import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ url, locals: { getSession, userProfile } }) => {
    const session = await getSession();
    if (!session) {
        throw redirect(303, '/login');
    }

    if (!userProfile || (userProfile.role !== 'adm_officer' && userProfile.role !== 'admin')) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch Metadata
    const [{ data: academicYears }, { data: activeYear }, { data: formTypes }] = await Promise.all([
        supabaseAdmin.from('academic_years').select('id, name').order('name', { ascending: false }),
        supabaseAdmin.from('academic_years').select('id').eq('is_active', true).maybeSingle(),
        supabaseAdmin.from('form_types').select('name, is_prov')
    ]);

    const selectedYearId = url.searchParams.get('academic_year_id') || activeYear?.id || (academicYears && academicYears[0]?.id);
    const provFormTypes = new Set((formTypes || []).filter(ft => ft.is_prov).map(ft => ft.name));

    // 2. Fetch Courses
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

    // 3. Fetch Applications with Filtering
    let appQuery = supabaseAdmin
        .from('applications')
        .select(`
            branch_id, 
            course_id,
            id, 
            status, 
            form_type, 
            student_id,
            application_fee_status,
            admission_cycles!inner (
                academic_year_id
            ),
            courses!inner (
                college_id
            ),
            payments (
                payment_type,
                status
            ),
            account_admissions (
                admission_number
            )
        `)
        .eq('admission_cycles.academic_year_id', selectedYearId);

    if (userProfile.role === 'adm_officer' && userProfile.college_id) {
        appQuery = appQuery.eq('courses.college_id', userProfile.college_id);
    }

    const { data: allApps, error: appError } = await appQuery.limit(20000); 

    if (appError) {
        console.error('Capacity Report - applications fetch error:', appError.message);
    }

    // Map course_id to its first branch for apps with null branch_id
    const courseToFirstBranchMap: Record<string, string> = {};
    (courses || []).forEach(course => {
        if (course.branches && course.branches.length > 0) {
            courseToFirstBranchMap[course.id] = course.branches[0].id;
        }
    });

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
                admitted_id: { total: 0, formTypes: {} },
                admitted_paid: { total: 0, formTypes: {} },
                students: {}
            };
        }
        return branchStats[branchId];
    };

    allApps?.forEach((app) => {
        let bId = app.branch_id;
        
        // Fallback: If branch_id is null, attribute to first branch of course
        if (!bId && app.course_id) {
            bId = courseToFirstBranchMap[app.course_id];
        }

        if (!bId) return;
        
        const stats = ensureBranch(bId);
        const type = (app.form_type || 'Unknown').trim();

        // Helper to increment
        const increment = (metric: string) => {
            stats[metric].total += 1;
            stats[metric].formTypes[type] = (stats[metric].formTypes[type] || 0) + 1;
        };

        const isCancelledOrRemoved = app.status === 'cancelled' || app.status === 'removed';

        // 1. All Applications: Everything fetched
        increment('all');

        // 2. Submitted Apps: Anything that is not a draft (submitted, verified, approved, etc.)
        if (app.status !== 'draft' && !isCancelledOrRemoved) {
            increment('submitted');
        }

        // 3. Approved Apps: Specifically approved
        if (app.status === 'approved') {
            increment('approved');
        }
        
        // 4. Paid: Application/Provisional fee paid
        const isProv = provFormTypes.has(app.form_type || '');
        const targetPaymentType = isProv ? 'provisional_fee' : 'application_fee';

        const hasPaidTargetFee = (app.payments as any || []).some(
            (p: any) => p.payment_type === targetPaymentType && p.status === 'completed'
        ) || (!isProv && app.application_fee_status === 'paid');

        if (hasPaidTargetFee && !isCancelledOrRemoved) {
            increment('paid');
        }

        // 5. Admitted: (College ID / Admission Number generated)
        const hasAdmissionNumber = !!(Array.isArray(app.account_admissions) 
            ? app.account_admissions[0]?.admission_number 
            : (app.account_admissions as any)?.admission_number);

        if (hasAdmissionNumber && !isCancelledOrRemoved) {
            increment('admitted_id');
            // Legacy field for compatibility
            increment('admitted');
        }

        // 6. Admitted & Paid: (Tuition fee paid) AND (ID generated)
        const hasTuitionFee = (app.payments as any || []).some(
            (p: any) => p.payment_type === 'tuition_fee' && p.status === 'completed'
        );

        if (hasTuitionFee && hasAdmissionNumber && !isCancelledOrRemoved) {
            increment('admitted_paid');
        }

        // Unique student tracking for Detailed View
        if (app.student_id && !isCancelledOrRemoved) {
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
                ['all', 'submitted', 'approved', 'paid', 'admitted', 'admitted_id', 'admitted_paid'].forEach(metric => {
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
                    admitted: { total: 0, formTypes: {} },
                    admitted_id: { total: 0, formTypes: {} },
                    admitted_paid: { total: 0, formTypes: {} }
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
        globalUniqueFormTypes,
        academicYears: academicYears || [],
        selectedYearId,
        activeYearId: activeYear?.id
    };
};
