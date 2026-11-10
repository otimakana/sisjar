-- SISJAR: perbaiki school_id pada data penilaian.
-- Bukti CSV: dua penilaian milik widyapratama tersimpan dengan school_id NULL.
-- Isi school_id dari profil guru berdasarkan teacher_id yang sudah terverifikasi.
UPDATE public.assessments a
SET school_id = p.school_id
FROM public.profiles p
WHERE a.school_id IS NULL
  AND a.teacher_id::text = p.teacher_id::text
  AND p.school_id IS NOT NULL;

-- Pastikan indeks membantu query daftar penilaian per sekolah/guru/kelas/mapel.
CREATE INDEX IF NOT EXISTS assessments_school_teacher_class_subject_idx
ON public.assessments (school_id, teacher_id, class_id, subject_id, assessment_date);

NOTIFY pgrst, 'reload schema';
