import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, userProfile } }) => {
    // Security check: Only staff can see inquiry data
    if (!userProfile || !['admin', 'adm_officer', 'deo', 'university_auth', 'college_auth'].includes(userProfile.role)) {
        return json([], { status: 403 });
    }

    const q = url.searchParams.get('q') || '';
    if (q.length < 2) return json([]);

    const { data, error } = await supabase
        .from('inquiries')
        .select('id, email, full_name, phone')
        .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .eq('is_processed', false)
        .limit(10);

    if (error) {
        console.error('Inquiry search error:', error);
        return json([]);
    }

    return json(data || []);
};
