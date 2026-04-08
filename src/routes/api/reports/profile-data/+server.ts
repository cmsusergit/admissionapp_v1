import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const POST: RequestHandler = async ({ request, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { applicationId } = await request.json();

    if (!applicationId) {
        return json({ error: 'Missing applicationId' }, { status: 400 });
    }

    try {
        // Fetch massive unified dataset
        const { data: appData, error: appError } = await supabaseAdmin
            .from('applications')
            .select(`
                *,
                courses(name, code, colleges(name, logo_url, universities(name))),
                admission_cycles(name, academic_years(name, short_code)),
                student_user:users!applications_student_id_fkey(
                    id, full_name, email,
                    student_profiles(*)
                ),
                marks(*),
                account_admissions(admission_number)
            `)
            .eq('id', applicationId)
            .single();

        if (appError || !appData) {
            console.error('Data fetch error:', appError);
            return json({ error: 'Failed to fetch application data' }, { status: 500 });
        }

        // Structure the data for easy templating
        const profileData = appData.student_user?.student_profiles?.profile_data || {};
        const marksData = appData.marks || [];

        // Convert marks array to object mapped by subject
        const formattedMarks: Record<string, any> = {};
        marksData.forEach((m: any) => {
             formattedMarks[m.subject.toLowerCase()] = m;
        });

        // Try to fetch photo url
        let photoUrl = '';
        const { data: docs } = await supabaseAdmin
            .from('documents')
            .select('file_path')
            .eq('user_id', appData.student_id)
            .ilike('document_type', '%photo%')
            .limit(1);
            
        if (docs && docs.length > 0) {
            const { data: urlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(docs[0].file_path, 3600);
            if (urlData) photoUrl = urlData.signedUrl;
        }

        const flatData = {
            student: {
                id: appData.student_user?.id,
                full_name: appData.student_user?.full_name,
                email: appData.student_user?.email,
                enrollment_number: appData.student_user?.student_profiles?.enrollment_number,
                photo_url: photoUrl,
                ...profileData // Spread profile attributes directly (dob, gender, etc.)
            },
            application: {
                id: appData.id,
                status: appData.status,
                form_type: appData.form_type,
                academic_year: appData.admission_cycles?.academic_years?.name,
                form_data: appData.form_data || {} // acpc_number, board, school, etc.
            },
            course: {
                name: appData.courses?.name,
                code: appData.courses?.code
            },
            college: {
                name: appData.courses?.colleges?.name,
                logo_url: appData.courses?.colleges?.logo_url,
                trust_name: 'The New English School Trust', // Hardcoded or fetch from DB if exists
                university_name: appData.courses?.colleges?.universities?.name
            },
            marks: formattedMarks, // {{marks.math.obtained}}
            entrance_marks: appData.form_data?.entrance_marks || {} // Assuming stored in form_data for MQNRI
        };

        return json({ success: true, data: flatData });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};