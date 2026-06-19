import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { getSession, userProfile, supabase } }) => {
    const session = await getSession();
    if (!session || !userProfile) {
        throw redirect(303, '/login');
    }

    const { data: record, error } = await supabase
        .from('busseva_fees')
        .select(`
            *,
            student:users!fk_busseva_fees_student (
                full_name,
                email,
                student_profiles (
                    enrollment_number,
                    active_app:applications (
                        courses (
                            name,
                            colleges ( name )
                        ),
                        branches ( name )
                    )
                )
            ),
            collector:users!fk_busseva_fees_collector (
                full_name
            )
        `)
        .eq('id', params.id)
        .single();

    if (error || !record) {
        throw redirect(303, '/busseva?error=Receipt+not+found');
    }

    // Role security check: allowed for collectors, DEOs, or the student themselves
    if (userProfile.role !== 'fee_collector' && userProfile.role !== 'deo' && userProfile.id !== record.student_id) {
        throw redirect(303, '/login');
    }

    // College restriction security check
    if (['fee_collector', 'deo'].includes(userProfile.role) && userProfile.college_id && record.college_id !== userProfile.college_id) {
        throw redirect(303, '/busseva?error=Unauthorized');
    }

    return { record };
};
