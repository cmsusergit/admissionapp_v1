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
        .select('id, name, college_id, intake_capacity, branches(id, name, intake_capacity), colleges(name)');

    if (userProfile.role === 'adm_officer' && userProfile.college_id) {
        coursesQuery = coursesQuery.eq('college_id', userProfile.college_id);
    }

    const { data: courses, error: coursesError } = await coursesQuery;
    if (coursesError) {
        console.error('Capacity Report - courses fetch error:', coursesError.message);
    }

    const { data: allApps, error: appError } = await supabaseAdmin
        .from('applications')
        .select('branch_id, id, status, form_type, student_id');

    if (appError) {
        console.error('Capacity Report - applications fetch error:', appError.message);
    }

    const { data: admCounts, error: admError } = await supabaseAdmin
        .from('account_admissions')
        .select('id, applications(branch_id, form_type)');

    if (admError) {
        console.error('Capacity Report - admissions fetch error:', admError.message);
    }

    // Structure for admissions: branch_id -> { total: number, formTypes: Record<string, number> }
    const branchAdmStats: Record<string, { total: number, formTypes: Record<string, number> }> = {};
    admCounts?.forEach((adm) => {
        const branchId = (adm.applications as any)?.branch_id;
        const type = (adm.applications as any)?.form_type || 'Unknown';
        if (branchId) {
            if (!branchAdmStats[branchId]) {
                branchAdmStats[branchId] = { total: 0, formTypes: {} };
            }
            branchAdmStats[branchId].total += 1;
            branchAdmStats[branchId].formTypes[type] = (branchAdmStats[branchId].formTypes[type] || 0) + 1;
        }
    });

    // Structure: branch_id -> { totalApproved: number, formTypes: { ... }, students: Record<string, Set<string>> }
    const branchAppStats: Record<string, { 
        totalApproved: number, 
        formTypes: Record<string, { total: number, approved: number }>,
        students: Record<string, Set<string>>
    }> = {};
    
    allApps?.forEach((app) => {
        if (!app.branch_id) return;
        
        if (!branchAppStats[app.branch_id]) {
            branchAppStats[app.branch_id] = { totalApproved: 0, formTypes: {}, students: {} };
        }

        const type = app.form_type || 'Unknown';
        if (!branchAppStats[app.branch_id].formTypes[type]) {
            branchAppStats[app.branch_id].formTypes[type] = { total: 0, approved: 0 };
        }

        if (app.student_id) {
            if (!branchAppStats[app.branch_id].students[app.student_id]) {
                branchAppStats[app.branch_id].students[app.student_id] = new Set();
            }
            branchAppStats[app.branch_id].students[app.student_id].add(type);
        }

        branchAppStats[app.branch_id].formTypes[type].total += 1;
        if (app.status === 'approved') {
            branchAppStats[app.branch_id].totalApproved += 1;
            branchAppStats[app.branch_id].formTypes[type].approved += 1;
        }
    });

    const globalFormTypesSet = new Set<string>();

    const capacityDataGrouped = (courses || []).reduce((acc: any, course: any) => {
        const collegeName = course.colleges?.name || 'Unknown College';
        if (!acc[collegeName]) {
            acc[collegeName] = { courses: [], formTypesSet: new Set<string>() };
        }

        const mappedBranches = (course.branches || []).map((branch: any) => {
            const stats = branchAppStats[branch.id];
            const admStats = branchAdmStats[branch.id];
            let uniqueCount = 0;
            let commonCount = 0;
            
            if (stats) {
                // Populate global form types
                Object.keys(stats.formTypes).forEach(ft => {
                    acc[collegeName].formTypesSet.add(ft);
                    globalFormTypesSet.add(ft);
                });
                
                uniqueCount = Object.keys(stats.students).length;
                commonCount = Object.values(stats.students).filter(s => s.size > 1).length;
            }

            // Also ensure form types from admissions are in the global set
            if (admStats) {
                Object.keys(admStats.formTypes).forEach(ft => {
                    acc[collegeName].formTypesSet.add(ft);
                    globalFormTypesSet.add(ft);
                });
            }

            return {
                id: branch.id,
                name: branch.name,
                capacity: branch.intake_capacity || 0,
                approved: stats?.totalApproved || 0,
                formTypes: stats?.formTypes || {},
                uniqueCount,
                commonCount,
                admissions: admStats?.total || 0,
                admissionsFormTypes: admStats?.formTypes || {},
            };
        });

        acc[collegeName].courses.push({
            courseName: course.name,
            branches: mappedBranches,
        });

        return acc;
    }, {});

    const globalUniqueFormTypes = Array.from(globalFormTypesSet).sort();

    const capacityData = Object.keys(capacityDataGrouped).map(collegeName => ({
        collegeName,
        courses: capacityDataGrouped[collegeName].courses,
        uniqueFormTypes: Array.from(capacityDataGrouped[collegeName].formTypesSet).sort()
    }));

    return {
        capacityData,
        globalUniqueFormTypes
    };
};
