// @ts-nocheck
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load = async ({ locals: { supabase, getAuthenticatedUser, userProfile } }: Parameters<PageServerLoad>[0]) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'admin') {
        throw redirect(303, '/login'); // Redirect non-admin users
    }

    const { data: forms, error: formsError } = await supabase
        .from('admission_forms')
        .select(`
            id, course_id, cycle_id, form_type, is_enabled, created_at,
            courses(name, code, colleges(name)),
            admission_cycles(name, academic_years(name))
        `)
        .order('created_at', { ascending: false });

    const { data: courses, error: coursesError } = await supabase.from('courses').select('id, name');
    const { data: admissionCycles, error: cyclesError } = await supabase.from('admission_cycles').select('id, name, academic_years(name)');
    const { data: formTypes, error: formTypesError } = await supabase.from('form_types').select('name, code').eq('is_active', true).order('name');

    if (formsError) {
        console.error('Error fetching admission forms:', formsError.message);
        return { admissionForms: [], courses: [], admissionCycles: [], formTypes: [] };
    }
    if (coursesError) {
        console.error('Error fetching courses for dropdown:', coursesError.message);
        return { admissionForms: forms || [], courses: [], admissionCycles: [], formTypes: [] };
    }
    if (cyclesError) {
        console.error('Error fetching admission cycles for dropdown:', cyclesError.message);
        return { admissionForms: forms || [], courses: courses || [], admissionCycles: [], formTypes: [] };
    }
    if (formTypesError) {
        console.error('Error fetching form types:', formTypesError.message);
        return { admissionForms: forms || [], courses: courses || [], admissionCycles: admissionCycles || [], formTypes: [] };
    }

    return {
        admissionForms: forms || [],
        courses: courses || [],
        admissionCycles: admissionCycles || [],
        formTypes: formTypes || []
    };
};

export const actions = {
    delete: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }: import('./$types').RequestEvent) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const id = formData.get('id') as string;

        const { error } = await supabase.from('admission_forms').delete().eq('id', id);

        if (error) {
            console.error('Error deleting admission form:', error.message);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Admission form deleted successfully!' };
    },

    copy: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }: import('./$types').RequestEvent) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'admin') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const source_id = formData.get('source_id') as string;
        const target_course_id = formData.get('target_course_id') as string;
        const target_cycle_id = formData.get('target_cycle_id') as string;
        const target_form_type = formData.get('target_form_type') as string;

        if (!source_id || !target_course_id || !target_cycle_id || !target_form_type) {
            return { success: false, message: 'Missing required fields for copy operation.' };
        }

        // 1. Fetch source details
    const { data: sourceForm, error: sourceError } = await supabase
        .from('admission_forms')
        .select('course_id, cycle_id, form_type, is_enabled, schema_json, form_fee, prov_fee')
        .eq('id', id)
        .single();

        if (sourceError || !sourceForm) {
            return { success: false, message: 'Source admission form not found.' };
        }

        // 2. Check if target already exists
        const { data: existingTarget, error: checkError } = await supabase
            .from('admission_forms')
            .select('id')
            .eq('course_id', target_course_id)
            .eq('cycle_id', target_cycle_id)
            .eq('form_type', target_form_type)
            .maybeSingle();

        if (existingTarget) {
            return { success: false, message: 'An admission form already exists for the target combination.' };
        }

        // 3. Insert new record
        const { error: insertError } = await supabase.from('admission_forms').insert({
            course_id: target_course_id,
            cycle_id: target_cycle_id,
            form_type: target_form_type,
            form_fee: sourceForm.form_fee,
            schema_json: sourceForm.schema_json,
            is_enabled: sourceForm.is_enabled // Can default to false or keep same
        });

        if (insertError) {
            console.error('Error copying admission form:', insertError.message);
            return { success: false, message: insertError.message };
        }

        return { success: true, message: 'Admission form copied successfully!' };
    }
};
;null as any as Actions;