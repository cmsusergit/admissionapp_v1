import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login'); // Redirect non-admin users
    }

    const courseId = url.searchParams.get('courseId');
    const cycleId = url.searchParams.get('cycleId');
    const formType = url.searchParams.get('formType');
    const search = url.searchParams.get('search');
    const sortBy = url.searchParams.get('sortBy') || 'merit_rank';
    const sortOrder = url.searchParams.get('sortOrder') || 'asc';

    // Use Service Role to bypass RLS for fetching all applications
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch options for filters
    const { data: courses } = await supabaseAdmin.from('courses').select('id, name');
    const { data: cycles } = await supabaseAdmin.from('admission_cycles').select('id, name');

    // Fetch applications that are eligible for merit calculation
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id,
            status,
            course_id,
            cycle_id,
            form_type,
            merit_list_entries!inner(merit_score, merit_rank),
            users!applications_student_id_fkey!inner(full_name, email),
            courses(id, name, colleges(name)),
            admission_cycles(name, academic_years(name))
        `)
        .in('status', ['submitted', 'verified', 'approved', 'waitlisted']);

    // Apply Filters
    if (courseId) query = query.eq('course_id', courseId);
    if (cycleId) query = query.eq('cycle_id', cycleId);
    if (formType) query = query.eq('form_type', formType);
    
    if (search) {
        // Search in users table
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, { foreignTable: 'users!applications_student_id_fkey' });
    }

    const { data: applications, error: appError } = await query;

    if (appError) {
        console.error('Error fetching applications for merit calculation:', appError.message);
        return { applications: [], courses: [], cycles: [], message: 'Error fetching applications.' };
    }

    // Flatten the data for easier consumption in the frontend
    let flattenedApps = applications?.map(app => {
        const meritEntry = Array.isArray(app.merit_list_entries) ? app.merit_list_entries[0] : app.merit_list_entries;
        return {
            ...app,
            merit_score: meritEntry?.merit_score ?? null,
            merit_rank: meritEntry?.merit_rank ?? null
        };
    }) || [];

    // Apply Sorting in-memory (Supabase JS client order() on foreign tables doesn't sort parent rows)
    if (sortBy === 'merit_rank' || sortBy === 'merit_score') {
        flattenedApps.sort((a, b) => {
            const valA = a[sortBy] !== null ? parseFloat(a[sortBy]) : null;
            const valB = b[sortBy] !== null ? parseFloat(b[sortBy]) : null;

            if (valA === null && valB === null) return 0;
            if (valA === null) return 1;
            if (valB === null) return -1;

            if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    } else {
        // Default sort by status if not merit sorting
        flattenedApps.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
    }

    return {
        applications: flattenedApps,
        courses: courses || [],
        cycles: cycles || [],
        filters: { courseId, cycleId, formType, search, sortBy, sortOrder },
        message: null
    };
};

export const actions: Actions = {
    updateMeritScore: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;
        const scoreStr = formData.get('merit_score') as string;
        const merit_score = parseFloat(scoreStr);

        if (!application_id || isNaN(merit_score)) {
             return fail(400, { message: 'Invalid application ID or Score', error: true });
        }

        // Use Service Role for updates
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Update merit_list_entries
        // We only update the score. Rank might become invalid/inconsistent, but that's expected with manual overrides.
        // Ideally, one would re-rank everything, but for a specific override, we just set the score.
        const { error: updateError } = await supabaseAdmin
            .from('merit_list_entries')
            .update({ 
                merit_score: merit_score
                // updated_at removed as per request
            })
            .eq('application_id', application_id);

        if (updateError) {
            console.error('Error updating merit score:', updateError.message);
            return fail(500, { message: 'Failed to update merit score.', error: true });
        }

        return { success: true, message: `Merit score updated to ${merit_score.toFixed(5)}` };
    },

    recalculateRanks: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const course_id = formData.get('course_id') as string;
        const cycle_id = formData.get('cycle_id') as string;
        const form_type = formData.get('form_type') as string;
        const start_rank_str = formData.get('start_rank') as string;
        const start_rank = parseInt(start_rank_str) || 1;

        if (!course_id || !cycle_id) {
            return fail(400, { message: 'Course and Cycle ID are required to recalculate ranks.', error: true });
        }

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch ALL merit entries for this specific group
        // We join with applications to filter by course/cycle/type
        const { data: entries, error: fetchError } = await supabaseAdmin
            .from('merit_list_entries')
            .select(`
                application_id, 
                merit_score,
                applications!inner (
                    id, course_id, cycle_id, form_type
                )
            `)
            .eq('applications.course_id', course_id)
            .eq('applications.cycle_id', cycle_id)
            .eq('applications.form_type', form_type || 'Provisional') // Handle null form_type? Usually defaulted.
            .order('merit_score', { ascending: false });

        if (fetchError) {
            console.error('Error fetching entries for ranking:', fetchError.message);
            return fail(500, { message: 'Failed to fetch entries.', error: true });
        }

        if (!entries || entries.length === 0) {
            return fail(404, { message: 'No entries found to rank.', error: true });
        }

        // Assign new ranks starting from start_rank
        const updates = entries.map((entry, index) => ({
            application_id: entry.application_id,
            merit_score: entry.merit_score, // Keep existing score
            merit_rank: start_rank + index
        }));

        // Batch update using upsert
        const { error: updateError } = await supabaseAdmin
            .from('merit_list_entries')
            .upsert(updates, { onConflict: 'application_id' });

        if (updateError) {
            console.error('Error updating ranks:', updateError.message);
            return fail(500, { message: 'Failed to update ranks.', error: true });
        }

        return { success: true, message: `Successfully recalculated ranks for ${updates.length} applications.` };
    }
};