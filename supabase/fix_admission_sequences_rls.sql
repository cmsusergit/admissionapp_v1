-- Fix RLS for Admission Sequences
-- Allow University Auth and College Auth to manage sequences for admission number generation

ALTER TABLE public.admission_sequences ENABLE ROW LEVEL SECURITY;

-- Drop existing restricted policy if it conflicts or just add new ones
-- We keep Admin policy.

-- University Auth Policy
DROP POLICY IF EXISTS "Admission Sequences: Univ Auth manage" ON public.admission_sequences;
CREATE POLICY "Admission Sequences: Univ Auth manage" ON public.admission_sequences 
FOR ALL 
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'university_auth'));

-- College Auth Policy (for direct admissions)
DROP POLICY IF EXISTS "Admission Sequences: College Auth manage" ON public.admission_sequences;
CREATE POLICY "Admission Sequences: College Auth manage" ON public.admission_sequences 
FOR ALL 
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'college_auth'));
