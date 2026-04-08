
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { executeReportQuery } from '$lib/server/reportQueryBuilder';
import { getValueByPath, formatValue } from '$lib/server/reportExporter';

export const load: PageServerLoad = async ({ params, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
    const authenticatedUser = await getAuthenticatedUser();
    if (!authenticatedUser) throw error(401, 'Unauthorized');
    
    // Basic role check if needed, though RLS handles data access.
    // The route is under /adm-officer/ so assumes role is checked by layout or hooks? 
    // But let's be safe.
    if (!['adm_officer', 'deo', 'fee_collector', 'admin'].includes(userProfile?.role)) {
        throw error(403, 'Forbidden');
    }
    
    const { id } = params;
    const { data: template, error: err } = await supabase
        .from('report_templates')
        .select('id, name, description, allowed_roles, report_type, configuration')
        .eq('id', params.id)
        .single();
        
    if (err || !template) throw error(404, 'Template not found');
    
    // Specific template access check
    if (!userProfile.role || (!template.allowed_roles.includes(userProfile.role) && userProfile.role !== 'admin')) {
        throw error(403, 'Forbidden');
    }
    
    return { template };
};

export const actions: Actions = {
    preview: async ({ request, params, locals: { supabase, userProfile } }) => {
        const formData = await request.formData();
        const id = params.id;
        
        // Fetch template again for security (config)
        const { data: template } = await supabase
            .from('report_templates')
            .select('base_table, configuration, report_type')
            .eq('id', id)
            .single();
            
        if (!template) return fail(404, { message: 'Template not found' });
        
        // Extract filters
        const userFilters: Record<string, any> = {};
        if (template.configuration.parameters) {
            template.configuration.parameters.forEach((param: any) => {
                const value = formData.get(param.name);
                if (value) {
                    userFilters[param.name] = value; // Store raw value, logic handles splitting for IN
                }
            });
        }
        
        try {
            // Check if it's an HTML profile template
            if (template.report_type === 'html_profile') {
                return fail(400, { message: 'HTML Profile forms cannot be previewed here. They must be printed directly from a specific application details page.' });
            }

            const { data: rawData, queryString } = await executeReportQuery(
                supabase, 
                userProfile, 
                template.base_table, 
                template.configuration, 
                { limit: 10, userFilters }
            );
            
             // Flatten for preview
            const previewData = (rawData as any[]).map((row: any) => {
                const flatRow: Record<string, string> = {};
                // Handle potential null/undefined columns array safely
                if (template.configuration && template.configuration.columns) {
                    template.configuration.columns.forEach((col: any) => {
                        flatRow[col.label] = formatValue(getValueByPath(row, col.path));
                    });
                }
                return flatRow;
            });
            
            return { 
                success: true, 
                previewData, 
                previewColumns: template.configuration.columns ? template.configuration.columns.map((c: any) => c.label) : [], 
                queryString,
                userFilters 
            };
        } catch (e: any) {
            console.error(e);
            return fail(500, { message: 'Preview failed: ' + e.message });
        }
    }
};
