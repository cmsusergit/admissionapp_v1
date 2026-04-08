import { applyRoleBasedCollegeFilter } from './security';

interface ReportColumn {
    path: string; // e.g. 'users!student_id.full_name' or 'status'
    label: string;
}

export interface ReportParameter {
    name: string; // unique key for the input form
    label: string;
    column: string; // db column path
    type: 'text' | 'number' | 'date' | 'select';
    operator: 'eq' | 'ilike' | 'gt' | 'lt' | 'gte' | 'lte' | 'in';
    options?: string[]; // For select type
}

export interface ReportConfig {
    columns: ReportColumn[];
    filters?: Record<string, any>; // Hardcoded filters (e.g. status=active)
    parameters?: ReportParameter[]; // User-defined dynamic filters
}

/**
 * Builds and executes a report query based on the template configuration.
 */
export async function executeReportQuery(
    supabase: any, 
    userProfile: any, 
    baseTable: string, 
    config: ReportConfig,
    options: { limit?: number; userFilters?: Record<string, any> } = {} 
) {
    // 1. Construct Select Query
    const selectString = buildSelectString(config.columns);
    
    // 2. Start Query
    let query = supabase.from(baseTable).select(selectString);

    // 3. Apply Security Filters (CRITICAL)
    query = applyRoleBasedCollegeFilter(query, userProfile, baseTable as any);

    // 4. Apply Template Default Filters (Hardcoded)
    if (config.filters) {
        Object.entries(config.filters).forEach(([key, value]) => {
            query = query.eq(key, value);
        });
    }

    // 5. Apply User Dynamic Filters
    let dynamicFilterString = '';
    if (options.userFilters && config.parameters) {
        Object.entries(options.userFilters).forEach(([paramName, value]) => {
            if (value === undefined || value === null || value === '') return; // Skip empty

            const param = config.parameters?.find(p => p.name === paramName);
            if (param) {
                // Apply based on operator
                // Note: PostgREST usually expects col.operator=value, but JS client uses methods
                const col = param.column;
                switch (param.operator) {
                    case 'eq': query = query.eq(col, value); break;
                    case 'ilike': query = query.ilike(col, `%${value}%`); break;
                    case 'gt': query = query.gt(col, value); break;
                    case 'gte': query = query.gte(col, value); break;
                    case 'lt': query = query.lt(col, value); break;
                    case 'lte': query = query.lte(col, value); break;
                    case 'in': 
                        const list = typeof value === 'string' ? value.split(',') : value;
                        query = query.in(col, list); 
                        break;
                }
                dynamicFilterString += ` AND ${col} ${param.operator} '${value}'`;
            }
        });
    }

    // 6. Apply Limit
    if (options.limit) {
        query = query.limit(options.limit);
    }

    // 7. Generate Query String Representation (for debug/preview)
    const queryString = `SELECT ${selectString} FROM ${baseTable}` + 
        (config.filters ? ` WHERE ${JSON.stringify(config.filters).replace(/{|}/g, '')}` : ' WHERE 1=1') +
        dynamicFilterString +
        (options.limit ? ` LIMIT ${options.limit}` : '');

    // 8. Execute
    const { data, error } = await query;
    
    if (error) throw error;
    return { data, queryString };
}

function buildSelectString(columns: ReportColumn[]): string {
    const rootFields: string[] = [];
    const nestedFields: Record<string, string[]> = {};

    columns.forEach(col => {
        const parts = col.path.split('.');
        if (parts.length === 1) {
            rootFields.push(parts[0]);
        } else {
            const root = parts[0];
            const rest = parts.slice(1).join('.');
            if (!nestedFields[root]) nestedFields[root] = [];
            nestedFields[root].push(rest);
        }
    });

    const nestedStrings = Object.entries(nestedFields).map(([relation, fields]) => {
        const subColumns = fields.map(f => ({ path: f, label: '' }));
        const subSelect = buildSelectString(subColumns);
        return `${relation}(${subSelect})`;
    });

    return [...new Set(rootFields), ...nestedStrings].join(',');
}