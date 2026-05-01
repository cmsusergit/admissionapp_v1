
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
    if (!obj) return null;
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current === null || current === undefined) return null;
        
        // Strip !fk or :alias if present to find the property name
        const propName = part.split('!')[0].split(':')[0]; 
        
        // Attempt 1: Direct match
        if (current[propName] !== undefined) {
            current = current[propName];
        } 
        // Attempt 2: Case-insensitive search if direct match fails
        else {
            const foundKey = Object.keys(current).find(k => k.toLowerCase() === propName.toLowerCase());
            if (foundKey) {
                current = current[foundKey];
            } else {
                // If it's a leaf node but we didn't find the exact path, 
                // maybe the object itself IS the value? (Sometimes happens with PostgREST count/single joins)
                // But usually we just return null.
                return null;
            }
        }
        
        // Handle Arrays (take first item for flat reports)
        if (Array.isArray(current)) {
            current = current.length > 0 ? current[0] : null;
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
