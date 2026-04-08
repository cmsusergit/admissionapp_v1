import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    // Fallback: If userProfile is missing from locals (hooks issue) but user exists, try to fetch it now.
    let currentRole = userProfile?.role;
    let currentProfile = userProfile;

    if (!currentRole) {
        console.warn('Student Load: User authenticated but profile missing in locals. Fetching directly...');
        const { data: profile } = await supabase
            .from('users')
            .select('id, role')
            .eq('id', authenticatedUser.id)
            .single();
        
        if (profile) {
            currentRole = profile.role;
            currentProfile = profile; // Use this as the profile
        }
    }

    if (currentRole !== 'student') {
        // If still not a student (or profile fetch failed), redirect.
        // But if profile fetch failed, maybe we shouldn't loop to login? 
        // For now, consistent behavior:
        console.warn('Student Load: Role mismatch or profile not found. Role:', currentRole);
        throw redirect(303, '/login'); 
    }

    // Use currentProfile instead of userProfile below if needed, though we primarily needed the role check.
    // Ideally we should update userProfile in locals for downstream use, but locals is per-request.
    // We will rely on the role check passing now.

    // Fetch independent data concurrently
    const [
        { data: activeYears },
        { data: availableCourses },
        { data: applications, error: appError }
    ] = await Promise.all([
        supabase
            .from('academic_years')
            .select('id, name, admission_cycles(id, name, is_active)')
            .eq('is_active', true),
        supabase
            .from('courses')
            .select('id, name, code, colleges(name, universities(name))'),
        supabase
            .from('applications')
            .select(`
                *,
                courses(name),
                admission_cycles(name, academic_years(name)),
                account_admissions(admission_number),
                merit_list_entries(merit_rank, merit_score)
            `)
            .eq('student_id', userProfile.id)
    ]);

    if (appError) {
        console.error('Error fetching applications:', appError.message);
    }

    // Fetch form publication status
    const courseIds = applications?.map(a => a.course_id) || [];
    const cycleIds = applications?.map(a => a.cycle_id) || [];
    
    const { data: forms } = await supabase
        .from('admission_forms')
        .select('course_id, cycle_id, form_type, is_merit_published')
        .in('course_id', courseIds)
        .in('cycle_id', cycleIds);

    // Attach published flag to applications
    const appsWithMeritStatus = applications?.map(app => {
        // Default to 'MQ/NRI' if not specified, as per specific requirement
        const appFormType = app.form_type || 'MQ/NRI';
        const form = forms?.find(f => 
            f.course_id === app.course_id && 
            f.cycle_id === app.cycle_id &&
            (f.form_type === appFormType || (!f.form_type && appFormType === 'MQ/NRI'))
        );
        
        // Handle merit list entry (might be array or object depending on inference)
        const meritEntry = Array.isArray(app.merit_list_entries) 
            ? app.merit_list_entries[0] 
            : app.merit_list_entries;

        return {
            ...app,
            merit_rank: meritEntry?.merit_rank,
            merit_score: meritEntry?.merit_score,
            is_merit_published: form?.is_merit_published || false
        };
    }) || [];

    // --- Fetch Active Circulars ---
    // Fetch circulars that are active AND (targeted to user's applied courses OR global)
    // We already have 'courseIds' from the applications fetch above.
    
    // Note: RLS should handle the filtering, but explicitly filtering ensures logic aligns with UI expectations
    let circularQuery = supabase
        .from('circulars')
        .select('id, title, description, file_path, created_at, course_id, courses(name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    // Since RLS is in place (checking course_id IN applications), we can just select.
    // However, to be safe and clear:
    if (courseIds.length > 0) {
        // Build OR condition: course_id is null OR course_id in list
        // Supabase-js OR syntax: .or(`course_id.is.null,course_id.in.(${courseIds.join(',')})`)
        circularQuery = circularQuery.or(`course_id.is.null,course_id.in.(${courseIds.join(',')})`);
    } else {
         circularQuery = circularQuery.is('course_id', null);
    }

    const { data: circulars, error: circError } = await circularQuery;

    if (circError) {
        console.error('Error fetching circulars:', circError);
    }

    // Generate signed URLs for students to download
    const circularsWithUrls = await Promise.all((circulars || []).map(async (c) => {
        let signedUrl = null;
        if (c.file_path) {
            const { data } = await supabase
                .storage
                .from('circulars')
                .createSignedUrl(c.file_path, 3600);
            signedUrl = data?.signedUrl;
        }
        return { ...c, signedUrl };
    }));

    return {
        applications: appsWithMeritStatus,
        activeYears: activeYears || [],
        availableCourses: availableCourses || [],
        circulars: circularsWithUrls || []
    };
};
