import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdmissions() {
    console.log('Checking Payments & Admissions...');
    
    const { data: payments, error } = await supabase
        .from('payments')
        .select(`
            id, payment_type, amount,
            applications (
                id,
                account_admissions (id, admission_number)
            )
        `)
        .limit(10);

    if (error) console.error(error);
    
    payments?.forEach(p => {
        const app = p.applications;
        const adm = app?.account_admissions;
        console.log(`Payment [${p.payment_type}]: App ${app?.id} -> Adm: ${JSON.stringify(adm)}`);
    });
}

checkAdmissions();
