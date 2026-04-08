// @ts-nocheck
import type { LayoutServerLoad } from './$types';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '$lib/stores/userStore';

export const load = async ({ locals: { getAuthenticatedUser, supabase, userProfile } }: Parameters<LayoutServerLoad>[0]) => {
	const authenticatedUser = await getAuthenticatedUser();
	
    // 1. Fetch Session
    const sessionPromise = authenticatedUser 
        ? supabase.auth.getSession().then(({ data }) => data.session) 
        : Promise.resolve(null);

    // 2. Fetch Default University ID if needed
    const universityIdPromise = userProfile?.university_id
        ? Promise.resolve(userProfile.university_id)
        : supabase.from('universities').select('id').limit(1).maybeSingle().then(({ data }) => data?.id);

    // 3. Fetch Avatar if student
    const avatarPromise = userProfile?.role === 'student'
        ? supabase.from('student_profiles').select('profile_data').eq('user_id', userProfile.id).maybeSingle().then(({ data }) => data?.profile_data?.photo || null)
        : Promise.resolve(null);

    // Execute concurrently
    const [session, universityIdToFetch, avatarUrl] = await Promise.all([
        sessionPromise,
        universityIdPromise,
        avatarPromise
    ]);

    // 4. Fetch Branding using resolved ID
    let universityBranding = null;
    if (universityIdToFetch) {
        const { data: branding } = await supabase
            .from('universities')
            .select('name, logo_url, footer_text')
            .eq('id', universityIdToFetch)
            .maybeSingle();
        universityBranding = branding;
    }
	
	return {
		session,
		userProfile, // userProfile is already populated in hooks.server.ts and available here
        universityBranding,
        avatarUrl
	};
};
