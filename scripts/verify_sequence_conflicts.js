import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSequenceConsistency() {
    console.log("Checking for sequence overlaps and inconsistencies...");

    // 1. Check for duplicate sequences for the same course/year but different payment types
    const { data: sequences, error: seqError } = await supabase
        .from('receipt_sequences')
        .select('*');

    if (seqError) {
        console.error("Error fetching sequences:", seqError);
        return;
    }

    const groups = {};
    sequences.forEach(s => {
        const key = `${s.college_id}_${s.course_id}_${s.academic_year_id}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    });

    console.log(`Total sequences: ${sequences.length}`);
    console.log(`Unique Course/Year groups: ${Object.keys(groups).length}`);

    let overlapCount = 0;
    for (const key in groups) {
        const group = groups[key];
        if (group.length > 1) {
            overlapCount++;
            console.log(`\nOverlap found for Group ${key}:`);
            group.forEach(s => {
                console.log(` - ID: ${s.id}, Type: ${s.payment_type}, Current: ${s.current_sequence}, Prefix: ${s.prefix}`);
            });
        }
    }

    if (overlapCount === 0) {
        console.log("\nNo overlapping sequences found (all Course/Year groups have only one sequence record).");
        console.log("This means currently all fee types share a single sequence record per Course/Year.");
        console.log("Risk: If I split them by payment_type, new fee types will START FROM 1.");
    } else {
        console.log(`\nTotal overlapping groups: ${overlapCount}`);
        console.log("This confirms that the current code (which doesn't filter by payment_type) will FAIL with 'multiple rows found' errors for these groups.");
    }

    // 2. Check if prefixes are consistent
    console.log("\nChecking prefix consistency...");
    sequences.forEach(s => {
        if (s.payment_type === 'provisional_fee' && s.prefix !== 'PROV-') {
            console.warn(` - Inconsistent prefix: ${s.id} (Type: ${s.payment_type}, Prefix: ${s.prefix})`);
        }
        // Note: Some might use 'REC-' as default
    });
}

checkSequenceConsistency();
