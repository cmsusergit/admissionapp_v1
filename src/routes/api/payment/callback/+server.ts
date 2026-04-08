import { redirect } from '@sveltejs/kit';
import { verifyPayment } from '$lib/server/payment';
import { createFeeReceipt } from '$lib/server/receipt';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    await handleCallback(url.searchParams, supabase);
    return new Response('Processed', { status: 200 }); // Should never reach here due to redirects
};

export const POST: RequestHandler = async ({ request, locals: { supabase } }) => {
    let formData;
    try {
        formData = await request.formData();
    } catch {
        return new Response('Invalid Request', { status: 400 });
    }
    
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
        params.append(key, value.toString());
    }

    await handleCallback(params, supabase);
    return new Response('Processed', { status: 200 }); // Should never reach here due to redirects
};

async function handleCallback(params: URLSearchParams, supabase: any) {
    const transactionId = params.get('transaction_id') || params.get('txnid');
    const status = params.get('status'); 
    
    if (!transactionId) {
        throw redirect(303, '/student/payments?error=Missing transaction ID');
    }

    const gatewayResponse = Object.fromEntries(params.entries());

    try {
        if (status === 'failure' || status === 'failed') {
            await supabase
                .from('transactions')
                .update({ status: 'failed', gateway_response: gatewayResponse })
                .eq('id', transactionId);
            throw redirect(303, `/student/payments?error=Payment failed`);
        }

        // Fetch transaction to preserve metadata before verifyPayment overwrites it
        const { data: initialTx } = await supabase.from('transactions').select('gateway_response').eq('id', transactionId).single();
        const initMeta = initialTx?.gateway_response?.init_meta;

        const verification = await verifyPayment(supabase, transactionId, gatewayResponse);
        
        if (verification.success) {
            const { data: transaction } = await supabase
                .from('transactions')
                .select('*, applications(college_id, course_id, academic_year_id)')
                .eq('id', transactionId)
                .single();

            if (transaction) {
                // Determine payment type from metadata
                const paymentType = initMeta?.paymentType || 'tuition_fee';
                
                // Record in `payments` table
                await supabase.from('payments').insert({
                    application_id: transaction.application_id,
                    amount: transaction.amount,
                    transaction_id: transaction.id,
                    status: 'completed',
                    payment_type: paymentType,
                    payment_date: new Date().toISOString()
                });

                if (paymentType === 'application_fee') {
                    await supabase
                        .from('applications')
                        .update({ application_fee_status: 'paid' })
                        .eq('id', transaction.application_id);
                }

                if (paymentType === 'provisional_fee') {
                    await supabase
                        .from('account_admissions')
                        .update({ enrollment_status: 'confirmed' })
                        .eq('application_id', transaction.application_id);
                }

                let yearName = undefined;
                if (transaction.applications?.academic_year_id) {
                    const { data: ay } = await supabase
                        .from('academic_years')
                        .select('name')
                        .eq('id', transaction.applications.academic_year_id)
                        .single();
                    yearName = ay?.name;
                }

                await createFeeReceipt(supabase, {
                    transactionId: transaction.id,
                    studentId: transaction.student_id,
                    applicationId: transaction.application_id,
                    amount: transaction.amount,
                    details: gatewayResponse,
                    generatedBy: transaction.student_id, 
                    paymentType: paymentType,
                    academicYearId: transaction.applications?.academic_year_id,
                    yearName: yearName,
                    collegeId: transaction.applications?.college_id,
                    courseId: transaction.applications?.course_id
                });
            }
            
            throw redirect(303, `/student/payments?success=Payment successful`);
        } else {
            throw redirect(303, `/student/payments?error=${encodeURIComponent(verification.message || 'Verification failed')}`);
        }
    } catch (e: any) {
        if (e.status === 303) throw e; 
        console.error('Callback processing error:', e);
        throw redirect(303, '/student/payments?error=Payment processing error');
    }
}
