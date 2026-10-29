/*
 * SISJAR - Supabase Authentication Adapter
 *
 * Login UI tetap menggunakan USERNAME + PASSWORD seperti aplikasi lama.
 * Supabase Auth sendiri melakukan autentikasi dengan EMAIL + PASSWORD.
 *
 * Untuk akun yang username-nya tidak dapat dicari sebelum login karena RLS,
 * kita gunakan mapping email internal di sisi aplikasi. Jangan pernah menaruh
 * password di file ini.
 *
 * Akun Superadmin existing:
 *   username : superadmin
 *   auth email: admin@sekolah.com
 *
 * Jika nanti akun guru juga ingin login menggunakan username, tambahkan
 * pasangan username -> email Auth pada USERNAME_EMAIL_MAP, atau kita dapat
 * menyiapkan mekanisme autentikasi lain tanpa membuat tabel baru.
 */
(function(){
  const sb = () => window.SISJAR_SB;

  // Mapping untuk akun yang memang sudah diketahui dari database existing.
  // Password TIDAK disimpan di sini.
  const USERNAME_EMAIL_MAP = {
    superadmin: 'admin@sekolah.com'
  };

  function normalizeUsername(value) {
    return String(value || '').trim().toLowerCase();
  }

  async function resolveLoginEmail(identifier) {
    const value = String(identifier || '').trim();
    if (!value) throw new Error('Username dan password wajib diisi.');

    // Jika user mengetik email, langsung gunakan email tersebut.
    if (value.includes('@')) return value.toLowerCase();

    const username = normalizeUsername(value);

    // Akun yang sudah diketahui dari database existing.
    if (USERNAME_EMAIL_MAP[username]) {
      return USERNAME_EMAIL_MAP[username];
    }

    // Jangan mencoba SELECT profiles sebelum login.
    // RLS profiles pada database existing memang tidak mengizinkan anonymous
    // membaca profile orang lain. Karena itu kita tidak melakukan query yang
    // akan selalu gagal sebelum Auth berhasil.
    throw new Error(
      'Username belum memiliki pemetaan login. Untuk sementara gunakan email Auth, atau tambahkan username tersebut ke USERNAME_EMAIL_MAP.'
    );
  }

  window.SISJAR_AUTH = {
    async login(identifier, password) {
      if (!identifier || !password) {
        throw new Error('Username dan password wajib diisi.');
      }

      const email = await resolveLoginEmail(identifier);

      const { data, error } = await sb().auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('[SISJAR] Supabase Auth login error:', error);
        throw new Error('Username atau password salah.');
      }

      if (!data || !data.session || !data.user) {
        throw new Error('Login tidak menghasilkan session.');
      }

      return data.session;
    },

    async session() {
      const { data, error } = await sb().auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async profile() {
      const { data: userData, error: userError } = await sb().auth.getUser();
      if (userError) throw userError;

      const user = userData && userData.user;
      if (!user) return null;

      const { data, error } = await sb()
        .from('profiles')
        .select('id, username, role, status, teacher_id, email, phone')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      return data;
    },

    async logout() {
      const { error } = await sb().auth.signOut();
      if (error) throw error;
    },

    // Dipakai bila nanti perlu menambahkan akun username lain.
    getUsernameEmailMap() {
      return { ...USERNAME_EMAIL_MAP };
    }
  };
})();
