/* SISJAR - Supabase client. Uses the existing database; no schema creation. */
(function () {
  const cfg = window.SISJAR_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-') || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes('YOUR_')) {
    console.warn('[SISJAR] Isi assets/js/config.js dengan Supabase URL dan anon key.');
  }
  if (!window.supabase) throw new Error('Supabase JS belum dimuat.');
  window.SISJAR_SB = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();
