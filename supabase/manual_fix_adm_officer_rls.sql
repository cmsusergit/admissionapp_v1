-- Allow Admission Officers to view payments
DROP POLICY IF EXISTS "Payments: Adm Officer View" ON public.payments;

CREATE POLICY "Payments: Adm Officer View" ON public.payments
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role = 'adm_officer'
    )
);