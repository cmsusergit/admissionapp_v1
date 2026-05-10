import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { applyRoleBasedCollegeFilter } from '$lib/server/security';

export const load: PageServerLoad = async ({ url, locals: { supabase, getSession, userProfile } }) => {
    const session = await getSession();

    if (!session || !['adm_officer', 'admin', 'college_auth'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    // Service Role to bypass RLS for complex joins/filtering if needed
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Params ---
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const search = url.searchParams.get('search') || '';
    const status = url.searchParams.get('status') || 'submitted'; // Default to pending verification

    const offset = (page - 1) * limit;
    const sortField = url.searchParams.get('sort') || 'submitted_at';
    const sortOrder = url.searchParams.get('order') || 'desc';

    if (search || sortField === 'receipt_number') {
        console.log(`🔍 Adm-Officer applications: ${search ? 'Searching' : 'Sorting by receipt'}. Fetching all records for in-memory processing.`);
    }

    // Fetch Form Types for provisional logic
    const { data: formTypesData } = await supabaseAdmin.from('form_types').select('name, is_prov');
    const formTypesMap = Object.fromEntries((formTypesData || []).map(ft => [ft.name, ft.is_prov]));

    // 2. Fetch Applications
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id, status, form_type, submitted_at,
            student_user:users!student_id!inner (full_name, email),
            courses (name, code),
            branches (name),
            payments (id, amount, status, payment_type, receipt_number)
        `, { count: 'exact' });

    // Apply Security Filter
    query = applyRoleBasedCollegeFilter(query, userProfile, 'applications');

    // Filter by status tab
    if (status === 'submitted') {
        query = query.in('status', ['submitted', 'needs_correction']);
    } else if (status === 'processed') {
        query = query.in('status', ['verified', 'approved', 'rejected', 'cancelled']);
    } else {
        query = query.eq('status', status);
    }

    // Search
    if (search) {
        query = query.or(`full_name.ilike.%${search}%`, { foreignTable: 'student_user' });
    }

    // Sort & Paginate
    // If NOT sorting by receipt, use server-side sort and range
    if (sortField !== 'receipt_number') {
        query = query.order(sortField, { ascending: sortOrder === 'asc' })
                     .range(offset, offset + limit - 1);
    }

    const { data: rawApplications, count: totalCount, error } = await query;

    if (error) {
        console.error('Error fetching applications:', error);
    }

    let processedApplications = rawApplications || [];

    // Helper to extract sorting receipt
    const getSortReceipt = (app: any) => {
        const isProvType = formTypesMap[app.form_type] === true;
        const payment = (app.payments || []).find((p: any) => p.payment_type === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number) 
                     || (app.payments || []).find((p: any) => p.receipt_number);
        if (!payment?.receipt_number) return { num: '', seq: 0 };
        const seqMatch = payment.receipt_number.match(/(\d+)$/);
        return {
            num: payment.receipt_number,
            seq: seqMatch ? parseInt(seqMatch[1]) : 0
        };
    };

    // In-memory sorting for receipt_number
    if (sortField === 'receipt_number') {
        processedApplications.sort((a, b) => {
            const rA = getSortReceipt(a);
            const rB = getSortReceipt(b);
            if (rA.seq !== rB.seq) {
                return sortOrder === 'asc' ? rA.seq - rB.seq : rB.seq - rA.seq;
            }
            return sortOrder === 'asc' ? rA.num.localeCompare(rB.num) : rB.num.localeCompare(rA.num);
        });
    }

    // Final pagination for in-memory sort
    const finalApplications = (sortField === 'receipt_number') 
        ? processedApplications.slice(offset, offset + limit) 
        : processedApplications;

    return {
        applications: finalApplications,
        count: totalCount || 0,
        page,
        limit,
        search,
        status,
        formTypesMap,
        sort: sortField,
        order: sortOrder
    };
};
