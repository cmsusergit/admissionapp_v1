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
    operator: 'eq' | 'ilike' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'match';
    options?: string[]; // For select type
}

export interface ReportConfig {
    columns: ReportColumn[];
    filters?: Record<string, any>; // Hardcoded filters (e.g. status=active)
    parameters?: ReportParameter[]; // User-defined dynamic filters
}

const JSON_COLUMNS = new Set(['profile_data', 'form_data']);

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
    // 0. Collect all paths from both columns AND active filters to ensure joins are established
    const allPaths = [...(config.columns || []).map(c => c.path)];
    const filteredRelations = new Set<string>();
    
    // Add paths from parameters that have values provided
    if (options.userFilters && config.parameters) {
        Object.entries(options.userFilters).forEach(([paramName, value]) => {
            if (value === undefined || value === null || value === '') return;
            const param = config.parameters?.find(p => p.name === paramName);
            if (param && param.column.includes('.')) {
                allPaths.push(param.column);
                
                // Track for !inner join
                let col = param.column;
                if (col.startsWith(baseTable + '.')) {
                    col = col.slice(baseTable.length + 1);
                }
                const rootWithHint = col.split('.')[0];
                const root = rootWithHint.split('!')[0].split(':')[0];
                if (!JSON_COLUMNS.has(root)) {
                    filteredRelations.add(root);
                }
            }
        });
    }

    // Also track hardcoded filters for !inner join
    if (config.filters) {
        Object.keys(config.filters).forEach(key => {
            let col = key;
            if (col.startsWith(baseTable + '.')) {
                col = col.slice(baseTable.length + 1);
            }
            // Track full path for inner joins
            filteredRelations.add(col.replace(/![a-zA-Z0-9_]+/g, ''));
        });
    }

    // Add all parameter columns to filteredRelations to ensure !inner joins
    if (options.userFilters && config.parameters) {
        Object.entries(options.userFilters).forEach(([paramName, value]) => {
            if (value === undefined || value === null || value === '') return;
            const param = config.parameters?.find(p => p.name === paramName);
            if (param) {
                let col = param.column;
                if (col.startsWith(baseTable + '.')) {
                    col = col.slice(baseTable.length + 1);
                }
                filteredRelations.add(col.replace(/![a-zA-Z0-9_]+/g, ''));
            }
        });
    }

    // 1. Construct Select Query
    const selectString = buildSelectString(allPaths.map(p => ({ path: p, label: '' })), baseTable, filteredRelations);
    
    // 2. Start Query
    let query = supabase.from(baseTable).select(selectString);

    // 3. Apply Security Filters (CRITICAL)
    query = applyRoleBasedCollegeFilter(query, userProfile, baseTable as any);

    // 4. Apply Template Default Filters (Hardcoded)
    if (config.filters) {
        Object.entries(config.filters).forEach(([key, value]) => {
            // Clean keys for filtering (PostgREST uses relationship names/aliases, not FK hints)
            const cleanKey = key.replace(/![a-zA-Z0-9_]+/g, '');
            query = query.eq(cleanKey, value);
        });
    }

    // 5. Apply User Dynamic Filters
    let dynamicFilterString = '';
    if (options.userFilters && config.parameters) {
        Object.entries(options.userFilters).forEach(([paramName, value]) => {
            if (value === undefined || value === null || value === '') return; 

            const param = config.parameters?.find(p => p.name === paramName);
            if (param) {
                // 1. Strip FK hints from column path for PostgREST filtering
                let col = param.column.replace(/![a-zA-Z0-9_]+/g, '');

                if (col.startsWith(baseTable + '.')) {
                    col = col.slice(baseTable.length + 1);
                }

                col = convertJsonPathToFilter(col);

                switch (param.operator) {
                    case 'eq': 
                        if (param.type === 'text' || param.type === 'select') {
                            query = query.ilike(col, value); 
                        } else {
                            query = query.eq(col, value); 
                        }
                        break;
                    case 'ilike': query = query.ilike(col, `%${value}%`); break;
                    case 'match': query = query.filter(col, 'match', value); break; // POSIX Regex
                    case 'gt': query = query.gt(col, value); break;
                    case 'gte': query = query.gte(col, value); break;
                    case 'lt': query = query.lt(col, value); break;
                    case 'lte': query = query.lte(col, value); break;
                    case 'in': {
                        const list = typeof value === 'string' ? value.split(',').map((item) => item.trim()) : value;
                        query = query.in(col, list);
                        break;
                    }
                }
                dynamicFilterString += `\n  AND ${col} ${param.operator} '${value}'`;
            }
        });
    }

    // 6. Apply Limit
    if (options.limit) {
        query = query.limit(options.limit);
    }

    // 7. Generate Query String Representation (for debug/preview)
    const queryString = `TABLE: ${baseTable}\nSELECT: ${selectString}\nWHERE: 1=1` + 
        (config.filters ? `\n  AND ${JSON.stringify(config.filters).replace(/{|}/g, '')}` : '') +
        dynamicFilterString +
        (options.limit ? `\nLIMIT: ${options.limit}` : '');

    // 8. Execute
    const { data, error } = await query;
    
    if (error) {
        console.error(`[ReportQueryBuilder] Query failed for ${baseTable}:`, error);
        throw error;
    }

    if (data && data.length > 0) {
        console.log(`[ReportQueryBuilder] Success. First row keys:`, Object.keys(data[0]));
        // Optional: deeper log if needed
        // console.log(`[ReportQueryBuilder] Sample row:`, JSON.stringify(data[0], null, 2));
    } else {
        console.log(`[ReportQueryBuilder] Query returned no data.`);
    }

    return { data, queryString };
}

