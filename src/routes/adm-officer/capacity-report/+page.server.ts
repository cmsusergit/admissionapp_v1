import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session) {
        throw redirect(303, '/login');
    }

    if (!userProfile || (userProfile.role !== 'adm_officer' && userProfile.role !== 'admin')) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let coursesQuery = supabaseAdmin
        .from('courses')
        .select('id, name, intake_capacity, branches(id, name, intake_capacity)');

    if (userProfile.role === 'adm_officer' && userProfile.college_id) {
        coursesQuery = coursesQuery.eq('college_id', userProfile.college_id);
    }

    const { data: courses, error: coursesError } = await coursesQuery;
    if (coursesError) {
        console.error('Capacity Report - courses fetch error:', coursesError.message);
    }

    const { data: appCounts, error: appError } = await supabaseAdmin
        .from('applications')
        .select('branch_id, id')
        .eq('status', 'approved');

    if (appError) {
        console.error('Capacity Report - approved applications fetch error:', appError.message);
    }

    const { data: admCounts, error: admError } = await supabaseAdmin
        .from('account_admissions')
        .select('id, applications(branch_id)');

    if (admError) {
        console.error('Capacity Report - admissions fetch error:', admError.message);
    }

    const approvedMap: Record<string, number> = {};
    appCounts?.forEach((app) => {
        if (app.branch_id) {
            approvedMap[app.branch_id] = (approvedMap[app.branch_id] || 0) + 1;
        }
    });

    const admissionsMap: Record<string, number> = {};
    admCounts?.forEach((adm) => {
        const branchId = (adm.applications as any)?.branch_id;
        if (branchId) {
            admissionsMap[branchId] = (admissionsMap[branchId] || 0) + 1;
        }
    });

    const capacityData = (courses || []).map((course: any) => ({
        courseName: course.name,
        branches: (course.branches || []).map((branch: any) => ({
            id: branch.id,
            name: branch.name,
            capacity: branch.intake_capacity || 0,
            approved: approvedMap[branch.id] || 0,
            admissions: admissionsMap[branch.id] || 0,
        })),
    }));

    return {
        capacityData,
    };
};
