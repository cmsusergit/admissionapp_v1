
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBranchCodes() {
    console.log('Checking for branches with missing codes...');
    
    const { data: branches, error } = await supabase
        .from('branches')
        .select('id, name, code, course_id, courses(name)');

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!branches || branches.length === 0) {
        console.log('No branches found.');
        return;
    }

    let missingCount = 0;
    branches.forEach(b => {
        if (!b.code) {
            console.log(`❌ Missing Code: Branch "${b.name}" (Course: ${b.courses?.name}) - ID: ${b.id}`);
            missingCount++;
        } else {
            console.log(`✅ OK: ${b.name} (${b.code})`);
        }
    });

    console.log(`\nSummary: ${branches.length} branches checked. ${missingCount} missing codes.`);
}

checkBranchCodes();
