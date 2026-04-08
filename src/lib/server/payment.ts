import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PaymentOrderRequest {
    amount: number;
    currency: string;
    description?: string;
    studentId: string;
    applicationId?: string;
    metadata?: Record<string, any>;
}

export interface PaymentOrderResponse {
    orderId: string;
    amount: number;
    currency: string;
    keyId?: string; // Public key for client-side SDK
    transactionId: string; // Our internal ID
    paymentUrl?: string; // For redirect flows
}

export interface VerificationResult {
    success: boolean;
    transactionId: string;
    gatewayTransactionId?: string;
    message?: string;
}

/**
 * Initiates a payment transaction.
 * 1. Fetches the active payment gateway configuration.
 * 2. Creates a local transaction record.
 * 3. Calls the gateway provider to create an order (mocked for now).
 */
export async function createPaymentOrder(
    supabase: SupabaseClient,
    request: PaymentOrderRequest
): Promise<PaymentOrderResponse> {
    
    // 1. Get Active Gateway
    const { data: gateway, error: gatewayError } = await supabase
        .from('payment_gateways')
        .select('*')
        .eq('is_active', true)
        .single();

    if (gatewayError || !gateway) {
        console.error('No active payment gateway found:', gatewayError);
        throw error(500, 'Payment service unavailable');
    }

    // 2. Create Transaction Record (Initiated)
    const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .insert({
            student_id: request.studentId,
            application_id: request.applicationId,
            amount: request.amount,
            currency: request.currency,
            status: 'initiated',
            payment_gateway_id: gateway.id,
            ip_address: '0.0.0.0', // TODO: Pass IP from request
            gateway_response: { init_meta: request.metadata }
        })
        .select()
        .single();

    if (txError) {
        console.error('Failed to create transaction record:', txError);
        throw error(500, 'Failed to initiate transaction');
    }

    // 3. Call Gateway API (Adapter Pattern)
    let gatewayOrderId = `ORDER-${Date.now()}`; 
    let keyId = gateway.config?.key_id || 'test_key';
    let paymentUrl = undefined;

    if (gateway.type === 'redirect') {
        // Handle Redirect Flows (PayU / Custom)
        const baseUrl = gateway.endpoint_url;
        if (!baseUrl) {
             throw error(500, 'Gateway misconfigured: Missing Endpoint URL');
        }

        if (gateway.provider_name === 'PayU') {
             // Mock PayU Hash Generation
             // In real app: hash = sha512(key|txnid|amount|productinfo|firstname|email|udf1...|salt)
             const txnid = transaction.id;
             const amount = request.amount;
             // Construct URL or Form Data. 
             // Since PayU requires POST, we might return the params for frontend to auto-submit.
             // For simplicity here, assuming GET or a pre-generated payment link:
             paymentUrl = `${baseUrl}?txnid=${txnid}&amount=${amount}&surl=/api/payment/callback&furl=/api/payment/callback`;
        } else {
             // Generic/Custom Redirect
             // Append basic params
             const params = new URLSearchParams({
                 transaction_id: transaction.id,
                 amount: request.amount.toString(),
                 currency: request.currency,
                 callback_url: '/api/payment/callback' // Frontend should handle full absolute URL
             });
             paymentUrl = `${baseUrl}?${params.toString()}`;
        }
    } else if (gateway.provider_name === 'Razorpay') {
        // SDK Flow
        // Example: const razorpay = new Razorpay({ key_id: ..., key_secret: ... });
        // gatewayOrderId = await razorpay.orders.create(...)
    }

    // Update transaction 
    await supabase
        .from('transactions')
        .update({ 
            gateway_transaction_id: gatewayOrderId,
            payment_url: paymentUrl
        })
        .eq('id', transaction.id);

    return {
        orderId: gatewayOrderId,
        amount: request.amount,
        currency: request.currency,
        keyId: keyId,
        transactionId: transaction.id,
        paymentUrl: paymentUrl
    };
}

/**
 * Verifies a payment transaction.
 * 1. Validates the signature using the gateway secret.
 * 2. Updates the transaction status.
 * 3. Returns the result.
 */
export async function verifyPayment(
    supabase: SupabaseClient,
    transactionId: string,
    gatewayResponse: any
): Promise<VerificationResult> {
    
    // 1. Fetch Transaction
    const { data: transaction, error: txError } = await supabase
        .from('transactions')
        .select('*, payment_gateways(*)')
        .eq('id', transactionId)
        .single();

    if (txError || !transaction) {
        return { success: false, transactionId, message: 'Transaction not found' };
    }

    const gateway = transaction.payment_gateways;
    
    // 2. Verify Signature (Mock logic)
    // Real implementation: crypto.createHmac('sha256', secret).update(body).digest('hex')
    let isValid = true; 
    
    // In production, implement provider-specific validation here
    // e.g. if (gateway.provider_name === 'Razorpay') { isValid = validateRazorpaySignature(...) }

    if (!isValid) {
        await supabase
            .from('transactions')
            .update({ status: 'failed', gateway_response: gatewayResponse })
            .eq('id', transactionId);
        return { success: false, transactionId, message: 'Invalid signature' };
    }

    // 3. Mark Success
    const { error: updateError } = await supabase
        .from('transactions')
        .update({ 
            status: 'success', 
            gateway_response: gatewayResponse,
            gateway_transaction_id: gatewayResponse.payment_id || transaction.gateway_transaction_id 
        })
        .eq('id', transactionId);

    if (updateError) {
        return { success: false, transactionId, message: 'Failed to update status' };
    }

    return { 
        success: true, 
        transactionId, 
        gatewayTransactionId: gatewayResponse.payment_id 
    };
}
