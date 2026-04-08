
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { executeReportQuery } from '$lib/server/reportQueryBuilder';
import { generateCSV } from '$lib/server/reportExporter';

export const GET: RequestHandler = async ({ url, locals: { getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) throw error(401, 'Unauthorized');

    const templateId = url.searchParams.get('id');
    if (!templateId) throw error(400, 'Template ID required');

    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: template } = await supabaseAdmin
        .from('report_templates')
        .select('name, allowed_roles, base_table, configuration')
        .eq('id', templateId)
        .single();

    if (!template) throw error(404, 'Template not found');

    // Check permissions
    if (!userProfile.role || (!template.allowed_roles.includes(userProfile.role) && userProfile.role !== 'admin')) {
        throw error(403, 'Forbidden');
    }

    // Extract filters from query params
    const userFilters: Record<string, any> = {};
    url.searchParams.forEach((value, key) => {
        if (key !== 'id') {
            userFilters[key] = value;
        }
    });

    try {
        console.log(`Generating report for template: ${template.name} (${templateId})`);
        const { data, queryString } = await executeReportQuery(supabaseAdmin, userProfile, template.base_table, template.configuration, { userFilters }); 
        
        const rowCount = data ? data.length : 0;
        console.log(`Report generated. Rows: ${rowCount}. Query: ${queryString}`);

        const csv = generateCSV(data as any[], template.configuration.columns);

        return new Response(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${template.name.replace(/\s+/g, '_')}_${Date.now()}.csv"`
            }
        });
    } catch (e) {
        console.error(e);
        throw error(500, 'Report generation failed');
    }
};
