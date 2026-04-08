// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, depends }: Parameters<LayoutServerLoad>[0]) => {
    depends('student:profile'); // Tag for invalidation

    const authUser = await getAuthenticatedUser();
    // console.log('Student Layout: User:', authUser?.id, 'Role:', userProfile?.role);

    if (!authUser || !userProfile || userProfile.role !== 'student') {
        console.warn('Student Layout: Access denied. User:', authUser?.id, 'App Role:', userProfile?.role, 'Auth Role:', authUser?.role, 'Redirecting to /login');
        throw redirect(303, '/login'); // Redirect non-students or unauthenticated users
    }

    const { data: studentProfile, error: profileError } = await supabase
        .from('student_profiles')
        .select('profile_data, enrollment_number, admission_status')
        .eq('user_id', userProfile.id)
        .maybeSingle();

    if (profileError) {
        console.error('Error fetching student profile:', profileError.message);
    }

    return {
        userProfile,
        studentProfile: studentProfile || null
    };
};
