/* SISJAR authentication: UI and credentials are USERNAME + PASSWORD. */
(function(){
  const sb = () => window.SISJAR_SB;
  const cfg = () => window.SISJAR_CONFIG || {};
  const endpoint = () => String(cfg().SUPABASE_URL || '').replace(/\/$/, '') + '/functions/v1/sisjar-auth';
  const normalizeUsername = v => String(v || '').trim().toLowerCase();

  async function functionCall(payload, token) {
    const headers = { 'Content-Type':'application/json', 'apikey': cfg().SUPABASE_ANON_KEY || '' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch(endpoint(), { method:'POST', headers, body:JSON.stringify(payload) });
    let data = {};
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(data.error || data.message || 'Permintaan autentikasi gagal.');
    return data;
  }

  window.SISJAR_AUTH = {
    async login(username, password) {
      username = normalizeUsername(username);
      if (!username || !password) throw new Error('Username dan password wajib diisi.');
      const data = await functionCall({ action:'login', username, password });
      if (!data.session || !data.session.access_token) throw new Error('Login tidak menghasilkan session.');
      const session = data.session;
      const set = await sb().auth.setSession({ access_token:session.access_token, refresh_token:session.refresh_token });
      if (set.error) throw set.error;
      return set.data.session;
    },
    async session() {
      const { data, error } = await sb().auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async profile() {
      const { data:userData, error:userError } = await sb().auth.getUser();
      if (userError) throw userError;
      const user = userData && userData.user;
      if (!user) return null;
      const { data, error } = await sb().from('profiles').select('id, username, role, status, teacher_id, email, phone').eq('id', user.id).single();
      if (error) throw error;
      return data;
    },
    async provisionTeacher(data) {
      const session = await this.session();
      if (!session) throw new Error('Session Superadmin tidak ditemukan.');
      return functionCall({ action:'provision_teacher', data }, session.access_token);
    },
    async importTeachers(rows) {
      const session = await this.session();
      if (!session) throw new Error('Session Superadmin tidak ditemukan.');
      return functionCall({ action:'import_teachers', rows }, session.access_token);
    },
    async logout() {
      const { error } = await sb().auth.signOut();
      if (error) throw error;
    }
  };
})();
