import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login'); // Redirect non-fee_collector users
    }

    // Fetch account_admissions records
    let aaQuery = supabase
        .from('account_admissions')
        .select(`
            *,
            applications(
                id,
                student_id,
                course_id,
                cycle_id,
                student_user:users!applications_student_id_fkey(full_name, email),
                courses!inner(name, college_id),
                admission_cycles(academic_year_id),
                payments(*)
            )
        `)
        .neq('enrollment_status', 'provisional'); // Exclude provisional admissions from this view

    aaQuery = applyRoleBasedCollegeFilter(aaQuery, userProfile, 'admissions');

    const { data: accountAdmissions, error: aaError } = await aaQuery;

    if (aaError) {
        console.error('Error fetching account admissions:', aaError.message);
        return { accountAdmissions: [], feeStructures: [] };
    }

    // Process to get fee structures for each admission
    const feeStructuresPromises = accountAdmissions?.map(async (aa) => {
        const courseId = aa.applications?.courses?.id;
        const academicYearId = aa.applications?.admission_cycles?.academic_year_id;

        if (!courseId || !academicYearId) return null;

        const { data: feeStructure, error: fsError } = await supabase
            .from('fee_structures')
            .select('id, total_amount, metadata')
            .eq('course_id', courseId)
            .eq('academic_year_id', academicYearId)
            .single();

        if (fsError) {
            console.error(`Error fetching fee structure for application ${aa.application_id}:`, fsError.message);
            return null;
        }
        return { applicationId: aa.application_id, feeStructure };
    }) || [];

    const feeStructures = (await Promise.all(feeStructuresPromises)).filter(Boolean);

    return {
        accountAdmissions: accountAdmissions || [],
        feeStructures: feeStructures
    };
};

export const actions: Actions = {
    updateAccountStatus: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const account_admission_id = formData.get('account_admission_id') as string;
        const status = formData.get('status') as string;
        const remarks = formData.get('remarks') as string;

        // Basic validation
        if (!['pending', 'cleared', 'partial'].includes(status)) {
            return fail(400, { message: 'Invalid status provided.', error: true });
        }

        const { error } = await supabase
            .from('account_admissions')
            .update({ account_status: status, remarks: remarks })
            .eq('id', account_admission_id);

        if (error) {
            console.error('Error updating account admission status:', error.message);
            return fail(500, { message: 'Failed to update account status.', error: true });
        }

        return { success: true, message: 'Account status updated successfully!' };
    }
};
