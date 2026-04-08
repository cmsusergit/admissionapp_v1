import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { generateSequence, generateCollegeId } from '$lib/server/sequences';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

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
                courses!inner(name, college_id),
                admission_cycles(academic_year_id)
            )
        `);

    admQuery = applyRoleBasedCollegeFilter(admQuery, userProfile, 'admissions');

    const { data: admissions, error: admError } = await admQuery.order('admission_number');

    if (admError) {
        console.error('Error fetching admissions:', admError.message);
    }

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
        .select('*, courses!inner(college_id)'); // Join to filter by college

    fsQuery = applyRoleBasedCollegeFilter(fsQuery, userProfile, 'fee_structures');

    const { data: allFeeStructures, error: allFsError } = await fsQuery;

    if (allFsError) {
        console.error('Error fetching all fee structures:', allFsError.message);
    }

    // Process to get fee structures for each admission (Legacy/Specific binding if needed, but we now have all)
    // We keep this structure to minimize frontend breakage but populate it from allFeeStructures if possible?
    // Actually, let's just pass allFeeStructures to frontend and update frontend logic.
    
    // Legacy support: Map admissions to structures for existing UI logic
    const feeStructuresPromises = admissionsWithProvFees?.map(async (adm) => {
        // Safe access to nested properties
        const app = adm.applications as any;
        const courseId = app?.course_id;
        const academicYearId = app?.admission_cycles?.academic_year_id;
        const formType = app?.form_type || 'Provisional';

        if (!courseId || !academicYearId) return null;

        // Find in fetched list
        const feeStructure = allFeeStructures?.find(fs => 
            fs.course_id === courseId && 
            fs.academic_year_id === academicYearId && 
            fs.form_type === formType
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
        admissions: admissionsWithProvFees || [], // Use admissionsWithProvFees here
        feeStructures: feeStructures || [],
        allFeeStructures: allFeeStructures || [] // Pass full list
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
        
        // Default to tuition_fee for this specific "Record Payment" form which is for admissions
        // If we want to support recording application fees here manually, we need a toggle.
        // But usually, Fee Collector records Admission Fees (Tuition). 
        // Application fees are paid by student or DEO pre-admission.
        // So we explicitly set payment_type to 'tuition_fee' here to ensure separation.
        const payment_type = 'tuition_fee';

        // New: Parse the payment breakdown JSON
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

        // --- Validation: Ensure collected amount is valid against net outstanding ---
        // 1. Fetch Fee Structure for the application
        const { data: currentFeeStructure, error: fsError } = await supabase
            .from('fee_structures')
            .select('total_fee')
            .eq('course_id', appData.course_id)
            .eq('academic_year_id', appData.admission_cycles?.academic_year_id)
            .eq('form_type', appData.form_type || 'Provisional')
            .maybeSingle();

        if (fsError || !currentFeeStructure) {
            console.error('Error fetching current fee structure:', fsError?.message);
            return fail(500, { message: 'Failed to retrieve fee structure for validation.', error: true });
        }
        const totalCourseFee = currentFeeStructure.total_fee || 0;

        // 2. Calculate Provisional Fee Paid
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

        // 3. Calculate Tuition Fee Already Paid (excluding this current payment)
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

        // 4. Determine Net Payable for Tuition
        const netPayableTuition = totalCourseFee - totalProvPaid - totalTuitionPaid;

        // 5. Validate Collected Amount
        if (amount > netPayableTuition + 0.01) { // Add a small epsilon for floating point comparison
            return fail(400, { message: `Collected amount (INR ${amount.toFixed(2)}) exceeds net payable tuition (INR ${netPayableTuition.toFixed(2)}).`, error: true });
        }
        if (amount <= 0) { // Amount must be positive
            return fail(400, { message: 'Payment amount must be greater than zero.', error: true });
        }
        // --- End Validation ---

        // 1. Fetch Application Details for Sequence Generation
        const { data: appData, error: appError } = await supabase
            .from('applications')
            .select(`
                student_id, 
                course_id, 
                branch_id, 
                form_type, 
                courses(college_id, code), 
                branches(code), 
                admission_cycles(academic_year_id, academic_years(short_code))
            `)
            .eq('id', application_id)
            .single();

        if (appError || !appData) {
            console.error('Error fetching application details:', appError?.message);
            return fail(500, { message: 'Failed to fetch application details.', error: true });
        }

        const collegeId = appData.courses!.college_id; 
        const academicYearId = appData.admission_cycles!.academic_year_id; 
        const courseId = appData.course_id;
        const studentId = appData.student_id;
        const branchId = appData.branch_id;
        const formType = appData.form_type; // Get form_type directly

        if (!collegeId || !academicYearId || !courseId || !studentId || !formType) {
            return fail(500, { message: 'Missing critical application details (college, academic year, course, student, or form type).', error: true });
        }
        
        const academicYearCode = appData.admission_cycles!.academic_years!.short_code; 
        const courseCode = appData.courses!.code;
        const branchCode = appData.branches?.code;

        const missingDetails = [];
        if (!collegeId) missingDetails.push('College');
        if (!academicYearId) missingDetails.push('Academic Year');
        if (!academicYearCode) missingDetails.push('Academic Year Short Code (e.g. 25)');
        if (!courseCode) missingDetails.push('Course Code');
        if (branchId && !branchCode) missingDetails.push('Branch Code');

        if (missingDetails.length > 0) {
             return fail(500, { message: `Missing details for ID generation: ${missingDetails.join(', ')}`, error: true });
        }

        // 2. Generate Receipt Number
        let receipt_number;
        try {
            // Receipt number generation remains per college/course/year (sequential)
            receipt_number = await generateSequence(
                supabase, 
                'receipt_sequences', 
                collegeId, 
                courseId, 
                academicYearId, 
                'RCPT-'
            );
        } catch (e) {
            return fail(500, { message: 'Failed to generate receipt number.', error: true });
        }

        // 3. Generate CollegeID (Enrollment Number) if not exists
        // Check current
        const { data: student, error: studentError } = await supabase
            .from('users')
            .select('student_profiles(enrollment_number)')
            .eq('id', studentId)
            .single();
        
        if (!student?.student_profiles?.enrollment_number) {
            try {
                // Generate CollegeID using the new function and detailed codes
                const enrollment_number = await generateCollegeId(
                    supabase,
                    collegeId,
                    courseId,
                    academicYearId,
                    academicYearCode,
                    courseCode,
                    branchCode,
                    admission_category_code, // Use the code from form data
                    branchId // Pass branchId for sequence lookup
                );
                
                // Update User
                await supabase.from('student_profiles').update({ enrollment_number }).eq('user_id', studentId);
            } catch (e) {
                console.error("Error generating student ID:", e);
                // We don't fail payment if ID generation fails, but log it.
            }
        }

        // Construct a primary transaction ID (e.g., HYBRID-TIMESTAMP)
        const transaction_id = `HYBRID-${Date.now()}`;

        // Get the fee structure to snapshot the breakdown at this point in time
        // This is crucial for future reference even if the fee structure changes later
        const { data: feeStructureSnapshot } = await supabase
            .from('fee_structures')
            .select('fee_components')
            .eq('course_id', courseId)
            .eq('academic_year_id', academicYearId)
            .eq('form_type', appData.form_type || 'Provisional')
            .maybeSingle();

        const { error } = await supabase.from('payments').insert({
            application_id,
            amount,
            transaction_id,
            receipt_number, // Save generated receipt number
            status: 'completed',
            payment_type, // Explicitly set to 'tuition_fee'
            payment_date: new Date(payment_date).toISOString(),
            payment_breakdown, // Store the payment mode JSON
            fee_components_breakdown: feeStructureSnapshot?.fee_components || null // Store the fee structure snapshot
        });

        if (error) {
            console.error('Error recording payment:', error.message);
            return fail(500, { message: 'Failed to record payment.', error: true });
        }

        return { success: true, message: 'Payment recorded successfully!' };
    }
};
