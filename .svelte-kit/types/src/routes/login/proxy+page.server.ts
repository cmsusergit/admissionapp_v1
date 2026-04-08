// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = async ({ locals: { getAuthenticatedUser, userProfile } }: Parameters<PageServerLoad>[0]) => {
    const user = await getAuthenticatedUser();
    // Only redirect if we have a valid profile. If user exists but profile is missing/null, 
    // stay on login page to avoid infinite redirect loops (e.g., / -> /student -> /login -> /).
    if (user && userProfile) {
        throw redirect(303, '/');
    }
};