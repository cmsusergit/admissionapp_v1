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
        .select(`
            branch_id, 
            id, 
            status, 
            form_type, 
            student_id,
            application_fee_status,
            payments (
                payment_type,
                status
            ),
            account_admissions (
                admission_number
            )
        `);

    if (appError) {
        console.error('Capacity Report - applications fetch error:', appError.message);
    }

    // New Structure: branch_id -> { [metric]: { total: number, formTypes: { [type]: count } }, students: Set }
    const branchStats: Record<string, any> = {};

    // Helper to ensure a branch has its stats initialized
    const ensureBranch = (branchId: string) => {
        if (!branchStats[branchId]) {
            branchStats[branchId] = {
                all: { total: 0, formTypes: {} },
                submitted: { total: 0, formTypes: {} },
                approved: { total: 0, formTypes: {} },
                paid: { total: 0, formTypes: {} },
                admitted: { total: 0, formTypes: {} },
                students: {}
            };
        }
        return branchStats[branchId];
    };

    allApps?.forEach((app) => {
        if (!app.branch_id) return;
        
        const stats = ensureBranch(app.branch_id);
        const type = (app.form_type || 'Unknown').trim();

        // Helper to increment
        const increment = (metric: string) => {
            stats[metric].total += 1;
            stats[metric].formTypes[type] = (stats[metric].formTypes[type] || 0) + 1;
        };

        // 1. All Applications: Everything fetched
        increment('all');

        // 2. Submitted Apps: Anything that is not a draft (submitted, verified, approved, etc.)
        if (app.status !== 'draft') {
            increment('submitted');
        }

        // 3. Approved Apps: Specifically approved
        if (app.status === 'approved') {
            increment('approved');
        }
        
        // 4. Paid: Application/Provisional fee paid
        const hasPaidAppFee = (app.payments as any || []).some(
            (p: any) => (p.payment_type === 'application_fee' || p.payment_type === 'provisional_fee') && p.status === 'completed'
        ) || app.application_fee_status === 'paid';

        if (hasPaidAppFee) {
            increment('paid');
        }

        // 5. Admitted: (Tuition fee paid) AND (College ID / Admission Number generated)
        const hasTuitionFee = (app.payments as any || []).some(
            (p: any) => p.payment_type === 'tuition_fee' && p.status === 'completed'
        );
        const hasAdmissionNumber = !!(app.account_admissions as any)?.admission_number;

        if (hasTuitionFee && hasAdmissionNumber) {
            increment('admitted');
        }

        // Unique student tracking for Detailed View
        if (app.student_id) {
            if (!stats.students[app.student_id]) stats.students[app.student_id] = new Set();
            stats.students[app.student_id].add(type);
        }
    });

    const globalFormTypesSet = new Set<string>();

    const capacityDataGrouped = (courses || []).reduce((acc: any, course: any) => {
        const collegeName = course.colleges?.name || 'Unknown College';
        if (!acc[collegeName]) {
            acc[collegeName] = { courses: [], formTypesSet: new Set<string>() };
        }

        const mappedBranches = (course.branches || []).map((branch: any) => {
            const stats = branchStats[branch.id];
            let uniqueCount = 0;
            let commonCount = 0;
            
            if (stats) {
                // Populate form types for this college
                ['all', 'submitted', 'approved', 'paid', 'admitted'].forEach(metric => {
                    Object.keys(stats[metric].formTypes).forEach(ft => {
                        acc[collegeName].formTypesSet.add(ft);
                        globalFormTypesSet.add(ft);
                    });
                });
                
                uniqueCount = Object.keys(stats.students).length;
                commonCount = Object.values(stats.students).filter((s: any) => s.size > 1).length;
            }

            // Backwards compatibility for Detailed View: formType -> { total, approved }
            const legacyFormTypes: Record<string, { total: number, approved: number }> = {};
            if (stats) {
                Object.keys(stats.all.formTypes).forEach(ft => {
                    legacyFormTypes[ft] = {
                        total: stats.all.formTypes[ft] || 0,
                        approved: stats.approved.formTypes[ft] || 0
                    };
                });
            }

            return {
                id: branch.id,
                name: branch.name,
                capacity: branch.intake_capacity || 0,
                // Detailed View backwards compatibility
                approved: stats?.approved?.total || 0,
                admissions: stats?.admitted?.total || 0,
                formTypes: legacyFormTypes,
                // Full metrics for Simple View
                metrics: stats || {
                    all: { total: 0, formTypes: {} },
                    submitted: { total: 0, formTypes: {} },
                    approved: { total: 0, formTypes: {} },
                    paid: { total: 0, formTypes: {} },
                    admitted: { total: 0, formTypes: {} }
                },
                uniqueCount,
                commonCount,
                // Keep these for now to avoid breaking other logic if it uses them
                paidApps: stats?.paid?.total || 0,
                paidFormTypes: stats?.paid?.formTypes || {},
                admissionsFormTypes: stats?.admitted?.formTypes || {}
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
