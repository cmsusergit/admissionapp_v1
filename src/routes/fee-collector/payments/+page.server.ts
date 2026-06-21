import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser || userProfile?.role !== 'fee_collector') {
        throw redirect(303, '/login');
    }

    const searchTerm = url.searchParams.get('search') || '';
    const courseIdFilter = url.searchParams.get('course_id') || '';
    const activeTab = (url.searchParams.get('type') || 'tuition') as 'tuition' | 'application' | 'provisional';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '25');
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const tabToDbType = {
        'tuition': 'tuition_fee',
        'application': 'application_fee',
        'provisional': 'provisional_fee'
    };
    const dbPaymentType = tabToDbType[activeTab];

    // Build optimized payments query (Pruned select list)
    let paymentsQuery = supabase
        .from('payments')
        .select(`
            *,
            applications!inner (
                id,
                course_id,
                form_type,
                student_user:users!student_id (full_name, email, student_profiles(enrollment_number)),
                courses!inner (name, college_id),
                branches(name),
                admission_cycles(academic_years(name)),
                account_admissions(admission_number)
            )
        `, { count: 'exact' })
        .eq('payment_type', dbPaymentType);

    if (courseIdFilter) {
        paymentsQuery = paymentsQuery.eq('applications.course_id', courseIdFilter);
    }
    if (searchTerm) {
        paymentsQuery = paymentsQuery.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`, { foreignTable: 'applications.student_user' });
    }
    paymentsQuery = applyRoleBasedCollegeFilter(paymentsQuery, userProfile, 'payments');

    // Build courses query
    let coursesQuery = supabase.from('courses').select('id, name');
    coursesQuery = applyRoleBasedCollegeFilter(coursesQuery, userProfile, 'courses');

    // Execute critical queries in PARALLEL
    const [paymentsRes, coursesRes] = await Promise.all([
        paymentsQuery.order('payment_date', { ascending: false }).range(from, to),
        coursesQuery.order('name')
    ]);

    const allPayments = paymentsRes.data || [];
    const totalPaymentsCount = paymentsRes.count || 0;
    const courses = coursesRes.data || [];

    // Stream non-blocking metadata queries
    const profileTemplates = supabase
        .from('report_templates')
        .select('id, name, target_form_type_id')
        .eq('report_type', 'html_profile')
        .contains('allowed_roles', ['fee_collector'])
        .then(r => r.data || []);

    const formTypes = supabase
        .from('form_types')
        .select('id, name')
        .then(r => r.data || []);

    return {
        payments: allPayments,
        tuitionPayments: activeTab === 'tuition' ? allPayments : [],
        applicationFeePayments: activeTab === 'application' ? allPayments : [],
        provisionalFeePayments: activeTab === 'provisional' ? allPayments : [],
        courses,
        userProfile,
        pagination: {
            page,
            limit,
            total: totalPaymentsCount,
            totalPages: Math.ceil(totalPaymentsCount / limit)
        },
        searchTerm,
        selectedCourseId: courseIdFilter,
        activeTab,
        streamed: {
            profileTemplates,
            formTypes
        }
    };
};
