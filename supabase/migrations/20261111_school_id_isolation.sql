-- SISJAR multi-school isolation: school_id as tenant key for operational data.
-- Existing ambiguous legacy rows are intentionally NOT guessed into a school.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_school_id uuid;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.teaching_schedules ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.student_attendance ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.assessments ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.student_scores ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.teaching_journals ADD COLUMN IF NOT EXISTS school_id uuid;

-- Backfill only when the relationship yields exactly one school.
UPDATE public.teachers t SET school_id = x.school_id
FROM (SELECT teacher_id, min(school_id::text)::uuid AS school_id
      FROM public.profiles WHERE school_id IS NOT NULL AND teacher_id IS NOT NULL
      GROUP BY teacher_id HAVING count(DISTINCT school_id) = 1) x
WHERE t.id::text = x.teacher_id::text AND t.school_id IS NULL;

WITH candidate AS (
  SELECT s.class_id, min(t.school_id::text)::uuid AS school_id
  FROM public.teaching_schedules s JOIN public.teachers t ON t.id::text=s.teacher_id::text
  WHERE t.school_id IS NOT NULL GROUP BY s.class_id
  HAVING count(DISTINCT t.school_id)=1
)
UPDATE public.classes c SET school_id=x.school_id FROM candidate x
WHERE c.id::text=x.class_id::text AND c.school_id IS NULL;

UPDATE public.students s SET school_id=c.school_id
FROM public.classes c WHERE s.class_id::text=c.id::text AND s.school_id IS NULL AND c.school_id IS NOT NULL;

UPDATE public.teaching_schedules s SET school_id=t.school_id
FROM public.teachers t WHERE s.teacher_id::text=t.id::text AND s.school_id IS NULL AND t.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id::text=s.class_id::text AND c.school_id IS NOT NULL AND c.school_id<>t.school_id);

UPDATE public.subjects sub SET school_id=x.school_id
FROM (SELECT subject_id, min(school_id::text)::uuid AS school_id FROM public.teaching_schedules
      WHERE subject_id IS NOT NULL AND school_id IS NOT NULL GROUP BY subject_id
      HAVING count(DISTINCT school_id)=1) x
WHERE sub.id::text=x.subject_id::text AND sub.school_id IS NULL;

UPDATE public.student_attendance a SET school_id=s.school_id
FROM public.teaching_schedules s
WHERE a.schedule_id::text=s.id::text AND a.school_id IS NULL AND s.school_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.students st WHERE st.id::text=a.student_id::text AND st.school_id IS NOT NULL AND st.school_id<>s.school_id);

UPDATE public.assessments a SET school_id=x.school_id
FROM (SELECT teacher_id,min(school_id::text)::uuid AS school_id FROM public.profiles
      WHERE teacher_id IS NOT NULL AND school_id IS NOT NULL GROUP BY teacher_id
      HAVING count(DISTINCT school_id)=1) x
WHERE a.school_id IS NULL AND a.teacher_id::text=x.teacher_id::text;

UPDATE public.student_scores sc SET school_id=a.school_id
FROM public.assessments a WHERE sc.assessment_id::text=a.id::text AND sc.school_id IS NULL AND a.school_id IS NOT NULL;

UPDATE public.teaching_journals j SET school_id=s.school_id
FROM public.teaching_schedules s
WHERE j.schedule_id::text=s.id::text AND j.school_id IS NULL AND s.school_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS teachers_school_id_idx ON public.teachers(school_id);
CREATE INDEX IF NOT EXISTS classes_school_id_idx ON public.classes(school_id);
CREATE INDEX IF NOT EXISTS subjects_school_id_idx ON public.subjects(school_id);
CREATE INDEX IF NOT EXISTS students_school_class_idx ON public.students(school_id,class_id);
CREATE INDEX IF NOT EXISTS schedules_school_teacher_idx ON public.teaching_schedules(school_id,teacher_id);
CREATE INDEX IF NOT EXISTS attendance_school_date_class_idx ON public.student_attendance(school_id,attendance_date,class_id);
CREATE INDEX IF NOT EXISTS assessments_school_teacher_class_idx ON public.assessments(school_id,teacher_id,class_id);
CREATE INDEX IF NOT EXISTS scores_school_assessment_student_idx ON public.student_scores(school_id,assessment_id,student_id);
CREATE INDEX IF NOT EXISTS journals_school_schedule_date_idx ON public.teaching_journals(school_id,schedule_id,journal_date);

