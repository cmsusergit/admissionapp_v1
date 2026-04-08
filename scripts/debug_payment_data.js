
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugData() {
    console.log("Fetching last payment...");
    const { data: payments, error } = await supabase
        .from('payments')
        .select(`
            *,
            applications (
                id,
                student_id,
                course_id,
                branch_id,
                users (full_name, email, enrollment_number),
                courses (name, code),
                branches (name, code),
                admission_cycles (academic_years (short_code)),
                account_admissions (admission_number)
            )
        `)
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error("Error fetching payment:", error);
        return;
    }

    if (!payments || payments.length === 0) {
        console.log("No payments found.");
        return;
    }

    const p = payments[0];
    console.log("Payment Receipt:", p.receipt_number);
    console.log("Application ID:", p.application_id);
    
    const app = p.applications;
    if (app) {
        console.log("Student:", app.users?.full_name);
        console.log("Enrollment Num (in DB):", app.users?.enrollment_number);
        console.log("Admission Num (in DB):", app.account_admissions);
        console.log("Course Code:", app.courses?.code);
        console.log("Branch Code:", app.branches?.code);
        console.log("AY Short Code:", app.admission_cycles?.academic_years?.short_code);
    } else {
        console.log("Application data missing in join.");
    }
}

debugData();
