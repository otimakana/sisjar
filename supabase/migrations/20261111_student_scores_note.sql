-- Kolom catatan nilai (dibaca/ditulis aplikasi sebagai student_scores.note)
ALTER TABLE public.student_scores ADD COLUMN IF NOT EXISTS note text;
NOTIFY pgrst, 'reload schema';
