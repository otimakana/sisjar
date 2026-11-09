-- SISJAR: calendar scope + per-teacher, per-schedule non-teaching agenda
-- Run once in Supabase SQL Editor for project SISJAR (aefdcchloktqiajqmolx).
-- Safe for existing academic data: creates one new table and replaces only
-- the four policies on public.holidays. Does not delete existing rows.

BEGIN;

-- School holidays are isolated by school. Admin Sekolah manages own school;
-- teachers and active users can read their own school's holiday calendar.
DROP POLICY IF EXISTS holidays_select ON public.holidays;
DROP POLICY IF EXISTS holidays_insert ON public.holidays;
DROP POLICY IF EXISTS holidays_update ON public.holidays;
DROP POLICY IF EXISTS holidays_delete ON public.holidays;

CREATE POLICY holidays_select ON public.holidays
  FOR SELECT TO authenticated
  USING (private.can_access_school(school_id));

CREATE POLICY holidays_insert ON public.holidays
  FOR INSERT TO authenticated
  WITH CHECK (private.can_manage_school(school_id));

CREATE POLICY holidays_update ON public.holidays
  FOR UPDATE TO authenticated
  USING (private.can_manage_school(school_id))
  WITH CHECK (private.can_manage_school(school_id));

CREATE POLICY holidays_delete ON public.holidays
  FOR DELETE TO authenticated
  USING (private.can_manage_school(school_id));

-- Each record excludes exactly one teacher schedule on one date.
CREATE TABLE IF NOT EXISTS public.teacher_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  teacher_id text NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  schedule_id text NOT NULL,
  exception_date date NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  status text NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif','Nonaktif')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, exception_date)
);

CREATE INDEX IF NOT EXISTS idx_teacher_schedule_exceptions_teacher_date
  ON public.teacher_schedule_exceptions (teacher_id, exception_date)
  WHERE status = 'Aktif';

CREATE INDEX IF NOT EXISTS idx_teacher_schedule_exceptions_school_date
  ON public.teacher_schedule_exceptions (school_id, exception_date)
  WHERE status = 'Aktif';

ALTER TABLE public.teacher_schedule_exceptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_schedule_exceptions TO authenticated;

DROP POLICY IF EXISTS teacher_schedule_exceptions_select ON public.teacher_schedule_exceptions;
DROP POLICY IF EXISTS teacher_schedule_exceptions_insert ON public.teacher_schedule_exceptions;
DROP POLICY IF EXISTS teacher_schedule_exceptions_update ON public.teacher_schedule_exceptions;
DROP POLICY IF EXISTS teacher_schedule_exceptions_delete ON public.teacher_schedule_exceptions;

CREATE POLICY teacher_schedule_exceptions_select
  ON public.teacher_schedule_exceptions
  FOR SELECT TO authenticated
  USING (
    (
      teacher_id = (private.current_teacher_id())::text
      AND school_id = private.current_school_id()
      AND private.is_active_user()
    )
    OR private.can_manage_school(school_id)
  );

CREATE POLICY teacher_schedule_exceptions_insert
  ON public.teacher_schedule_exceptions
  FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = (private.current_teacher_id())::text
    AND school_id = private.current_school_id()
    AND private.current_role() = 'guru'
    AND private.is_active_user()
    AND EXISTS (
      SELECT 1
      FROM public.teaching_schedules ts
      WHERE ts.id::text = schedule_id
        AND ts.teacher_id::text = teacher_id
        AND ts.school_id = school_id
        AND COALESCE(ts.status, 'Aktif') <> 'Nonaktif'
    )
  );

CREATE POLICY teacher_schedule_exceptions_update
  ON public.teacher_schedule_exceptions
  FOR UPDATE TO authenticated
  USING (
    teacher_id = (private.current_teacher_id())::text
    AND school_id = private.current_school_id()
    AND private.current_role() = 'guru'
    AND private.is_active_user()
  )
  WITH CHECK (
    teacher_id = (private.current_teacher_id())::text
    AND school_id = private.current_school_id()
    AND private.current_role() = 'guru'
    AND private.is_active_user()
  );

CREATE POLICY teacher_schedule_exceptions_delete
  ON public.teacher_schedule_exceptions
  FOR DELETE TO authenticated
  USING (
    teacher_id = (private.current_teacher_id())::text
    AND school_id = private.current_school_id()
    AND private.current_role() = 'guru'
    AND private.is_active_user()
  );

COMMIT;
