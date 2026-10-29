# SISJAR — Supabase Migration Audit

## Scope reviewed
The migrated HTML was audited against the legacy Apps Script functions that are still referenced by the UI and against the existing Supabase schema used by the current app.

## UI/API compatibility now covered
- Dashboard: `getDashboardData`
- Kelas: `getKelasDropdown`, `getDaftarKelas`, `tambahKelas`, `editKelas`, `hapusKelas`
- Data siswa: `getDaftarSiswa`, `tambahSiswa`, `updateSiswa`, `hapusSiswa`, `importDataSiswa`
- Presensi siswa: `getSiswaByKelas`, `getPresensiSiswa`, `savePresensiSiswa`, `deletePresensiSiswa`, `getPresensiSiswaMingguan`, `savePresensiSiswaMingguan`
- Laporan siswa: `getRekapLaporan`, `getDetailHarian`, `getLaporanSiswaBundle`, `getTerlambatSiswa`
- Kalender: `getKalenderLibur`, `tambahLiburRange`, `tambahLibur`, `hapusLibur`, `getInfoHari`, `getHariEfektif`
- Guru: schedules, attendance, journal, assessments, scores
- Laporan guru: attendance detail/summary, score report, journal report, print identity
- Admin: teachers, schedules, classes/WhatsApp, app settings
- Backup/restore: Supabase JSON backup/restore
- Superadmin test mode: `gmSwitchRole`

## Security/UI corrections
- Dashboard is shared by role.
- Guru sees only guru modules.
- Piket sees only student attendance and lateness modules.
- Superadmin sees administrative/master modules.
- Kalender Libur is Superadmin-only.
- Mobile bottom navigation is role-aware.
- Main app shell stays hidden until Supabase profile verification succeeds.
- Sidebar status text now says Supabase, not Google Sheets.
- Admin teacher form no longer claims it creates an Auth password; Supabase Auth provisioning remains a separate operation.

## Important note
The browser uses the existing Supabase Auth session. No service-role key is embedded in the frontend. Therefore creating a new Supabase Auth user/password from the client is intentionally not implemented in `gmAdminSaveTeacher`.

No database table or schema is created/altered by this package.
