
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkConstraints() {
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // We can check existing data to see if there's a conflict
    const { data: sequences, error } = await supabase
        .from('admission_sequences')
        .select('*');

    if (error) {
        console.error('Error fetching sequences:', error.message);
        return;
    }

    console.log('Current Sequences:');
    console.table(sequences.map(s => ({
        id: s.id,
        college: s.college_id,
        course: s.course_id,
        ay: s.academic_year_id,
        prefix: s.prefix,
        seq: s.current_sequence
    })));
}

checkConstraints();
