
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testQuery() {
    const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const appId = 'e3796c09-3905-4368-9d1a-1290db3e7f14';

    console.log(`Testing query for App ID: ${appId}`);

    const { data, error } = await supabaseAdmin
        .from('applications')
        .select(`
            id, status, form_type, submitted_at,
            student_user:users!student_id!inner (full_name, email),
            courses (name),
            branches (name),
            documents (*)
        `)
        .eq('id', appId)
        .single();

    if (error) {
        console.error('Query Error:', error.message);
    } else {
        console.log('App Found:', data.id);
        console.log('Documents Array:', data.documents);
        console.log('Documents Count:', data.documents?.length);
    }
}

testQuery();
