import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { calculateAndRankMerit } from '$lib/server/merit'; // Ensure correct import
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (!['adm_officer', 'admin'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    // Fetch options
    const { data: courses } = await supabase.from('courses').select('id, name');
    const { data: cycles } = await supabase.from('admission_cycles').select('id, name').eq('is_active', true);
    const { data: formTypes } = await supabase.from('form_types').select('name').eq('is_active', true).order('name');

    // Fetch admission forms to determine publication status
    const { data: admissionForms } = await supabase
        .from('admission_forms')
        .select('course_id, cycle_id, form_type, is_merit_published');

    // Fetch ALL relevant applications (Verified + Approved) to show locally filtered list
    // Ideally this should be paginated or filtered by URL params for performance, but starting simple.
    const { data: applications, error: appError } = await supabase
        .from('applications')
        .select(`
            id, status, course_id, cycle_id, form_type,
            student_user:users!applications_student_id_fkey (full_name, email),
            merit_list_entries(merit_rank, merit_score)
        `)
        .in('status', ['verified', 'approved', 'waitlisted']);

    if (appError) {
        console.error('Error fetching applications:', appError.message);
    }

    // Flatten and sort
    const mappedApps = applications?.map(app => {
        const meritEntry = Array.isArray(app.merit_list_entries) 
            ? app.merit_list_entries[0] 
            : app.merit_list_entries;
        return {
            ...app,
            merit_rank: meritEntry?.merit_rank,
            merit_score: meritEntry?.merit_score
        };
    }).sort((a, b) => {
        // Sort by rank ascending (nulls last)
        if (a.merit_rank && b.merit_rank) return a.merit_rank - b.merit_rank;
        if (a.merit_rank) return -1;
        if (b.merit_rank) return 1;
        return 0;
    }) || [];

    return {
        courses: courses || [],
        cycles: cycles || [],
        formTypes: formTypes || [],
        applications: mappedApps,
        admissionForms: admissionForms || []
    };
};

export const actions: Actions = {
    generateMerit: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;

        if (!course_id || !cycle_id) {
            return fail(400, { message: 'Course and Cycle are required.', error: true });
        }

        // Use Service Role to bypass RLS for bulk updates if needed (though adm_officer should have permissions)
        // Using service role guarantees the update works regardless of complex RLS on 'merit_rank' updates.
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const result = await calculateAndRankMerit(supabaseAdmin, course_id, cycle_id, form_type);

        if (!result.success) {
            return fail(500, { message: result.message, error: true });
        }

        return { success: true, message: result.message };
    },

    publishMerit: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;

        // Use Service Role to bypass RLS (Admission Officer might not have UPDATE permission on forms table)
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch ALL forms for this course/cycle to perform robust matching in JS
        const { data: candidates, error: findError } = await supabaseAdmin.from('admission_forms')
            .select('id, form_type')
            .eq('course_id', course_id)
            .eq('cycle_id', cycle_id);
        
        if (findError || !candidates || candidates.length === 0) {
             return fail(404, { message: 'Admission form configuration not found.', error: true });
        }

        // Find the target form
        const target = candidates.find(c => 
            c.form_type === form_type || 
            (!c.form_type && (form_type === 'Provisional' || form_type === 'MQ/NRI'))
        );

        if (!target) {
            console.error(`No matching form found for type '${form_type}'. Candidates:`, candidates);
            return fail(404, { message: `Form type '${form_type}' configuration not found.`, error: true });
        }

        // Update the identified form
        const { error } = await supabaseAdmin
            .from('admission_forms')
            .update({ is_merit_published: true })
            .eq('id', target.id);

        if (error) {
            console.error('Error publishing merit list:', error.message);
            return fail(500, { message: 'Failed to publish merit list.', error: true });
        }

        return { success: true, message: 'Merit List Published successfully! (Ranks are now live)' };
    },

    unpublishMerit: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch ALL forms for this course/cycle
        const { data: candidates, error: findError } = await supabaseAdmin.from('admission_forms')
            .select('id, form_type')
            .eq('course_id', course_id)
            .eq('cycle_id', cycle_id);
        
        if (findError || !candidates || candidates.length === 0) {
             return fail(404, { message: 'Admission form configuration not found.', error: true });
        }

        // Find the target form
        const target = candidates.find(c => 
            c.form_type === form_type || 
            (!c.form_type && (form_type === 'Provisional' || form_type === 'MQ/NRI'))
        );

        if (!target) {
            return fail(404, { message: `Form type '${form_type}' configuration not found.`, error: true });
        }

        const { error } = await supabaseAdmin
            .from('admission_forms')
            .update({ is_merit_published: false })
            .eq('id', target.id);

        if (error) {
            console.error('Error unpublishing merit list:', error.message);
            return fail(500, { message: 'Failed to unpublish merit list.', error: true });
        }

        return { success: true, message: 'Merit List Unpublished. Ranks hidden from students.' };
    }
};
