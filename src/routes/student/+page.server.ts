import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    // Fallback: If userProfile is missing from locals (hooks issue) but user exists, try to fetch it now.
    let currentRole = userProfile?.role;
    let currentProfile: any = userProfile;

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

    const profileId = currentProfile?.id || authenticatedUser.id;

    // Initialize default values in case queries fail
    let activeYears: any[] = [];
    let applications: any[] = [];
    let enabledForms: any[] = [];
    let formTypes: any[] = [];
    let availableCourses: any[] = [];
    let circulars: any[] = [];

    try {
        // Fetch independent data concurrently with proper error handling
        const [activeYearsResult, appsResult, enabledFormsResult, formTypesResult] = await Promise.all([
            supabase
                .from('academic_years')
                .select('id, name, admission_cycles(id, name, is_active)')
                .eq('is_active', true),
            supabase
                .from('applications')
                .select(`
                    *,
                    courses(name),
                    admission_cycles(name, academic_years(name)),
                    account_admissions(admission_number),
                    merit_list_entries(merit_rank, merit_score)
                `)
                .eq('student_id', profileId),
            supabase
                .from('admission_forms')
                .select('course_id, cycle_id, form_type, is_enabled, is_merit_published')
                .eq('is_enabled', true),
            supabase
                .from('form_types')
                .select('name, student_can_apply')
        ]);

        // Handle results with proper error checking
        if (activeYearsResult.error) {
            console.error('Error fetching academic years:', activeYearsResult.error.message);
        } else {
            activeYears = activeYearsResult.data || [];
        }

        if (appsResult.error) {
            console.error('Error fetching applications:', appsResult.error.message);
        } else {
            applications = appsResult.data || [];
        }

        if (enabledFormsResult.error) {
            console.error('Error fetching enabled forms:', enabledFormsResult.error.message);
        } else {
            enabledForms = enabledFormsResult.data || [];
        }

        if (formTypesResult.error) {
            console.error('Error fetching form types:', formTypesResult.error.message);
        } else {
            formTypes = formTypesResult.data || [];
        }

        // Filter form types that students are allowed to apply for
        const allowedFormTypeNames = (formTypes || [])
            .filter(ft => ft.student_can_apply !== false) // Matches true or undefined
            .map(ft => ft.name);

        // Filter enabled forms by allowed form types
        const allowedEnabledForms = (enabledForms || []).filter(f => 
            allowedFormTypeNames.includes(f.form_type)
        );

        // Get unique course IDs that have at least one allowed enabled form
        const enabledCourseIds = Array.from(new Set(allowedEnabledForms.map(f => f.course_id)));

        // Now fetch courses, but filter by those that actually have enabled student-facing forms
        if (enabledCourseIds.length > 0) {
            const { data: coursesData, error: coursesError } = await supabase
                .from('courses')
                .select('id, name, code, colleges(name, universities(name))')
                .in('id', enabledCourseIds);

            if (coursesError) {
                console.error('Error fetching courses:', coursesError.message);
            } else {
                availableCourses = coursesData || [];
            }
        }

        const courseIds = applications?.map(a => a.course_id) || [];
        const cycleIds = applications?.map(a => a.cycle_id) || [];

        // Attach published flag to applications
        const appsWithMeritStatus = applications?.map(app => {
            // Default to 'MQ/NRI' if not specified, as per specific requirement
            const appFormType = app.form_type || 'MQ/NRI';
            const form = allowedEnabledForms?.find(f => 
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
        let circularQuery = supabase
            .from('circulars')
            .select('id, title, description, file_path, created_at, course_id, courses(name)')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (courseIds.length > 0) {
            circularQuery = circularQuery.or(`course_id.is.null,course_id.in.(${courseIds.join(',')})`);
        } else {
            circularQuery = circularQuery.is('course_id', null);
        }

        const { data: circularsData, error: circError } = await circularQuery;

        if (circError) {
            console.error('Error fetching circulars:', circError.message);
            circulars = [];
        } else {
            circulars = circularsData || [];
        }

        // Generate signed URLs for students to download (with error handling)
        const circularsWithUrls = await Promise.all((circulars || []).map(async (c) => {
            let signedUrl = null;
            if (c.file_path) {
                try {
                    const { data, error: signedUrlError } = await supabase
                        .storage
                        .from('circulars')
                        .createSignedUrl(c.file_path, 3600);
                    
                    if (signedUrlError) {
                        console.warn(`Failed to create signed URL for ${c.file_path}:`, signedUrlError.message);
                    } else {
                        signedUrl = data?.signedUrl || null;
                    }
                } catch (err) {
                    console.warn(`Exception creating signed URL for ${c.file_path}:`, err);
                }
            }
            return { ...c, signedUrl };
        }));

        return {
            applications: appsWithMeritStatus,
            activeYears: activeYears,
            availableCourses: availableCourses,
            circulars: circularsWithUrls || []
        };

    } catch (err) {
        console.error('Error in student dashboard load:', err);
        // Return minimal data instead of crashing
        return {
            applications: [],
            activeYears: [],
            availableCourses: [],
            circulars: []
        };
    }
};
