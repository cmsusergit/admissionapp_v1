import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ url, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session || !['adm_officer', 'admin', 'college_auth'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    // Service Role to bypass RLS for complex joins/filtering if needed
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Params ---
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || 'submitted'; // Default to pending verification

    const offset = (page - 1) * limit;

    // 2. Fetch Applications
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id, status, form_type, submitted_at,
            student_user:users!student_id!inner (full_name, email),
            courses (name, code),
            branches (name)
        `, { count: 'exact' });

    // Apply Security Filter
    query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');

    // Filter by status tab
    // 'pending' tab usually means 'submitted' or 'needs_correction'
    // 'processed' tab means 'verified' or 'approved' or 'rejected'
    if (status === 'submitted') {
        query = query.in('status', ['submitted', 'needs_correction']);
    } else if (status === 'processed') {
        query = query.in('status', ['verified', 'approved', 'rejected', 'cancelled']);
    } else {
        query = query.eq('status', status);
    }

    // Search
    if (search) {
                    query = query.or(`full_name.ilike.%${search}%`, { foreignTable: 'student_user' });    }

    // Sort & Paginate
    query = query
        .order('submitted_at', { ascending: false })
        .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
        console.error('Error fetching applications:', error);
    }

    return {
        applications: data || [],
        count: count || 0,
        page,
        limit,
        search,
        status
    };
};