-- Resolve a tenant from the authenticated profile. Superadmin is restricted to
-- the school explicitly selected in the application, not to every school.
CREATE OR REPLACE FUNCTION public.sisjar_can_access_school(p_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_school_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=auth.uid()
      AND lower(coalesce(p.status,'aktif')) IN ('aktif','active')
      AND ((lower(coalesce(p.role,''))='superadmin' AND p.active_school_id=p_school_id)
        OR (lower(coalesce(p.role,''))<>'superadmin' AND p.school_id=p_school_id))
  );
$$;
REVOKE ALL ON FUNCTION public.sisjar_can_access_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sisjar_can_access_school(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sisjar_set_active_school(p_school_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND lower(coalesce(p.role,''))='superadmin') THEN
    RAISE EXCEPTION 'Hanya Superadmin yang dapat memilih sekolah.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id=p_school_id) THEN
    RAISE EXCEPTION 'Sekolah tidak ditemukan.';
  END IF;
  UPDATE public.profiles SET active_school_id=p_school_id WHERE id=auth.uid();
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sisjar_set_active_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sisjar_set_active_school(uuid) TO authenticated;


-- Reject cross-school references on every write, including edits made outside the UI.
CREATE OR REPLACE FUNCTION public.sisjar_validate_school_relations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ref_school uuid;
BEGIN
  IF NEW.school_id IS NULL THEN RAISE EXCEPTION 'school_id wajib diisi.'; END IF;

  IF TG_TABLE_NAME='students' THEN
    SELECT school_id INTO ref_school FROM public.classes WHERE id::text=NEW.class_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Kelas siswa tidak berasal dari sekolah aktif.'; END IF;
  ELSIF TG_TABLE_NAME='teaching_schedules' THEN
    SELECT school_id INTO ref_school FROM public.teachers WHERE id::text=NEW.teacher_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Guru jadwal tidak berasal dari sekolah aktif.'; END IF;
    SELECT school_id INTO ref_school FROM public.classes WHERE id::text=NEW.class_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Kelas jadwal tidak berasal dari sekolah aktif.'; END IF;
    IF NEW.subject_id IS NOT NULL THEN
      SELECT school_id INTO ref_school FROM public.subjects WHERE id::text=NEW.subject_id::text;
      IF ref_school IS NOT NULL AND ref_school<>NEW.school_id THEN RAISE EXCEPTION 'Mata pelajaran tidak berasal dari sekolah aktif.'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='student_attendance' THEN
    SELECT school_id INTO ref_school FROM public.teaching_schedules WHERE id::text=NEW.schedule_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Jadwal presensi tidak berasal dari sekolah aktif.'; END IF;
    SELECT school_id INTO ref_school FROM public.students WHERE id::text=NEW.student_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Siswa presensi tidak berasal dari sekolah aktif.'; END IF;
  ELSIF TG_TABLE_NAME='assessments' THEN
    SELECT school_id INTO ref_school FROM public.teachers WHERE id::text=NEW.teacher_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Guru penilaian tidak berasal dari sekolah aktif.'; END IF;
    SELECT school_id INTO ref_school FROM public.classes WHERE id::text=NEW.class_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Kelas penilaian tidak berasal dari sekolah aktif.'; END IF;
    IF NEW.subject_id IS NOT NULL THEN
      SELECT school_id INTO ref_school FROM public.subjects WHERE id::text=NEW.subject_id::text;
      IF ref_school IS NOT NULL AND ref_school<>NEW.school_id THEN RAISE EXCEPTION 'Mapel penilaian tidak berasal dari sekolah aktif.'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME='student_scores' THEN
    SELECT school_id INTO ref_school FROM public.assessments WHERE id::text=NEW.assessment_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Penilaian nilai tidak berasal dari sekolah aktif.'; END IF;
    SELECT school_id INTO ref_school FROM public.students WHERE id::text=NEW.student_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Siswa nilai tidak berasal dari sekolah aktif.'; END IF;
  ELSIF TG_TABLE_NAME='teaching_journals' THEN
    SELECT school_id INTO ref_school FROM public.teaching_schedules WHERE id::text=NEW.schedule_id::text;
    IF ref_school IS DISTINCT FROM NEW.school_id THEN RAISE EXCEPTION 'Jadwal jurnal tidak berasal dari sekolah aktif.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['students','teaching_schedules','student_attendance','assessments','student_scores','teaching_journals'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sisjar_validate_school_relations ON public.%I',t);
    EXECUTE format('CREATE TRIGGER sisjar_validate_school_relations BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sisjar_validate_school_relations()',t);
  END LOOP;
