import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Searching for student users containing "NISTHA"...');
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('*')
        .ilike('full_name', '%NISTHA%');
    
    if (userError) {
        console.error('User search error:', userError);
        return;
    }

    console.log('Matching users found:', users);

    for (const user of users) {
        console.log(`\n=== Processing User: ${user.full_name} (${user.id}) ===`);
        
        // 1. Fetch Student Profile
        const { data: profiles } = await supabase
            .from('student_profiles')
            .select('*')
            .eq('user_id', user.id);
        console.log('Student Profiles:', profiles);

        // 2. Fetch Applications
        const { data: apps } = await supabase
            .from('applications')
            .select('*, courses(name, code)')
            .eq('student_id', user.id);
        console.log('Applications:', apps);

        for (const app of apps || []) {
            console.log(`\n  --- Application ID: ${app.id} ---`);
            // 3. Fetch Payments
            const { data: payments } = await supabase
                .from('payments')
                .select('*')
                .eq('application_id', app.id);
            console.log('  Payments:', payments);

            // 4. Fetch Account Admissions
            const { data: admissions } = await supabase
                .from('account_admissions')
                .select('*')
                .eq('application_id', app.id);
            console.log('  Account Admissions:', admissions);

            // 5. Fetch Transfer History
            const { data: history } = await supabase
                .from('student_transfer_history')
                .select('*')
                .eq('application_id', app.id);
            console.log('  Transfer History:', history);
        }
    }
}

run();
