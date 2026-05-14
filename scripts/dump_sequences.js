
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function dumpSequences() {
    const { data, error } = await supabase.from('receipt_sequences').select('*');
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Current sequences in DB:');
        console.table(data.map(d => ({
            id: d.id,
            payment_type: d.payment_type,
            prefix: d.prefix,
            curr: d.current_sequence,
            coll: d.college_id.slice(0,8),
            course: d.course_id.slice(0,8),
            year: d.academic_year_id.slice(0,8)
        })));
    }
}

dumpSequences();
