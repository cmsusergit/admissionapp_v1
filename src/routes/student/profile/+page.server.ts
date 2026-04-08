import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, parent }) => {
    const parentData = await parent(); // Access parent layout data

    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'student') {
        throw redirect(303, '/login');
    }

    // 1. Fetch Schema Definition
    const { data: schemaFields } = await supabase
        .from('student_profile_fields')
        .select('key, label, type, is_required, options')
        .order('created_at');

    // 2. Fetch Student Profile Data from parent layout
    const profile = parentData.studentProfile;

    return {
        schemaFields: schemaFields || [],
        profile: profile || { profile_data: {} },
        user: userProfile
    };
};

export const actions: Actions = {
    updateProfile: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'student') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const profileData: Record<string, any> = {};
        const isDraft = formData.get('is_draft') === 'true';

        // 1. Fetch Schema Definition for Validation
        const { data: schemaFields } = await supabase
            .from('student_profile_fields')
            .select('key, label, type, is_required');

        // Iterate over form data and build profile_data object
        for (const [key, value] of formData.entries()) {
            if (!key.startsWith('_') && key !== 'is_draft') {
                profileData[key] = value;
            }
        }

        // Server-side validation if NOT a draft
        if (!isDraft && schemaFields) {
            for (const field of schemaFields) {
                if (field.is_required && !profileData[field.key]) {
                     return fail(400, { message: `Field ${field.label} is required.`, error: true });
                }
            }
        }

        // Upsert profile
        const { error } = await supabase
            .from('student_profiles')
            .upsert({
                user_id: userProfile.id,
                profile_data: profileData,
                // Do NOT update enrollment_number or admission_status here (security)
            }, { onConflict: 'user_id' });

        if (error) {
            console.error('Error updating profile:', error);
            return fail(500, { message: 'Failed to update profile.', error: true });
        }

        return { success: true, message: isDraft ? 'Profile saved as draft!' : 'Profile submitted successfully!' };
    }
};
