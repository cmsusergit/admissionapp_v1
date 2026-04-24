
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: apps, error } = await supabaseAdmin
        .from('applications')
        .select('id, course_id, cycle_id, form_type')
        .limit(5);
        
    if (error) {
        console.error('Error:', error.message);
        return;
    }
    
    console.log('Sample Applications:', apps);
    
    if (apps && apps.length > 0) {
        const app = apps[0];
        const { data: form } = await supabaseAdmin
            .from('admission_forms')
            .select('id, form_type')
            .eq('course_id', app.course_id)
            .eq('cycle_id', app.cycle_id)
            .eq('form_type', app.form_type)
            .maybeSingle();
            
        console.log('Match for first app:', form);
    }
}

run();