END $$;

-- Restrictive policies are ANDed with the existing role/ownership policies,
-- so older permissive policies cannot leak rows across schools.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['teachers','classes','subjects','students','teaching_schedules',
    'student_attendance','assessments','student_scores','teaching_journals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('DROP POLICY IF EXISTS sisjar_school_isolation ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS sisjar_school_base_select ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS sisjar_school_base_insert ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS sisjar_school_base_update ON public.%I',t);
    EXECUTE format('DROP POLICY IF EXISTS sisjar_school_base_delete ON public.%I',t);
    -- Supply a tenant-scoped permissive policy only for operations that have
    -- no existing permissive policy. Existing role/ownership policies remain.
    IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t AND p.permissive='PERMISSIVE' AND p.cmd IN ('ALL','SELECT')) THEN
      IF t='subjects' THEN
        EXECUTE format('CREATE POLICY sisjar_school_base_select ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (school_id IS NULL OR public.sisjar_can_access_school(school_id))',t);
      ELSE
        EXECUTE format('CREATE POLICY sisjar_school_base_select ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (public.sisjar_can_access_school(school_id))',t);
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t AND p.permissive='PERMISSIVE' AND p.cmd IN ('ALL','INSERT')) THEN
      IF t='subjects' THEN
        EXECUTE format('CREATE POLICY sisjar_school_base_insert ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (school_id IS NULL OR public.sisjar_can_access_school(school_id))',t);
      ELSE
        EXECUTE format('CREATE POLICY sisjar_school_base_insert ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.sisjar_can_access_school(school_id))',t);
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t AND p.permissive='PERMISSIVE' AND p.cmd IN ('ALL','UPDATE')) THEN
      IF t='subjects' THEN
        EXECUTE format('CREATE POLICY sisjar_school_base_update ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (school_id IS NULL OR public.sisjar_can_access_school(school_id)) WITH CHECK (school_id IS NULL OR public.sisjar_can_access_school(school_id))',t);
      ELSE
        EXECUTE format('CREATE POLICY sisjar_school_base_update ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (public.sisjar_can_access_school(school_id)) WITH CHECK (public.sisjar_can_access_school(school_id))',t);
      END IF;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=t AND p.permissive='PERMISSIVE' AND p.cmd IN ('ALL','DELETE')) THEN
      IF t='subjects' THEN
        EXECUTE format('CREATE POLICY sisjar_school_base_delete ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (school_id IS NULL OR public.sisjar_can_access_school(school_id))',t);
      ELSE
        EXECUTE format('CREATE POLICY sisjar_school_base_delete ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (public.sisjar_can_access_school(school_id))',t);
      END IF;
    END IF;
    IF t='subjects' THEN
      EXECUTE format('CREATE POLICY sisjar_school_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (school_id IS NULL OR public.sisjar_can_access_school(school_id)) WITH CHECK (school_id IS NULL OR public.sisjar_can_access_school(school_id))',t);
    ELSE
      EXECUTE format('CREATE POLICY sisjar_school_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.sisjar_can_access_school(school_id)) WITH CHECK (public.sisjar_can_access_school(school_id))',t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Audit after migration: any remaining NULL means the legacy row was ambiguous
-- and must be assigned manually before that row becomes visible to a school.
-- SELECT 'classes' table_name,count(*) FROM public.classes WHERE school_id IS NULL
-- UNION ALL SELECT 'teachers',count(*) FROM public.teachers WHERE school_id IS NULL
-- UNION ALL SELECT 'subjects',count(*) FROM public.subjects WHERE school_id IS NULL
-- UNION ALL SELECT 'students',count(*) FROM public.students WHERE school_id IS NULL
-- UNION ALL SELECT 'teaching_schedules',count(*) FROM public.teaching_schedules WHERE school_id IS NULL
-- UNION ALL SELECT 'student_attendance',count(*) FROM public.student_attendance WHERE school_id IS NULL
-- UNION ALL SELECT 'assessments',count(*) FROM public.assessments WHERE school_id IS NULL
-- UNION ALL SELECT 'student_scores',count(*) FROM public.student_scores WHERE school_id IS NULL
-- UNION ALL SELECT 'teaching_journals',count(*) FROM public.teaching_journals WHERE school_id IS NULL;
