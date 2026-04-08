import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSequences() {
    console.log("Checking admission_sequences...");
    const { data: sequences, error } = await supabase
        .from('admission_sequences')
        .select('*');
    
    if (error) {
        console.error("Error fetching sequences:", error);
    } else {
        console.log("Found sequences:", sequences);
    }
}

checkSequences();
