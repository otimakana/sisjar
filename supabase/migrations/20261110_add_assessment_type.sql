-- SISJAR: tambahkan kolom jenis penilaian yang belum ada pada tabel assessments.
-- Aman dijalankan berulang kali (idempotent).
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'Lainnya';

COMMENT ON COLUMN public.assessments.type IS
  'Jenis penilaian, misalnya Tugas, Ulangan, Praktik, atau Proyek.';

-- Minta PostgREST/Supabase memperbarui schema cache.
NOTIFY pgrst, 'reload schema';
