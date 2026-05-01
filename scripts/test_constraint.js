
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testConstraint() {
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Existing record:
    // College: 2f6032fd-3a69-411e-85c4-bf755e9fdae0
    // Course: de7b17a8-3e1b-4a4c-9f2b-b13235c8c7e1
    // AY: 679c59c6-534b-42ac-b2e5-b1a5d8e00472
    // Prefix: P-26-BE-
    
    const data = {
        college_id: '2f6032fd-3a69-411e-85c4-bf755e9fdae0',
        course_id: 'de7b17a8-3e1b-4a4c-9f2b-b13235c8c7e1',
        academic_year_id: '679c59c6-534b-42ac-b2e5-b1a5d8e00472',
        prefix: 'MQ-26-BE-', // DIFFERENT PREFIX
        current_sequence: 0
    };

    console.log('Testing insert with different prefix...');
    const { data: result, error } = await supabase
        .from('admission_sequences')
        .insert(data);

    if (error) {
        console.error('Insert failed:', error.message);
    } else {
        console.log('Insert succeeded! Constraint allows different prefixes.');
    }
}

testConstraint();
