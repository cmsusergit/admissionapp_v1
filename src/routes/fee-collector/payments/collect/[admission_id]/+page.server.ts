import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createFeeReceipt } from '$lib/server/receipt';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';
import { ensureStudentEnrolled } from '$lib/server/enrollment';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ params, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    const { admission_id } = params;

    // 1. Fetch Admission Details
    let admQuery = supabase
        .from('account_admissions')
        .select(`
            id,
            admission_number,
            application_id,
            applications!inner(
                student_id,
                student_user:users!applications_student_id_fkey(
                    full_name, 
                    email,
                    student_profiles(enrollment_number)
                ),
                course_id,
                cycle_id,
                branch_id,
                form_type,
                assigned_fee_scheme_id,
                courses!inner(
                    name, 
                    college_id,
                    colleges(
                        name,
                        address,
                        logo_url,
                        universities(name, logo_url, contact_email, address)
                    )
                ),
                branches(name),
                admission_cycles(academic_year_id, academic_years(name))
            )
        `)
        .eq('id', admission_id);

    admQuery = applyRoleBasedCollegeFilter(admQuery, userProfile, 'admissions');
    const { data: admission, error: admError } = await admQuery.single();

    if (admError || !admission) {
        console.error('Error fetching admission:', admError?.message);
        throw redirect(303, `/fee-collector/payments?error=${encodeURIComponent(admError?.message || 'Admission not found')}`);
    }

    // 2. Fetch Fee Schemes for dropdown (if needed to change)
    const { data: feeSchemes } = await supabase
        .from('fee_schemes')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

    // 3. Fetch Payments History for this student
    const { data: studentPayments } = await supabase
        .from('payments')
        .select('*')
        .eq('application_id', admission.application_id)
        .eq('status', 'completed')
        .order('payment_date', { ascending: false });

    // 4. Fetch Fee Structure
    const app = admission.applications as any;
    const { data: feeStructure, error: fsError } = await supabase
        .from('fee_structures')
        .select('*, fee_schemes(name)')
        .eq('course_id', app.course_id)
        .eq('academic_year_id', app.admission_cycles?.academic_year_id)
        .eq('form_type', app.form_type)
        .eq('fee_scheme_id', app.assigned_fee_scheme_id)
        .maybeSingle();

    if (fsError) {
        console.error('Error fetching fee structure:', fsError.message);
    }

    return {
        admission,
        studentPayments: studentPayments || [],
        feeStructure,
        feeSchemes: feeSchemes || []
    };
};

