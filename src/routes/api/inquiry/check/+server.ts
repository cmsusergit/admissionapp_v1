import { json } from '@sveltejs/kit';
import { getUnprocessedInquiry, mapInquiryToProfile } from '$lib/server/inquiry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
    const q = url.searchParams.get('q');
    
    if (!q || q.length < 3) return json({ found: false });

    const inquiry = await getUnprocessedInquiry(supabase, q);
    
    if (inquiry) {
        const mappedData = await mapInquiryToProfile(inquiry);
        // Use the intelligently combined name from mappedData if column is empty
        const finalFullName = inquiry.full_name || mappedData.full_name || '';
        
        return json({
            found: true,
            inquiryId: inquiry.id,
            fullName: finalFullName,
            email: inquiry.email,
            phone: inquiry.phone || mappedData.contact || mappedData.phone || '',
            mappedData: mappedData
        });
    }

    return json({ found: false });
};
