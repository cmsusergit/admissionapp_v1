import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login');
    }

    // Fetch all users with their details
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('*, universities(name), colleges(name)')
        .order('created_at', { ascending: false });

    // Fetch lists for dropdowns
    const { data: universities } = await supabase.from('universities').select('id, name');
    const { data: colleges } = await supabase.from('colleges').select('id, name, university_id');

    if (usersError) {
        console.error('Error fetching users:', usersError.message);
        return { users: [], universities: [], colleges: [] };
    }

    return {
        users: users || [],
        universities: universities || [],
        colleges: colleges || []
    };
};

export const actions: Actions = {
    createUser: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        const full_name = formData.get('full_name') as string;
        const role = formData.get('role') as string;
        const university_id = formData.get('university_id') as string || null;
        const college_id = formData.get('college_id') as string || null;

        const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

        if (!SERVICE_KEY) {
            return fail(500, { 
                message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing. Cannot create users programmatically.', 
                error: true 
            });
        }

        // Initialize Service Client
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SERVICE_KEY);

        // 1. Create Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm
            user_metadata: { full_name }
        });

        if (authError) {
            console.error('Error creating auth user:', authError.message);
            return fail(400, { message: authError.message, error: true });
        }

        if (!authData.user) {
            return fail(500, { message: 'Failed to create auth user.', error: true });
        }

        // 2. Create Public Profile
        // We use the admin client here too to bypass any RLS that might block 'insert' on users table
        // although our policy allows admins to insert.
        const { error: profileError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authData.user.id,
                email,
                role,
                full_name,
                university_id,
                college_id
            });

        if (profileError) {
            console.error('Error creating public profile:', profileError.message);
            // Optional: delete auth user if profile creation fails to keep consistency?
            return fail(500, { message: 'User created in Auth but failed to create profile: ' + profileError.message, error: true });
        }

        return { success: true, message: 'User created successfully!' };
    },

    resetPassword: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const userId = formData.get('id') as string;
        const newPassword = formData.get('newPassword') as string;

        const SERVICE_KEY = SUPABASE_SERVICE_ROLE_KEY;

        if (!SERVICE_KEY) {
            return fail(500, { 
                message: 'Server configuration error: SUPABASE_SERVICE_ROLE_KEY is missing. Cannot reset passwords programmatically.', 
                error: true 
            });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SERVICE_KEY);

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: newPassword
        });

        if (error) {
            console.error('Error resetting password:', error.message);
            return fail(500, { message: error.message, error: true });
        }

        return { success: true, message: 'Password reset successfully!' };
    },

    updateRole: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const userId = formData.get('id') as string;
        const role = formData.get('role') as string;
        const university_id = formData.get('university_id') as string || null;
        const college_id = formData.get('college_id') as string || null;

        // Prevent admin from removing their own admin status (safety check)
        if (userId === authenticatedUser.id && role !== 'admin') {
             return fail(400, { message: 'You cannot remove your own admin status.', error: true });
        }

        const { error } = await supabase.from('users').update({
            role,
            university_id,
            college_id
        }).eq('id', userId);

        if (error) {
            console.error('Error updating user role:', error.message);
            return fail(500, { message: error.message, error: true });
        }

        return { success: true, message: 'User updated successfully!' };
    },

    deleteUser: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const userId = formData.get('id') as string;

        if (userId === authenticatedUser.id) {
            return fail(400, { message: 'You cannot delete yourself.', error: true });
        }

        // Delete from 'users' table. Note: This cascades to auth.users if Supabase is configured that way, 
        // but typically we delete from auth.users via service role. 
        // Since we don't have service role access easily here, we delete from public.users.
        // If there's a trigger, it might handle auth.users.
        // For now, removing from public.users removes their access to the app data.
        
        const { error } = await supabase.from('users').delete().eq('id', userId);

        if (error) {
            console.error('Error deleting user:', error.message);
            return fail(500, { message: error.message, error: true });
        }

        return { success: true, message: 'User deleted successfully!' };
    }
};