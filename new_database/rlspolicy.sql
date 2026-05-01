-- ==========================================================
-- 1. BACKFILL & PREPARATION
-- ==========================================================

-- Backfill user_id from applications if missing to ensure RLS works reliably
UPDATE public.documents d
SET user_id = a.student_id
FROM public.applications a
WHERE d.application_id = a.id
AND d.user_id IS NULL;


-- ==========================================================
-- 2. STORAGE POLICIES (Actual Files)
-- ==========================================================

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to modify own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated viewing" ON storage.objects;
DROP POLICY IF EXISTS "Documents: Upload Policy" ON storage.objects;
DROP POLICY IF EXISTS "Documents: Manage Policy" ON storage.objects;
DROP POLICY IF EXISTS "Documents: View Policy" ON storage.objects;

-- Policy: Allow users to upload to their own folder OR allow staff (Admin/DEO) to upload anywhere
CREATE POLICY "Documents: Upload Policy" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND (
    (name LIKE (auth.uid()::text || '/%')) -- Can upload to folder named after self
    OR 
    (public.get_my_role() IN ('admin', 'deo', 'adm_officer')) -- Staff can upload anywhere
  )
);

-- Policy: Allow users to update/delete their own files OR allow staff to manage all
CREATE POLICY "Documents: Manage Policy" ON storage.objects
FOR ALL TO authenticated
USING (
  bucket_id = 'documents' AND (
    (name LIKE (auth.uid()::text || '/%'))
    OR 
    (public.get_my_role() IN ('admin', 'deo', 'adm_officer'))
  )
);

-- Policy: Allow all authenticated users to view documents
CREATE POLICY "Documents: View Policy" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documents');


-- ==========================================================
-- 3. PUBLIC TABLE POLICIES (Metadata)
-- ==========================================================

-- Ensure staff can insert/update records in the public.documents table
DROP POLICY IF EXISTS "Documents: Staff Manage" ON public.documents;
CREATE POLICY "Documents: Staff Manage" ON public.documents 
FOR ALL TO authenticated
USING (
    public.get_my_role() IN ('admin', 'deo', 'adm_officer', 'college_auth', 'university_auth')
)
WITH CHECK (
    public.get_my_role() IN ('admin', 'deo', 'adm_officer', 'college_auth', 'university_auth')
);

-- Re-confirm Student policy (already exists but ensures it's clean)
DROP POLICY IF EXISTS "Documents: Student RW" ON public.documents;
CREATE POLICY "Documents: Student RW" ON public.documents 
FOR ALL TO authenticated
USING (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM public.applications 
        WHERE id = application_id AND student_id = auth.uid()
    )
)
WITH CHECK (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM public.applications 
        WHERE id = application_id AND student_id = auth.uid()
    )
);

-- ==========================================================
-- 4. ADMISSION SEQUENCES FIX
-- ==========================================================

-- Fix unique constraint for admission sequences to include prefix
-- This allows different numbering series for different form types
ALTER TABLE public.admission_sequences 
DROP CONSTRAINT IF EXISTS admission_sequences_college_id_course_id_academic_year_id_key;

-- We use a safe check for the new constraint name
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admission_sequences_full_unique_key') THEN
        ALTER TABLE public.admission_sequences 
        ADD CONSTRAINT admission_sequences_full_unique_key 
        UNIQUE(college_id, course_id, academic_year_id, prefix);
    END IF;
END $$;


