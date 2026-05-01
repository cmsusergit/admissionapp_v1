import { json } from '@sveltejs/kit';
import { verifyPayment } from '$lib/server/payment';
import { createFeeReceipt } from '$lib/server/receipt';
import { ensureStudentEnrolled } from '$lib/server/enrollment';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { supabase, getSession } }) => {
    const session = await getSession();
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transactionId, gatewayResponse } = body;

    if (!transactionId || !gatewayResponse) {
        return json({ error: 'Missing transactionId or gatewayResponse' }, { status: 400 });
    }

    try {
        // 1. Verify Payment
        const verification = await verifyPayment(supabase, transactionId, gatewayResponse);
        
        if (!verification.success) {
            return json({ success: false, message: verification.message }, { status: 400 });
        }

        // 2. Fetch Transaction Details (to get amount, studentId, etc.)
        const { data: transaction, error: txError } = await supabase
            .from('transactions')
            .select('*, applications(college_id, course_id, academic_year_id)')
            .eq('id', transactionId)
            .single();
        
        if (txError || !transaction) {
             console.error('Transaction fetch error after verification:', txError);
             // Even if this fails, payment was verified. But we can't generate receipt easily.
             return json({ success: true, message: 'Payment verified but receipt generation failed (Transaction not found)' });
        }

        // 3. Generate Receipt
        // We need to fetch academic year name if possible, or just pass ID.
        // For now, let's try to get year name if available, or skip it.
        let yearName = undefined;
        if (transaction.applications?.academic_year_id) {
            const { data: ay } = await supabase
                .from('academic_years')
                .select('name')
                .eq('id', transaction.applications.academic_year_id)
                .single();
            yearName = ay?.name;
        }

        const receipt = await createFeeReceipt(supabase, {
            transactionId: transaction.id,
            studentId: transaction.student_id,
            applicationId: transaction.application_id,
            amount: transaction.amount,
            details: transaction.gateway_response, // Store full response or parsed details
            generatedBy: session.user.id,
            paymentType: 'tuition_fee', // TODO: Determine from metadata or transaction context
            academicYearId: transaction.applications?.academic_year_id,
            yearName: yearName,
            collegeId: transaction.applications?.college_id,
            courseId: transaction.applications?.course_id
        });

        // Trigger auto-enrollment if this was a tuition payment
        if (transaction.application_id) {
            await ensureStudentEnrolled(supabase, transaction.application_id);
        }

        return json({ success: true, receiptId: receipt.id, receiptNo: receipt.receipt_no });

    } catch (e: any) {
        console.error('Payment Verification Error:', e);
        return json({ error: e.message || 'Verification failed' }, { status: 500 });
    }
};
