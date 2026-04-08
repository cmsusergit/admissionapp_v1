// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions = {
    default: async ({ locals: { supabase }, cookies }: import('./$types').RequestEvent) => {
        console.log('Server Action: Logging out...');
        
    const { error } = await supabase.auth.signOut();

    if (error) {
        console.error('Error logging out:', error.message);
    }

    // Redirect to the root path which now serves as the login page when unauthenticated
    throw redirect(303, '/');
    }
};;null as any as Actions;