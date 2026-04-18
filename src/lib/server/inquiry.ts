import type { SupabaseClient } from '@supabase/supabase-js';

export async function getUnprocessedInquiry(supabase: SupabaseClient, identifier: string) {
    if (!identifier) return null;

    const { data: inquiry, error } = await supabase
        .from('inquiries')
        .select(`
            *,
            form:inquiry_forms(schema_json),
            preferences:inquiry_preferences(
                priority,
                course_id,
                branch_id
            )
        `)
        .or(`email.eq.${identifier},phone.eq.${identifier},full_name.ilike.%${identifier}%`)
        .eq('is_processed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !inquiry) return null;
    return inquiry;
}

export async function mapInquiryToProfile(inquiry: any) {
    const profileData: Record<string, any> = {};
    const schema = inquiry.form?.schema_json;
    const inquiryData = inquiry.inquiry_data || {};
    
    // 1. Map via Schema Profile Links
    if (schema && schema.fields) {
        schema.fields.forEach((field: any) => {
            if (field.profileFieldKey && inquiryData[field.key]) {
                profileData[field.profileFieldKey] = inquiryData[field.key];
            }
        });
    }

    // 2. Map standard columns if present
    if (inquiry.full_name && !profileData.full_name) profileData.full_name = inquiry.full_name;
    if (inquiry.phone && (!profileData.phone && !profileData.contact)) {
        profileData.phone = inquiry.phone;
        profileData.contact = inquiry.phone;
    }

    // 3. Pattern-based fallbacks from JSON (if still empty)
    if (!profileData.full_name) {
        const data = inquiryData;
        // Check for common name parts
        const parts = [
            data.title || data.student_title,
            data.first_name || data.student_first_name,
            data.middle_name || data.student_middle_name,
            data.last_name || data.student_last_name
        ].filter(p => !!p);

        if (parts.length > 0) {
            profileData.full_name = parts.join(' ');
        } else {
            const nameKey = Object.keys(data).find(k => k.toLowerCase().includes('name'));
            if (nameKey) profileData.full_name = data[nameKey];
        }
    }
    if (!profileData.phone && !profileData.contact) {
        const phoneKey = Object.keys(inquiryData).find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('contact'));
        if (phoneKey) {
            profileData.phone = inquiryData[phoneKey];
            profileData.contact = inquiryData[phoneKey];
        }
    }

    return profileData;
}

export async function markInquiryAsProcessed(supabase: SupabaseClient, inquiryId: string) {
    await supabase
        .from('inquiries')
        .update({ is_processed: true })
        .eq('id', inquiryId);
}
