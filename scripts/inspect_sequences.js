import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectTable() {
    console.log("Inspecting receipt_sequences table...");
    
    const { data: columns, error: colError } = await supabase
        .rpc('get_table_columns', { table_name: 'receipt_sequences' });

    if (colError) {
        // Fallback to direct query if RPC doesn't exist
        const { data: cols, error: e } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable')
            .eq('table_name', 'receipt_sequences');
        
        if (e) {
            console.error("Error fetching columns:", e);
        } else {
            console.table(cols);
        }
    } else {
        console.table(columns);
    }

    // Check data
    const { data: samples, error: sError } = await supabase
        .from('receipt_sequences')
        .select('*')
        .limit(5);
    
    if (sError) {
        console.error("Error fetching samples:", sError);
    } else {
        console.log("Samples:", JSON.stringify(samples, null, 2));
    }
}

inspectTable();
