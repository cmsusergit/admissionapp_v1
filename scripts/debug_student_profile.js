
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStudentProfile() {
    console.log('Fetching a student profile...');
    // Fetch one profile that has data
    const { data: profiles, error } = await supabase
        .from('student_profiles')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching profile:', error);
        return;
    }

    if (!profiles || profiles.length === 0) {
        console.log('No student profiles found.');
        return;
    }

    const profile = profiles[0];
    console.log('User ID:', profile.user_id);
    console.log('Profile Data:', JSON.stringify(profile.profile_data, null, 2));
    
    if (profile.profile_data.category) {
        console.log(`Category Value: '${profile.profile_data.category}'`);
        console.log(`Category Type: ${typeof profile.profile_data.category}`);
    } else {
        console.log('Category key not found in profile_data');
    }
}

checkStudentProfile();
