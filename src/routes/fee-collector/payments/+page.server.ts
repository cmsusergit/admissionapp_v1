import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { generateReceiptNumber } from '$lib/server/receipt';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';
import { ensureStudentEnrolled } from '$lib/server/enrollment';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    // Fetch all payments with student details
    let paymentsQuery = supabase
        .from('payments')
        .select(`
            *,
            applications!inner (
                id,
                student_user:users!student_id (full_name, email, student_profiles(enrollment_number)),
                courses!inner (
                    name, 
                    college_id,
                    colleges(
                        name, 
                        address,
                        logo_url,
                        universities(name, logo_url, contact_email, contact_phone, website, address, footer_text)
                    )
                ),
                account_admissions (admission_number)
            )
        `);

    paymentsQuery = applyRoleBasedCollegeFilter(paymentsQuery, userProfile, 'payments');

    const { data: allPayments, error: paymentsError } = await paymentsQuery.order('payment_date', { ascending: false });

    if (paymentsError) {
        console.error('Error fetching payments:', paymentsError.message);
    }

    // Separate payments by type
    const tuitionPayments = allPayments?.filter(p => p.payment_type === 'tuition_fee') || [];
    const applicationFeePayments = allPayments?.filter(p => p.payment_type === 'application_fee') || [];
    const provisionalFeePayments = allPayments?.filter(p => p.payment_type === 'provisional_fee') || [];

    // Fetch account_admissions for the "Record Payment" dropdown
    let admQuery = supabase
        .from('account_admissions')
        .select(`
            id,
            admission_number,
            application_id,
            applications!inner(
                student_user:users!applications_student_id_fkey(full_name, email),
                course_id,
                cycle_id,
                form_type,
                assigned_fee_scheme_id,
                courses!inner(name, college_id),
                admission_cycles(academic_year_id)
            )
        `);

    admQuery = applyRoleBasedCollegeFilter(admQuery, userProfile, 'admissions');

    const { data: rawAdmissions, error: admError } = await admQuery.order('admission_number');

    if (admError) {
        console.error('Error fetching admissions:', admError.message);
    }

    // Fetch form types to filter non-provisional applications
    const { data: formTypesData } = await supabase.from('form_types').select('name, is_prov');
    const formTypesMap = new Map((formTypesData || []).map(ft => [ft.name, ft.is_prov]));

    const admissions = rawAdmissions?.filter(adm => {
        const formType = (adm.applications as any)?.form_type;
        const isProv = formTypesMap.get(formType) || false;
        return !isProv; // Only include non-provisional
    }) || [];

    // Fetch fee schemes for dropdown
    const { data: feeSchemes } = await supabase
        .from('fee_schemes')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

    // Fetch provisional fee payments for each admission's application
    const admissionsWithProvFees = await Promise.all(admissions?.map(async (adm) => {
        const { data: provPayments, error: provPayError } = await supabase
            .from('payments')
            .select('amount')
            .eq('application_id', adm.application_id)
            .eq('payment_type', 'provisional_fee')
            .eq('status', 'completed');

        if (provPayError) {
            console.error(`Error fetching provisional payments for app ${adm.application_id}:`, provPayError);
        }

        const totalProvPaid = provPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;
        return { ...adm, totalProvPaid };
    }) || []);

    // Fetch all fee structures for robust lookup
    let fsQuery = supabase
        .from('fee_structures')
        .select('*, courses!inner(college_id), fee_schemes(name)'); // Join to filter by college

    fsQuery = applyRoleBasedCollegeFilter(fsQuery, userProfile, 'fee_structures');

    const { data: allFeeStructures, error: allFsError } = await fsQuery;

    if (allFsError) {
        console.error('Error fetching all fee structures:', allFsError.message);
    }

    // Process to get fee structures for each admission
    const feeStructuresPromises = admissionsWithProvFees?.map(async (adm) => {
        const app = adm.applications as any;
        const courseId = app?.course_id;
        const academicYearId = app?.admission_cycles?.academic_year_id;
        const formType = app?.form_type || 'Provisional';
        const feeSchemeId = app?.assigned_fee_scheme_id;

        if (!courseId || !academicYearId) return null;

        const feeStructure = allFeeStructures?.find(fs => 
            fs.course_id === courseId && 
            fs.academic_year_id === academicYearId && 
            fs.form_type === formType &&
            (!feeSchemeId || fs.fee_scheme_id === feeSchemeId)
        );
        
        if (!feeStructure) return null;

        return { admissionId: adm.id, feeStructure };
    }) || [];

    const feeStructures = (await Promise.all(feeStructuresPromises)).filter((item): item is NonNullable<typeof item> => item !== null);

    return {
        payments: tuitionPayments, 
        tuitionPayments,
        applicationFeePayments,
        provisionalFeePayments,
        admissions: admissionsWithProvFees || [], 
        feeStructures: feeStructures || [],
        allFeeStructures: allFeeStructures || [],
        feeSchemes: feeSchemes || []
    };
};

