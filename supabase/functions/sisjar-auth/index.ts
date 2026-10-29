import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });

function roleLabel(role: string) {
  if (role === 'superadmin') return 'Superadmin';
  if (role === 'piket') return 'Piket';
  return 'Guru';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method tidak diizinkan.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return json({ error: 'Konfigurasi Supabase Function belum lengkap.' }, 500);

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const body = await req.json();
    const action = String(body.action || '').trim();

    // ============================================================
    // LOGIN: username + password only in the UI.
    // Email is resolved internally for Supabase Auth.
    // ============================================================
    if (action === 'login') {
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!username || !password) return json({ error: 'Username dan password wajib diisi.' }, 400);

      const { data: profile, error: profileError } = await admin
        .from('profiles')
        .select('id,username,role,status,email,teacher_id')
        .ilike('username', username)
        .maybeSingle();

      if (profileError || !profile || String(profile.status || '').toLowerCase() !== 'aktif') {
        return json({ error: 'Username atau password salah.' }, 401);
      }
      if (!profile.email) return json({ error: 'Akun belum memiliki email Auth. Hubungi Superadmin.' }, 400);

      const tokenResponse = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile.email, password })
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) return json({ error: 'Username atau password salah.' }, 401);

      return json({
        success: true,
        session: tokenData,
        profile: {
          id: profile.id,
          username: profile.username,
          role: profile.role,
          status: profile.status,
          teacher_id: profile.teacher_id,
          email: profile.email
        }
      });
    }

    // ============================================================
    // ALL MANAGEMENT ACTIONS: SUPERADMIN ONLY
    // ============================================================
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Unauthorized.' }, 401);

    const caller = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData, error: userError } = await caller.auth.getUser(jwt);
    if (userError || !userData.user) return json({ error: 'Session tidak valid.' }, 401);

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role,status')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile || String(callerProfile.role).toLowerCase() !== 'superadmin' || String(callerProfile.status).toLowerCase() !== 'aktif') {
      return json({ error: 'Akses ditolak. Hanya Superadmin.' }, 403);
    }

    // ============================================================
    // CREATE / UPDATE ONE ACCOUNT
    // ============================================================
    if (action === 'provision_teacher') {
      const d = body.data || {};
      const username = String(d.username || '').trim().toLowerCase();
      const name = String(d.nama || d.name || '').trim();
      const whatsapp = String(d.noWa || d.whatsapp || '').trim();
      const requestedEmail = String(d.email || '').trim().toLowerCase();
      const password = String(d.password || 'guru123!');
      const nip = String(d.nip || '').trim();
      const role = String(d.role || 'guru').trim().toLowerCase();

      if (!['guru', 'piket', 'superadmin'].includes(role)) {
        return json({ error: 'Role tidak valid.' }, 400);
      }
      if (!username || !name) return json({ error: 'Username dan Nama Lengkap wajib diisi.' }, 400);
      if (password.length < 6) return json({ error: 'Password minimal 6 karakter.' }, 400);

      const existingTeacherResult = await admin
        .from('teachers')
        .select('*')
        .eq('username', username)
        .maybeSingle();
      if (existingTeacherResult.error) throw existingTeacherResult.error;

      const existingTeacher = existingTeacherResult.data;
      const email = requestedEmail || existingTeacher?.email || `${username}@auth.sisjar.local`;
      let teacher;

      if (existingTeacher) {
        const upd = await admin
          .from('teachers')
          .update({ name, email, nip, status: 'Aktif' })
          .eq('id', existingTeacher.id)
          .select('*')
          .single();
        if (upd.error) throw upd.error;
        teacher = upd.data;
      } else {
        const row = {
          id: `GRU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          username,
          name,
          email,
          nip,
          status: 'Aktif'
        };
        const ins = await admin.from('teachers').insert(row).select('*').single();
        if (ins.error) throw ins.error;
        teacher = ins.data;
      }

      const existingProfileResult = await admin
        .from('profiles')
        .select('*')
        .eq('teacher_id', teacher.id)
        .maybeSingle();
      if (existingProfileResult.error) throw existingProfileResult.error;

      let authUserId = existingProfileResult.data?.id || null;
      const metadata = { username, teacher_id: teacher.id, role };

      if (authUserId) {
        const updAuth = await admin.auth.admin.updateUserById(authUserId, {
          email,
          password,
          email_confirm: true,
          user_metadata: metadata
        });
        if (updAuth.error) throw updAuth.error;
      } else {
        const created = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: metadata
        });
        if (created.error) throw created.error;
        authUserId = created.data.user.id;
      }

      const prof = await admin.from('profiles').upsert({
        id: authUserId,
        username,
        role,
        status: 'Aktif',
        teacher_id: teacher.id,
        email,
        phone: whatsapp
      }, { onConflict: 'id' });
      if (prof.error) throw prof.error;

      return json({
        success: true,
        message: `Akun ${roleLabel(role)} ${name} berhasil disimpan.`,
        teacher_id: teacher.id,
        username,
        role
      });
    }

    // ============================================================
    // IMPORT ACCOUNTS FROM EXCEL
    // Columns supported:
    // Username, Nama, WhatsApp/No_WA, Role, Password, Email(optional), NIP(optional)
    // ============================================================
    if (action === 'import_teachers') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json({ error: 'Data Excel guru kosong.' }, 400);

      const results = [];
      for (const row of rows) {
        try {
          const username = String(row.username || '').trim().toLowerCase();
          const name = String(row.nama || row.name || '').trim();
          const whatsapp = String(row.noWa || row.whatsapp || '').trim();
          const requestedEmail = String(row.email || '').trim().toLowerCase();
          const password = String(row.password || 'guru123!');
          const nip = String(row.nip || '').trim();
          const role = String(row.role || 'guru').trim().toLowerCase();

          if (!['guru', 'piket', 'superadmin'].includes(role)) throw new Error('Role tidak valid. Gunakan guru, piket, atau superadmin.');
          if (!username || !name) throw new Error('Username dan Nama wajib diisi.');
          if (password.length < 6) throw new Error('Password minimal 6 karakter.');

          const existing = await admin.from('teachers').select('*').eq('username', username).maybeSingle();
          if (existing.error) throw existing.error;
          const existingTeacher = existing.data;
          const email = requestedEmail || existingTeacher?.email || `${username}@auth.sisjar.local`;
          let teacherId = existingTeacher?.id;

          if (teacherId) {
            const upd = await admin.from('teachers').update({ name, email, nip, status: 'Aktif' }).eq('id', teacherId);
            if (upd.error) throw upd.error;
          } else {
            teacherId = `GRU-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            const ins = await admin.from('teachers').insert({ id: teacherId, username, name, email, nip, status: 'Aktif' });
            if (ins.error) throw ins.error;
          }

          const existingProfile = await admin.from('profiles').select('id').eq('teacher_id', teacherId).maybeSingle();
          if (existingProfile.error) throw existingProfile.error;

          const metadata = { username, teacher_id: teacherId, role };
          let authId = existingProfile.data?.id || null;

          if (authId) {
            const u = await admin.auth.admin.updateUserById(authId, { email, password, email_confirm: true, user_metadata: metadata });
            if (u.error) throw u.error;
            const p = await admin.from('profiles').update({ username, role, status: 'Aktif', email, phone: whatsapp }).eq('id', authId);
            if (p.error) throw p.error;
          } else {
            const u = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
            if (u.error) throw u.error;
            authId = u.data.user.id;
            const p = await admin.from('profiles').insert({ id: authId, username, role, status: 'Aktif', teacher_id: teacherId, email, phone: whatsapp });
            if (p.error) throw p.error;
          }

          results.push({ username, success: true });
        } catch (e) {
          results.push({ username: String(row?.username || ''), success: false, error: e instanceof Error ? e.message : String(e) });
        }
      }

      const failed = results.filter(x => !x.success);
      return json({
        success: failed.length === 0,
        results,
        message: `${results.length - failed.length} akun berhasil, ${failed.length} gagal.`
      });
    }

    return json({ error: `Action tidak dikenal: ${action}` }, 400);
  } catch (e) {
    console.error('SISJAR AUTH ERROR:', e);
    return json({ error: e instanceof Error ? e.message : String(e) || 'Terjadi kesalahan server.' }, 500);
  }
});
