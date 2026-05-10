import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generates a sequential receipt number based on payment type and optional academic year.
 * Format: PREFIX-YYCOURSECODE-0001 (e.g., PROV-26BE-0001)
 */
export async function generateReceiptNumber(
    supabase: SupabaseClient, 
    paymentType: string, 
    academicYearId: string,
    yearName?: string, // e.g. "2025-2026" for formatting
    collegeId: string,
    courseId: string,
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

    // Fetch course code for the receipt format
    const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('code')
        .eq('id', courseId)
        .single();

    let courseCode = '';
    if (courseData?.code) {
        courseCode = courseData.code;
    } else if (courseError) {
        console.warn('Error fetching course code:', courseError.message);
    }

    // 1. Fetch Sequence
    let query = supabase
        .from('receipt_sequences')
        .select('id, current_sequence, prefix')
        .eq('college_id', collegeId)
        .eq('course_id', courseId)
        .eq('academic_year_id', academicYearId);

    let { data: sequence, error } = await query.maybeSingle();

    // 2. Create if missing
    if (!sequence) {
        const payload: any = {
            college_id: collegeId,
            course_id: courseId,
            academic_year_id: academicYearId,
            prefix: prefix,
            current_sequence: 0
        };

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

    // 4. Format: PREFIX-YYCOURSECODE-0001 (e.g., PROV-26BE-0001)
    const courseCodePart = courseCode ? courseCode : '';
    const yearCoursePart = academicYearShortcode && courseCodePart ? 
        `${academicYearShortcode}${courseCodePart}` : 
        (academicYearShortcode || courseCodePart || '');
    
    return `${prefix}${yearCoursePart ? yearCoursePart + '-' : ''}${newSeqNum.toString().padStart(4, '0')}`;
}

export interface ReceiptCreationParams {
    transactionId: string;
    studentId: string;
    applicationId?: string;
    amount: number;
    details?: any; // JSONB generic metadata
    paymentBreakdown?: any[]; // JSONB detailed payment modes
    feeComponentsBreakdown?: any[]; // JSONB fee sections/items
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

    // Prepare composite details object for the receipt record
    const compositeDetails = {
        ...(params.details || {}),
        payment_breakdown: params.paymentBreakdown || [],
        fee_components_breakdown: params.feeComponentsBreakdown || [],
        payment_type: params.paymentType || 'tuition_fee'
    };

    // 2. Create Receipt Record
    const { data: receipt, error } = await supabase
        .from('fee_receipts')
        .insert({
            receipt_no: receiptNo,
            transaction_id: params.transactionId,
            application_id: params.applicationId,
            student_id: params.studentId,
            amount: params.amount,
            details: compositeDetails,
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
