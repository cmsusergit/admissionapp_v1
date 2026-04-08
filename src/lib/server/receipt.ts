import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generates a sequential receipt number based on payment type and optional academic year.
 * Format: PREFIX-YYYY-SEQUENCE (e.g., PROV-2025-0001)
 */
export async function generateReceiptNumber(
    supabase: SupabaseClient, 
    paymentType: string, 
    academicYearId?: string,
    yearName?: string, // e.g. "2025-2026" for formatting
    collegeId?: string,
    courseId?: string,
    shortCode?: string // New optional parameter
): Promise<string> {
    
    // Determine Prefix
    let prefix = 'REC-';
    switch (paymentType) {
        case 'provisional_fee': prefix = 'PROV-'; break;
        case 'application_fee': prefix = 'APP-'; break;
        case 'tuition_fee': prefix = 'TUIT-'; break;
        default: prefix = 'GEN-';
    }

    // Determine Academic Year Shortcode for Format (e.g., "24-25" from "2024-2025")
    let academicYearShortcode = shortCode || '';
    if (!academicYearShortcode && yearName) {
        const parts = yearName.split('-');
        if (parts.length === 2 && parts[0].length === 4 && parts[1].length === 4) {
            academicYearShortcode = `${parts[0].slice(-2)}-${parts[1].slice(-2)}`; // e.g., '24-25'
        } else if (parts.length === 1 && parts[0].length === 4) {
            academicYearShortcode = parts[0].slice(-2); // e.g., '24' for '2024'
        } else {
            academicYearShortcode = yearName; // Fallback if format is unexpected
        }
    }

    // 1. Fetch Sequence
    let query = supabase
        .from('receipt_sequences')
        .select('id, current_sequence, prefix')
        .eq('payment_type', paymentType);

    if (academicYearId) {
        query = query.eq('academic_year_id', academicYearId);
    } else {
        query = query.is('academic_year_id', null);
    }

    if (collegeId) {
        query = query.eq('college_id', collegeId);
    }

    if (courseId) {
        query = query.eq('course_id', courseId);
    }

    let { data: sequence, error } = await query.maybeSingle();

    // 2. Create if missing
    if (!sequence) {
        const payload: any = {
            payment_type: paymentType,
            academic_year_id: academicYearId || null,
            prefix: prefix,
            current_sequence: 0
        };
        if (collegeId) payload.college_id = collegeId;
        if (courseId) payload.course_id = courseId;

        const { data: newSeq, error: createError } = await supabase
            .from('receipt_sequences')
            .insert(payload)
            .select()
            .single();
        
        if (createError) {
            console.error('Error creating receipt sequence:', createError);
            // Fallback to timestamp if sequence fails to prevent blocking payment
            return `REC-${Date.now()}`;
        }
        sequence = newSeq;
    }

    // 3. Increment
    const newSeqNum = (sequence.current_sequence || 0) + 1;
    
    const { error: updateError } = await supabase
        .from('receipt_sequences')
        .update({ current_sequence: newSeqNum })
        .eq('id', sequence.id);

    if (updateError) {
        console.error('Error updating receipt sequence:', updateError);
        return `REC-${Date.now()}`; // Fallback
    }

    // 4. Format: PREFIX-YY-YY-0001
    return `${prefix}${academicYearShortcode ? academicYearShortcode + '-' : ''}${newSeqNum.toString().padStart(4, '0')}`;
}

export interface ReceiptCreationParams {
    transactionId: string;
    studentId: string;
    applicationId?: string;
    amount: number;
    details?: any; // JSONB fee breakdown
    generatedBy?: string; // User ID
    paymentType?: string; // e.g. 'tuition_fee', 'application_fee'
    academicYearId?: string;
    yearName?: string;
    collegeId?: string;
    courseId?: string;
}

/**
 * Creates a fee receipt record after a successful transaction.
 */
export async function createFeeReceipt(
    supabase: SupabaseClient,
    params: ReceiptCreationParams
) {
    // 1. Generate Receipt Number
    const receiptNo = await generateReceiptNumber(
        supabase,
        params.paymentType || 'tuition_fee',
        params.academicYearId,
        params.yearName,
        params.collegeId,
        params.courseId
    );

    // 2. Create Receipt Record
    const { data: receipt, error } = await supabase
        .from('fee_receipts')
        .insert({
            receipt_no: receiptNo,
            transaction_id: params.transactionId,
            application_id: params.applicationId,
            student_id: params.studentId,
            amount: params.amount,
            details: params.details || {},
            generated_by: params.generatedBy
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating fee receipt:', error);
        throw new Error('Failed to generate receipt record');
    }

    return receipt;
}
