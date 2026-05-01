
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data: templates, error } = await supabaseAdmin
        .from('report_templates')
        .select('*');
        
    if (error) {
        console.error('Error:', error.message);
        return;
    }
    
    console.log('Existing Report Templates:');
    templates.forEach(t => {
        console.log(`ID: ${t.id} | Name: ${t.name}`);
        console.log('Configuration:', JSON.stringify(t.configuration, null, 2));
        console.log('---');
    });
}

run();
