// @ts-nocheck
import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load = async ({ url, locals: { supabase, getSession, userProfile } }: Parameters<PageServerLoad>[0]) => {
    const session = await getSession();

    if (!session || !['adm_officer', 'admin', 'college_auth'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    const collegeId = userProfile.college_id;
    if (!collegeId) {
        return { applications: [] };
    }

    // Use Service Role to ensure we get all data cleanly for bulk processing
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Filter Params
    const status = url.searchParams.get('status') || 'submitted'; // Default to Pending Verification
    const courseId = url.searchParams.get('courseId') || null;
    const search = url.searchParams.get('search') || ''; // Extract search term

    // 1. Get Course IDs for this college
    const { data: courses } = await supabaseAdmin
        .from('courses')
        .select('id, name')
        .eq('college_id', collegeId);
    
    const validCourseIds = courses?.map(c => c.id) || [];

    if (validCourseIds.length === 0) return { applications: [], courses: [], statusFilter: status, courseFilter: courseId, search, count: 0, page: 1, limit: parseInt(url.searchParams.get('limit') || '50') };

    // 2. Build Query
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id, status, form_type, submitted_at,
            student_user:users!student_id!inner (full_name, email),
            courses (name),
            branches (name),
            documents (*)
        `, { count: 'exact' })
        .in('course_id', validCourseIds);

    // Apply Status Filter
    // 'submitted' = pending verification by college
    if (status === 'submitted') {
        query = query.in('status', ['submitted', 'needs_correction']);
    } else {
        query = query.eq('status', status);
    }

    if (courseId) {
        query = query.eq('course_id', courseId);
    }

    // Add Search Filter
    if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, { foreignTable: 'student_user' });
    }

    // Pagination
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    query = query
        .order('submitted_at', { ascending: true })
        .range(offset, offset + limit - 1);

    const { data: applications, count, error } = await query;

    if (error) {
        console.error('Bulk Load Error:', error);
    }
    
    // Generate signed URLs for documents
    if (applications) {
        for (const app of applications) {
            if (app.documents) {
                for (const doc of app.documents) {
                    const { data: signed } = await supabaseAdmin.storage
                        .from('documents')
                        .createSignedUrl(doc.file_path, 3600);
                    if (signed) doc.signed_url = signed.signedUrl;
                }
            }
        }
    }

    return {
        applications: applications || [],
        courses: courses || [],
        statusFilter: status,
        courseFilter: courseId,
        search, // Include search in return
        count: count || 0,
        page,
        limit
    };
};

export const actions = {
    verifyStudent: async ({ request, locals: { getSession, userProfile } }: import('./$types').RequestEvent) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const application_id = formData.get('application_id') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Approve all documents
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'approved', rejection_reason: null })
            .eq('application_id', application_id);

        if (docError) {
            console.error('Doc Update Error:', docError);
            return fail(500, { message: 'Failed to approve documents.' });
        }

        // 2. Verify Application
        const { error: appError } = await supabaseAdmin
            .from('applications')
            .update({ status: 'verified' })
            .eq('id', application_id);

        if (appError) {
            console.error('App Verify Error:', appError);
            return fail(500, { message: 'Failed to verify application.' });
        }

        return { success: true, message: 'Student Verified Successfully' };
    },

    rejectDocument: async ({ request, locals: { getSession, userProfile } }: import('./$types').RequestEvent) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const document_id = formData.get('document_id') as string;
        const application_id = formData.get('application_id') as string;
        const reason = formData.get('reason') as string;

        if (!reason) return fail(400, { message: 'Rejection reason is required.' });

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Check application status
        const { data: app, error: appFetchError } = await supabaseAdmin
            .from('applications')
            .select('status')
            .eq('id', application_id)
            .single();

        if (appFetchError || !app) {
            console.error('App fetch error:', appFetchError?.message);
            return fail(404, { message: 'Application not found.' });
        }

        if (['verified', 'approved'].includes(app.status)) {
            return fail(403, { message: 'Error: Cannot reject document for an already verified or approved application.', error: true });
        }
        
        // 1. Reject Document
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'rejected', rejection_reason: reason })
            .eq('id', document_id);

        if (docError) return fail(500, { message: 'Failed to reject document.' });

        // 2. Flag Application
        const { error: appError } = await supabaseAdmin
            .from('applications')
            .update({ status: 'needs_correction' })
            .eq('id', application_id);

        if (appError) return fail(500, { message: 'Failed to update application status.' });

        return { success: true, message: 'Document Rejected.' };
    },

    undoRejectDocument: async ({ request, locals: { getSession, userProfile } }: import('./$types').RequestEvent) => {
        const session = await getSession();
        if (!session || !['adm_officer', 'college_auth'].includes(userProfile?.role || '')) {
            return fail(403, { message: 'Unauthorized' });
        }

        const formData = await request.formData();
        const document_id = formData.get('document_id') as string;
        const application_id = formData.get('application_id') as string;

        const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Reset Document
        const { error: docError } = await supabaseAdmin
            .from('documents')
            .update({ status: 'pending', rejection_reason: null })
            .eq('id', document_id);

        if (docError) return fail(500, { message: 'Failed to undo rejection.' });

        // 2. Check if any other documents are still rejected
        const { count, error: countError } = await supabaseAdmin
            .from('documents')
            .select('id', { count: 'exact', head: true })
            .eq('application_id', application_id)
            .eq('status', 'rejected');

        if (countError) console.error('Count Error:', countError);

        // 3. If no more rejected documents, revert application status to 'submitted'
        if (count === 0) {
            const { error: appError } = await supabaseAdmin
                .from('applications')
                .update({ status: 'submitted' })
                .eq('id', application_id)
                .eq('status', 'needs_correction'); // Only update if currently flagged for correction
            
            if (appError) console.error('App Revert Error:', appError);
        }

        return { success: true, message: 'Rejection Undone.' };
    }
};
;null as any as Actions;