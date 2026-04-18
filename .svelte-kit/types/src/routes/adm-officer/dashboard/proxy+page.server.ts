// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load = async ({ url, locals: { supabase, getSession, userProfile } }: Parameters<PageServerLoad>[0]) => {
    const session = await getSession();

    if (!session) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'adm_officer' && userProfile?.role !== 'admin') { // Admin can also view dashboard
        throw redirect(303, '/login'); // Redirect non-authorized users
    }

    // --- Aggregated Data Fetching ---

    const [
        { data: statusCounts, error: statusError },
        { data: courseCounts, error: courseError },
        { data: totalApplicationFees, error: appFeesError },
        { data: totalProvFees, error: provFeesError },
        { count: totalApplications, error: totalAppError },
        { data: allCourses },
        { data: allBranches },
        { data: distinctTypes },
        { data: allAppBranches },
        { data: activeYear }
    ] = await Promise.all([
        supabase.rpc('get_application_status_counts'),
        supabase.rpc('get_application_course_counts'),
        supabase.from('payments').select('amount').eq('payment_type', 'application_fee').eq('status', 'completed'),
        supabase.from('payments').select('amount').eq('payment_type', 'provisional_fee').eq('status', 'completed'),
        supabase.from('applications').select('*', { count: 'exact', head: true }),
        supabase.from('courses').select('id, name, code').order('name'),
        supabase.from('branches').select('id, name, course_id, courses(name)').order('name'),
        supabase.from('applications').select('form_type').limit(100),
        supabase.from('applications').select('branch_id, form_type'),
        supabase.from('academic_years').select('id, name').eq('is_active', true).maybeSingle()
    ]);

    // Fetch Inquiry counts for the active year
    let totalInquiries = 0;
    let processedInquiries = 0;
    
    if (activeYear?.data?.id) {
        const [totalRes, processedRes] = await Promise.all([
            supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('academic_year_id', activeYear.data.id),
            supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('academic_year_id', activeYear.data.id).eq('is_processed', true)
        ]);
        totalInquiries = totalRes.count || 0;
        processedInquiries = processedRes.count || 0;
    } else {
        const [totalRes, processedRes] = await Promise.all([
            supabase.from('inquiries').select('*', { count: 'exact', head: true }),
            supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('is_processed', true)
        ]);
        totalInquiries = totalRes.count || 0;
        processedInquiries = processedRes.count || 0;
    }

    if (statusError) console.error('Error fetching application status counts:', statusError.message);
    if (courseError) console.error('Error fetching application course counts:', courseError.message);

    const totalAmountCollected = totalApplicationFees?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
    if (appFeesError) console.error('Error fetching total application fees:', appFeesError.message);

    const totalProvFeesCollected = totalProvFees?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
    if (provFeesError) console.error('Error fetching total provisional fees:', provFeesError.message);

    if (totalAppError) console.error('Error fetching total applications:', totalAppError.message);

    // Get distinct form types
    const formTypes = [...new Set(distinctTypes?.map(a => a.form_type).filter(Boolean))].sort();
    
    const branchCountsMap = new Map<string, number>();
    allAppBranches?.forEach(app => {
        if (app.branch_id) {
            branchCountsMap.set(app.branch_id, (branchCountsMap.get(app.branch_id) || 0) + 1);
        }
    });
    const branchCounts = allBranches?.map(b => ({
        branch_id: b.id,
        branch_name: b.name,
        course_id: b.course_id,
        count: branchCountsMap.get(b.id) || 0
    })).filter(b => b.count > 0).sort((a, b) => b.count - a.count) || [];

    const formTypeCountsMap = new Map<string, number>();
    allAppBranches?.forEach(app => {
        if (app.form_type) {
            formTypeCountsMap.set(app.form_type, (formTypeCountsMap.get(app.form_type) || 0) + 1);
        }
    });
    const formTypeCounts = Array.from(formTypeCountsMap.entries())
        .map(([type, count]) => ({ form_type: type, count }))
        .sort((a, b) => b.count - a.count);

    // --- Filtered Applications List ---
    const statusFilter = url.searchParams.get('status');
    const searchQuery = url.searchParams.get('search');
    const courseFilter = url.searchParams.get('course');
    const branchFilter = url.searchParams.get('branch');
    const formTypeFilter = url.searchParams.get('form_type');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    
    // Pagination & Sorting
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const sortField = url.searchParams.get('sort') || 'updated_at';
    const sortOrder = url.searchParams.get('order') || 'desc';
    
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Main List Query (Filtered)
    // FIX: Use explicit relationship 'users!student_id' and apply role-based filter
    let applicationsQuery = supabase
        .from('applications')
        .select(`
            *,
            approval_comment,
            users!student_id!inner(full_name, email),
            courses(name, code, colleges(name)),
            branches(name),
            merit_list_entries(merit_score, merit_rank)
        `, { count: 'exact' });
    
    applicationsQuery = applyRoleBasedCollegeFilter(applicationsQuery, userProfile, 'applications');

    // Fetch recent applications for this college officer (Dashboard Card)
    // FIX: Use explicit relationship 'users!student_id'
    let recentAppsQuery = supabase
        .from('applications')
        .select(`
            id, status, form_type, submitted_at,
            users!student_id(full_name, email),
            courses(name, code),
            branches(name)
        `);
    
    recentAppsQuery = applyRoleBasedCollegeFilter(recentAppsQuery, userProfile, 'applications');

    const { data: recentApplications, error: recentAppError } = await recentAppsQuery
        .order('submitted_at', { ascending: false })
        .limit(10);

    if (statusFilter) {
        applicationsQuery = applicationsQuery.eq('status', statusFilter);
    }
    if (courseFilter) {
        applicationsQuery = applicationsQuery.eq('course_id', courseFilter);
    }
    if (branchFilter) {
        applicationsQuery = applicationsQuery.eq('branch_id', branchFilter);
    }
    if (formTypeFilter) {
        applicationsQuery = applicationsQuery.eq('form_type', formTypeFilter);
    }
    if (startDate) {
        applicationsQuery = applicationsQuery.gte('updated_at', startDate);
    }
    if (endDate) {
        applicationsQuery = applicationsQuery.lte('updated_at', endDate + 'T23:59:59'); 
    }

    if (searchQuery) {
        applicationsQuery = applicationsQuery.or(`email.ilike.%${searchQuery}%,full_name.ilike.%${searchQuery}%`, { foreignTable: 'users' });
    }
    
    const allowedSorts = ['updated_at', 'status', 'merit_score'];
    
    if (sortField === 'merit_score') {
         applicationsQuery = applicationsQuery.order('merit_score', { foreignTable: 'merit_list_entries', ascending: sortOrder === 'asc' });
    } else if (allowedSorts.includes(sortField)) {
        applicationsQuery = applicationsQuery.order(sortField, { ascending: sortOrder === 'asc' });
    } else {
        applicationsQuery = applicationsQuery.order('updated_at', { ascending: false });
    }

    applicationsQuery = applicationsQuery.range(from, to);

    const { data: filteredApplications, count: filteredCount, error: filteredAppError } = await applicationsQuery;
    
    if (filteredAppError) {
        console.error('Error fetching filtered applications:', filteredAppError.message);
    }

    return {
        statusCounts: statusCounts || [],
        courseCounts: courseCounts || [],
        branchCounts: branchCounts || [],
        formTypeCounts: formTypeCounts || [],
        totalAmountCollected: totalAmountCollected,
        totalProvFeesCollected: totalProvFeesCollected,
        totalApplications: totalApplications || 0,
        totalInquiries: totalInquiries,
        processedInquiries: processedInquiries,
        activeYearName: activeYear?.data?.name || 'Current Year',
        filteredApplications: filteredApplications || [],
        recentApplications: recentApplications || [], // Pass recent apps to UI
        filters: {
            status: statusFilter,
            search: searchQuery,
            course: courseFilter,
            branch: branchFilter,
            form_type: formTypeFilter,
            start_date: startDate,
            end_date: endDate,
            page,
            limit,
            sort: sortField,
            order: sortOrder
        },
        pagination: {
            total: filteredCount || 0,
            page,
            limit,
            totalPages: Math.ceil((filteredCount || 0) / limit)
        },
        options: {
            courses: allCourses || [],
            branches: allBranches || [],
            formTypes: formTypes || []
        }
    };
};
