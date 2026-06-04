import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { generateReceiptNumber, createFeeReceipt } from '$lib/server/receipt';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';
import { ensureStudentEnrolled } from '$lib/server/enrollment';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    const searchTerm = url.searchParams.get('search') || '';
    const activeTab = (url.searchParams.get('type') || 'tuition') as 'tuition' | 'application' | 'provisional';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Map frontend tab to DB payment type
    const tabToDbType = {
        'tuition': 'tuition_fee',
        'application': 'application_fee',
        'provisional': 'provisional_fee'
    };
    const dbPaymentType = tabToDbType[activeTab];

    // Fetch payments with student details and server-side search/pagination
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
                        code,
                        address,
                        logo_url,
                        universities(name, logo_url, contact_email, contact_phone, website, address, footer_text)
                    )
                ),
                branches(name),
                admission_cycles(
                    academic_years(name)
                ),
                account_admissions (admission_number)
            )
        `, { count: 'exact' });

    // ALWAYS filter by the active tab's payment type to ensure pagination is consistent
    paymentsQuery = paymentsQuery.eq('payment_type', dbPaymentType);

    if (searchTerm) {
        paymentsQuery = paymentsQuery.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`, { foreignTable: 'applications.student_user' });
    }

    paymentsQuery = applyRoleBasedCollegeFilter(paymentsQuery, userProfile, 'payments');

    const { data: allPayments, count: totalPaymentsCount, error: paymentsError } = await paymentsQuery
        .order('payment_date', { ascending: false })
        .range(from, to);

    if (paymentsError) {
        console.error('Error fetching payments:', paymentsError.message);
    }

    // Return the list for the current tab
    const tuitionPayments = activeTab === 'tuition' ? (allPayments || []) : [];
    const applicationFeePayments = activeTab === 'application' ? (allPayments || []) : [];
    const provisionalFeePayments = activeTab === 'provisional' ? (allPayments || []) : [];

    // --- Optimization for "Record Payment" Dropdown ---
    // If no search is performed, only fetch top 50 recently admitted students to keep it fast.
    // If a search is performed, fetch matching admissions.
    let admQuery = supabase
        .from('account_admissions')
        .select(`
            id,
            admission_number,
            application_id,
            applications!inner(
                id,
                student_user:users!applications_student_id_fkey(full_name, email),
                course_id,
                cycle_id,
                form_type,
                admission_type,
                assigned_fee_scheme_id,
                courses!inner(name, college_id),
                admission_cycles(academic_year_id)
            )
        `);

    if (searchTerm) {
        admQuery = admQuery.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,admission_number.ilike.%${searchTerm}%`, { foreignTable: 'applications.student_user' });
    }

    admQuery = applyRoleBasedCollegeFilter(admQuery, userProfile, 'admissions');

    // Limit the dropdown list to prevent massive overhead
    const { data: rawAdmissions, error: admError } = await admQuery
        .order('created_at', { ascending: false })
        .limit(100);

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

    // BATCH FETCH: Provisional fee payments for the current set of admissions
    const appIdsForAdmissions = admissions.map(a => a.application_id);
    let allProvPayments: any[] = [];
    if (appIdsForAdmissions.length > 0) {
        const { data: provData } = await supabase
            .from('payments')
            .select('application_id, amount')
            .in('application_id', appIdsForAdmissions)
            .eq('payment_type', 'provisional_fee')
            .eq('status', 'completed');
        allProvPayments = provData || [];
    }

    const admissionsWithProvFees = admissions.map(adm => {
        const totalProvPaid = allProvPayments
            .filter(p => p.application_id === adm.application_id)
            .reduce((sum, p) => sum + p.amount, 0);
        return { ...adm, totalProvPaid };
    });

    // BATCH FETCH: All fee structures for the current college
    let fsQuery = supabase
        .from('fee_structures')
        .select('*, courses!inner(college_id), fee_schemes(name)'); 

    fsQuery = applyRoleBasedCollegeFilter(fsQuery, userProfile, 'fee_structures');

    const { data: allFeeStructures, error: allFsError } = await fsQuery;

    if (allFsError) {
        console.error('Error fetching all fee structures:', allFsError.message);
    }

    // Process to get fee structures for each admission from the batched list
    const feeStructures = admissionsWithProvFees?.map((adm) => {
        const app = adm.applications as any;
        const courseId = app?.course_id;
        const academicYearId = app?.admission_cycles?.academic_year_id;
        const formType = app?.form_type || 'Provisional';
        const feeSchemeId = app?.assigned_fee_scheme_id;

        if (!courseId || !academicYearId) return null;

        const feeStructure = allFeeStructures?.find(fs => {
            const matchBase = fs.course_id === courseId && 
                             fs.academic_year_id === academicYearId && 
                             fs.form_type === formType;
            if (!matchBase) return false;
            
            if (feeSchemeId) {
                return fs.fee_scheme_id === feeSchemeId;
            } else {
                return fs.fee_schemes?.name?.toLowerCase() === 'general';
            }
        }) || allFeeStructures?.find(fs => 
            fs.course_id === courseId && 
            fs.academic_year_id === academicYearId && 
            fs.form_type === formType
        );
        
        if (!feeStructure) return null;

        return { admissionId: adm.id, feeStructure };
    }).filter(Boolean);

    return {
        payments: allPayments || [],
        tuitionPayments,
        applicationFeePayments,
        provisionalFeePayments,
        admissions: admissionsWithProvFees,
        feeStructures: feeStructures,
        userProfile,
        pagination: {
            page,
            limit,
            total: totalPaymentsCount || 0,
            totalPages: Math.ceil((totalPaymentsCount || 0) / limit)
        },
        searchTerm,
        activeTab
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

        let feeSchemeId = appData.assigned_fee_scheme_id;

        // --- AUTO-RESOLVE FEE SCHEME ---
        if (!feeSchemeId) {
            console.log(`[Server] No fee scheme assigned for application ${application_id}. Attempting to resolve default...`);
            
            const { data: structures } = await supabase
                .from('fee_structures')
                .select('fee_scheme_id, fee_schemes(name)')
                .eq('course_id', appData.course_id)
                .eq('academic_year_id', appData.admission_cycles?.academic_year_id)
                .eq('form_type', appData.form_type || 'Provisional');

            if (structures && structures.length > 0) {
                // Try to find 'General'
                const general = structures.find(s => (s.fee_schemes as any)?.name?.toLowerCase() === 'general');
                feeSchemeId = general?.fee_scheme_id || structures[0].fee_scheme_id;
                
                console.log(`[Server] Auto-resolved to scheme: ${feeSchemeId}`);
                
                // Save it for future consistency
                const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
                    auth: { persistSession: false }
                });
                await supabaseAdmin
                    .from('applications')
                    .update({ assigned_fee_scheme_id: feeSchemeId })
                    .eq('id', application_id);
            }
        }

        if (!feeSchemeId) {
            return fail(400, { message: 'Student has no assigned Fee Scheme and no default structure could be found. Please assign one manually.', error: true });
        }
        // --- END AUTO-RESOLVE ---

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

        const gateway_tx_id = `HYBRID-${Date.now()}`;

        // Use Admin Client to bypass RLS for administrative record keeping
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false }
        });

        // 1. Create Transaction Record first to get UUID for linking
        const { data: txData, error: txError } = await supabaseAdmin.from('transactions').insert({
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
                fee_components_breakdown: currentFeeStructure?.fee_components || null
            }
        }).select().single();

        if (txError || !txData) {
            console.error('Error recording transaction:', txError?.message);
            return fail(500, { message: 'Failed to record transaction: ' + txError?.message, error: true });
        }

        const transaction_uuid = txData.id;

        // 2. Create Receipt Record (this handles sequence generation internally)
        let receipt;
        try {
            // Ensure we use the components from the specific scheme we just validated
            const components = currentFeeStructure?.fee_components || [];
            
            receipt = await createFeeReceipt(supabaseAdmin, {
                transactionId: transaction_uuid,
                studentId: studentId,
                applicationId: application_id,
                amount,
                generatedBy: authenticatedUser?.id || userProfile.id,
                paymentType: payment_type,
                formType: formType,
                academicYearId: academicYearId,
                yearName: academicYearName,
                collegeId: collegeId,
                courseId: courseId,
                paymentBreakdown: payment_breakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
                feeComponentsBreakdown: components
            });
        } catch (e) {
            console.error('Error generating receipt:', e);
            return fail(500, { message: 'Failed to generate receipt.', error: true });
        }
        
        const receipt_number = receipt.receipt_no;

        // Update transaction with receipt number
        await supabaseAdmin.from('transactions').update({
            gateway_response: { 
                ...(txData.gateway_response as any),
                receipt_number
            }
        }).eq('id', transaction_uuid);

        // Record in `payments` table as well since it's the source of truth for categorized fees
        const mainBreakdown = payment_breakdown[0];
        const { error: payError } = await supabaseAdmin.from('payments').insert({
            application_id,
            amount,
            payment_type, // 'tuition_fee'
            transaction_id: gateway_tx_id,
            receipt_number,
            status: 'completed',
            fee_period,
            payment_date: new Date(payment_date).toISOString(),
            payment_breakdown: payment_breakdown.map((m: any) => ({ ...m, mode: m.type || m.mode })),
            fee_components_breakdown: currentFeeStructure?.fee_components || [],
            payment_mode: payment_breakdown.length === 1 ? mainBreakdown.mode : 'hybrid',
            reference_no: payment_breakdown.length === 1 ? mainBreakdown.ref : gateway_tx_id
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
        let fee_scheme_id: string | null = formData.get('fee_scheme_id') as string;

        console.log('[Server] updateAssignedScheme:', { application_id, fee_scheme_id });

        if (fee_scheme_id === 'null' || !fee_scheme_id) {
            fee_scheme_id = null;
        }

        if (!application_id) {
            return fail(400, { message: 'Application ID is required.', error: true });
        }
        
        if (fee_scheme_id === null) {
            return fail(400, { message: 'Fee Scheme is required.', error: true });
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
