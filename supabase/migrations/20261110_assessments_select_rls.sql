-- SISJAR: izinkan guru membaca penilaian miliknya sendiri.
-- SELECT policy terpisah diperlukan karena INSERT sukses tidak otomatis memberi SELECT.
CREATE OR REPLACE FUNCTION public.sisjar_can_access_own_assessment(p_teacher_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(p.role, '')) IN ('guru', 'superadmin')
      AND nullif(p.teacher_id::text, '') IS NOT NULL
      AND p.teacher_id::text = p_teacher_id
      AND lower(coalesce(p.status, 'aktif')) IN ('aktif', 'active')
  );
$$;

REVOKE ALL ON FUNCTION public.sisjar_can_access_own_assessment(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sisjar_can_access_own_assessment(text) TO authenticated;

DROP POLICY IF EXISTS assessments_select_own_teacher ON public.assessments;
CREATE POLICY assessments_select_own_teacher
ON public.assessments
FOR SELECT
TO authenticated
USING (
  public.sisjar_can_access_own_assessment(teacher_id::text)
);

NOTIFY pgrst, 'reload schema';
