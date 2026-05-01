
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function debugBackfill() {
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Check one application that has data
    const { data: apps } = await supabase
        .from('applications')
        .select('*')
        .limit(5);

    for (const app of apps) {
        console.log(`\nApp ID: ${app.id}`);
        console.log(`Course: ${app.course_id}, Cycle: ${app.cycle_id}, Type: ${app.form_type}`);
        console.log(`Form Data Keys: ${Object.keys(app.form_data || {}).join(', ')}`);

        const { data: form } = await supabase
            .from('admission_forms')
            .select('schema_json')
            .eq('course_id', app.course_id)
            .eq('cycle_id', app.cycle_id)
            .eq('form_type', app.form_type)
            .maybeSingle();

        if (form) {
            const fileFields = form.schema_json.fields.filter(f => f.type === 'file');
            console.log(`Schema File Fields: ${fileFields.map(f => f.key || f.name).join(', ')}`);
            
            for (const f of fileFields) {
                const val = app.form_data[f.key || f.name];
                console.log(` - Field [${f.label}] Key [${f.key || f.name}] Value: ${val}`);
            }
        } else {
            console.log('No matching schema found.');
        }
    }
}

debugBackfill();