function convertJsonPathToFilter(path: string): string {
    const parts = path.split('.');
    const jsonIndex = parts.findIndex((p) => JSON_COLUMNS.has(p));
    if (jsonIndex >= 0 && jsonIndex + 1 < parts.length) {
        const prefix = parts.slice(0, jsonIndex + 1).join('.');
        const jsonKey = parts.slice(jsonIndex + 1).join('.');
        return `${prefix}->>${jsonKey}`;
    }
    return path;
}

/**
 * Maps known ambiguous relationships to their explicit FK constraints
 */
const FK_MAP: Record<string, Record<string, string>> = {
    'applications': {
        'users': 'applications_student_id_fkey',
        'courses': 'applications_course_id_fkey',
        'branches': 'applications_branch_id_fkey',
        'admission_cycles': 'applications_cycle_id_fkey',
        'payments': 'payments_application_id_fkey',
        'account_admissions': 'account_admissions_application_id_fkey'
    },
    'payments': {
        'applications': 'payments_application_id_fkey'
    }
};

export function buildSelectString(columns: ReportColumn[], currentTable: string, filteredRelations?: Set<string>, prefix: string = ''): string {
    const rootFields: string[] = [];
    const nestedFields: Record<string, string[]> = {};

    const addNestedField = (relation: string, field: string) => {
        if (!nestedFields[relation]) nestedFields[relation] = [];
        if (!nestedFields[relation].includes(field)) nestedFields[relation].push(field);
    };

    columns.forEach((col) => {
        const parts = col.path.split('.');
        if (parts.length === 1) {
            rootFields.push(parts[0]);
            return;
        }

        const firstSegment = parts[0];
        if (JSON_COLUMNS.has(firstSegment)) {
            rootFields.push(firstSegment);
            return;
        }

        const rootWithHint = firstSegment;
        const root = rootWithHint.split('!')[0].split(':')[0];
        const rest = parts.slice(1).join('.');

        // Special case: if the "root" is actually the current table name (redundant prefix)
        if (root === currentTable) {
            const subParts = rest.split('.');
            if (subParts.length === 1) {
                rootFields.push(subParts[0]);
            } else if (JSON_COLUMNS.has(subParts[0])) {
                rootFields.push(subParts[0]);
            } else {
                const subRoot = subParts[0].split('!')[0].split(':')[0];
                addNestedField(subRoot, subParts.slice(1).join('.'));
            }
            return;
        }

        addNestedField(root, rest);
    });

    const nestedStrings = Object.entries(nestedFields).map(([relation, fields]) => {
        const subColumns = fields.map(f => ({ path: f, label: '' }));
        
        // Find table name for recursion (usually same as relation name)
        let targetTable = relation;
        
        // Apply FK Hint ONLY if ambiguous in FK_MAP
        let joinExpr = relation;
        const hint = FK_MAP[currentTable]?.[relation];
        if (hint) {
            joinExpr = `${relation}!${hint}`;
        } else if (relation.includes('!')) {
            // If path already contains a hint (e.g. users!student_id), keep it
            joinExpr = relation;
        }

        // Always alias to the clean relationship name for consistent data structure
        const alias = relation.split('!')[0].split(':')[0];
        
        // Construct full path for inner join check
        const fullRelPath = prefix ? `${prefix}.${alias}` : alias;

        // NEW: If this relation or any of its children are being filtered, use !inner join
        const shouldBeInner = Array.from(filteredRelations || []).some(path => path === fullRelPath || path.startsWith(fullRelPath + '.'));
        
        if (shouldBeInner) {
            joinExpr += '!inner';
        }

        const subSelect = buildSelectString(subColumns, targetTable, filteredRelations, fullRelPath);

        return `${alias}:${joinExpr}(${subSelect})`;
    });

    return [...new Set(rootFields), ...nestedStrings].join(',');
}