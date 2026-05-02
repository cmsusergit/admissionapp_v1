import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Generates a sequential College ID (Enrollment Number) for a student.
 * Format: [YY][CourseAlias][BranchAlias][CategoryChar][SEQ]
 * Example: 26BECEA001
 */
export async function generateEnrollmentNumber(
    supabase: SupabaseClient,
    collegeId: string,
    courseId: string,
    academicYearId: string,
    branchId: string | null = null,
    formType: string = 'MQ/NRI'
): Promise<string> {
    
    // 1. Fetch required metadata
    const { data: ayData } = await supabase
        .from('academic_years')
        .select('short_code, name')
        .eq('id', academicYearId)
        .single();
    
    const { data: courseData } = await supabase
        .from('courses')
        .select('code')
        .eq('id', courseId)
        .single();

    let branchCode = '';
    if (branchId) {
        const { data: branchData } = await supabase
            .from('branches')
            .select('code')
            .eq('id', branchId)
            .single();
        branchCode = branchData?.code || '';
    }
    
    const yearShort = ayData?.short_code || ayData?.name.substring(0, 4).slice(-2) || new Date().getFullYear().toString().slice(-2);
    const courseAlias = courseData?.code || 'GEN';
    
    // Mapping for Admission Category (single char)
    const categoryMap: Record<string, string> = {
        'ACPC': 'A',
        'MQ/NRI': 'M',
        'Provisional': 'P',
        'Vacant': 'V',
        'D2D': 'D'
    };
    const categoryChar = categoryMap[formType] || formType.charAt(0).toUpperCase();

    // The sequence tracking still happens per college/course/year/branch
    const sequencePrefix = `${yearShort}${courseAlias}${branchCode}${categoryChar}`;

    // 2. Fetch or Create Enrollment Sequence
    let query = supabase
        .from('enrollment_sequences')
        .select('id, current_sequence')
        .eq('college_id', collegeId)
        .eq('course_id', courseId)
        .eq('academic_year_id', academicYearId);

    if (branchId) {
        query = query.eq('branch_id', branchId);
    } else {
        query = query.is('branch_id', null);
    }

    let { data: sequence, error } = await query.maybeSingle();

    if (!sequence) {
        const { data: newSeq, error: createError } = await supabase
            .from('enrollment_sequences')
            .insert({
                college_id: collegeId,
                course_id: courseId,
                academic_year_id: academicYearId,
                branch_id: branchId,
                prefix: sequencePrefix, // Store the new format prefix
                current_sequence: 0
            })
            .select()
            .single();
        
        if (createError) {
            console.error('Error creating enrollment sequence:', createError);
            throw new Error('Failed to create enrollment sequence');
        }
        sequence = newSeq;
    }

    if (!sequence) {
        throw new Error('Enrollment sequence could not be found or created.');
    }

    // 3. Increment Sequence
    const newSeqNum = (sequence.current_sequence || 0) + 1;
    const { error: updateError } = await supabase
        .from('enrollment_sequences')
        .update({ 
            current_sequence: newSeqNum,
            prefix: sequencePrefix // Update prefix in case it changed
        })
        .eq('id', sequence.id);

    if (updateError) {
        console.error('Error updating enrollment sequence:', updateError);
        throw new Error('Failed to increment enrollment sequence');
    }

    // 4. Return formatted number: [YY][Course][Branch][Category][001]
    return `${yearShort}${courseAlias}${branchCode}${categoryChar}${newSeqNum.toString().padStart(3, '0')}`;
}

/**
 * Assigns a College ID (Enrollment Number) to a student if they don't already have one.
 * Typically called after a tuition fee payment is recorded.
 */
export async function ensureStudentEnrolled(
    supabase: SupabaseClient,
    applicationId: string
) {
    // 1. Fetch application and student details
    const { data: app, error: appError } = await supabase
        .from('applications')
        .select(`
            id, 
            student_id, 
            course_id, 
            branch_id, 
            cycle_id,
            form_type,
            admission_cycles(academic_year_id),
            courses(college_id)
        `)
        .eq('id', applicationId)
        .single();

    if (appError || !app) return;

    // 2. Check if student already has an enrollment number
    const { data: profile } = await supabase
        .from('student_profiles')
        .select('enrollment_number')
        .eq('user_id', app.student_id)
        .single();

    if (profile?.enrollment_number) return;

    // 3. Generate and Assign
    const collegeId = (app.courses as any)?.college_id;
    const academicYearId = (app.admission_cycles as any)?.academic_year_id;

    if (!collegeId || !academicYearId) return;

    try {
        const enrollmentNumber = await generateEnrollmentNumber(
            supabase,
            collegeId,
            app.course_id,
            academicYearId,
            app.branch_id,
            app.form_type
        );

        // Update student profile and official college affiliation in users table
        await supabase
            .from('student_profiles')
            .update({ 
                enrollment_number: enrollmentNumber,
                admission_status: 'Admitted'
            })
            .eq('user_id', app.student_id);

        await supabase
            .from('users')
            .update({ college_id: collegeId })
            .eq('id', app.student_id);
            
        console.log(`Assigned College ID ${enrollmentNumber} to Student ${app.student_id}`);
    } catch (e) {
        console.error('Failed to auto-enroll student:', e);
    }
}