export const actions: Actions = {
    recordPayment: async ({ request, params, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            throw redirect(303, '/login');
        }

        const { admission_id } = params;
        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;
        const amount = parseFloat(formData.get('amount') as string);
        const payment_date = formData.get('payment_date') as string || new Date().toISOString();
        const admission_category_code = formData.get('admission_category_code') as string; 
        const fee_period = (formData.get('fee_period') as string) || 'year';
        
        const payment_type = 'tuition_fee';

        const payment_breakdown_str = formData.get('payment_breakdown') as string;
        let payment_breakdown = [];
        try {
            payment_breakdown = JSON.parse(payment_breakdown_str || '[]');
        } catch (e) {
            return fail(400, { message: 'Invalid payment breakdown data.', error: true });
        }

        if (!application_id || isNaN(amount) || amount <= 0 || !admission_category_code) { 
            return fail(400, { message: 'Invalid payment details or missing admission category.', error: true });
        }

        // 1. Fetch Application Details for validation
        const { data: appData, error: appError } = await supabase
            .from('applications')
            .select(`
                student_id, 
                course_id, 
                branch_id, 
                form_type, 
                assigned_fee_scheme_id,
                courses(college_id, code), 
                branches(code), 
                admission_cycles(academic_year_id, academic_years(short_code, name))
            `)
            .eq('id', application_id)
            .single();

        if (appError || !appData) {
            return fail(500, { message: 'Failed to fetch application details.', error: true });
        }

        const feeSchemeId = appData.assigned_fee_scheme_id;
        if (!feeSchemeId) {
            return fail(400, { message: 'Student has no assigned Fee Scheme. Please assign one before recording payment.', error: true });
        }

        // 2. Fetch Fee Structure for validation
        const { data: currentFeeStructure, error: fsError } = await supabase
            .from('fee_structures')
            .select('total_fee, fee_components')
            .eq('course_id', appData.course_id)
            .eq('academic_year_id', appData.admission_cycles?.academic_year_id)
            .eq('form_type', appData.form_type)
            .eq('fee_scheme_id', feeSchemeId)
            .maybeSingle();

        if (fsError || !currentFeeStructure) {
            return fail(500, { message: 'Failed to retrieve fee structure for the assigned scheme.', error: true });
        }
        const totalCourseFee = currentFeeStructure.total_fee || 0;

        // 3. Calculate Outstanding
        const { data: provPayments } = await supabase
            .from('payments')
            .select('amount')
            .eq('application_id', application_id)
            .eq('payment_type', 'provisional_fee')
            .eq('status', 'completed');
        const totalProvPaid = provPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;

        const { data: tuitionPayments } = await supabase
            .from('payments')
            .select('amount')
            .eq('application_id', application_id)
            .eq('payment_type', 'tuition_fee')
            .eq('status', 'completed');
        const totalTuitionPaid = tuitionPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;

        const netPayableTuition = totalCourseFee - totalProvPaid - totalTuitionPaid;

        if (amount > netPayableTuition + 0.01) { 
            return fail(400, { message: `Collected amount exceeds net payable tuition (Outstanding: INR ${netPayableTuition.toFixed(2)}).`, error: true });
        }

        const collegeId = appData.courses!.college_id; 
        const academicYearId = appData.admission_cycles!.academic_year_id; 
        const academicYearName = appData.admission_cycles!.academic_years!.name;
        const courseId = appData.course_id;
        const studentId = appData.student_id;

        const gateway_tx_id = `HYBRID-${Date.now()}`;

        // 4. Create Transaction
        const { data: txData, error: txError } = await supabase.from('transactions').insert({
            student_id: studentId,
            application_id,
            amount,
            currency: 'INR',
            status: 'success',
            gateway_transaction_id: gateway_tx_id,
            gateway_response: { 
                payment_type,
                payment_date: new Date(payment_date).toISOString(),
                payment_breakdown: payment_breakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
                fee_components_breakdown: currentFeeStructure?.fee_components || null,
                collected_by: userProfile.id
            }
        }).select().single();

        if (txError || !txData) {
            return fail(500, { message: 'Failed to record transaction.', error: true });
        }

        // 5. Create Receipt
        let receipt;
        try {
            receipt = await createFeeReceipt(supabase, {
                transactionId: txData.id,
                studentId: studentId,
                applicationId: application_id,
                amount,
                generatedBy: userProfile.id,
                paymentType: payment_type,
                academicYearId: academicYearId,
                yearName: academicYearName,
                collegeId: collegeId,
                courseId: courseId,
                paymentBreakdown: payment_breakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
                feeComponentsBreakdown: currentFeeStructure?.fee_components || []
            });
        } catch (e) {
            console.error('Receipt generation error:', e);
            return fail(500, { message: 'Failed to generate receipt record.', error: true });
        }

        // 6. Record Payment
        const mainBreakdown = payment_breakdown[0];
        const { error: payError } = await supabase.from('payments').insert({
            application_id,
            amount,
            payment_type,
            transaction_id: gateway_tx_id,
            receipt_number: receipt.receipt_no,
            status: 'completed',
            fee_period,
            payment_date: new Date(payment_date).toISOString(),
            payment_breakdown: payment_breakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
            fee_components_breakdown: currentFeeStructure?.fee_components || [],
            payment_mode: payment_breakdown.length === 1 ? mainBreakdown.mode : 'hybrid',
            reference_no: payment_breakdown.length === 1 ? mainBreakdown.ref : gateway_tx_id
        });

        if (payError) {
            return fail(500, { message: 'Failed to record payment entry.', error: true });
        }

        // 7. Auto-enroll
        await ensureStudentEnrolled(supabase, application_id, admission_category_code);

        // 8. Auto set Account Status to Cleared
        await supabase
            .from('account_admissions')
            .update({ account_status: 'cleared' })
            .eq('id', admission_id);

        return { success: true, message: 'Payment recorded successfully!' };
    },

    updateAssignedScheme: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;
        const fee_scheme_id = formData.get('fee_scheme_id') as string;

        if (!application_id || !fee_scheme_id) {
            return fail(400, { message: 'Missing application or scheme ID.', error: true });
        }

        // Admin client required for 'applications' update
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        });

        const { error } = await supabaseAdmin
            .from('applications')
            .update({ assigned_fee_scheme_id: fee_scheme_id })
            .eq('id', application_id);

        if (error) {
            return fail(500, { message: 'Failed to update scheme: ' + error.message, error: true });
        }

        return { success: true, message: 'Fee scheme assigned successfully!' };
    }
};
