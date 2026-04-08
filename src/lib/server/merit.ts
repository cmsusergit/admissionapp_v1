import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluate } from 'mathjs';

/**
 * Calculates merit scores for all verified applications in a specific course and cycle.
 * Then assigns ranks based on the scores.
 */
export async function calculateAndRankMerit(
    supabase: SupabaseClient, 
    courseId: string, 
    cycleId: string,
    formType: string = 'Provisional' // Default
) {
    console.log(`Starting Merit Calculation for Course: ${courseId}, Cycle: ${cycleId}, Type: ${formType}`);

    // 1. Fetch Verified Applications
    const { data: applications, error: appError } = await supabase
        .from('applications')
        .select(`
            id, 
            student_id, 
            form_data,
            marks (*)
        `)
        .eq('course_id', courseId)
        .eq('cycle_id', cycleId)
        .eq('form_type', formType)
        .eq('status', 'verified'); // Only verified applications

    if (appError) {
        console.error('Error fetching verified applications:', appError.message);
        return { success: false, message: 'Failed to fetch applications.' };
    }

    if (!applications || applications.length === 0) {
        return { success: true, message: 'No verified applications found to process.' };
    }

    // 2. Fetch Merit Formula
    const { data: formulaData, error: formulaError } = await supabase
        .from('merit_formulas')
        .select('rules_json')
        .eq('course_id', courseId)
        .eq('form_type', formType)
        .single();

    // Default formula if none exists (e.g., just sum of marks or straight percentage)
    // For now, we assume a simple 'total_percentage' if available in form_data, or 0.
    const rules = formulaData?.rules_json || {};

    // 3. Calculate Scores
    const updates = [];
    for (const app of applications) {
        let score = 0;

        // --- CALCULATION LOGIC ---
        
        // C. Expression Mode (New)
        if (rules.mode === 'expression' && rules.expression) {
            try {
                // Build Context
                const context: any = {};
                
                // 1. Add marks from 'marks' table
                if (app.marks && app.marks.length > 0) {
                    app.marks.forEach((m: any) => {
                        // Normalize key: lowercase, remove spaces, etc. if needed.
                        // Assuming frontend uses keys that match exactly what's saved in 'subject' or mapped correctly.
                        // Ideally, we should use the field key.
                        
                        // NOTE: 'subject' in marks table currently stores the LABEL or Subject Name.
                        // BUT our formula uses Keys.
                        // We need to map labels back to keys OR ensure marks are stored with keys.
                        // The trigger we wrote stores 'subject' as the Label/Name.
                        // BUT it inserts based on schema.
                        
                        // Hack/Adjustment: We iterate marks. We also need access to form_data for raw keys if needed.
                        // Better approach: Use form_data for raw values since they are reliable keys.
                    });
                }
                
                // PREFERRED: Build context from form_data directly as it has the keys
                if (app.form_data) {
                    for (const [key, val] of Object.entries(app.form_data)) {
                        if (typeof val === 'object' && val !== null && 'value' in val && 'max_score' in val) {
                            // Structured Merit Field
                            context[key] = Number(val.value) || 0;
                            context[`${key}_max`] = Number(val.max_score) || 1; // Avoid div/0
                        } else if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
                            // Simple field
                            context[key] = Number(val);
                            // We don't have max here easily unless we look up schema.
                            // But for expression mode, usually structured fields are used.
                        }
                    }
                }

                score = evaluate(rules.expression, context);
            } catch (e) {
                console.error(`Error evaluating formula for app ${app.id}:`, e);
                score = 0;
            }
        }
        
        // B. Weighted Average (Legacy)
        // If rules exist, e.g., { "weight_hsc": 0.6, "weight_entrance": 0.4 }
        else if (Object.keys(rules).length > 0 && rules.mode !== 'expression') {
             // ... implementation of weighted average ...
             // Iterate through rules keys starting with "weight_"
             for (const [rKey, weight] of Object.entries(rules)) {
                 if (rKey.startsWith('weight_')) {
                     const fieldKey = rKey.replace('weight_', '');
                     let fieldVal = 0;
                     
                     // Try to find value in form_data
                     if (app.form_data && app.form_data[fieldKey]) {
                         const raw = app.form_data[fieldKey];
                         if (typeof raw === 'object' && raw.value) {
                             fieldVal = Number(raw.value);
                         } else {
                             fieldVal = Number(raw);
                         }
                     }
                     
                     if (!isNaN(fieldVal)) {
                         score += fieldVal * (Number(weight) || 0);
                     }
                 }
             }
        }
        // A. Fallback: Check form_data for direct score 
        else if (app.form_data && (app.form_data['merit_score'] || app.form_data['total_percentage'])) {
            score = parseFloat(app.form_data['merit_score'] || app.form_data['total_percentage']);
        } 

        // Ensure score is a number
        if (isNaN(score)) score = 0;

        updates.push({ id: app.id, merit_score: score });
    }

    // 4. Sort by Score (Descending) to determine Rank
    updates.sort((a, b) => b.merit_score - a.merit_score);

    // 5. Update Database (Batch or Loop)
    // We update both score and rank in the new table
    let rank = 1;
    for (const update of updates) {
        const { error } = await supabase
            .from('merit_list_entries')
            .upsert({ 
                application_id: update.id,
                merit_score: update.merit_score,
                merit_rank: rank,
                created_at: new Date().toISOString()
            }, { onConflict: 'application_id' });
        
        if (error) {
            console.error(`Failed to update merit for app ${update.id}:`, error.message);
        }
        rank++;
    }

    return { success: true, message: `Successfully calculated and ranked ${updates.length} applications.` };
}
