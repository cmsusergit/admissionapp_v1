import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTables() {
    const tables = ['payments', 'receipt_sequences', 'transactions', 'enrollment_sequences'];
    
    for (const table of tables) {
        console.log(`\n--- Inspecting ${table} table ---`);
        
        // Use a direct query to get column info since information_schema might be restricted via PostgREST
        // But we can try a simple select * limit 0 or similar if RPC fails
        const { data: samples, error: sError } = await supabase
            .from(table)
            .select('*')
            .limit(1);
        
        if (sError) {
            console.error(`Error fetching sample from ${table}:`, sError.message);
        } else if (samples && samples.length > 0) {
            console.log(`Columns in ${table}:`, Object.keys(samples[0]).join(', '));
            console.log('Sample data:', JSON.stringify(samples[0], null, 2));
        } else {
            console.log(`No data in ${table} to inspect columns.`);
        }
    }
}

inspectTables();
