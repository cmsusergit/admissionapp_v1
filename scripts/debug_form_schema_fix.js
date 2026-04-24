
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function debugSchema(applicationId) {
    console.log(`Checking Application: ${applicationId}`);
    
    const { data: application, error: appError } = await supabaseAdmin
        .from('applications')
        .select('course_id, cycle_id, form_type')
        .eq('id', applicationId)
        .single();
        
    if (appError) {
        console.error('App fetch error:', appError.message);
        return;
    }
    
    console.log('Application Config:', application);
    
    const { data: form, error: formError } = await supabaseAdmin
        .from('admission_forms')
        .select('id, course_id, cycle_id, form_type, is_enabled')
        .eq('course_id', application.course_id)
        .eq('cycle_id', application.cycle_id)
        .eq('form_type', application.form_type)
        .maybeSingle();
        
    if (formError) {
        console.error('Form fetch error:', formError.message);
    }
    
    if (form) {
        console.log('Found matching form:', form);
    } else {
        console.log('No matching form found with exact criteria.');
        
        // Try loose check
        console.log('Checking for ANY forms with this course/cycle...');
        const { data: looseForms } = await supabaseAdmin
            .from('admission_forms')
            .select('id, form_type')
            .eq('course_id', application.course_id)
            .eq('cycle_id', application.cycle_id);
            
        console.log('Forms found for this course/cycle:', looseForms);
    }
}

// Get the last application to test
async function run() {
    const { data: apps } = await supabaseAdmin.from('applications').select('id').limit(10).order('created_at', {ascending: false});
    if (apps && apps.length > 0) {
        for (const app of apps) {
            await debugSchema(app.id);
            console.log('---');
        }
    } else {
        console.log('No applications found to debug.');
        console.log('Listing all admission forms for reference:');
        const { data: allForms } = await supabaseAdmin.from('admission_forms').select('id, course_id, cycle_id, form_type, is_enabled');
        console.log(allForms);
    }
}

run();
