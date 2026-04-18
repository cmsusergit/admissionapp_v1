import { fail, redirect } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ url, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const user = await getAuthenticatedUser();
    if (!user || !['admin', 'adm_officer', 'university_auth', 'college_auth', 'deo'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    // 1. Get filter parameters
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const academicYearId = url.searchParams.get('academicYearId') || '';
    const courseId = url.searchParams.get('courseId') || '';
    const status = url.searchParams.get('status') || '';
    const search = url.searchParams.get('search') || '';

    // 2. Fetch Helper Data (Filters)
    const [yearsRes, coursesRes] = await Promise.all([
        supabase.from('academic_years').select('id, name').order('name', { ascending: false }),
        supabase.from('courses').select('id, name').order('name')
    ]);

    // 3. Build Inquiry Query
    let query = supabase
        .from('inquiries')
        .select(`
            *,
            form:inquiry_forms(name),
            academic_year:academic_years(name),
            preferences:inquiry_preferences(
                priority,
                course:courses(id, name),
                branch:branches(name)
            )
        `, { count: 'exact' });

    // Apply Filters
    if (academicYearId) query = query.eq('academic_year_id', academicYearId);
    if (status === 'processed') query = query.eq('is_processed', true);
    if (status === 'new') query = query.eq('is_processed', false);
    
    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    if (courseId) {
        const { data: prefIds } = await supabase
            .from('inquiry_preferences')
            .select('inquiry_id')
            .eq('course_id', courseId);
        
        const ids = (prefIds || []).map(p => p.inquiry_id);
        if (ids.length > 0) {
            query = query.in('id', ids);
        } else {
            return {
                inquiries: [],
                totalCount: 0,
                academicYears: yearsRes.data || [],
                courses: coursesRes.data || [],
                filters: { page, pageSize, academicYearId, courseId, status, search }
            };
        }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    
    const { data: inquiries, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) console.error('Error fetching inquiries:', error);

    return {
        inquiries: inquiries || [],
        totalCount: count || 0,
        academicYears: yearsRes.data || [],
        courses: coursesRes.data || [],
        filters: { page, pageSize, academicYearId, courseId, status, search }
    };
};

export const actions: Actions = {
    deleteInquiries: async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
        const user = await getAuthenticatedUser();
        if (!user || !['admin', 'adm_officer'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized: Only Admin and Admission Officers can delete inquiries.' });
        }

        const formData = await request.formData();
        const idsRaw = formData.get('ids') as string;
        
        if (!idsRaw) return fail(400, { message: 'No IDs provided' });
        
        let ids: string[] = [];
        try {
            ids = JSON.parse(idsRaw);
        } catch (e) {
            return fail(400, { message: 'Invalid format for IDs' });
        }

        if (!Array.isArray(ids) || ids.length === 0) return fail(400, { message: 'No records selected' });

        // Bypass RLS for admin deletion using Service Role
        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabaseAdmin
            .from('inquiries')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('Admin Delete Error:', error);
            return fail(500, { message: 'Failed to delete records: ' + error.message });
        }

        return { success: true };
    }
};
