import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
    const { data: form, error: formError } = await supabase
        .from('inquiry_forms')
        .select('*')
        .eq('slug', params.slug)
        .eq('is_active', true)
        .single();

    if (formError || !form) {
        throw error(404, 'Inquiry form not found');
    }

    const { data: courses } = await supabase
        .from('courses')
        .select('id, name, colleges(name)')
        .order('name');

    const { data: branches } = await supabase
        .from('branches')
        .select('id, name, course_id')
        .order('name');

    return {
        form,
        courses: courses || [],
        branches: branches || []
    };
};

export const actions: Actions = {
    default: async ({ request, params, locals: { supabase } }) => {
        const formData = await request.formData();
        const inquiryDataRaw = formData.get('inquiry_data') as string;
        const preferencesRaw = formData.get('preferences') as string;

        let inquiryData: Record<string, any> = {};
        try {
            inquiryData = JSON.parse(inquiryDataRaw || '{}');
        } catch (e) {
            return fail(400, { message: 'Invalid data format' });
        }

        // 1. Find form schema to identify identity fields
        const { data: form } = await supabase
            .from('inquiry_forms')
            .select('id, academic_year_id, schema_json')
            .eq('slug', params.slug)
            .single();

        if (!form) return fail(404, { message: 'Form not found' });

        // 2. Extract Identity from linked fields
        let email = '';
        let fullName = '';
        let phone = '';

        if (form.schema_json && form.schema_json.fields) {
            form.schema_json.fields.forEach((field: any) => {
                const val = inquiryData[field.key];
                if (!val) return;

                // Priority 1: Linked to profile
                if (field.profileFieldKey === 'email') email = val;
                else if (field.profileFieldKey === 'full_name') fullName = val;
                else if (field.profileFieldKey === 'phone' || field.profileFieldKey === 'contact') phone = val;
                
                // Priority 2: Key pattern matching (if not already found)
                if (!email && field.key.toLowerCase().includes('email')) email = val;
                if (!fullName && field.key.toLowerCase().includes('name')) fullName = val;
                if (!phone && (field.key.toLowerCase().includes('phone') || field.key.toLowerCase().includes('contact'))) phone = val;
            });
        }

        if (!email) {
            return fail(400, { message: 'An "Email" field linked to the student profile is required in this form.' });
        }

        // 3. Clean up JSON: Remove fields that are already stored in columns to avoid duplication
        const cleanedInquiryData = { ...inquiryData };
        if (form.schema_json && form.schema_json.fields) {
            form.schema_json.fields.forEach((field: any) => {
                if (['email', 'full_name', 'phone'].includes(field.profileFieldKey)) {
                    delete cleanedInquiryData[field.key];
                }
            });
        }

        // 4. Resolve Academic Year
        let academicYearId = form.academic_year_id;
        
        if (!academicYearId) {
            const { data: activeYear } = await supabase
                .from('academic_years')
                .select('id')
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();
            
            if (activeYear) academicYearId = activeYear.id;
        }

        // 5. Insert Inquiry
        const { data: inquiry, error: inquiryError } = await supabase
            .from('inquiries')
            .insert({
                form_id: form.id,
                academic_year_id: academicYearId,
                email,
                full_name: fullName,
                phone,
                inquiry_data: cleanedInquiryData
            })
            .select()
            .single();

        if (inquiryError) {
            console.error('Inquiry Error:', inquiryError);
            return fail(500, { message: 'Failed to save inquiry' });
        }

        // 3. Insert Preferences (Priority Choices)
        const preferences = JSON.parse(preferencesRaw || '[]');
        if (preferences.length > 0) {
            const prefsToInsert = preferences.map((p: any, index: number) => ({
                inquiry_id: inquiry.id,
                course_id: p.course_id,
                branch_id: p.branch_id || null,
                priority: index + 1
            }));

            const { error: prefsError } = await supabase
                .from('inquiry_preferences')
                .insert(prefsToInsert);

            if (prefsError) {
                console.error('Preferences Error:', prefsError);
                // Non-fatal for the main inquiry, but log it
            }
        }

        return { success: true };
    }
};
