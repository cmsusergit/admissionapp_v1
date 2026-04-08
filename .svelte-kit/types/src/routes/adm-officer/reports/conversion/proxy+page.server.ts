// @ts-nocheck

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export const load = async ({ locals: { getSession, userProfile } }: Parameters<PageServerLoad>[0]) => {
    const session = await getSession();

    if (!session || !['adm_officer', 'admin'].includes(userProfile?.role || '')) {
        throw redirect(303, '/login');
    }

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch Form Types Map (Name -> is_prov)
    const { data: formTypes } = await supabaseAdmin
        .from('form_types')
        .select('name, is_prov');
    
    const provMap = new Map<string, boolean>();
    formTypes?.forEach(ft => provMap.set(ft.name, ft.is_prov));

    // 2. Fetch ALL Approved Applications
    // We need student_id, dates, IDs, form_type
    const { data: applications, error } = await supabaseAdmin
        .from('applications')
        .select(`
            id, 
            student_id, 
            form_type, 
            submitted_at, 
            account_admissions(admission_number),
            student_user:users!student_id(full_name, email)
        `)
        .eq('status', 'approved')
        .order('submitted_at', { ascending: true });

    if (error) {
        console.error('Report Error:', error);
        return { reportData: [], stats: {} };
    }

    // 3. Process Data
    const provApps: any[] = [];
    const finalAppsMap = new Map<string, any[]>(); // student_id -> [apps]

    // Split into Prov and Final
    applications?.forEach(app => {
        const isProv = provMap.get(app.form_type);
        if (isProv) {
            provApps.push(app);
        } else {
            if (!finalAppsMap.has(app.student_id)) {
                finalAppsMap.set(app.student_id, []);
            }
            finalAppsMap.get(app.student_id)?.push(app);
        }
    });

    // Match
    const reportData = provApps.map(provApp => {
        const studentId = provApp.student_id;
        const potentialFinals = finalAppsMap.get(studentId);
        
        let convertedApp = null;
        if (potentialFinals) {
            // Find a final app created AFTER or SAME TIME as provisional
            // (Simple logic: if they have a final app, they converted)
            convertedApp = potentialFinals.find(fa => new Date(fa.submitted_at) >= new Date(provApp.submitted_at));
            // Fallback: just take the latest final app if date logic is fuzzy
            if (!convertedApp && potentialFinals.length > 0) convertedApp = potentialFinals[potentialFinals.length - 1]; 
        }

        return {
            student_name: provApp.student_user?.full_name || 'Unknown',
            student_email: provApp.student_user?.email || '-',
            prov_admission_no: provApp.account_admissions?.[0]?.admission_number || '-',
            prov_date: provApp.submitted_at,
            prov_type: provApp.form_type,
            final_admission_no: convertedApp?.account_admissions?.[0]?.admission_number || '-',
            final_date: convertedApp?.submitted_at || null,
            final_type: convertedApp?.form_type || null,
            status: convertedApp ? 'Converted' : 'Pending'
        };
    });

    // 4. Calculate Stats
    const totalProv = reportData.length;
    const convertedCount = reportData.filter(r => r.status === 'Converted').length;
    const pendingCount = totalProv - convertedCount;
    const conversionRate = totalProv > 0 ? ((convertedCount / totalProv) * 100).toFixed(1) : '0.0';

    return {
        reportData,
        stats: {
            totalProv,
            convertedCount,
            pendingCount,
            conversionRate
        }
    };
};
