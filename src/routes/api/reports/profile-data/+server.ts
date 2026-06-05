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
        
        // 1. Primary Fetch with joins
        let { data: appData, error: appError } = await supabaseAdmin
            .from('applications')
            .select(`
                *,
                course:courses(
                    *,
                    college:colleges(
                        *,
                        university:universities(*)
                    )
                ),
                admission_cycles(*, academic_years(*)),
                student:users!applications_student_id_fkey(
                    id, full_name, email,
                    student_profiles(*)
                ),
                marks(*),
                account_admissions(*),
                payments(*)
            `)
            .eq('id', applicationId)
            .single();

        if (appError || !appData) {
            console.error('[API] Primary Data fetch error:', appError);
            // Try to fetch application without joins if primary failed
            const { data: retryData } = await supabaseAdmin.from('applications').select('*').eq('id', applicationId).single();
            if (retryData) {
                appData = retryData;
            } else {
                return json({ error: 'Failed to fetch application data' }, { status: 500 });
            }
        }

        // 2. Fallback Fetches for missing relations
        if (appData) {
            // Student Fallback
            if (!appData.student && appData.student_id) {
                const { data: student } = await supabaseAdmin
                    .from('users')
                    .select('id, full_name, email, student_profiles(*)')
                    .eq('id', appData.student_id)
                    .single();
                if (student) appData.student = student;
            }
            
            // Course/College Fallback
            if (!appData.course && appData.course_id) {
                const { data: course } = await supabaseAdmin
                    .from('courses')
                    .select('*, college:colleges(*, university:universities(*))')
                    .eq('id', appData.course_id)
                    .single();
                if (course) appData.course = course;
            }

            // Admission Cycle Fallback
            if (!appData.admission_cycles && appData.cycle_id) {
                const { data: cycle } = await supabaseAdmin
                    .from('admission_cycles')
                    .select('*, academic_years(*)')
                    .eq('id', appData.cycle_id)
                    .single();
                if (cycle) appData.admission_cycles = cycle;
            }
        }

        console.log('[API] Data resolution complete');

        // Extract relevant payment receipt
        const isProvType = (appData.form_type || '').toLowerCase().includes('provisional');
        const payment = (appData.payments || []).find((p: any) => 
            (p.payment_type || '').toLowerCase() === (isProvType ? 'provisional_fee' : 'application_fee') && p.receipt_number
        ) || (appData.payments || []).find((p: any) => p.receipt_number);

        // Structure the data
        const studentUser = appData.student;
        const profileObj = Array.isArray(studentUser?.student_profiles) 
            ? studentUser.student_profiles[0] 
            : studentUser?.student_profiles;
            
        const profileData = (profileObj?.profile_data && typeof profileObj.profile_data === 'object') ? profileObj.profile_data : {};
        const marksData = appData.marks || [];
        const formData = (appData.form_data && typeof appData.form_data === 'object') ? appData.form_data : {};

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
            const userId = appData.student_id || studentUser?.id;
            if (userId) {
                const { data: docs } = await supabaseAdmin
                    .from('documents')
                    .select('file_path')
                    .eq('user_id', userId)
                    .ilike('document_type', '%photo%')
                    .limit(1);
                    
                if (docs && docs.length > 0) {
                    const { data: urlData } = await supabaseAdmin.storage.from('documents').createSignedUrl(docs[0].file_path, 3600);
                    if (urlData) photoUrl = urlData.signedUrl;
                }
            }
        } catch (e) {
            console.error('[API] Photo fetch error:', e);
        }

        const studentObj = {
            id: studentUser?.id || '',
            full_name: studentUser?.full_name || 'N/A',
            email: studentUser?.email || '',
            enrollment_number: profileObj?.enrollment_number || '',
            photo_url: photoUrl,
            profile_data: profileData,
            ...profileData
        };

        const flatData: any = {
            student: studentObj,
            students: studentObj, // Alias
            student_profile: studentObj, // Alias
            course: {
                ...appData.course,
                college: {
                    ...appData.course?.college,
                    trust_name: 'The New English School Trust',
                    university: appData.course?.college?.university
                }
            },
            courses: appData.course, // Alias
            marks: formattedMarks,
            marks_list: marksData,
            payments: appData.payments || [],
            entrance_marks: formData?.entrance_marks || {},
            application: {
                ...appData, // Include all base table fields
                admission_number: appData.account_admissions?.admission_number,
                receipt_number: payment?.receipt_number || 'N/A',
                academic_year: appData.admission_cycles?.academic_years?.name,
                form_data: formData,
                ...formData,
                student: studentObj,
                course: appData.course
            }
        };
        
        // Alias for the base table
        flatData.applications = flatData.application;

        // Root level spreading for maximum compatibility
        Object.keys(studentObj).forEach(k => { if (!flatData[k]) flatData[k] = studentObj[k]; });
        Object.keys(formData).forEach(k => { if (!flatData[k]) flatData[k] = formData[k]; });
        // Also add application level fields to root
        Object.keys(appData).forEach(k => { if (typeof appData[k] !== 'object' && !flatData[k]) flatData[k] = appData[k]; });

        console.log('[API] Returning robust flatData. Root keys:', Object.keys(flatData).length);
        
        return json({ success: true, data: flatData });
    } catch (e: any) {
        console.error('[API] Fatal Error:', e);
        return json({ error: e.message }, { status: 500 });
    }
};