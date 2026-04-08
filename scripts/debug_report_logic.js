import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const COLLEGE_ID = '144ae3bd-c2cf-4906-8318-b41f790db62c';

async function testExactQuery() {
    console.log('--- Testing Exact Server Query ---');

    // 1. Get Course IDs
    const { data: courses } = await supabaseAdmin.from('courses').select('id').eq('college_id', COLLEGE_ID);
    const courseIds = courses.map(c => c.id);

    // 2. Query
    // Exact copy from college-auth/reports/+page.server.ts
    let query = supabaseAdmin
        .from('applications')
        .select(`
            id, 
            status, 
            form_type,
            course_id,
            branch_id,
            users!inner (full_name, email, enrollment_number, mobile_number), 
            courses (name),
            branches (name)
        `, { count: 'exact' })
        .in('course_id', courseIds)
        .eq('status', 'approved');

    // No search, default sort, range 0-9
    query = query.order('created_at', { ascending: false }).range(0, 9);

    const { data, count, error } = await query;

    if (error) {
        console.error('QUERY FAILED:', error);
    } else {
        console.log(`Query Success. Count: ${count}`);
        console.log(`Rows returned: ${data?.length}`);
        if (data?.length > 0) console.log('Sample:', data[0]);
    }
}

testExactQuery();