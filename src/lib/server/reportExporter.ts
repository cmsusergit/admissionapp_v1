
interface ReportColumn {
    path: string;
    label: string;
}

export function generateCSV(data: any[], columns: ReportColumn[]): string {
    // 1. Header Row
    const header = columns.map(c => escapeCsv(c.label)).join(',');

    // 2. Data Rows
    const rows = (data || []).map(row => {
        return columns.map(col => {
            const val = getValueByPath(row, col.path);
            return escapeCsv(formatValue(val));
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

export function getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    // Handle PostgREST alias syntax in path if present (e.g. 'users!fk.name')
    // The data object usually has the alias/table name as key.
    // So 'users!fk' in path maps to 'users' key in data? 
    // Actually, if we selected 'users!fk(...)', the key in data is 'users'.
    // We need to strip modifiers from path parts to find keys.
    
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        
        // Strip !fk or :alias if present to find the property name
        // e.g. "users!fk" -> "users"
        const propName = part.split('!')[0].split(':')[0]; 
        
        current = current[propName];
        
        // Handle Arrays (e.g. one-to-many)? 
        // If current becomes an array, we might want the first item or join them?
        // For CSV flat report, usually we expect x-to-one. 
        // If array, just JSON stringify or join.
        if (Array.isArray(current)) {
            if (current.length > 0) current = current[0]; // Take first for now
            else current = null;
        }
    }
    return current;
}

export function formatValue(val: any): string {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val.toLocaleDateString();
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

function escapeCsv(str: string): string {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
