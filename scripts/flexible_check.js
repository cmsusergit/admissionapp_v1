import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSql() {
    // This is a hack to run raw SQL since Supabase JS doesn't support it directly 
    // and I don't want to create an RPC for every check.
    // I'll check the information_schema instead.
    
    console.log("Checking unique constraints for receipt_sequences...");
    
    // We can't run raw SQL easily without an RPC. 
    // Let's check the migrations files again or try to infer from schema.
    
    const { data, error } = await supabase
        .from('receipt_sequences')
        .select('*')
        .limit(1);
    
    if (error) console.error(error);
    else console.log("Table exists and is accessible.");
}

runSql();