export const actions: Actions = {
    recordPayment: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;
        const amount = parseFloat(formData.get('amount') as string);
        const payment_date = formData.get('payment_date') as string || new Date().toISOString();
        const admission_category_code = formData.get('admission_category_code') as string; 
        
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

        // 1. Fetch Application Details for validation and sequence generation
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
            console.error('Error fetching application details:', appError?.message);
            return fail(500, { message: 'Failed to fetch application details.', error: true });
        }

        const feeSchemeId = appData.assigned_fee_scheme_id;
        if (!feeSchemeId) {
            return fail(400, { message: 'Student has no assigned Fee Scheme. Please assign one before recording payment.', error: true });
        }

        // --- Validation: Ensure collected amount is valid against net outstanding ---
        // 2. Fetch Fee Structure for the application AND scheme
        const { data: currentFeeStructure, error: fsError } = await supabase
            .from('fee_structures')
            .select('total_fee, fee_components')
            .eq('course_id', appData.course_id)
            .eq('academic_year_id', appData.admission_cycles?.academic_year_id)
            .eq('form_type', appData.form_type || 'Provisional')
            .eq('fee_scheme_id', feeSchemeId)
            .maybeSingle();

        if (fsError || !currentFeeStructure) {
            console.error('Error fetching current fee structure:', fsError?.message);
            return fail(500, { message: 'Failed to retrieve fee structure for the assigned scheme.', error: true });
        }
        const totalCourseFee = currentFeeStructure.total_fee || 0;

        // 3. Calculate Provisional Fee Paid
        const { data: provPayments, error: provPayError } = await supabase
            .from('payments')
            .select('amount')
            .eq('application_id', application_id)
            .eq('payment_type', 'provisional_fee')
            .eq('status', 'completed');
        
        if (provPayError) {
            console.error('Error fetching provisional payments for validation:', provPayError);
            return fail(500, { message: 'Failed to retrieve provisional payment history.', error: true });
        }
        const totalProvPaid = provPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;

        // 4. Calculate Tuition Fee Already Paid (excluding this current payment)
        const { data: tuitionPayments, error: tuitionPayError } = await supabase
            .from('payments')
            .select('amount')
            .eq('application_id', application_id)
            .eq('payment_type', 'tuition_fee')
            .eq('status', 'completed');

        if (tuitionPayError) {
            console.error('Error fetching tuition payments for validation:', tuitionPayError);
            return fail(500, { message: 'Failed to retrieve tuition payment history.', error: true });
        }
        const totalTuitionPaid = tuitionPayments?.reduce((sum, p) => sum + p.amount, 0) || 0;

        // 5. Determine Net Payable for Tuition
        const netPayableTuition = totalCourseFee - totalProvPaid - totalTuitionPaid;

        // 6. Validate Collected Amount
        if (amount > netPayableTuition + 0.01) { 
            return fail(400, { message: `Collected amount (INR ${amount.toFixed(2)}) exceeds net payable tuition (INR ${netPayableTuition.toFixed(2)}) for assigned scheme.`, error: true });
        }
        if (amount <= 0) {
            return fail(400, { message: 'Payment amount must be greater than zero.', error: true });
        }
        // --- End Validation ---

        const collegeId = appData.courses!.college_id; 
        const academicYearId = appData.admission_cycles!.academic_year_id; 
        const academicYearName = appData.admission_cycles!.academic_years!.name;
        const courseId = appData.course_id;
        const studentId = appData.student_id;
        const formType = appData.form_type; 

        if (!collegeId || !academicYearId || !courseId || !studentId || !formType) {
            return fail(500, { message: 'Missing critical application details.', error: true });
        }

        const transaction_id = `HYBRID-${Date.now()}`;

        // 2. Create Receipt Record (this handles sequence generation internally)
        let receipt;
        try {
            receipt = await createFeeReceipt(supabase, {
                transactionId: transaction_id,
                studentId: studentId,
                applicationId: application_id,
                amount,
                generatedBy: authenticatedUser?.id || userProfile.id,
                paymentType: payment_type,
                academicYearId: academicYearId,
                yearName: academicYearName,
                collegeId: collegeId,
                courseId: courseId,
                paymentBreakdown: payment_breakdown,
                feeComponentsBreakdown: currentFeeStructure?.fee_components || []
            });
        } catch (e) {
            console.error('Error generating receipt:', e);
            return fail(500, { message: 'Failed to generate receipt.', error: true });
        }
        
        const receipt_number = receipt.receipt_no;

        const { error: txError } = await supabase.from('transactions').insert({
            student_id: authenticatedUser?.id || userProfile.id,
            application_id,
            amount,
            currency: 'INR',
            status: 'success',
            gateway_transaction_id: transaction_id,
            gateway_response: { 
                payment_type,
                receipt_number,
                payment_date: new Date(payment_date).toISOString(),
                payment_breakdown,
                fee_components_breakdown: currentFeeStructure?.fee_components || null
            }
        });

        if (txError) {
            console.error('Error recording transaction:', txError.message);
            return fail(500, { message: 'Failed to record transaction.', error: true });
        }

        // Record in `payments` table as well since it's the source of truth for categorized fees
        const { error: payError } = await supabase.from('payments').insert({
            application_id,
            amount,
            payment_type, // 'tuition_fee'
            transaction_id,
            receipt_number,
            status: 'completed',
            payment_date: new Date(payment_date).toISOString(),
            payment_breakdown: payment_breakdown,
            fee_components_breakdown: currentFeeStructure?.fee_components || []
        });

        if (payError) {
            console.error('Error recording payment in payments table:', payError.message);
            return fail(500, { message: 'Failed to record payment.', error: true });
        }

        // Trigger auto-enrollment if this was a tuition payment
        if (payment_type === 'tuition_fee') {
            await ensureStudentEnrolled(supabase, application_id, admission_category_code);
        }

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

        console.log('[Server] updateAssignedScheme:', { application_id, fee_scheme_id });

        if (!application_id || !fee_scheme_id) {
            return fail(400, { message: 'Application ID and Fee Scheme are required.', error: true });
        }

        // Use Admin client because fee_collector doesn't have update rights on 'applications' table
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });

        const { error } = await supabaseAdmin
            .from('applications')
            .update({ assigned_fee_scheme_id: fee_scheme_id })
            .eq('id', application_id);

        if (error) {
            console.error('Error updating assigned scheme:', error.message);
            return fail(500, { message: 'Failed to update assigned fee scheme: ' + error.message, error: true });
        }

        return { success: true, message: 'Fee scheme assigned successfully!' };
    }
};
