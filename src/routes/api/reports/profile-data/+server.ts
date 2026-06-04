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
        console.log('[API] Fetching data for ID:', applicationId);
        // Fetch massive unified dataset
        const { data: appData, error: appError } = await supabaseAdmin
            .from('applications')
            .select(`
                *,
                course:courses(name, code, college:colleges(name, logo_url, university:universities(name, logo_url, footer_text))),
                admission_cycles(name, academic_years(name, short_code)),
                student:users!applications_student_id_fkey(
                    id, full_name, email,
                    student_profiles(*)
                ),
                marks(*),
                account_admissions(admission_number),
                payments(receipt_number, payment_type, status)
            `)
            .eq('id', applicationId)
            .single();

        if (appError || !appData) {
            console.error('[API] Data fetch error:', appError);
            return json({ error: 'Failed to fetch application data' }, { status: 500 });
        }

        console.log('[API] App Data fetched successfully');

        // Extract relevant payment receipt
        const isProvType = (appData.form_type || '').toLowerCase().includes('provisional');
        const payment = (appData.payments || []).find((p: any) => 
            (p.payment_type || '').toLowerCase() === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number
        ) || (appData.payments || []).find((p: any) => p.receipt_number);

        // Structure the data for easy templating
        const studentUser = appData.student;
        const profileObj = Array.isArray(studentUser?.student_profiles) 
            ? studentUser.student_profiles[0] 
            : studentUser?.student_profiles;
            
        const profileData = profileObj?.profile_data || {};
        const marksData = appData.marks || [];

        // Convert marks array to object mapped by subject with fuzzy matching
        const formattedMarks: Record<string, any> = {};
        marksData.forEach((m: any) => {
             const subject = (m.subject || '').toLowerCase();
             formattedMarks[subject] = m;
             
             if (subject.includes('math')) formattedMarks['math'] = m;
             if (subject.includes('physics')) formattedMarks['physics'] = m;
             if (subject.includes('chemistry')) formattedMarks['chemistry'] = m;
             if (subject.includes('computer')) formattedMarks['computer'] = m;
             if (subject.includes('english') || subject.includes('gujarat')) formattedMarks['english'] = m;
             if (subject.includes('biology')) formattedMarks['biology'] = m;
        });

        // Try to fetch photo url
        let photoUrl = '';
        try {
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
        } catch (e) {
            console.error('[API] Photo fetch error:', e);
        }

        const flatData = {
            student: {
                id: studentUser?.id || '',
                full_name: studentUser?.full_name || 'N/A',
                email: studentUser?.email || '',
                enrollment_number: profileObj?.enrollment_number || '',
                photo_url: photoUrl,
                ...profileData
            },
            application: {
                id: appData.id,
                status: appData.status,
                form_type: appData.form_type,
                academic_year: appData.admission_cycles?.academic_years?.name,
                submitted_at: appData.submitted_at,
                admission_number: appData.account_admissions?.admission_number,
                receipt_number: payment?.receipt_number || 'N/A',
                ...appData.form_data
            },
            // Maintain nesting for relations to match designer paths
            course: {
                ...appData.course,
                college: {
                    ...appData.course?.college,
                    trust_name: 'The New English School Trust',
                    university: appData.course?.college?.university
                }
            },
            marks: formattedMarks,
            entrance_marks: appData.form_data?.entrance_marks || {}
        };

        console.log('[API] Returning flatData. Sample paths:');
        console.log(' - student.full_name:', flatData.student.full_name);
        console.log(' - course.college.name:', flatData.course?.college?.name);
        
        return json({ success: true, data: flatData });
    } catch (e: any) {
        return json({ error: e.message }, { status: 500 });
    }
};