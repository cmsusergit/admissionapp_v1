import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session || userProfile?.role !== 'hod' || !userProfile?.branch_id) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch HOD Department (Branch) details
    const { data: branchInfo, error: branchError } = await supabaseAdmin
        .from('branches')
        .select(`
            name, 
            code,
            courses(
                name, 
                code,
                colleges(name)
            )
        `)
        .eq('id', userProfile.branch_id)
        .single();

    if (branchError || !branchInfo) {
        console.error('HOD Load Error: Department info not found.', branchError);
        return {
            department: {
                branchName: 'Unknown Department',
                courseName: 'N/A',
                collegeName: 'N/A'
            },
            students: [],
            error: 'Department configuration missing.'
        };
    }

    // 2. Query applications for HOD's branch
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id,
            form_type,
            admission_type,
            submitted_at,
            form_data,
            courses!inner(name, college_id, colleges(name)),
            student_user:users!student_id(
                full_name, 
                email, 
                student_profiles(enrollment_number, admission_status)
            ),
            account_admissions(admission_number),
            merit_list_entries(merit_score)
        `)
        .eq('branch_id', userProfile.branch_id)
        .neq('status', 'draft');

    // 3. Apply college filter (scopes to college_id if set, else global)
    query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');

    const { data: applications, error: appsError } = await query;

    if (appsError) {
        console.error('HOD Load Error: Applications query failed.', appsError);
    }

    // 4. Filter in-memory to only include final 'Admitted' students with college ID assigned
    const admittedStudents = (applications || [])
        .filter((app: any) => {
            const profiles = app.student_user?.student_profiles;
            const profile = Array.isArray(profiles) ? profiles[0] : profiles;
            return profile?.admission_status === 'Admitted' && app.courses?.college_id;
        })
        .map((app: any, index: number) => {
            const profiles = app.student_user?.student_profiles;
            const profile = Array.isArray(profiles) ? profiles[0] : profiles;
            const meritEntry = Array.isArray(app.merit_list_entries) ? app.merit_list_entries[0] : app.merit_list_entries;
            const admissionEntry = Array.isArray(app.account_admissions) ? app.account_admissions[0] : app.account_admissions;

            return {
                srNo: index + 1,
                id: app.id,
                fullName: app.student_user?.full_name || 'N/A',
                email: app.student_user?.email || 'N/A',
                enrollmentNumber: profile?.enrollment_number || 'Pending',
                admissionNumber: admissionEntry?.admission_number || 'N/A',
                meritScore: meritEntry?.merit_score || 'N/A',
                formType: app.form_type || 'N/A',
                admissionType: app.admission_type || 'Regular',
                collegeName: app.courses?.colleges?.name || 'N/A',
                submittedAt: app.submitted_at,
                formData: app.form_data
            };
        });

    const courseName = (branchInfo?.courses as any)?.name || 'N/A';
    const collegeName = userProfile.college_id 
        ? ((branchInfo?.courses as any)?.colleges?.name || 'N/A') 
        : 'All Colleges (Global Access)';

    return {
        department: {
            branchName: branchInfo?.name || 'N/A',
            courseName,
            collegeName
        },
        students: admittedStudents
    };
};
