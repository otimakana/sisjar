    // ==============================================================
    // NATIVE UI COMPATIBILITY — menggantikan kebutuhan Bootstrap JS
    // ==============================================================
    (function(){
      function showModal(el){
        if(!el) return;
        el.classList.add('is-open'); el.setAttribute('aria-hidden','false');
        document.body.classList.add('modal-open');
      }
      function hideModal(el){
        if(!el) return;
        el.classList.remove('is-open'); el.setAttribute('aria-hidden','true');
        if(!document.querySelector('.modal.is-open')) document.body.classList.remove('modal-open');
      }
      window.bootstrap = {
        Modal: function(el){
          this.el = typeof el === 'string' ? document.querySelector(el) : el;
          this.show=function(){showModal(this.el)};
          this.hide=function(){hideModal(this.el)};
        }
      };
      window.bootstrap.Modal.getInstance=function(el){
        if(!el || !el.classList.contains('is-open')) return null;
        return new window.bootstrap.Modal(el);
      };
      document.addEventListener('click', function(e){
        var trigger=e.target.closest('[data-bs-toggle="modal"]');
        if(trigger){ e.preventDefault(); var target=document.querySelector(trigger.getAttribute('data-bs-target')); showModal(target); return; }
        var dismiss=e.target.closest('[data-bs-dismiss="modal"]');
        if(dismiss){ hideModal(dismiss.closest('.modal')); return; }
        var tab=e.target.closest('[data-bs-toggle="tab"]');
        if(tab){ e.preventDefault(); var target=document.querySelector(tab.getAttribute('data-bs-target')); if(!target)return;
          var group=tab.closest('ul,.nav'); if(group) group.querySelectorAll('[data-bs-toggle="tab"]').forEach(function(x){x.classList.remove('active')});
          tab.classList.add('active');
          var content=target.parentElement; if(content) content.querySelectorAll('.tab-pane').forEach(function(x){x.classList.remove('show','active')});
          target.classList.add('show','active');
        }
      });
      document.addEventListener('click', function(e){ if(e.target.classList.contains('modal')) hideModal(e.target); });
    })();

    // ==============================================================
    // TEMA DINAMIS — Light / Dark
    // ==============================================================
    function applyTheme(theme){
      var root=document.documentElement;
      root.setAttribute('data-theme', theme);
      localStorage.setItem('sisjar_theme', theme);
      var icon=document.getElementById('themeToggleIcon');
      var text=document.getElementById('themeToggleText');
      if(icon) icon.className=theme==='dark'?'bi bi-sun-fill':'bi bi-moon-stars-fill';
      if(text) text.textContent=theme==='dark'?'Terang':'Gelap';
    }
    function toggleTheme(){ applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'); }
    (function(){
      var saved=localStorage.getItem('sisjar_theme');
      var preferred=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light';
      applyTheme(saved || preferred);
    })();

    // ==============================================================
    // CACHE MANAGER - OPTIMASI DATA SEMENTARA
    // ==============================================================
    const AppCache = {
        data: {},
        
        get(key) {
            const cached = this.data[key];
            if (cached && (Date.now() - cached.timestamp < 300000)) { // 5 menit
                return cached.data;
            }
            return null;
        },
        
        set(key, data) {
            this.data[key] = {
                data: data,
                timestamp: Date.now()
            };
        },
        
        clear(key) {
            if (key) {
                delete this.data[key];
            } else {
                this.data = {};
            }
        },
        
        // Untuk presensi siswa (2 menit)
        getPresensi(tanggal, idKelas) {
            const key = 'presensi_' + tanggal + '_' + idKelas;
            const cached = this.data[key];
            if (cached && (Date.now() - cached.timestamp < 120000)) {
                return cached.data;
            }
            return null;
        },
        
        setPresensi(tanggal, idKelas, data) {
            const key = 'presensi_' + tanggal + '_' + idKelas;
            this.data[key] = {
                data: data,
                timestamp: Date.now()
            };
        },
        
        clearPresensi(tanggal, idKelas) {
            const key = 'presensi_' + tanggal + '_' + idKelas;
            delete this.data[key];
        }
    };

    // ==============================================================
    // SESSION CREDENTIAL
    // ==============================================================
    function getCredential() {
        return localStorage.getItem('ePiket_token') || '';
    }

    function clearClientSession() {
        localStorage.removeItem('ePiket_token');
        localStorage.removeItem('ePiket_user');
        localStorage.removeItem('ePiket_role');
        localStorage.removeItem('ePiket_canSwitch');
        localStorage.removeItem('ePiket_isSuperMode');
        localStorage.removeItem('ePiket_loginTime');
        AppCache.clear();
    }

    // ==============================================================
    // APP VIEW STATE - LOGIN HARUS TERPISAH DARI MAIN APP
    // ==============================================================
    function setAppView(authenticated) {
        var login = document.getElementById('loginSection');
        var main = document.getElementById('mainSection');
        if (!login || !main) return;

        if (authenticated) {
            login.classList.remove('sisjar-login-visible');
            login.classList.add('sisjar-login-hidden');
            main.classList.remove('sisjar-app-hidden');
            main.classList.add('sisjar-app-visible');
            main.style.display = 'block';
            login.style.display = 'none';
        } else {
            main.classList.remove('sisjar-app-visible');
            main.classList.add('sisjar-app-hidden');
            main.style.display = 'none';
            login.classList.remove('sisjar-login-hidden');
            login.classList.add('sisjar-login-visible');
            login.style.display = 'flex';
        }
    }

    // ==============================================================
    // TOAST & LOADING
    // ==============================================================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast-item ' + type;
        toast.innerText = message;
        container.appendChild(toast);
        setTimeout(function() { toast.classList.add('show'); }, 10);
        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 400);
        }, 3500);
    }

    function legacyShowLoading(text = 'Memuat data...') {
        var el=document.getElementById('loading-text'); if(el)el.textContent=text;
        var ov=document.getElementById('loading-overlay'); if(ov)ov.classList.add('active');
    }

    function legacyHideLoading() {
        if(sisjarBusyCount>0)return;
        var ov=document.getElementById('loading-overlay'); if(ov)ov.classList.remove('active');
    }

    // ==============================================================
    // SESSION & LOGIN
    // ==============================================================
    async function checkLocalSession() {
        try {
            const session = await SISJAR_AUTH.session();
            if (!session) {
                clearClientSession();
                setAppView(false);
                return false;
            }

            const p = await SISJAR_AUTH.profile();
            if (!p) throw new Error('Profil pengguna tidak ditemukan.');

            localStorage.setItem('ePiket_user', p.username || p.email || '');
            localStorage.setItem('ePiket_role', p.role || 'guru');
            setAppView(true);

            var badge = document.getElementById('userBadge');
            var badgeTop = document.getElementById('userBadgeTop');
            var label = (p.role || 'guru').toUpperCase() + ' : ' + (p.username || p.email || '');
            if (badge) badge.textContent = label;
            if (badgeTop) badgeTop.textContent = label;

            applyRoleMenu(p.role || 'guru');
            if ((p.role || '').toLowerCase() === 'superadmin') localStorage.setItem('ePiket_canSwitch','1');
            else localStorage.removeItem('ePiket_canSwitch');

            // Dashboard is the single landing page after authentication.
            // Run it only after the authenticated shell is visible.
            switchMenu('dashboard');
            loadAppSettingsUI();
            loadSuperRoleOptions();
            return true;
        } catch (e) {
            console.error('[SISJAR] Session/profile initialization failed:', e);
            clearClientSession();
            setAppView(false);
            return false;
        }
    }

    async function logout() {
        document.body.classList.remove('sisjar-role-ready');
        clearClientSession();
        try { await SISJAR_AUTH.logout(); } catch(e) { console.warn(e); }
        location.reload();
    }

    async function handleLogin() {
        var user = document.getElementById('username').value.trim();
        var pass = document.getElementById('password').value.trim();
        var alertBox = document.getElementById('loginAlert');
        var spinner = document.getElementById('loginSpinner');
        var btn = document.getElementById('loginBtn');
        if (!user || !pass) { alertBox.textContent='Username dan Password wajib diisi!'; alertBox.classList.remove('d-none'); return; }
        alertBox.classList.add('d-none'); spinner.classList.remove('d-none'); btn.disabled=true;
        try {
            const session = await SISJAR_AUTH.login(user,pass);
            localStorage.setItem('ePiket_token', session.access_token || 'supabase');
            localStorage.setItem('ePiket_loginTime', Date.now());
            const ready = await checkLocalSession();
            if (!ready) throw new Error('Login berhasil, tetapi profil pengguna tidak dapat dimuat. Periksa data profile akun di Supabase.');
            showToast('Login berhasil. Selamat datang di Dashboard.','success');
        } catch(e) {
            alertBox.textContent=e.message||'Login gagal.'; alertBox.classList.remove('d-none'); showToast(e.message||'Login gagal.','error');
        } finally { spinner.classList.add('d-none'); btn.disabled=false; }
    }

    (function bindSisjarLoginForm(){
        var form = document.getElementById('sisjarLoginForm');
        if (form && form.dataset.bound !== '1') {
            form.dataset.bound = '1';
            form.addEventListener('submit', function(event){
                event.preventDefault();
                handleLogin();
            });
        }
    })();

    // ==============================================================
    // SIDEBAR & NAVIGASI
    // ==============================================================
    function toggleSidebar(show) {
        var sidebar = document.getElementById('sidebar');
        var overlay = document.getElementById('sidebarOverlay');
        var main = document.getElementById('mainContent');
        if (!sidebar) return;
        var mobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;

        // Mobile: sidebar is an off-canvas drawer.
        if (mobile) {
            var open = (typeof show === 'boolean') ? show : !sidebar.classList.contains('show');
            sidebar.classList.toggle('show', open);
            sidebar.classList.toggle('open', open);
            if (overlay) overlay.classList.toggle('show', open);
            document.body.classList.toggle('menu-open', open);
            return;
        }

        // Desktop: keep the sidebar visible, but allow compact/expanded mode.
        if (typeof show === 'boolean' && show === false) return;
        var collapsed = !sidebar.classList.contains('collapsed');
        sidebar.classList.toggle('collapsed', collapsed);
        if (main) main.classList.toggle('sidebar-collapsed', collapsed);
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        localStorage.setItem('sisjar_sidebar_collapsed', collapsed ? '1' : '0');
        var btn = document.querySelector('.hamburger-btn');
        if (btn) {
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.setAttribute('aria-label', collapsed ? 'Buka sidebar' : 'Tutup sidebar');
            var icon = btn.querySelector('i');
            if (icon) {
                icon.className = collapsed ? 'bi bi-layout-sidebar' : 'bi bi-list';
            }
        }
    }

    function initSidebarState(){
        var sidebar=document.getElementById('sidebar');
        var main=document.getElementById('mainContent');
        if(!sidebar) return;
        var mobile=window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
        if(mobile){
            sidebar.classList.remove('collapsed','open');
            if(main) main.classList.remove('sidebar-collapsed');
            return;
        }
        var collapsed=localStorage.getItem('sisjar_sidebar_collapsed')==='1';
        sidebar.classList.toggle('collapsed',collapsed);
        if(main) main.classList.toggle('sidebar-collapsed',collapsed);
        document.body.classList.toggle('sidebar-collapsed',collapsed);
        var btn=document.querySelector('.hamburger-btn');
        if(btn){
            btn.setAttribute('aria-expanded',collapsed?'false':'true');
            btn.setAttribute('aria-label',collapsed?'Buka sidebar':'Tutup sidebar');
            var icon=btn.querySelector('i');
            if(icon) icon.className=collapsed?'bi bi-layout-sidebar':'bi bi-list';
        }
    }

    function toggleMobileMore(force){
        var el=document.getElementById('mobileMoreSheet');
        if(!el)return;
        var show=(typeof force==='boolean')?force:!el.classList.contains('show');
        el.classList.toggle('show',show);
    }

    initSidebarState();

    function setActiveBottomNav(menu){
        document.querySelectorAll('[data-bottom-menu]').forEach(function(el){
            el.classList.toggle('active',el.dataset.bottomMenu===menu);
        });
    }

    function setActiveSidebar(menu) {
        document.querySelectorAll('.sidebar-link[data-menu]').forEach(function(el) {
            el.classList.toggle('active', el.dataset.menu === menu);
        });
    }

    function loadSuperRoleOptions(){
        var box=document.getElementById('superRoleBox'),sel=document.getElementById('superRoleSelect');if(!box||!sel)return;
        var actual=String(localStorage.getItem('ePiket_role')||'').toLowerCase();
        if(actual==='superadmin' && localStorage.getItem('ePiket_superOrigin')){actual='guru';}
        if(String(localStorage.getItem('ePiket_isSuperMode')||'')==='1') actual='guru';
        if(localStorage.getItem('ePiket_canSwitch')!=='1'){box.style.display='none';return;}
        box.style.display='block';
        google.script.run.withSuccessHandler(function(r){
          var opts='<option value="superadmin">Superadmin</option>'+(r.data||[]).map(function(t){return '<option value="guru:'+gmEsc(t.username)+'">Guru — '+gmEsc(t.nama)+' ('+gmEsc(t.username)+')</option>';}).join('');
          sel.innerHTML=opts;
          var current=localStorage.getItem('ePiket_role')==='guru'?'guru:'+localStorage.getItem('ePiket_user'):'superadmin';
          if([].some.call(sel.options,function(o){return o.value===current}))sel.value=current;
        }).gmAdminGetTeachers(getCredential());
    }
    function handleSuperRoleChange(value){
        var token=getCredential();if(!token)return;
        if(value==='superadmin'){showLoading('Mengembalikan mode Superadmin...');google.script.run.withSuccessHandler(function(r){hideLoading();if(!r.success)return showToast(r.message,'error');localStorage.setItem('ePiket_role','superadmin');localStorage.setItem('ePiket_user',r.username);localStorage.removeItem('ePiket_isSuperMode');document.getElementById('userBadge').textContent='SUPERADMIN : '+r.username;document.getElementById('userBadgeTop').textContent='SUPERADMIN : '+r.username;applyRoleMenu('superadmin');switchMenu('dashboard');loadSuperRoleOptions();showToast('Kembali ke mode Superadmin.','success');}).withFailureHandler(function(e){hideLoading();showToast(e.message||'Gagal mengganti mode.','error');}).gmSwitchRole(token,'superadmin','');return;}
        var target=String(value).replace(/^guru:/,'');if(!target)return;showLoading('Membuka mode Guru...');google.script.run.withSuccessHandler(function(r){hideLoading();if(!r.success)return showToast(r.message,'error');localStorage.setItem('ePiket_role','guru');localStorage.setItem('ePiket_user',r.username);localStorage.setItem('ePiket_isSuperMode','1');document.getElementById('userBadge').textContent='GURU : '+r.nama;document.getElementById('userBadgeTop').textContent='GURU : '+r.nama;applyRoleMenu('guru');switchMenu('guruJadwal');loadSuperRoleOptions();showToast('Mode Guru aktif untuk pengecekan.','success');}).withFailureHandler(function(e){hideLoading();showToast(e.message||'Gagal membuka mode Guru.','error');}).gmSwitchRole(token,'guru',target);
    }

    function applyRoleMenu(role){
        role=String(role||'').trim().toLowerCase();
        if(!['guru','piket','superadmin','admin_sekolah'].includes(role)) role='';
        document.body.classList.add('sisjar-role-ready');
        document.body.dataset.userRole=role;

        // Gunakan class dengan display:none!important agar aturan CSS lama
        // yang memakai display:flex!important tidak dapat memunculkan menu lintas-role.
        var sidebarItems=document.querySelectorAll('.sidebar-link[data-menu], .sidebar-link.text-warning, .teacher-menu, .admin-teacher-menu, .admin-settings-menu');
        sidebarItems.forEach(function(el){
            el.classList.add('role-hidden');
            el.classList.remove('disabled');
        });

        function showMenu(selector){
            document.querySelectorAll(selector).forEach(function(el){el.classList.remove('role-hidden');});
        }
        showMenu('.sidebar-link[data-menu="dashboard"]');
        if(role==='guru'){
            showMenu('.sidebar-link.teacher-menu:not(.admin-teacher-menu):not(.admin-settings-menu)');
        } else if(role==='piket'){
            showMenu('.sidebar-link[data-menu="siswa"], .sidebar-link[data-menu="terlambat"]');
        } else if(role==='admin_sekolah'){
            showMenu('.sidebar-link.admin-settings-menu, .sidebar-link[data-menu="libur"]');
        } else if(role==='superadmin'){
            showMenu('.sidebar-link.teacher-menu, .sidebar-link.admin-teacher-menu, .sidebar-link.admin-settings-menu, .sidebar-link.superadmin-only');
            showMenu('.sidebar-link[data-menu="siswa"], .sidebar-link[data-menu="dataSiswa"], .sidebar-link[data-menu="terlambat"], .sidebar-link[data-menu="kelas"], .sidebar-link[data-menu="libur"], .sidebar-link[data-menu="backup"], .sidebar-link.text-warning');
        }

        // Bottom navigation memakai tiga pintasan yang relevan dengan role.
        var bottom=document.querySelectorAll('#mobileBottomNav [data-bottom-menu]');
        var map={
          guru:[['dashboard','Beranda','bi-grid-1x2-fill'],['guruAbsensi','Absensi','bi-person-check-fill'],['guruJurnal','Jurnal','bi-journal-text']],
          piket:[['dashboard','Beranda','bi-grid-1x2-fill'],['siswa','Kehadiran','bi-clipboard2-check-fill'],['terlambat','Terlambat','bi-alarm-fill']],
          superadmin:[['dashboard','Beranda','bi-grid-1x2-fill'],['siswa','Kehadiran','bi-clipboard2-check-fill'],['dataSiswa','Data Siswa','bi-people-fill']],
          admin_sekolah:[['dashboard','Beranda','bi-grid-1x2-fill'],['dashboard','Sekolah','bi-building']]
        };
        var items=map[role]||map.guru;
        bottom.forEach(function(el,i){
            var item=items[i];
            if(!item){el.classList.add('role-hidden');return;}
            el.classList.remove('role-hidden');
            el.setAttribute('data-bottom-menu',item[0]);
            var icon=el.querySelector('i'),label=el.querySelector('.bottom-label');
            if(icon)icon.className='bi '+item[2];
            if(label)label.textContent=item[1];
            el.classList.toggle('primary-action',i===1);
        });

        // Sheet tambahan hanya memuat pintasan guru. Untuk Piket/Superadmin,
        // menu lengkap tetap dibuka dari sidebar yang sudah difilter.
        document.querySelectorAll('#mobileMoreSheet button[data-role-menu]').forEach(function(el){
            var m=el.getAttribute('data-role-menu');
            var visible=role==='guru' && ['guruNilai','guruJadwal','guruAgenda','guruLaporan'].includes(m);
            el.classList.toggle('role-hidden',!visible);
        });
        var fullMenuBtn=document.querySelector('#mobileMoreSheet button:not([data-role-menu])');
        if(fullMenuBtn) fullMenuBtn.classList.toggle('role-hidden',!['guru','piket','superadmin','admin_sekolah'].includes(role));
        var more=document.querySelector('#mobileBottomNav .bottom-menu-more');
        if(more)more.classList.toggle('role-hidden',!['guru','piket','superadmin','admin_sekolah'].includes(role));

        // Bersihkan active state yang mungkin berasal dari role sebelumnya.
        var active=document.querySelector('.sidebar-link.active[data-menu]');
        if(active && active.classList.contains('role-hidden')){
            document.querySelectorAll('.sidebar-link.active').forEach(function(el){el.classList.remove('active');});
            var dash=document.querySelector('.sidebar-link[data-menu="dashboard"]');if(dash)dash.classList.add('active');
        }
    }

    function canAccessMenu(menu){
        var role=String(getUserRoleLocal()||'').trim().toLowerCase();
        menu=String(menu||'');
        if(menu==='dashboard') return true;
        if(role==='superadmin') return true;
        if(role==='guru') return ['guruJadwal','guruAgenda','guruAbsensi','guruJurnal','guruNilai','guruLaporan'].indexOf(menu)>=0;
        if(role==='piket') return ['siswa','terlambat'].indexOf(menu)>=0;
        if(role==='admin_sekolah') return ['libur'].indexOf(menu)>=0;
        return false;
    }

    function switchMenu(menu) {
        // Guard kedua di level navigasi. Walaupun tombol/menu lama masih ada di DOM,
        // guru tidak boleh membuka modul Superadmin dengan memanggil switchMenu() langsung.
        if(!canAccessMenu(menu) && String(menu||'')!=='dashboard'){
            showToast('Akses ditolak. Menu ini hanya tersedia untuk Superadmin.','error');
            return;
        }
        var content = document.getElementById('dynamicContent');
        var title = document.getElementById('pageTitle');
        var sub = document.getElementById('pageSubtitle');
        var eyebrow = document.getElementById('pageEyebrow');
        if (!content) return;

        setActiveSidebar(menu);
        setActiveBottomNav(menu);
        toggleMobileMore(false);
        document.querySelectorAll('.main-tab-pane').forEach(function(p) {
            p.classList.remove('show', 'active');
        });

        if (menu === 'dashboard') {
            if (String(getUserRoleLocal() || '').toLowerCase() === 'guru') {
                eyebrow.textContent = 'RUANG GURU MATA PELAJARAN'; title.textContent = 'Dashboard Guru'; sub.textContent = 'Jadwal, absensi, jurnal, dan penilaian dalam satu alur kerja.'; renderGuruDashboard(content);
            } else {
                eyebrow.textContent = 'RINGKASAN KEHADIRAN'; title.textContent = 'Dashboard'; sub.textContent = 'Pantau kondisi kehadiran siswa secara ringkas dan cepat.'; renderDashboardContent(content);
            }
        } else if (menu === 'siswa') {
            eyebrow.textContent = 'MANAJEMEN PRESENSI';
            title.textContent = 'Kehadiran Siswa';
            sub.textContent = 'Input presensi satu kelas sekaligus untuk Senin–Jumat, rekap, dan cetak presensi siswa.';
            renderSiswaContent(content);
        } else if (menu === 'terlambat') {
            eyebrow.textContent = 'MONITORING CEPAT';
            title.textContent = 'Siswa Terlambat';
            sub.textContent = 'Temukan siswa yang terlambat tanpa membuka kelas satu per satu.';
            renderTerlambatContent(content);
        } else if (menu === 'dataSiswa') {
            eyebrow.textContent = 'DATA MASTER';
            title.textContent = 'Data Siswa';
            sub.textContent = 'Kelola data siswa. Menghapus siswa juga menghapus seluruh riwayat kehadirannya.';
            renderDataSiswaContent(content);
        } else if (menu === 'kelas') {
            eyebrow.textContent = 'DATA MASTER';
            title.textContent = 'Data Kelas';
            sub.textContent = 'Kelola daftar kelas sekolah.';
            renderKelasContent(content);
        } else if (menu === 'libur') {
            eyebrow.textContent = 'KALENDER AKADEMIK';
            title.textContent = 'Kalender Libur';
            sub.textContent = 'Atur hari libur agar tidak masuk perhitungan kehadiran.';
            renderLiburContent(content);
        } else if (menu === 'backup') {
            eyebrow.textContent = 'KEAMANAN DATA';
            title.textContent = 'Backup & Restore';
            sub.textContent = 'Simpan salinan database dan pulihkan kembali kapan saja melalui file backup.';
            renderBackupContent(content);
        } else if (menu === 'guruJadwal') { eyebrow.textContent='GURU MATA PELAJARAN'; title.textContent='Jadwal Mengajar'; sub.textContent='Lihat kelas, mata pelajaran, hari, dan jam mengajar Anda.'; renderGuruSchedule(content); }
        else if (menu === 'guruAgenda') { eyebrow.textContent='GURU MATA PELAJARAN'; title.textContent='Agenda Tidak Mengajar'; sub.textContent='Tandai kelas atau jam tertentu yang tidak dilaksanakan tanpa memengaruhi jadwal lainnya.'; renderGuruAgenda(content); }
        else if (menu === 'guruAbsensi') { eyebrow.textContent='GURU MATA PELAJARAN'; title.textContent='Absensi Mapel'; sub.textContent='Presensi hanya tersedia pada tanggal yang sesuai dengan jadwal kelas.'; renderGuruAttendance(content); }
        else if (menu === 'guruJurnal') { eyebrow.textContent='GURU MATA PELAJARAN'; title.textContent='Jurnal Mengajar'; sub.textContent='Rekap kehadiran otomatis dari absensi lalu lengkapi materi dan catatan.'; renderGuruJournal(content); }
        else if (menu === 'guruNilai') { eyebrow.textContent='GURU MATA PELAJARAN'; title.textContent='Penilaian & Nilai'; sub.textContent='Buat jenis penilaian sendiri dan isi nilai siswa per kelas.'; renderGuruGrades(content); }
        else if (menu === 'guruLaporan') { eyebrow.textContent='GURU MATA PELAJARAN'; title.textContent='Laporan Guru'; sub.textContent='Export Excel atau cetak PDF untuk absensi, nilai, dan jurnal.'; renderGuruReports(content); }
        else if (menu === 'dataGuru') { eyebrow.textContent='ADMINISTRASI'; title.textContent='Data Guru'; sub.textContent='Tambah, cari, dan ubah data akun serta identitas guru.'; renderGuruAdmin(content); }
        else if (menu === 'adminJadwal') { eyebrow.textContent='ADMINISTRASI'; title.textContent='Data Jadwal'; sub.textContent='Kelola jadwal mengajar secara terpisah dari data guru.'; renderAdminJadwal(content); }
        else if (menu === 'pengaturan') { eyebrow.textContent='PENGATURAN SISTEM'; title.textContent='Identitas SISJAR'; sub.textContent='Atur identitas sekolah dan data penandatangan dokumen.'; renderAppSettings(content); }
        else if (menu === 'masterSekolah') { eyebrow.textContent='ADMINISTRASI PUSAT'; title.textContent='Master Sekolah'; sub.textContent='Tambah dan kelola identitas sekolah yang menggunakan SISJAR.'; renderMasterSekolah(content); }

        toggleSidebar(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==============================================================
    // FUNGSI BANTUAN
    // ==============================================================
    function initDatesSiswa() {
        var now = new Date();
        var monday = getMondayDateSiswa(dateToKeySiswa(now));
        var el = document.getElementById('selectMingguSiswa');
        if (el) el.value = dateToKeySiswa(monday);
        var first = new Date(now.getFullYear(), now.getMonth(), 1);
        var el2 = document.getElementById('rekapTglMulaiSiswa');
        if (el2) el2.valueAsDate = first;
        var el3 = document.getElementById('rekapTglSelesaiSiswa');
        if (el3) el3.valueAsDate = now;
        var el4 = document.getElementById('laporanTglMulaiSiswa');
        if (el4) el4.valueAsDate = first;
        var el5 = document.getElementById('laporanTglSelesaiSiswa');
        if (el5) el5.valueAsDate = now;
    }

    function loadKelasDropdown(id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var current = sel.value;
        var isFilter = id.includes('rekap') || id.includes('laporan') || id === 'terlambatKelas' || id === 'kelolaJadwalKelas';
        google.script.run
            .withSuccessHandler(function(data) {
                sel.innerHTML = '';
                if (isFilter && id !== 'kelolaJadwalKelas') {
                    var all = document.createElement('option');
                    all.value = 'SEMUA';
                    all.textContent = 'Semua Kelas';
                    sel.appendChild(all);
                }
                (Array.isArray(data) ? data : []).forEach(function(k) {
                    if (!k || !k.id || !k.nama) return;
                    var opt = document.createElement('option');
                    opt.value = String(k.id);
                    opt.textContent = String(k.nama);
                    sel.appendChild(opt);
                });

                // Filter Terlambat harus selalu default ke SEMUA KELAS.
                if (isFilter && id !== 'kelolaJadwalKelas') {
                    sel.value = 'SEMUA';
                } else if (current && Array.from(sel.options).some(function(o) { return o.value === current; })) {
                    sel.value = current;
                }
            })
            .getKelasDropdown();
    }

    // ==============================================================
    // SISWA FUNCTIONS
    // ==============================================================
    var siswaData = [];
    var siswaRekapFull = [];
    var siswaRekapPage = 1;
    var siswaRekapPageSize = 25;
    var siswaFilterStatus = null;
    var siswaChart = null;
    var siswaLaporanRekap = null;
    var siswaLaporanDetail = null;
    var siswaFilterKeyword = '';

    // ==============================================================
    // RENDER SISWA CONTENT
    // ==============================================================
    function renderSiswaContent(container) {
        container.innerHTML = `
            <ul class="nav nav-tabs mb-3" role="tablist">
                <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#siswaInputTab">1. Input</button></li>
                <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#siswaRekapTab">2. Rekap</button></li>
                <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#siswaCetakTab">3. Cetak</button></li>
            </ul>
            <div class="tab-content">
                <div class="tab-pane fade show active main-tab-pane" id="siswaInputTab">
                    <div class="card-flat p-3 mb-3 control-row">
                        <div class="row g-2 align-items-end">
                            <div class="col-12 col-md-3">
                                <label class="form-label">Kelas</label>
                                <select id="selectKelasSiswa" class="form-select"></select>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="form-label">Minggu</label>
                                <input type="date" id="selectMingguSiswa" class="form-control" />
                                <div class="small text-secondary mt-1" id="labelRentangMinggu">Senin–Jumat</div>
                            </div>
                            <div class="col-6 col-md-2">
                                <label class="form-label">&nbsp;</label>
                                <button class="btn btn-refresh-sm w-100" onclick="refreshSiswa()" id="btnRefreshSiswa" title="Muat ulang data siswa">
                                    <i class="bi bi-arrow-clockwise"></i> Refresh
                                </button>
                            </div>
                            <div class="col-6 col-md-4">
                                <label class="form-label">Cari Nama / NIS</label>
                                <div class="filter-input-icon position-relative">
                                    <i class="bi bi-search"></i>
                                    <input type="text" id="filterNamaSiswa" class="form-control" placeholder="Ketik nama atau NIS..." oninput="filterSiswaByNama()" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="loadingSiswa" class="text-center py-5 d-none"><div class="spinner-border text-primary"></div><p class="text-secondary mt-2">Memuat presensi Senin–Jumat...</p></div>
                    <div id="siswaContainer"></div>
                    <div class="text-end mt-4">
                        <div class="small text-secondary mb-2"><span class="badge bg-primary">H</span> Hadir &nbsp; <span class="badge" style="background:#f59e0b;color:#fff">T</span> Terlambat &nbsp; <span class="badge bg-info">S</span> Sakit &nbsp; <span class="badge bg-warning text-dark">I</span> Izin &nbsp; <span class="badge bg-danger">A</span> Alfa <span class="ms-2 text-primary fw-bold"><i class="bi bi-calendar2-check"></i> Senin–Jumat</span></div><button id="btnSimpanSiswa" onclick="savePresensiSiswa()" class="btn btn-success btn-save-bottom">
                            <i class="bi bi-check-circle-fill me-2"></i>
                            <span id="btnSimpanSiswaText">Simpan Presensi</span>
                            <span id="btnSimpanSiswaSpinner" class="spinner-border spinner-border-sm d-none ms-2"></span>
                        </button>
                    </div>
                </div>
                <div class="tab-pane fade main-tab-pane" id="siswaRekapTab">
                    <div class="card-flat p-3 mb-3">
                        <div class="row g-2 align-items-end">
                            <div class="col-md-2">
                                <label class="form-label">Kelas</label>
                                <select id="rekapKelasSiswa" class="form-select"><option value="SEMUA">Semua</option></select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Cari Nama</label>
                                <input type="text" id="rekapNamaSiswa" class="form-control" placeholder="Nama / NIS" onkeyup="if(event.key==='Enter') loadRekapSiswa()">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Mulai</label>
                                <input type="date" id="rekapTglMulaiSiswa" class="form-control" />
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Selesai</label>
                                <input type="date" id="rekapTglSelesaiSiswa" class="form-control" />
                            </div>
                            <div class="col-md-2">
                                <button onclick="loadRekapSiswa()" class="btn btn-warning w-100 fw-bold"><i class="bi bi-search me-1"></i> Tampilkan</button>
                            </div>
                        </div>
                    </div>
                    <div class="row g-2 mb-3" id="rekapCardsSiswa"><div class="col-12 text-center text-secondary py-4">Atur filter dan klik Tampilkan.</div></div>
                    <div class="row g-3 d-none" id="rekapDetailSiswa">
                        <div class="col-lg-5">
                            <div class="card-flat p-3 text-center">
                                <h6 class="fw-bold"><i class="bi bi-pie-chart-fill text-primary"></i> Komposisi</h6>
                                <div class="d-flex justify-content-center"><canvas id="rekapChartSiswa" style="max-width:280px; max-height:280px;"></canvas></div>
                            </div>
                        </div>
                        <div class="col-lg-7">
                            <div class="card-flat p-3">
                                <div class="d-flex justify-content-between align-items-center mb-2">
                                    <h6 class="fw-bold"><i class="bi bi-table text-warning"></i> Rincian</h6>
                                    <div><span class="badge bg-secondary" id="badgeJumlahSiswa">0 Siswa</span>
                                    <button onclick="resetFilterRekapSiswa()" class="btn btn-sm btn-outline-secondary d-none ms-2" id="btnResetFilterSiswa">Reset</button></div>
                                </div>
                                <div class="d-flex gap-2 mb-2">
                                    <input type="text" id="searchRekapSiswa" class="form-control form-control-sm" placeholder="Cari..." oninput="applyFilterRekapSiswa()">
                                    <select id="pageSizeRekapSiswa" class="form-select form-select-sm" style="width:auto;" onchange="applyFilterRekapSiswa()">
                                        <option value="10">10</option><option value="25" selected>25</option><option value="50">50</option><option value="100">100</option>
                                    </select>
                                </div>
                                <div class="table-responsive" style="max-height:300px; overflow-y:auto;">
                                    <table class="table table-rekap table-sm mb-0" id="tableRekapSiswa">
                                        <thead><tr><th class="text-start">Nama</th><th>Kelas</th><th>H</th><th>T</th><th>S</th><th>I</th><th>A</th><th>Data</th><th>Hari Ef.</th><th>% Hadir</th><th>% T</th></tr></thead>
                                        <tbody id="tbodyRekapSiswa"></tbody>
                                    </table>
                                </div>
                                <div class="d-flex justify-content-between align-items-center mt-2">
                                    <span id="rekapPaginationInfoSiswa" class="small text-secondary">Menampilkan 0-0 dari 0</span>
                                    <div>
                                        <button class="btn btn-sm btn-outline-secondary" onclick="changeRekapPageSiswa(-1)" id="prevRekapSiswa" disabled>«</button>
                                        <span id="rekapCurrentPageSiswa" class="mx-2">1</span>
                                        <button class="btn btn-sm btn-outline-secondary" onclick="changeRekapPageSiswa(1)" id="nextRekapSiswa">»</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="tab-pane fade main-tab-pane" id="siswaCetakTab">
                    <div class="card-flat p-3 mb-3">
                        <div class="row g-2 align-items-end">
                            <div class="col-md-2">
                                <label class="form-label">Kelas</label>
                                <select id="laporanKelasSiswa" class="form-select"><option value="SEMUA">Semua</option></select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Mulai</label>
                                <input type="date" id="laporanTglMulaiSiswa" class="form-control" />
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">Selesai</label>
                                <input type="date" id="laporanTglSelesaiSiswa" class="form-control" />
                            </div>
                            <div class="col-md-2">
                                <button onclick="tampilkanLaporanSiswa()" class="btn btn-primary w-100 fw-bold"><i class="bi bi-eye"></i> Tampilkan</button>
                            </div>
                        </div>
                        <div class="row g-2 mt-2">
                            <div class="col-md-6">
                                <label class="form-label">Status</label>
                                <div class="d-flex flex-wrap gap-2">
                                    ${['H','T','S','I','A'].map(function(s) { return '<div class="form-check form-check-inline"><input class="form-check-input status-check-siswa" type="checkbox" value="' + s + '" checked><label class="form-check-label small fw-bold">' + s + '</label></div>'; }).join('')}
                                    <button onclick="toggleAllStatusSiswa(true)" class="btn btn-sm btn-outline-secondary">Semua</button>
                                    <button onclick="toggleAllStatusSiswa(false)" class="btn btn-sm btn-outline-secondary">Hapus</button>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label">Petugas Piket</label>
                                <input type="text" id="namaPiketSiswa" class="form-control" placeholder="Nama petugas piket" />
                                <div class="mt-1 d-flex gap-2 flex-wrap">
                                    <button onclick="cetakRekapSiswa()" class="btn btn-danger btn-sm"><i class="bi bi-file-pdf"></i> PDF Rekap</button>
                                    <button onclick="downloadExcelRekapSiswa()" class="btn btn-success btn-sm"><i class="bi bi-file-excel"></i> Excel Rekap</button>
                                    <button onclick="cetakDetailSiswa()" class="btn btn-danger btn-sm"><i class="bi bi-file-pdf"></i> PDF Detail</button>
                                    <button onclick="downloadExcelDetailSiswa()" class="btn btn-success btn-sm"><i class="bi bi-file-excel"></i> Excel Detail</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-flat p-3" id="laporanPreviewSiswa"><div class="text-center text-secondary py-5">Klik Tampilkan untuk pratinjau.</div></div>
                    <div id="printAreaSiswa" style="display:none;"></div>
                </div>
            </div>
        `;
        initDatesSiswa();
        loadKelasDropdown('selectKelasSiswa');
        loadKelasDropdown('rekapKelasSiswa');
        loadKelasDropdown('laporanKelasSiswa');
        document.getElementById('selectKelasSiswa').addEventListener('change', function() { loadSiswaList(); });
        document.getElementById('selectMingguSiswa').addEventListener('change', function() { normalisasiMingguSiswa(); loadSiswaList(); });
        normalisasiMingguSiswa();
        setTimeout(loadSiswaList, 300);
    }

    // ==============================================================
    // SISWA - INPUT MINGGUAN (SENIN-JUMAT)
    // ============================================================== 
    var siswaMingguan = { dates: [], presensi: {}, hari: {} };

    function getMondayDateSiswa(value) {
        var d = value ? new Date(value + 'T00:00:00') : new Date();
        if (isNaN(d.getTime())) d = new Date();
        var day = d.getDay();
        var diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d;
    }

    function dateToKeySiswa(d) {
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function formatTanggalSingkatSiswa(tgl) {
        var d = new Date(tgl + 'T00:00:00');
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
    }

    function normalisasiMingguSiswa() {
        var el = document.getElementById('selectMingguSiswa');
        if (!el) return;
        var monday = getMondayDateSiswa(el.value);
        var key = dateToKeySiswa(monday);
        el.value = key;
        var label = document.getElementById('labelRentangMinggu');
        if (label) {
            var fri = new Date(monday);
            fri.setDate(fri.getDate() + 4);
            label.textContent = 'Senin ' + formatTanggalSingkatSiswa(key) + ' – Jumat ' + formatTanggalSingkatSiswa(dateToKeySiswa(fri));
        }
    }

    function getDatesMingguanSiswa() {
        var monday = getMondayDateSiswa(document.getElementById('selectMingguSiswa').value);
        var dates = [];
        for (var i = 0; i < 5; i++) {
            var d = new Date(monday);
            d.setDate(monday.getDate() + i);
            dates.push(dateToKeySiswa(d));
        }
        return dates;
    }

    function statusOptionsSiswa(current, disabled, futureDate, tanggal, idSiswa) {
        var opts = [['H','Hadir'],['T','Terlambat'],['S','Sakit'],['I','Izin'],['A','Alfa']];
        if (futureDate) return '<div class="status-locked-mingguan" title="Presensi belum dapat diisi sebelum tanggal tersebut."><i class="bi bi-lock-fill"></i><span>Belum tersedia</span></div>';
        current = String(current || 'H').trim().toUpperCase();
        if (['H','T','S','I','A'].indexOf(current) === -1) current = 'H';
        var dis = disabled ? ' disabled' : '';
        var buttons = opts.map(function(o){
            return '<button type="button" class="siswa-status-btn st-'+o[0]+(current===o[0]?' active':'')+'" data-status="'+o[0]+'" data-tanggal="'+escapeHtmlDashboard(tanggal||'')+'" data-id-siswa="'+escapeHtmlDashboard(idSiswa||'')+'" onclick="setSiswaMingguanStatus(this)" title="'+o[1]+'"'+dis+'><span>'+o[0]+'</span><small>'+o[1]+'</small></button>';
        }).join('');
        return '<input type="hidden" class="status-input-mingguan" data-tanggal="'+escapeHtmlDashboard(tanggal||'')+'" data-id-siswa="'+escapeHtmlDashboard(idSiswa||'')+'" value="'+current+'"'+dis+'><div class="siswa-status-group" role="group" aria-label="Status kehadiran">'+buttons+'</div>';
    }
    function setSiswaMingguanStatus(btn){
        if(!btn || btn.disabled)return;
        var root=btn.closest('td')||btn.closest('.mobile-day-row');
        if(!root)return;
        var input=root.querySelector('.status-input-mingguan');
        var st=String(btn.dataset.status||'H').toUpperCase();
        if(input)input.value=st;
        root.querySelectorAll('.siswa-status-btn').forEach(function(b){b.classList.toggle('active',String(b.dataset.status||'')===st);});
    }
    function ubahWarnaStatusMingguan(){ return; }

    function renderSiswaCardsMingguan(list, bundle) {
        var container = document.getElementById('siswaContainer');
        var dates = bundle.dates || getDatesMingguanSiswa();
        var presensi = bundle.presensi || {};
        var hari = bundle.hari || {};
        siswaMingguan = { dates: dates, presensi: presensi, hari: hari };
        if (!list.length) {
            container.innerHTML = '<div class="card-flat text-center py-5"><i class="bi bi-folder-x display-4 text-warning"></i><h5 class="fw-bold">Belum ada data siswa.</h5></div>';
            return;
        }
        var keyword = (siswaFilterKeyword || '').toLowerCase().trim();
        var sorted = list.slice().sort(function(a,b){return String(a.nama||'').localeCompare(String(b.nama||''),'id',{numeric:true,sensitivity:'base'});});
        if (keyword) sorted = sorted.filter(function(x){return String(x.nama).toLowerCase().includes(keyword)||String(x.nis).toLowerCase().includes(keyword);});
        if (!sorted.length) { container.innerHTML='<div class="card-flat text-center py-4"><i class="bi bi-search display-4 text-secondary"></i><p class="text-secondary fw-bold">Tidak ada siswa yang cocok.</p></div>'; return; }
        var todayKey = bundle.today || dateToKeySiswa(new Date());
        var dayNames=['Senin','Selasa','Rabu','Kamis','Jumat'];
        var opts=[['H','Hadir'],['T','Terlambat'],['S','Sakit'],['I','Izin'],['A','Alfa']];

        // DESKTOP/TABLET: tetap mempertahankan tampilan mingguan.
        var head='<div class="guru-grid-wrapper siswa-mingguan-wrapper siswa-mingguan-desktop"><table><thead><tr><th style="min-width:55px;">No</th><th class="text-start" style="min-width:220px;">Siswa</th>';
        dates.forEach(function(tgl,idx){var info=hari[tgl]||{};var libur=!!info.libur;head+='<th style="min-width:145px;">'+dayNames[idx]+'<br><span class="fw-normal">'+formatTanggalSingkatSiswa(tgl)+'</span>'+(libur?'<br><span class="badge bg-secondary mt-1">LIBUR</span>':'')+'</th>';});
        head+='</tr></thead><tbody>';
        var desktopRows=sorted.map(function(stu,idx){
            var tr='<tr><td>'+(idx+1)+'</td><td class="guru-nama-cell"><span class="badge bg-light text-dark border me-1">'+escapeHtmlDashboard(stu.nis)+'</span>'+escapeHtmlDashboard(stu.nama)+'</td>';
            dates.forEach(function(tgl){var info=hari[tgl]||{};var libur=!!info.libur;var future=tgl>todayKey;var key=tgl+'|'+stu.id;var has=Object.prototype.hasOwnProperty.call(presensi,key);var cur=has?presensi[key]:'H';var disabled=future||libur;var cell=libur?'<div class="status-locked-mingguan holiday"><i class="bi bi-calendar-x"></i><span>LIBUR</span></div>':statusOptionsSiswa(cur,disabled,future,tgl,stu.id);tr+='<td>'+cell+'</td>';});
            return tr+'</tr>';
        }).join('');
        var desktop='<div class="small text-secondary mb-2"><i class="bi bi-info-circle me-1"></i> Senin–Jumat. Tanggal yang sudah lewat membaca database; tanggal yang belum terjadi terkunci.</div>'+head+desktopRows+'</tbody></table></div>';

        // MOBILE: tidak memakai tabel lebar. Satu kartu siswa berisi 5 hari dan tombol status ringkas.
        var mobile='<div class="siswa-mingguan-mobile">';
        mobile += '<div class="mobile-week-head"><strong>Presensi Mingguan</strong><span>'+formatTanggalSingkatSiswa(dates[0])+' – '+formatTanggalSingkatSiswa(dates[4])+'</span></div>';
        mobile += sorted.map(function(stu,idx){
            var card='<div class="mobile-student-card"><div class="mobile-student-head"><div class="mobile-student-no">'+(idx+1)+'</div><div class="mobile-student-info"><strong>'+escapeHtmlDashboard(stu.nama)+'</strong><span>NIS '+escapeHtmlDashboard(stu.nis)+'</span></div></div><div class="mobile-day-list">';
            dates.forEach(function(tgl,di){var info=hari[tgl]||{};var libur=!!info.libur;var future=tgl>todayKey;var key=tgl+'|'+stu.id;var cur=Object.prototype.hasOwnProperty.call(presensi,key)?String(presensi[key]).toUpperCase():'H';if(['H','T','S','I','A'].indexOf(cur)<0)cur='H';var disabled=future||libur;
                card+='<div class="mobile-day-row"><div class="mobile-day-label"><strong>'+dayNames[di]+'</strong><span>'+formatTanggalSingkatSiswa(tgl)+'</span></div>';
                if(libur) card+='<div class="mobile-holiday">LIBUR</div>'; else if(future) card+='<div class="mobile-holiday"><i class="bi bi-lock-fill"></i></div>'; else {
                    card+=statusOptionsSiswa(cur,disabled,future,tgl,stu.id);
                }
                card+='</div>';
            });
            return card+'</div></div>';
        }).join('');
        mobile+='</div>';
        container.innerHTML=desktop+mobile;
    }

    function setMobileSiswaStatus(btn) { setSiswaMingguanStatus(btn); }

    function filterSiswaByNama() {
        var input = document.getElementById('filterNamaSiswa');
        siswaFilterKeyword = input ? input.value : '';
        if (siswaData.length && siswaMingguan.dates.length) renderSiswaCardsMingguan(siswaData, siswaMingguan);
    }

    function refreshSiswa() {
        var btn = document.getElementById('btnRefreshSiswa');
        if (!btn) return;
        btn.classList.add('loading');
        btn.disabled = true;
        AppCache.clear('siswa_' + document.getElementById('selectKelasSiswa').value);
        loadSiswaList(function() {
            btn.classList.remove('loading');
            btn.disabled = false;
            showToast('Data siswa berhasil dimuat ulang.', 'success');
        });
    }

    // ==============================================================
    // SISWA - LOAD LIST MINGGUAN
    // ==============================================================
    function loadSiswaList(callback) {
        normalisasiMingguSiswa();
        var idKelas = document.getElementById('selectKelasSiswa').value;
        var tglSenin = document.getElementById('selectMingguSiswa').value;
        var container = document.getElementById('siswaContainer');
        var loading = document.getElementById('loadingSiswa');
        var saveBtn = document.getElementById('btnSimpanSiswa');
        if (!idKelas || !tglSenin) {
            container.innerHTML = '<div class="card-flat text-center py-5"><i class="bi bi-info-circle display-4 text-secondary"></i><p class="text-secondary fw-bold">Pilih kelas dan minggu.</p></div>';
            if (callback) callback();
            return;
        }
        loading.classList.remove('d-none');
        if (saveBtn) saveBtn.disabled = true;
        var username = getCredential();
        google.script.run
            .withSuccessHandler(function(bundle) {
                if (!bundle || bundle.success === false) {
                    loading.classList.add('d-none');
                    container.innerHTML = '<div class="card-flat text-center text-danger py-5">' + escapeHtmlDashboard(bundle && bundle.message ? bundle.message : 'Gagal memuat data.') + '</div>';
                    if (callback) callback();
                    return;
                }
                google.script.run
                    .withSuccessHandler(function(siswaList) {
                        loading.classList.add('d-none');
                        if (siswaList && siswaList.success === false) {
                            container.innerHTML = '<div class="card-flat text-center text-danger py-5">' + escapeHtmlDashboard(siswaList.message) + '</div>';
                        } else {
                            siswaData = siswaList || [];
                            AppCache.set('siswa_' + idKelas, siswaData);
                            renderSiswaCardsMingguan(siswaData, bundle);
                            if (saveBtn) saveBtn.disabled = false;
                        }
                        if (callback) callback();
                    })
                    .withFailureHandler(function(err) {
                        loading.classList.add('d-none');
                        container.innerHTML = '<div class="card-flat text-center text-danger py-5">Gagal memuat siswa: ' + escapeHtmlDashboard(err.message) + '</div>';
                        if (callback) callback();
                    })
                    .getSiswaByKelas(idKelas, username);
            })
            .withFailureHandler(function(err) {
                loading.classList.add('d-none');
                container.innerHTML = '<div class="card-flat text-center text-danger py-5">Gagal memuat kalender: ' + escapeHtmlDashboard(err.message) + '</div>';
                if (callback) callback();
            })
            .getPresensiSiswaMingguan(tglSenin, idKelas, username);
    }

    // ==============================================================
    // SISWA - SAVE PRESENSI MINGGUAN (1 KELAS x 5 HARI)
    // ==============================================================
    function savePresensiSiswa() {
        var idKelas = document.getElementById('selectKelasSiswa').value;
        var tglSenin = document.getElementById('selectMingguSiswa').value;
        if (!idKelas || !tglSenin) { alert('Pilih kelas dan minggu!'); return; }
        var inputs = document.querySelectorAll('#siswaContainer .status-input-mingguan:not(:disabled)');
        if (!inputs.length) { alert('Tidak ada data presensi yang dapat disimpan.'); return; }
        var payload = []; var seen = {};
        inputs.forEach(function(input) {
            var key = String(input.dataset.tanggal||'')+'|'+String(input.dataset.idSiswa||'');
            if(seen[key]) return; seen[key]=true;
            payload.push({ tanggal: input.dataset.tanggal, idSiswa: input.dataset.idSiswa, status: String(input.value||'H').toUpperCase() });
        });
        var btn = document.getElementById('btnSimpanSiswaText');
        var spinner = document.getElementById('btnSimpanSiswaSpinner');
        var button = document.getElementById('btnSimpanSiswa');
        var orig = btn.textContent;
        btn.textContent = 'Menyimpan 5 hari...';
        spinner.classList.remove('d-none');
        button.disabled = true;
        google.script.run
            .withSuccessHandler(function(res) {
                btn.textContent = orig;
                spinner.classList.add('d-none');
                button.disabled = false;
                if (!res || res.success === false) { showToast((res && res.message) || 'Gagal menyimpan.', 'error'); return; }
                AppCache.clear('siswa_' + idKelas);
                showToast(res.message, 'success');
                loadSiswaList();
            })
            .withFailureHandler(function(err) {
                btn.textContent = orig;
                spinner.classList.add('d-none');
                button.disabled = false;
                showToast('Error: ' + err.message, 'error');
            })
            .savePresensiSiswaMingguan(tglSenin, idKelas, payload, getCredential());
    }

    function refreshSiswa() {
        var btn = document.getElementById('btnRefreshSiswa');
        btn.classList.add('loading');
        btn.disabled = true;
        AppCache.clear('siswa_' + document.getElementById('selectKelasSiswa').value);
        loadSiswaList(function() {
            btn.classList.remove('loading');
            btn.disabled = false;
            showToast('Data siswa berhasil dimuat ulang.', 'success');
        });
    }

    // ==============================================================
    // SISWA - REKAP (OPTIMASI DENGAN CACHE)
    // ==============================================================
    function loadRekapSiswa() {
        var idKelas = document.getElementById('rekapKelasSiswa').value;
        var tglMulai = document.getElementById('rekapTglMulaiSiswa').value;
        var tglSelesai = document.getElementById('rekapTglSelesaiSiswa').value;
        if (!tglMulai || !tglSelesai) { alert('Pilih tanggal!'); return; }
        
        // Cek cache
        var cacheKey = 'rekap_siswa_' + idKelas + '_' + tglMulai + '_' + tglSelesai;
        var cached = AppCache.get(cacheKey);
        if (cached) {
            siswaRekapFull = cached.detailSiswa;
            siswaFilterStatus = null;
            renderRekapSiswaUI(cached.rekap, cached.total, cached.detailSiswa, cached.hariEfektif);
            showToast('Data dari cache', 'info');
            return;
        }
        
        document.getElementById('rekapCardsSiswa').innerHTML = '<div class="col-12 text-center py-4"><div class="spinner-border text-primary"></div><p class="text-secondary">Memuat data...</p></div>';
        document.getElementById('rekapDetailSiswa').classList.add('d-none');
        var username = getCredential();
        
        google.script.run
            .withSuccessHandler(function(res) {
                if (res.success) {
                    if (!res.detailSiswa) res.detailSiswa = [];
                    siswaRekapFull = res.detailSiswa;
                    siswaFilterStatus = null;
                    renderRekapSiswaUI(res.rekap, res.total, res.detailSiswa, res.hariEfektif);
                    
                    // Simpan ke cache
                    AppCache.set(cacheKey, {
                        rekap: res.rekap,
                        total: res.total,
                        detailSiswa: res.detailSiswa,
                        hariEfektif: res.hariEfektif
                    });
                } else {
                    showToast('Gagal: ' + res.message, 'error');
                    document.getElementById('rekapCardsSiswa').innerHTML = '<div class="col-12 text-center text-danger">Gagal memuat data.</div>';
                }
            })
            .withFailureHandler(function() {
                document.getElementById('rekapCardsSiswa').innerHTML = '<div class="col-12 text-center text-danger">Terjadi kesalahan.</div>';
            })
            .getRekapLaporan(idKelas, tglMulai, tglSelesai, ['H', 'T', 'S', 'I', 'A'], username);
    }

    function renderRekapSiswaUI(rekap, total, data, hariEfektif) {
        var container = document.getElementById('rekapCardsSiswa');
        var statuses = [
            { key: 'H', label: 'Hadir', color: '#2563eb' },
            { key: 'T', label: 'Terlambat', color: '#f59e0b' },
            { key: 'S', label: 'Sakit', color: '#06b6d4' },
            { key: 'I', label: 'Izin', color: '#ca8a04' },
            { key: 'A', label: 'Alfa', color: '#dc2626' }
        ];
        var html = statuses.map(function(s) {
            return '<div class="col"><div class="rekap-card" style="border-top:4px solid ' + s.color +
                '" onclick="setFilterRekapSiswa(\'' + s.key + '\')"><div class="label">' + s.label +
                '</div><div class="value" style="color:' + s.color + '">' + (rekap[s.key] || 0) +
                '</div></div></div>';
        }).join('');
        html += '<div class="col"><div class="rekap-card" style="border-top:4px solid #2563eb;background:rgba(37,99,235,0.05)" onclick="resetFilterRekapSiswa()"><div class="label">Data Presensi</div><div class="value" style="color:#2563eb">' +
            total + '</div></div></div>';
        html += '<div class="col"><div class="rekap-card" style="border-top:4px solid #0f3d91;background:#eef5ff"><div class="label">Hari Efektif</div><div class="value" style="color:#0f3d91">' +
            (hariEfektif || 0) + '</div></div></div>';
        var totalEfektif = (hariEfektif || 0);
        var totalT = Number(rekap.T || 0);
        var totalH = Number(rekap.H || 0);
        var totalS = Number(rekap.S || 0);
        var totalI = Number(rekap.I || 0);
        var totalA = Number(rekap.A || 0);
        var jumlahSiswaRekap = Array.isArray(data) ? data.length : 0;
        var denominatorTotal = totalEfektif * Math.max(1, jumlahSiswaRekap);
        var pctT = denominatorTotal ? Math.round((totalT / denominatorTotal) * 100) : 0;
        var pctHadir = denominatorTotal ? Math.round(((totalH + totalT) / denominatorTotal) * 100) : 0;
        html += '<div class="col"><div class="rekap-card" style="border-top:4px solid #f59e0b;background:#fffaf1"><div class="label">Terlambat</div><div class="value" style="color:#d97706">' +
            totalT + '<small style="font-size:.58rem;margin-left:5px;">(' + pctT + '%)</small></div></div></div>';
        html += '<div class="col"><div class="rekap-card" style="border-top:4px solid #2563eb;background:#f3f7ff"><div class="label">Kehadiran Total</div><div class="value" style="color:#2563eb">' +
            pctHadir + '%</div><div class="small text-secondary">H + T dibanding hari efektif</div></div></div>';
        container.innerHTML = html;
        document.getElementById('rekapDetailSiswa').classList.remove('d-none');

        var ctx = document.getElementById('rekapChartSiswa').getContext('2d');
        if (siswaChart) siswaChart.destroy();
        siswaChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['H', 'T', 'S', 'I', 'A'],
                datasets: [{ data: [rekap.H || 0, rekap.T || 0, rekap.S || 0, rekap.I || 0, rekap.A || 0],
                    backgroundColor: ['#10b981', '#f97316', '#06b6d4', '#ca8a04', '#dc2626'],
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom',
                        labels: { font: { size: 10, weight: '600' }, usePointStyle: true } } } }
        });

        siswaRekapFull = data;
        siswaRekapPage = 1;
        applyFilterRekapSiswa();
    }

    function setFilterRekapSiswa(status) { siswaFilterStatus = status; applyFilterRekapSiswa(); }
    function resetFilterRekapSiswa() { siswaFilterStatus = null; applyFilterRekapSiswa(); }

    function applyFilterRekapSiswa() {
        var keyword = document.getElementById('searchRekapSiswa')?.value.toLowerCase() || '';
        var pageSize = parseInt(document.getElementById('pageSizeRekapSiswa')?.value || 25);
        siswaRekapPageSize = pageSize;

        var filtered = siswaRekapFull || [];
        if (siswaFilterStatus) {
            filtered = filtered.filter(function(s) { return (s[siswaFilterStatus] || 0) > 0; });
        }
        if (keyword) {
            filtered = filtered.filter(function(s) { return (s.nama || '').toLowerCase().includes(keyword) || (s.nis || '').includes(keyword); });
        }

        var total = filtered.length;
        var totalPages = Math.ceil(total / pageSize) || 1;
        if (siswaRekapPage > totalPages) siswaRekapPage = totalPages;
        var start = (siswaRekapPage - 1) * pageSize;
        var end = Math.min(start + pageSize, total);
        var pageData = filtered.slice(start, end);
        renderRekapSiswaTable(pageData, total, start, end);
    }

    function renderRekapSiswaTable(data, total, start, end) {
        var tbody = document.getElementById('tbodyRekapSiswa');
        if (!tbody) return;
        var badge = document.getElementById('badgeJumlahSiswa');
        if (badge) badge.textContent = total + ' Siswa';

        tbody.innerHTML = '';
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-secondary py-3">Tidak ada data.</td></tr>';
        } else {
            data.forEach(function(s) {
                var fmt = function(v) { return v > 0 ? '<span class="fw-bold">' + v + '</span>' : '<span class="angka-nol">0</span>'; };
                var totalVal = s.total || 0;
                var persen = (s.hariEfektif || 0) > 0 ? Math.round(((s.H + (s.T || 0)) / s.hariEfektif) * 100) : 0;
                var badgeClass = persen >= 80 ? 'high' : (persen >= 50 ? 'medium' : 'low');
                tbody.innerHTML += '<tr>' +
                    '<td class="text-start fw-bold">' + (s.nama || 'N/A') + '<br/><small class="text-secondary">' + (s.nis || '-') + '</small></td>' +
                    '<td><span class="badge-kelas">' + (s.kelas || '-') + '</span></td>' +
                    '<td>' + fmt(s.H) + '</td><td>' + fmt(s.T) + '</td><td>' + fmt(s.S) + '</td><td>' + fmt(s.I) + '</td>' +
                    '<td>' + fmt(s.A) + '</td>' +
                    '<td><span class="badge-total">' + totalVal + '</span></td>' +
                    '<td>' + (s.hariEfektif || 0) + '</td>' +
                    '<td><span class="badge badge-persen ' + badgeClass + '">' + persen + '%</span></td>' +
                    '<td><span class="late-pill">' + (s.persenTerlambat || 0) + '%</span></td>' +
                    '</tr>';
            });
        }

        var info = document.getElementById('rekapPaginationInfoSiswa');
        if (info) { info.textContent = 'Menampilkan ' + (total === 0 ? 0 : start + 1) + '-' + end + ' dari ' + total; }
        var totalPages = Math.ceil(total / siswaRekapPageSize);
        var currentPageEl = document.getElementById('rekapCurrentPageSiswa');
        if (currentPageEl) currentPageEl.textContent = siswaRekapPage;
        var prevBtn = document.getElementById('prevRekapSiswa');
        var nextBtn = document.getElementById('nextRekapSiswa');
        if (prevBtn) prevBtn.disabled = (siswaRekapPage <= 1);
        if (nextBtn) nextBtn.disabled = (siswaRekapPage >= totalPages);
        var resetBtn = document.getElementById('btnResetFilterSiswa');
        if (resetBtn) resetBtn.classList.toggle('d-none', !siswaFilterStatus);
    }

    function changeRekapPageSiswa(delta) {
        var total = siswaRekapFull.length;
        var totalPages = Math.ceil(total / siswaRekapPageSize) || 1;
        var newPage = siswaRekapPage + delta;
        if (newPage < 1 || newPage > totalPages) return;
        siswaRekapPage = newPage;
        applyFilterRekapSiswa();
    }

    // ==============================================================
    // SISWA - CETAK & LAPORAN (OPTIMASI DENGAN CACHE)
    // ==============================================================
    function tampilkanLaporanSiswa() {
        var idKelas = document.getElementById('laporanKelasSiswa').value;
        var tglMulai = document.getElementById('laporanTglMulaiSiswa').value;
        var tglSelesai = document.getElementById('laporanTglSelesaiSiswa').value;
        var statuses = Array.from(document.querySelectorAll('.status-check-siswa:checked')).map(function(cb) { return cb.value; });
        if (!tglMulai || !tglSelesai) { alert('Pilih tanggal!'); return; }
        if (tglMulai > tglSelesai) { alert('Tanggal mulai tidak boleh melebihi tanggal selesai.'); return; }
        if (!statuses.length) { alert('Pilih status!'); return; }

        var cacheKey = 'laporan_siswa_bundle_' + idKelas + '_' + tglMulai + '_' + tglSelesai + '_' + statuses.slice().sort().join('');
        var cached = AppCache.get(cacheKey);
        if (cached) {
            siswaLaporanRekap = cached.rekap;
            siswaLaporanDetail = cached.detail;
            renderLaporanSiswaPreview(cached.rekap, cached.detail, statuses, cached.hariEfektif);
            showToast('Laporan dimuat dari cache.', 'info');
            return;
        }

        var preview = document.getElementById('laporanPreviewSiswa');
        preview.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><p class="text-secondary mt-2">Menyiapkan rekap & detail...</p></div>';
        var username = getCredential();

        google.script.run
            .withSuccessHandler(function(res) {
                if (!res.success) {
                    preview.innerHTML = '<div class="text-center text-danger py-5">' + (res.message || 'Gagal memuat laporan.') + '</div>';
                    return;
                }
                siswaLaporanRekap = res;
                siswaLaporanDetail = res;
                AppCache.set(cacheKey, {
                    rekap: res,
                    detail: res,
                    hariEfektif: res.hariEfektif
                });
                renderLaporanSiswaPreview(res, res, statuses, res.hariEfektif);
                showToast('Laporan siap.', 'success');
            })
            .withFailureHandler(function(err) {
                preview.innerHTML = '<div class="text-center text-danger py-5">Gagal memuat laporan: ' + (err?.message || 'Kesalahan koneksi') + '</div>';
            })
            .getLaporanSiswaBundle(idKelas, tglMulai, tglSelesai, statuses, username);
    }

    function renderLaporanSiswaPreview(rekap, detail, statuses, hariEfektif) {
        var preview = document.getElementById('laporanPreviewSiswa');
        var selectKelas = document.getElementById('laporanKelasSiswa');
        var namaKelas = selectKelas.options[selectKelas.selectedIndex].textContent;
        
        var filteredDetail = rekap.detailSiswa.filter(function(s) {
            if (!statuses || statuses.length === 0) return false;
            return statuses.some(function(st) { return (s[st] || 0) > 0; });
        });
        
        var rekapRows = filteredDetail.map(function(s) {
            var totalVal = s.total || 0;
            var persen = (s.hariEfektif || 0) > 0 ? Math.round(((s.H + (s.T || 0)) / s.hariEfektif) * 100) : 0;
            return '<tr><td class="text-start">' + s.nama + '</td><td>' + s.kelas + '</td><td>' + (s.H || 0) + '</td><td>' + (s.T || 0) + '</td><td>' + (s.S || 0) + '</td><td>' + (s.I || 0) + '</td><td>' + (s.A || 0) + '</td><td><strong>' + totalVal + '</strong></td><td>' + (s.hariEfektif || 0) + '</td><td>' + persen + '%</td><td>' + (s.persenTerlambat || 0) + '%</td><td></td></tr>';
        }).join('');
        
        var detailHeader = '<th>Nama</th><th>Kelas</th>';
        detail.dates.forEach(function(tgl) { var d = tgl.slice(8, 10); var m = tgl.slice(5, 7); detailHeader += '<th>' + d + '-' + m + '</th>'; });
        detailHeader += '<th>Total Status</th><th>Catatan Penanganan</th>';
        
        var detailRows = detail.detail.map(function(s) {
            var total = 0;
            var row = '<td class="text-start">' + s.nama + '</td><td>' + s.kelas + '</td>';
            var hasRelevant = false;
            detail.dates.forEach(function(tgl) {
                var st = s.hari[tgl] || '-';
                if (st === 'LIBUR') {
                    row += '<td><span class="badge badge-libur">LIBUR</span></td>';
                    hasRelevant = true;
                } else if (st !== '-' && statuses.indexOf(st) !== -1) {
                    total++;
                    hasRelevant = true;
                    row += '<td>' + st + '</td>';
                } else {
                    row += '<td>-</td>';
                }
            });
            if (!hasRelevant) return '';
            row += '<td><strong>' + total + '</strong></td><td></td>';
            return '<tr>' + row + '</tr>';
        }).filter(function(row) { return row !== ''; }).join('');

        if (!rekapRows && !detailRows) {
            preview.innerHTML = '<div class="text-center text-warning py-5"><i class="bi bi-exclamation-triangle display-4"></i><h5>Tidak ada data dengan status yang dipilih.</h5></div>';
            return;
        }

        var html = '<div class="bg-white p-3 border border-dark" id="laporanContentSiswa">' +
            '<div class="text-center border-bottom border-dark pb-2 mb-3">' +
            '<h2 class="fw-bold" id="legacyReportSchool">SISJAR — Sistem Informasi Mengajar</h2>' +
            '<h3 class="fw-bold">SISJAR — Sistem Informasi Mengajar</h3>' +
            '<p class="small" id="legacyReportAddress"></p>' +
            '</div>' +
            '<h5 class="text-center fw-bold text-decoration-underline">LAPORAN PRESENSI SISWA</h5>' +
            '<p class="small">Kelas: ' + namaKelas +
            ' | Periode: ' + document.getElementById('laporanTglMulaiSiswa').value + ' s/d ' + document.getElementById('laporanTglSelesaiSiswa').value +
            ' | Status: ' + statuses.join(', ') + ' | Hari efektif: ' + (hariEfektif || rekap.hariEfektif || 0) + ' | T tetap dihitung hadir</p>' +
            '<h6 class="fw-bold mt-3">A. Rekapitulasi</h6>' +
            '<table class="print-tabel"><thead><tr><th class="text-start">Nama</th><th>Kelas</th><th>H</th><th>T</th><th>S</th><th>I</th><th>A</th><th>Data</th><th>Hari Ef.</th><th>% Hadir</th><th>% T</th><th>Catatan Penanganan</th></tr></thead>' +
            '<tbody>' + (rekapRows || '<tr><td colspan="12" class="text-center">Tidak ada data</td></tr>') + '</tbody>' +
            '<tfoot><tr class="fw-bold"><td colspan="2" class="text-end">Total:</td>' +
            '<td>' + (rekap.rekap.H || 0) + '</td><td>' + (rekap.rekap.T || 0) + '</td><td>' + (rekap.rekap.S || 0) + '</td><td>' + (rekap.rekap.I || 0) + '</td>' +
            '<td>' + (rekap.rekap.A || 0) + '</td><td>' + rekap.total + '</td><td>' + (hariEfektif || rekap.hariEfektif || 0) + '</td><td>' +
            ((hariEfektif && rekap.detailSiswa && rekap.detailSiswa.length) ? Math.round((((rekap.rekap.H || 0) + (rekap.rekap.T || 0)) / (hariEfektif * rekap.detailSiswa.length)) * 100) + '%' : '-') +
            '</td><td>' +
            ((hariEfektif && rekap.detailSiswa && rekap.detailSiswa.length) ? Math.round(((rekap.rekap.T || 0) / (hariEfektif * rekap.detailSiswa.length)) * 100) + '%' : '-') +
            '</td><td></td>' +
            '</tr></tfoot>' +
            '</table>' +
            '<h6 class="fw-bold mt-3">B. Detail Harian</h6>' +
            '<table class="print-tabel" style="font-size:10px;"><thead><tr>' + detailHeader + '</tr></thead><tbody>' + (detailRows || '<tr><td colspan="' + (detail.dates.length + 4) + '" class="text-center">Tidak ada data</td></tr>') + '</tbody></table>' +
            '<div class="print-footer">' +
            '<div class="ttd"><p>Mengetahui,<br/>Kepala Sekolah</p><div class="nama">Dwi Septiani, S.T.,M.Pd.V.,Gr.</div></div>' +
            '<div class="ttd"><p></br>Kesiswaan,</p><div class="nama">Nur Maila Kusumaningrum, S.Pd.,Gr.</div></div>' +
            '<div class="ttd"><p></br>Petugas Piket,</p><div class="nama">' + (document.getElementById('namaPiketSiswa').value || '___________________') + '</div></div>' +
            '</div>' +
            '</div>';
        preview.innerHTML = html;
    }

    function cetakRekapSiswa() { printSiswa('rekap'); }
    function cetakDetailSiswa() { printSiswa('detail'); }

    function buildDetailPrintPages_(content) {
        var tables = content.querySelectorAll('table.print-tabel');
        var detailTable = tables[1];
        if (!detailTable) return content.outerHTML;

        var allHeaders = Array.from(detailTable.querySelectorAll('thead th'));
        var dateHeaders = allHeaders.slice(2, -2);
        var rows = Array.from(detailTable.querySelectorAll('tbody tr'));
        var chunkSize = 31;
        var totalPages = Math.max(1, Math.ceil(dateHeaders.length / chunkSize));
        var pages = [];

        // Header laporan saja. Rekapitulasi tidak diulang pada cetak DETAIL.
        var base = content.cloneNode(true);
        Array.from(base.querySelectorAll('table.print-tabel')).forEach(function(tbl) {
            tbl.remove();
        });
        Array.from(base.querySelectorAll('h6')).forEach(function(h6) {
            h6.remove();
        });
        base.querySelectorAll('.print-footer').forEach(function(el) {
            el.remove();
        });

        for (var startDate = 0; startDate < dateHeaders.length; startDate += chunkSize) {
            var endDate = Math.min(startDate + chunkSize, dateHeaders.length);
            var chunkDates = dateHeaders.slice(startDate, endDate);

            var page = base.cloneNode(true);

            var heading = document.createElement('h6');
            heading.className = 'fw-bold mt-2 mb-1';
            heading.textContent = 'B. Detail Harian';
            page.appendChild(heading);

            var rangeText = document.createElement('p');
            rangeText.className = 'detail-print-range';
            rangeText.innerHTML =
                'Rentang halaman: <strong>' +
                escapeHtmlDashboard(chunkDates[0].textContent) + ' s/d ' +
                escapeHtmlDashboard(chunkDates[chunkDates.length - 1].textContent) +
                '</strong> &nbsp;|&nbsp; Maksimal 31 tanggal per halaman.';
            page.appendChild(rangeText);

            var table = document.createElement('table');
            table.className = 'print-tabel detail-print-table';
            table.style.fontSize = '10px';

            var thead = document.createElement('thead');
            var trh = document.createElement('tr');
            trh.innerHTML = '<th>Nama</th><th>Kelas</th>';
            chunkDates.forEach(function(th) {
                trh.appendChild(th.cloneNode(true));
            });
            // Total Status dan Catatan tetap berada di ujung setiap halaman.
            var totalTh = allHeaders[allHeaders.length - 2];
            var noteTh = allHeaders[allHeaders.length - 1];
            if (totalTh) trh.appendChild(totalTh.cloneNode(true));
            if (noteTh) trh.appendChild(noteTh.cloneNode(true));
            thead.appendChild(trh);
            table.appendChild(thead);

            var tbody = document.createElement('tbody');
            rows.forEach(function(oldRow) {
                var oldCells = Array.from(oldRow.querySelectorAll('td'));
                if (oldCells.length < 2) return;

                var tr = document.createElement('tr');
                tr.appendChild(oldCells[0].cloneNode(true));
                tr.appendChild(oldCells[1].cloneNode(true));

                for (var j = startDate; j < endDate; j++) {
                    var cell = oldCells[j + 2];
                    if (cell) tr.appendChild(cell.cloneNode(true));
                }

                var totalCell = oldCells[oldCells.length - 2];
                var noteCell = oldCells[oldCells.length - 1];
                if (totalCell) tr.appendChild(totalCell.cloneNode(true));
                if (noteCell) tr.appendChild(noteCell.cloneNode(true));

                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            page.appendChild(table);

            var pageNo = document.createElement('div');
            pageNo.className = 'print-page-number';
            pageNo.textContent = 'Detail halaman ' + (pages.length + 1) + ' dari ' + totalPages;
            page.appendChild(pageNo);

            // Tanda tangan hanya pada halaman terakhir agar tidak menghabiskan ruang
            // pada setiap pecahan tabel.
            if (endDate === dateHeaders.length) {
                var footer = content.querySelector('.print-footer');
                if (footer) page.appendChild(footer.cloneNode(true));
            }

            pages.push(
                '<section class="print-page-detail">' + page.outerHTML + '</section>'
            );
        }

        return pages.join('');
    }

    // ==============================================================
    // SISJAR UNIVERSAL PRINT ENGINE
    // All PDF/print reports share one isolated, light-only print host.
    // ==============================================================
    function sisjarPrintHeader(identity) {
        var x = identity || {};
        var title = x.kopJudul || x.sekolah || 'SEKOLAH';
        var subtitle = x.kopSubjudul || '';
        var address = x.kopAlamat || x.alamat || '';
        return '<header class="sisjar-print-letterhead">' +
          '<div class="sisjar-print-school">' + gmEsc(title) + '</div>' +
          (subtitle ? '<div class="sisjar-print-subtitle">' + gmEsc(subtitle) + '</div>' : '') +
          (x.sekolah && x.sekolah !== title ? '<div class="sisjar-print-school-name">' + gmEsc(x.sekolah) + '</div>' : '') +
          (address ? '<div class="sisjar-print-address">' + gmEsc(address).replace(/\n/g, '<br>') + '</div>' : '') +
          '<div class="sisjar-print-rule"></div>' +
        '</header>';
    }

    function sisjarPrintDialog(defaultOrientation, onConfirm, config) {
        config = config || {};
        var old = document.getElementById('sisjarPrintOptions');
        if (old) old.remove();
        var modal = document.createElement('div');
        modal.id = 'sisjarPrintOptions';
        var modeField = config.attendanceMode
          ? '<label>Isi laporan absensi<select id="sisjarPrintReportMode"><option value="summary">Rekap saja (tanpa rincian siswa)</option><option value="daily" selected>Detail per hari + rekap</option></select></label>'
          : '';
        modal.innerHTML = '<div class="sisjar-print-dialog-backdrop"><section class="sisjar-print-dialog" role="dialog" aria-modal="true" aria-labelledby="sisjarPrintDialogTitle">' +
          '<div class="sisjar-print-dialog-head"><strong id="sisjarPrintDialogTitle">Pengaturan Cetak PDF</strong><button type="button" class="sisjar-print-dialog-close" data-close aria-label="Tutup">×</button></div>' +
          '<div class="sisjar-print-dialog-body"><label>Ukuran kertas<select id="sisjarPrintPaper"><option value="A4">A4 (210 × 297 mm)</option><option value="F4">F4 / Folio (215,9 × 330,2 mm)</option></select></label>' +
          '<label>Orientasi<select id="sisjarPrintOrientation"><option value="portrait">Potret</option><option value="landscape">Lanskap</option></select></label>' + modeField +
          '<p>Dokumen dicetak dengan latar putih, tabel terstruktur, dan tipografi yang dioptimalkan untuk keterbacaan.</p></div>' +
          '<div class="sisjar-print-dialog-actions"><button type="button" class="btn btn-light" data-close>Batal</button><button type="button" class="btn btn-primary" id="sisjarPrintConfirm"><i class="bi bi-printer me-1"></i> Lanjutkan Cetak</button></div>' +
          '</section></div>';
        document.body.appendChild(modal);
        var orientation = modal.querySelector('#sisjarPrintOrientation');
        orientation.value = defaultOrientation || 'portrait';
        modal.querySelectorAll('[data-close]').forEach(function(btn){btn.addEventListener('click',function(){modal.remove();});});
        modal.querySelector('.sisjar-print-dialog-backdrop').addEventListener('click',function(e){if(e.target===this)modal.remove();});
        modal.querySelector('#sisjarPrintConfirm').addEventListener('click',function(){
          var options={paper:modal.querySelector('#sisjarPrintPaper').value,orientation:orientation.value};
          var mode=modal.querySelector('#sisjarPrintReportMode');
          if(mode) options.reportMode=mode.value;
          modal.remove(); onConfirm(options);
        });
    }

    function sisjarPrintDocument(reportHTML, identity, options) {
        options = options || {};
        var paper = options.paper === 'F4' ? 'F4' : 'A4';
        var orientation = options.orientation === 'landscape' ? 'landscape' : 'portrait';
        var dimensions = paper === 'F4'
          ? (orientation === 'landscape' ? '330.2mm 215.9mm' : '215.9mm 330.2mm')
          : (orientation === 'landscape' ? '297mm 210mm' : '210mm 297mm');

        // Normalisasi konten cetak tanpa mengubah HTML laporan yang tampil di aplikasi.
        var reportStage = document.createElement('div');
        reportStage.innerHTML = String(reportHTML || '');
        var isLeadingBlank = function(node) {
          if (!node) return true;
          if (node.nodeType === Node.TEXT_NODE) return !String(node.textContent || '').trim();
          if (node.nodeType !== Node.ELEMENT_NODE) return true;
          if (node.matches('.gm-page-break,.page-break,[data-page-break]')) return true;
          var visibleText = String(node.textContent || '').replace(/\s+/g,'').trim();
          var visibleMedia = !!node.querySelector('table,img,svg,canvas,video');
          return !visibleText && !visibleMedia;
        };
        while (reportStage.firstChild && isLeadingBlank(reportStage.firstChild)) reportStage.removeChild(reportStage.firstChild);
        reportStage.querySelectorAll('.gm-page-break,.page-break,[data-page-break]').forEach(function(node){node.remove();});
        var firstBranch = reportStage;
        for (var depth = 0; depth < 8 && firstBranch.firstElementChild; depth++) {
          var firstNode = firstBranch.firstElementChild;
          firstNode.style.breakBefore = 'auto';
          firstNode.style.pageBreakBefore = 'auto';
          firstNode.classList.remove('gm-page-break','page-break');
          while (firstNode.firstChild && isLeadingBlank(firstNode.firstChild)) firstNode.removeChild(firstNode.firstChild);
          if (firstNode.firstElementChild) firstBranch = firstNode;
          else break;
        }

        // Print memakai dokumen iframe terpisah. CSS global aplikasi (termasuk aturan
        // print lama) tidak ikut masuk sehingga tidak dapat menyisipkan halaman kosong.
        var oldFrame = document.getElementById('sisjarPrintFrame');
        if (oldFrame) oldFrame.remove();
        var frame = document.createElement('iframe');
        frame.id = 'sisjarPrintFrame';
        frame.title = 'Dokumen cetak SISJAR';
        frame.setAttribute('aria-hidden','true');
        frame.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483647;background:#fff;';
        document.body.appendChild(frame);

        var printCSS = `
          @page { size: ${dimensions}; margin: 12mm; }
          * { box-sizing:border-box; }
          html,body { margin:0!important;padding:0!important;width:100%;min-height:0;height:auto;background:#fff!important;color:#172033!important;overflow:visible!important;font-family:Inter,Arial,Helvetica,sans-serif!important; }
          body { display:block!important; }
          .sisjar-print-document { display:block;width:100%;max-width:none;margin:0;padding:0;background:#fff;color:#172033;font:9pt/1.35 Inter,Arial,Helvetica,sans-serif; }
          .sisjar-print-letterhead { display:block;text-align:center;margin:0 0 6mm;padding:0 0 3mm;border-bottom:2px solid #23395d;break-inside:avoid;page-break-inside:avoid; }
          .sisjar-print-school {font-size:15pt;font-weight:800;line-height:1.15;letter-spacing:.25px;text-transform:uppercase}
          .sisjar-print-subtitle {font-size:9pt;font-weight:700;margin-top:1mm}
          .sisjar-print-school-name {font-size:9pt;font-weight:700;margin-top:1mm}
          .sisjar-print-address {font-size:8pt;line-height:1.3;margin-top:1mm;white-space:normal}
          .sisjar-print-rule {height:3px;border-top:1.5px solid #23395d;border-bottom:1px solid #23395d;margin-top:3mm}
          .sisjar-print-report-content {display:block;width:100%;overflow:visible;background:#fff;color:#172033;padding:0}
          .sisjar-print-footer {margin-top:6mm;padding-top:2mm;border-top:1px solid #aaa;font-size:8pt;text-align:center;color:#111}
          h1,h2,h3,h4,h5 {break-after:avoid;page-break-after:avoid}
          table {width:100%;max-width:100%;border-collapse:collapse;table-layout:auto;background:#fff;color:#172033;}
          thead {display:table-header-group} tfoot {display:table-footer-group}
          tr {break-inside:avoid;page-break-inside:avoid}
          th,td {border:1px solid #b8c4d3;vertical-align:middle}
          .gm-page-break,.page-break,[data-page-break] {display:none!important;break-before:auto!important;page-break-before:auto!important;height:0!important;margin:0!important;padding:0!important}
          .ar-report {display:block;position:static;width:100%;max-width:none;height:auto;min-height:0;margin:0;padding:0;overflow:visible;background:#fff;color:#172033;font-size:8.5pt;line-height:1.35}
          .ar-report-title {text-align:center;margin:0 0 6mm;padding:0 0 4mm;border-bottom:1px solid #cbd5e1;break-inside:avoid;page-break-inside:avoid}
          .ar-kicker {font-size:7pt;letter-spacing:1.5px;font-weight:800;color:#52627a}
          .ar-report-title h2 {font-size:15pt;line-height:1.2;margin:1.5mm 0;font-weight:800}
          .ar-teacher,.ar-period {font-size:9pt;margin-top:2mm}.ar-period{font-weight:700;margin-top:1mm}
          .ar-mode {font-size:7.5pt;color:#52627a;margin-top:1mm}
          .ar-section {margin:0 0 5mm;break-inside:auto;page-break-inside:auto}
          .ar-section-title {display:flex;align-items:center;gap:3mm;margin:0 0 2mm;break-after:avoid;page-break-after:avoid}
          .ar-section-title>span {display:inline-flex;align-items:center;justify-content:center;width:7mm;height:7mm;border:1px solid #9fb5d1;border-radius:2mm;font-size:8pt;font-weight:800}
          .ar-section-title h4 {font-size:10pt;margin:0;font-weight:800}.ar-section-title p{font-size:7.5pt;color:#64748b;margin:0}
          .ar-kpi-table {width:100%;table-layout:fixed;border-collapse:collapse;margin:0;font-size:8.5pt}
          .ar-kpi-table th,.ar-kpi-table td {padding:2.2mm 3mm;border:1px solid #cbd5e1}
          .ar-kpi-table th {width:27%;text-align:left;background:#f1f5f9;font-weight:700}.ar-kpi-table td{width:23%;text-align:center;font-size:10pt;font-weight:800}
          .ar-kpi-table .ar-good{color:#166534}.ar-kpi-table .ar-bad{color:#991b1b}.ar-kpi-table .ar-percent{color:#1d4ed8}
          .ar-table {width:100%;border-collapse:collapse;table-layout:auto;font-size:7.4pt;margin:0}
          .ar-table thead{display:table-header-group}.ar-table tr{break-inside:avoid;page-break-inside:avoid}
          .ar-table th{background:#eaf0f7;color:#172033;font-weight:800;text-align:center}
          .ar-table th,.ar-table td{padding:1.5mm 1.7mm;border:1px solid #b8c4d3;vertical-align:middle}
          .ar-group-table th:nth-child(3),.ar-group-table td:nth-child(3){text-align:left}
          .ar-center{text-align:center}.ar-percent{font-weight:800}.ar-empty{text-align:center;padding:4mm;color:#64748b}
          .ar-day-heading{display:flex;justify-content:space-between;align-items:center;margin:5mm 0 2mm;padding:2mm 3mm;background:#edf3fb;border-left:3px solid #426b9a;break-after:avoid;page-break-after:avoid}
          .ar-day-heading span{font-size:7pt;font-weight:800;letter-spacing:1px}.ar-day-heading strong{font-size:10pt}
          .ar-session{margin:0 0 4mm;break-inside:auto;page-break-inside:auto}
          .ar-session-head{display:flex;justify-content:space-between;align-items:center;gap:4mm;padding:2mm 3mm;border:1px solid #cbd5e1;border-bottom:0;break-after:avoid;page-break-after:avoid}
          .ar-session-head strong{font-size:9pt;margin-right:3mm}.ar-session-head span,.ar-session-meta{font-size:8pt;color:#475569}
          .ar-counts{display:flex;gap:4mm;flex-wrap:wrap;padding:1.5mm 3mm;border:1px solid #cbd5e1;border-top:0;border-bottom:0;font-size:7.5pt}.ar-counts b{margin-left:1mm}
          .ar-daily-table{font-size:8pt}.ar-daily-table th,.ar-daily-table td{padding:1.7mm 2.2mm}
          .ar-status{display:inline-block;padding:.7mm 2mm;border:1px solid #aab6c5;border-radius:2mm;font-weight:700}
          .ar-status.is-h{color:#166534}.ar-status.is-t{color:#92400e}.ar-status.is-s,.ar-status.is-i{color:#1d4ed8}.ar-status.is-a{color:#991b1b}
          .ar-method{margin:4mm 0;padding:2.5mm 3mm;border:1px solid #cbd5e1;background:#f8fafc;font-size:7.5pt}
          .ar-signatures{display:grid;grid-template-columns:1fr 1fr;gap:25mm;margin:8mm 8mm 0;break-inside:avoid;page-break-inside:avoid;text-align:center}
          .ar-signatures>div{display:flex;flex-direction:column;align-items:center}.ar-signatures span,.ar-signatures strong,.ar-signatures b,.ar-signatures small{display:block;font-size:8pt}
          .ar-sign-space{height:17mm}.ar-signatures b{text-decoration:underline}
          .ar-document-footer{margin-top:5mm;padding-top:2mm;border-top:1px solid #cbd5e1;text-align:center;font-size:7pt;color:#64748b}
          .ar-matrix-group{margin:0 0 5mm;break-inside:auto;page-break-inside:auto}
          .ar-matrix-table{table-layout:auto;width:100%}.ar-matrix-table th{white-space:normal;font-size:7pt}
          .ar-matrix-table .ar-matrix-no{width:8mm}.ar-matrix-table .ar-matrix-name{min-width:42mm;text-align:left}.ar-matrix-table .ar-matrix-date{min-width:17mm}
          .ar-matrix-date span,.ar-matrix-date small{display:block}.ar-matrix-date small{font-size:6.2pt;font-weight:500;margin-top:.5mm}
          .ar-matrix-table td{text-align:center}.ar-matrix-table .ar-matrix-student{text-align:left;font-weight:600;white-space:nowrap}
          .ar-matrix-status{font-weight:800;font-size:8pt}.ar-status-cell-h{color:#166534;background:#ecfdf3}.ar-status-cell-t{color:#1d4ed8;background:#eff6ff}
          .ar-status-cell-s{color:#92400e;background:#fffbeb}.ar-status-cell-i{color:#6d28d9;background:#f5f3ff}.ar-status-cell-a{color:#b91c1c;background:#fef2f2}
          .ar-matrix-legend{font-size:7pt;color:#64748b;padding:1.5mm 2mm;border:1px solid #dbe3ed;border-top:0}
          @media print { html,body{margin:0!important;padding:0!important;overflow:visible!important} }
        `;
        var doc = frame.contentDocument || frame.contentWindow.document;
        doc.open();
        doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Laporan SISJAR</title><style>' + printCSS + '</style></head><body>' +
          '<article class="sisjar-print-document">' + sisjarPrintHeader(identity) +
          '<section class="sisjar-print-report-content">' + reportStage.innerHTML + '</section>' +
          ((identity && identity.kopFooter) ? '<footer class="sisjar-print-footer">' + gmEsc(identity.kopFooter) + '</footer>' : '') +
          '</article></body></html>');
        doc.close();

        var cleaned = false;
        var cleanup = function(){
          if (cleaned) return;
          cleaned = true;
          setTimeout(function(){ if (frame.parentNode) frame.remove(); }, 300);
        };
        frame.contentWindow.addEventListener('afterprint', cleanup, { once:true });
        var fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
        fonts.then(function(){
          requestAnimationFrame(function(){
            requestAnimationFrame(function(){
              try { frame.contentWindow.focus(); frame.contentWindow.print(); }
              catch (err) { cleanup(); showToast('Dokumen gagal dibuka untuk dicetak: ' + (err.message || err), 'error'); }
            });
          });
        });
        // Fallback jika browser tidak mengirim event afterprint.
        setTimeout(cleanup, 120000);
    }

    function sisjarPrintWithIdentity(reportHTML, defaultOrientation) {
        gmCall('gmGetPrintIdentity',[getCredential()],function(result){
          if(!result || !result.success){showToast(result&&result.message?result.message:'Pengaturan identitas sekolah tidak dapat dimuat.','error');return;}
          sisjarPrintDialog(defaultOrientation,function(options){sisjarPrintDocument(reportHTML,result.data||{},options);});
        });
    }

    function printSiswa(mode) {
        var content = document.getElementById('laporanContentSiswa');
        if (!content) { alert('Klik Tampilkan dulu!'); return; }

        var area = document.getElementById('printAreaSiswa');
        var output = '';

        if (mode === 'rekap') {
            var clone = content.cloneNode(true);
            var dt = clone.querySelector('h6:nth-of-type(2)');
            var db = clone.querySelector('h6:nth-of-type(2) + table');
            if (dt) dt.style.display = 'none';
            if (db) db.style.display = 'none';
            output = clone.outerHTML;
        } else {
            output = buildDetailPrintPages_(content);
        }

        // Hasil yang sama dengan pratinjau halaman, dibungkus kop sekolah aktif.
        sisjarPrintWithIdentity(output, 'portrait');
    }

    function downloadExcelRekapSiswa() {
        if (!siswaLaporanRekap) { alert('Klik Tampilkan dulu!'); return; }
        var data = siswaLaporanRekap.detailSiswa.map(function(s) {
            var totalVal = s.total || 0;
            var persen = (s.hariEfektif || 0) > 0 ? Math.round(((s.H + (s.T || 0)) / s.hariEfektif) * 100) : 0;
            return { 'Nama': s.nama, 'Kelas': s.kelas, 'H': s.H || 0, 'T': s.T || 0, 'S': s.S || 0, 'I': s.I || 0, 'A': s.A || 0, 'Data Presensi': totalVal, 'Hari Efektif': s.hariEfektif || 0, '% Hadir Total': persen, '% Terlambat': s.persenTerlambat || 0 };
        });
        var ws = XLSX.utils.json_to_sheet(data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
        XLSX.writeFile(wb, 'Rekap_Siswa_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        showToast('Excel Rekap Siswa berhasil diunduh!', 'success');
    }

    function downloadExcelDetailSiswa() {
        if (!siswaLaporanDetail) { alert('Klik Tampilkan dulu!'); return; }
        var d = siswaLaporanDetail;
        var header = ['Nama', 'Kelas'];
        d.dates.forEach(function(t) { header.push(t.slice(8, 10) + '-' + t.slice(5, 7)); });
        header.push('Total');
        var rows = d.detail.map(function(s) {
            var row = [s.nama, s.kelas];
            var total = 0;
            d.dates.forEach(function(tgl) {
                var st = s.hari[tgl] || '-';
                if (st !== '-') total++;
                row.push(st);
            });
            row.push(total);
            return row;
        });
        var ws = XLSX.utils.aoa_to_sheet([header].concat(rows));
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Detail');
        XLSX.writeFile(wb, 'Detail_Siswa_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        showToast('Excel Detail Siswa berhasil diunduh!', 'success');
    }

    function toggleAllStatusSiswa(checked) {
        document.querySelectorAll('.status-check-siswa').forEach(function(cb) { cb.checked = checked; });
    }

     // ==============================================================
    // DASHBOARD
    // ==============================================================
    var dashChartSiswa = null;

    function loadDashboard(period) {
        var container = document.getElementById('dashboardContentSiswa');
        if (!container) return;
        var mulaiEl = document.getElementById('dashboardTanggalMulai');
        var selesaiEl = document.getElementById('dashboardTanggalSelesai');
        var mulai = mulaiEl ? mulaiEl.value : '';
        var selesai = selesaiEl ? selesaiEl.value : '';
        if (!mulai || !selesai) return;
        if (selesai < mulai) {
            showToast('Tanggal selesai tidak boleh sebelum tanggal mulai.', 'error');
            return;
        }
        container.innerHTML = `<div class="dashboard-loading"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Memuat ringkasan kehadiran...</div></div>`;
        google.script.run
            .withSuccessHandler(function(data) {
                if (data && data.success) renderDashboard(data, container);
                else container.innerHTML = '<div class="empty-dashboard"><i class="bi bi-exclamation-circle"></i><strong>Data tidak dapat dimuat</strong><span>' + (data?.message || 'Silakan login kembali.') + '</span></div>';
            })
            .withFailureHandler(function(err) {
                container.innerHTML = '<div class="empty-dashboard error"><i class="bi bi-wifi-off"></i><strong>Gagal memuat dashboard</strong><span>' + (err?.message || 'Terjadi kesalahan koneksi.') + '</span></div>';
            })
            .getDashboardData('custom', getCredential(), mulai, selesai);
    }

    function renderDashboard(data, container) {
        var statusMap = {
            H: { label:'Hadir', short:'H', cls:'present', icon:'bi-check-circle-fill' },
            T: { label:'Terlambat', short:'T', cls:'late', icon:'bi-clock-fill' },
            S: { label:'Sakit', short:'S', cls:'sick', icon:'bi-heart-pulse-fill' },
            I: { label:'Izin', short:'I', cls:'permit', icon:'bi-envelope-check-fill' },
            A: { label:'Alfa', short:'A', cls:'absent', icon:'bi-x-circle-fill' }
        };

        var total = Number(data.totalKehadiran || 0);
        var hadir = Number(data.statusCount?.H || 0);
        var terlambat = Number(data.statusCount?.T || 0);
        var sakit = Number(data.statusCount?.S || 0);
        var izin = Number(data.statusCount?.I || 0);
        var alfa = Number(data.statusCount?.A || 0);
        var efektifHadir = hadir + terlambat;
        var attendanceRate = total ? Math.round((efektifHadir / total) * 100) : 0;

        var periodLabel = 'Rentang tanggal';
        var statusPercent = data.statusPercent || {};
        var pct = function(key) { return Number(statusPercent[key] || 0).toFixed(1).replace('.0','') + '%'; };

        var cards = [
            {key:'H', value:hadir},
            {key:'T', value:terlambat},
            {key:'S', value:sakit},
            {key:'I', value:izin},
            {key:'A', value:alfa}
        ];

        var html = `
            <div class="dashboard-toolbar">
                <div>
                    <span class="toolbar-label">PERIODE</span>
                    <strong>${periodLabel}</strong>
                    <small>${formatDashboardDate(data.start)} — ${formatDashboardDate(data.end)}</small>
                </div>
                <div class="dashboard-date-controls">
                    <div class="dashboard-date-field"><label>Mulai</label><input type="date" id="dashboardTanggalMulai" value="${normalizeDate(data.start)}" /></div>
                    <div class="dashboard-date-field"><label>Selesai</label><input type="date" id="dashboardTanggalSelesai" value="${normalizeDate(data.end)}" /></div>
                    <button type="button" class="btn-dashboard-load" onclick="loadDashboard('custom')"><i class="bi bi-search me-1"></i>Tampilkan</button>
                </div>
            </div>

            <div class="dashboard-kpi-grid">
                ${cards.map(function(c) {
                    var s = statusMap[c.key];
                    return `
                        <div class="dashboard-kpi ${s.cls}">
                            <div class="kpi-icon"><i class="bi ${s.icon}"></i></div>
                            <div class="kpi-copy"><span>${s.label}</span><strong>${c.value}</strong><small class="dashboard-percent-line">${pct(c.key)}</small></div>
                            <div class="kpi-code">${s.short}</div>
                        </div>`;
                }).join('')}
            </div>

            <div class="dashboard-main-grid">
                <section class="dashboard-panel chart-panel">
                    <div class="panel-head">
                        <div>
                            <span class="panel-kicker">ANALISIS</span>
                            <h3>Komposisi Kehadiran</h3>
                        </div>
                        <span class="panel-total">${total} presensi</span>
                    </div>
                    <div class="chart-area">
                        <canvas id="dashChartSiswa"></canvas>
                        <div class="chart-center">
                            <strong>${attendanceRate}%</strong>
                            <span>Hadir efektif</span>
                        </div>
                    </div>
                    <div class="chart-legend">
                        ${cards.map(function(c) {
                            var s = statusMap[c.key];
                            return `<span><i class="legend-dot ${s.cls}"></i>${s.label} <b>${c.value}</b> <em class="legend-percent">(${pct(c.key)})</em></span>`;
                        }).join('')}
                    </div>
                </section>

                <section class="dashboard-panel">
                    <div class="panel-head">
                        <div>
                            <span class="panel-kicker">PERHATIAN</span>
                            <h3>Alfa Terbanyak</h3>
                        </div>
                        <div class="mini-icon danger"><i class="bi bi-person-exclamation"></i></div>
                    </div>
                    <div class="top-alfa-list">
                        ${data.topAlfa && data.topAlfa.length ? data.topAlfa.map(function(s, i) {
                            return `
                                <div class="alfa-row">
                                    <div class="rank">${i + 1}</div>
                                    <div class="alfa-name"><strong>${escapeHtmlDashboard(s.nama)}</strong><span>Akumulasi alfa</span></div>
                                    <div class="alfa-count">${s.alfa}<small>x</small></div>
                                </div>`;
                        }).join('') : `
                            <div class="empty-dashboard compact">
                                <i class="bi bi-emoji-smile"></i>
                                <strong>Belum ada data alfa</strong>
                                <span>Siswa tanpa alfa akan tetap tampil bersih di sini.</span>
                            </div>`}
                    </div>
                </section>
            </div>

            <div class="dashboard-note">
                <i class="bi bi-info-circle-fill"></i>
                <span><strong>Catatan:</strong> status <b>Terlambat</b> tetap dihitung sebagai kehadiran.</span>
            </div>`;

        container.innerHTML = html;

        var canvas = document.getElementById('dashChartSiswa');
        if (!canvas) return;

        var ctx = canvas.getContext('2d');
        if (dashChartSiswa) dashChartSiswa.destroy();

        var chartColors = ['#2563eb', '#f59e0b', '#38bdf8', '#8b5cf6', '#ef4444'];
        dashChartSiswa = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: cards.map(function(c){ return statusMap[c.key].label; }),
                datasets: [{
                    data: cards.map(function(c){ return c.value; }),
                    backgroundColor: chartColors,
                    borderColor: '#ffffff',
                    borderWidth: 4,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '76%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0f2f70',
                        padding: 12,
                        callbacks: {
                            label: function(ctx) { return ' ' + ctx.label + ': ' + ctx.raw + ' (' + pct(cards[ctx.dataIndex].key) + ')'; }
                        }
                    }
                }
            }
        });
    }

    function setDashboardPeriod(period) {
        var select = document.getElementById('dashboardPeriodSiswa');
        if (select) select.value = period;
        loadDashboard(period);
    }

    function formatDashboardDate(value) {
        if (!value) return '-';
        var parts = String(value).split('-');
        if (parts.length !== 3) return value;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function escapeHtmlDashboard(value) {
        return String(value ?? '').replace(/[&<>"']/g, function(ch) {
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
        });
    }

    function renderDashboardContent(container) {
        var d = new Date();
        var day = d.getDay();
        var diff = day === 0 ? -6 : 1 - day;
        var monday = new Date(d); monday.setDate(d.getDate() + diff);
        var friday = new Date(monday); friday.setDate(monday.getDate() + 4);
        var iso = function(x) { return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
        container.innerHTML = `<div id="dashboardContentSiswa"><div class="dashboard-loading"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Menyiapkan dashboard...</div></div></div>`;
        // Input tanggal dibuat oleh renderDashboard setelah data pertama diterima.
        google.script.run.withSuccessHandler(function(data) {
            if (data && data.success) renderDashboard(data, document.getElementById('dashboardContentSiswa'));
        }).getDashboardData('custom', getCredential(), iso(monday), iso(friday));
    }

    // DATA KELAS
    // ==============================================================
    function renderTerlambatContent(container) {
        container.innerHTML = `
            <div class="late-hero">
                <div class="late-hero-icon"><i class="bi bi-alarm-fill"></i></div>
                <div>
                    <span>MONITORING CEPAT</span>
                    <h3>Rekap Siswa Terlambat</h3>
                    <p>Pilih rentang tanggal untuk melihat semua siswa berstatus <strong>T</strong> dari seluruh kelas.</p>
                </div>
            </div>

            <section class="card-flat p-3 mb-3">
                <div class="row g-2 align-items-end">
                    <div class="col-md-2">
                        <label class="form-label">Mulai</label>
                        <input type="date" id="terlambatTanggalMulai" class="form-control">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Selesai</label>
                        <input type="date" id="terlambatTanggalSelesai" class="form-control">
                    </div>
                    <div class="col-md-2">
                        <label class="form-label">Kelas</label>
                        <select id="terlambatKelas" class="form-select"><option value="SEMUA">Semua Kelas</option></select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Cari Siswa</label>
                        <input type="text" id="terlambatKeyword" class="form-control" placeholder="Nama / NIS / kelas">
                    </div>
                    <div class="col-md-3">
                        <div class="d-flex gap-2">
                            <button class="btn btn-primary flex-fill" onclick="loadTerlambatSiswa()">
                                <i class="bi bi-search me-1"></i> Tampilkan
                            </button>
                            <button class="btn btn-outline-success" onclick="exportTerlambatExcel()" title="Export Excel">
                                <i class="bi bi-file-earmark-excel-fill"></i>
                            </button>
                            <button class="btn btn-outline-dark" onclick="cetakTerlambat()" title="Cetak / PDF">
                                <i class="bi bi-printer-fill"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="late-filter-hint mt-2">
                    <i class="bi bi-info-circle-fill"></i>
                    Semua kelas dipilih otomatis. Gunakan filter kelas bila ingin melihat kelas tertentu.
                </div>
            </section>

            <section class="card-flat p-3">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
                    <div>
                        <div class="section-title mb-1"><i class="bi bi-clock-history"></i><span>Daftar Terlambat</span></div>
                        <div id="terlambatSummary" class="small text-secondary">Belum ada pencarian.</div>
                    </div>
                    <span class="late-count-badge" id="jumlahTerlambat">0 siswa</span>
                </div>
                <div id="terlambatResult"></div>
            </section>

            <div id="printAreaTerlambat" class="print-area-extra"></div>
        `;

        var now = new Date();
        var iso = now.toISOString().slice(0,10);
        document.getElementById('terlambatTanggalMulai').value = iso;
        document.getElementById('terlambatTanggalSelesai').value = iso;

        loadKelasDropdown('terlambatKelas');

        var kw = document.getElementById('terlambatKeyword');
        if (kw) kw.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') loadTerlambatSiswa();
        });

        loadTerlambatSiswa();
    }

    function getTerlambatFilter_() {
        return {
            mulai: document.getElementById('terlambatTanggalMulai')?.value || '',
            selesai: document.getElementById('terlambatTanggalSelesai')?.value || '',
            kelas: document.getElementById('terlambatKelas')?.value || 'SEMUA',
            keyword: document.getElementById('terlambatKeyword')?.value || ''
        };
    }

    var _terlambatDataV8 = [];

    function loadTerlambatSiswa() {
        var f = getTerlambatFilter_();
        var result = document.getElementById('terlambatResult');
        if (!result || !f.mulai || !f.selesai) return;

        if (f.selesai < f.mulai) {
            alert('Tanggal selesai tidak boleh sebelum tanggal mulai.');
            return;
        }

        result.innerHTML = '<div class="text-center py-5 text-secondary"><div class="spinner-border text-primary"></div><p class="mt-2">Membaca data terlambat...</p></div>';

        google.script.run
            .withSuccessHandler(function(res) {
                if (!res.success) {
                    result.innerHTML = '<div class="empty-dashboard error"><i class="bi bi-shield-x"></i><strong>Akses ditolak</strong><span>' + (res.message || '') + '</span></div>';
                    return;
                }

                _terlambatDataV8 = res.data || [];
                var count = _terlambatDataV8.length;
                var badge = document.getElementById('jumlahTerlambat');
                var summary = document.getElementById('terlambatSummary');

                if (badge) badge.textContent = (res.totalSiswa || count) + ' siswa';
                if (summary) {
                    summary.textContent =
                        'Periode ' + formatHolidayDate(res.tglMulai) + ' — ' + formatHolidayDate(res.tglSelesai) +
                        ' • Hari efektif: ' + (res.hariEfektif || 0) +
                        ' • Siswa terlambat: ' + (res.totalSiswa || _terlambatDataV8.length) +
                        ' • Total kejadian terlambat: ' + (res.total || 0);
                }

                if (!count) {
                    result.innerHTML = '<div class="empty-late"><i class="bi bi-emoji-smile"></i><strong>Tidak ada data terlambat</strong><span>Tidak ditemukan siswa berstatus T pada filter tersebut.</span></div>';
                    return;
                }

                result.innerHTML =
                    '<div class="table-responsive"><table class="table align-middle table-late mb-0">' +
                    '<thead><tr><th>#</th><th>Siswa</th><th>Kelas</th><th>Jumlah Terlambat</th><th>Tanggal Terlambat</th></tr></thead><tbody>' +
                    _terlambatDataV8.map(function(s, i) {
                        var tanggalList = (s.tanggalTerlambat || []).map(function(t){ return formatHolidayDate(t); }).join(', ');
                        return '<tr>' +
                            '<td>' + (i + 1) + '</td>' +
                            '<td><strong>' + escapeHtmlDashboard(s.nama) + '</strong><br><small>' + escapeHtmlDashboard(s.nis || '-') + '</small></td>' +
                            '<td><span class="badge-kelas">' + escapeHtmlDashboard(s.kelas) + '</span></td>' +
                            '<td><span class="late-count-badge"><i class="bi bi-clock-fill me-1"></i>' + Number(s.jumlahTerlambat || 0) + '×</span></td>' +
                            '<td><small>' + escapeHtmlDashboard(tanggalList || '-') + '</small></td>' +
                            '</tr>';
                    }).join('') +
                    '</tbody></table></div>';
            })
            .withFailureHandler(function(err) {
                result.innerHTML = '<div class="empty-dashboard error"><i class="bi bi-wifi-off"></i><strong>Gagal memuat data</strong><span>' + (err?.message || 'Kesalahan koneksi') + '</span></div>';
            })
            .getTerlambatSiswa(f.mulai, f.selesai, f.kelas, f.keyword, getCredential());
    }

    function exportTerlambatExcel() {
        if (!_terlambatDataV8.length) {
            alert('Tampilkan data terlambat terlebih dahulu.');
            return;
        }

        var f = getTerlambatFilter_();
        var rows = _terlambatDataV8.map(function(s, i) {
            return {
                'No': i + 1,
                'NIS': s.nis || '',
                'Nama Siswa': s.nama,
                'Kelas': s.kelas,
                'Jumlah Terlambat': s.jumlahTerlambat || 0,
                'Tanggal Terlambat': (s.tanggalTerlambat || []).join(', ')
            };
        });

        var ws = XLSX.utils.json_to_sheet(rows);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Terlambat');

        var filename = 'Rekap_Terlambat_' + f.mulai + '_s.d_' + f.selesai + '.xlsx';
        XLSX.writeFile(wb, filename);
    }

    function cetakTerlambat() {
        if (!_terlambatDataV8.length) {
            alert('Tampilkan data terlambat terlebih dahulu.');
            return;
        }

        var f = getTerlambatFilter_();
        var print = document.getElementById('printAreaTerlambat');
        if (!print) return;

        var rows = _terlambatDataV8.map(function(s, i) {
            return '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td class="text-start">' + escapeHtmlDashboard(s.nama) + '</td>' +
                '<td>' + escapeHtmlDashboard(s.kelas) + '</td>' +
                '<td><strong>' + Number(s.jumlahTerlambat || 0) + '×</strong></td>' +
                '<td>' + escapeHtmlDashboard((s.tanggalTerlambat || []).map(function(t){ return formatHolidayDate(t); }).join(', ')) + '</td>' +
                '</tr>';
        }).join('');

        print.innerHTML =
            '<div class="print-late-document">' +
            '<h2>REKAP SISWA TERLAMBAT</h2>' +
            '<p>Periode: <strong>' + formatHolidayDate(f.mulai) + ' s/d ' + formatHolidayDate(f.selesai) + '</strong></p>' +
            '<p>Kelas: <strong>' + escapeHtmlDashboard(f.kelas === 'SEMUA' ? 'Semua Kelas' : f.kelas) + '</strong></p>' +
            '<table class="print-tabel">' +
            '<thead><tr><th>No</th><th>Nama Siswa</th><th>Kelas</th><th>Jumlah</th><th>Tanggal Terlambat</th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table>' +
            '</div>';

        sisjarPrintWithIdentity(print.innerHTML, 'portrait');
        print.style.display = 'none';
        print.innerHTML = '';
    }

    function renderLiburContent(container) {
        container.innerHTML = `
            <div class="holiday-hero">
                <div class="holiday-hero-icon"><i class="bi bi-calendar2-range-fill"></i></div>
                <div>
                    <span>KALENDER AKADEMIK</span>
                    <h3>Hari efektif sekolah</h3>
                    <p>Sabtu dan Minggu otomatis <strong>LIBUR</strong>. Untuk libur panjang, cukup masukkan satu rentang tanggal.</p>
                </div>
            </div>

            <div class="holiday-grid">
                <section class="card-flat holiday-form-card">
                    <div class="section-title"><i class="bi bi-calendar-plus-fill"></i><span>Tambah Rentang Libur</span></div>
                    <div class="alert alert-info small mb-3">
                        <i class="bi bi-info-circle-fill me-1"></i>
                        Contoh: Libur Semester 22 Desember–3 Januari cukup disimpan sekali.
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Tanggal Mulai</label>
                        <input type="date" id="liburTanggalMulai" class="form-control">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Tanggal Selesai</label>
                        <input type="date" id="liburTanggalSelesai" class="form-control">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Keterangan</label>
                        <input type="text" id="liburKeterangan" class="form-control" placeholder="Contoh: Libur Semester">
                    </div>
                    <button class="btn btn-primary w-100" id="btnTambahLibur" onclick="tambahHariLibur()">
                        <i class="bi bi-calendar2-plus me-1"></i> Simpan Rentang Libur
                    </button>
                </section>

                <section class="card-flat holiday-list-card">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div class="section-title mb-0"><i class="bi bi-calendar3-week-fill"></i><span>Daftar Libur</span></div>
                        <button class="btn btn-sm btn-outline-primary" onclick="loadKalenderLibur()"><i class="bi bi-arrow-clockwise"></i></button>
                    </div>
                    <div class="weekend-note"><i class="bi bi-calendar2-week-fill"></i> Sabtu & Minggu otomatis LIBUR dan tidak perlu disetting.</div>
                    <div id="holidayList" class="holiday-list"><div class="text-center text-secondary py-4">Memuat...</div></div>
                </section>
            </div>
        `;
        loadKalenderLibur();
    }

    function loadKalenderLibur() {
        var list = document.getElementById('holidayList');
        if (!list) return;

        gmCall('getKalenderLibur', [getCredential()], function(res) {
            if (!res || !res.success) {
                list.innerHTML = '<div class="text-danger small">' + ((res && res.message) || 'Akses ditolak.') + '</div>';
                return;
            }
            if (!res.data || !res.data.length) {
                list.innerHTML = '<div class="empty-holiday"><i class="bi bi-calendar-heart"></i><strong>Belum ada libur tambahan</strong><span>Tambahkan rentang libur selain Sabtu/Minggu.</span></div>';
                return;
            }
            var isAdmin = ['superadmin','admin_sekolah'].includes(String(getUserRoleLocal() || '').toLowerCase());
            list.innerHTML = res.data.map(function(item) {
                var sameDay = item.start === item.end;
                var period = sameDay ? formatHolidayDate(item.start) : formatHolidayDate(item.start) + ' — ' + formatHolidayDate(item.end);
                return '<div class="holiday-row">' +
                    '<div class="holiday-date"><strong>' + period + '</strong><span>' + escapeHtmlDashboard(item.keterangan) + '</span></div>' +
                    (isAdmin ? '<button class="btn btn-sm btn-outline-danger" onclick="hapusHariLibur(\'' + String(item.id).replace(/'/g, "\\'") + '\')"><i class="bi bi-trash3"></i></button>' : '') +
                    '</div>';
            }).join('');
        }, function(err) {
            list.innerHTML = '<div class="text-danger small">Gagal memuat kalender: ' + ((err && err.message) || 'Kesalahan') + '</div>';
        });
    }

    function getUserRoleLocal() {
        return localStorage.getItem('ePiket_role') || '';
    }

    function formatHolidayDate(value) {
        if (!value) return '-';
        var d = new Date(value + 'T00:00:00');
        if (isNaN(d.getTime())) return value;
        return new Intl.DateTimeFormat('id-ID', {day:'2-digit', month:'short', year:'numeric'}).format(d);
    }

    function tambahHariLibur() {
        var tanggalMulai = document.getElementById('liburTanggalMulai')?.value;
        var tanggalSelesai = document.getElementById('liburTanggalSelesai')?.value;
        var keterangan = document.getElementById('liburKeterangan')?.value.trim();

        if (!tanggalMulai || !tanggalSelesai || !keterangan) {
            alert('Tanggal mulai, tanggal selesai, dan keterangan wajib diisi.');
            return;
        }

        if (tanggalSelesai < tanggalMulai) {
            alert('Tanggal selesai tidak boleh sebelum tanggal mulai.');
            return;
        }

        var btn = document.getElementById('btnTambahLibur');
        btn.disabled = true;

        gmCall('tambahLiburRange', [tanggalMulai, tanggalSelesai, keterangan, getCredential()], function(res) {
            btn.disabled = false;
            showToast(res && res.message || 'Selesai.', res && res.success ? 'success' : 'error');
            if (res && res.success) {
                document.getElementById('liburTanggalMulai').value = '';
                document.getElementById('liburTanggalSelesai').value = '';
                document.getElementById('liburKeterangan').value = '';
                if (typeof AppCache !== 'undefined') AppCache.clear();
                loadKalenderLibur();
            }
        }, function(err) {
            btn.disabled = false;
            showToast('Gagal: ' + ((err && err.message) || 'Kesalahan'), 'error');
        });
    }

    function hapusHariLibur(id) {
        if (!confirm('Hapus seluruh rentang libur ini? Tanggal tersebut akan kembali menjadi hari efektif.')) return;

        gmCall('hapusLibur', [id, getCredential()], function(res) {
            showToast(res && res.message || 'Selesai.', res && res.success ? 'success' : 'error');
            if (res && res.success) {
                if (typeof AppCache !== 'undefined') AppCache.clear();
                loadKalenderLibur();
            }
        }, function(err) {
            showToast('Gagal menghapus hari libur: ' + ((err && err.message) || 'Kesalahan'), 'error');
        });
    }


    // ==============================================================
    // DATA SISWA - KELOLA & HAPUS SISWA BESERTA RIWAYAT PRESENSI
    // ==============================================================
    function renderDataSiswaContent(container) {
        container.innerHTML =
            '<div class="card-flat p-3 mb-3">' +
            '<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">' +
                '<div><h6 class="fw-bold mb-1"><i class="bi bi-people-fill me-1"></i> Data Siswa</h6>' +
                '<small class="text-secondary">Tambah, ubah, cari, atau hapus data siswa. Mengubah nama tidak memutus riwayat presensi.</small></div>' +
                '<div class="d-flex gap-2 flex-wrap">' +
                    '<button class="btn btn-primary btn-sm" onclick="bukaFormSiswa()"><i class="bi bi-person-plus-fill me-1"></i> Tambah Siswa</button>' +
                    '<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-2 d-flex align-items-center"><i class="bi bi-exclamation-triangle-fill me-1"></i>&nbsp; Hapus = hapus seluruh presensi</span>' +
                '</div>' +
            '</div>' +
            '<div class="row g-2 align-items-end">' +
                '<div class="col-md-5"><label class="form-label">Kelas</label><select id="dataSiswaKelas" class="form-select"><option value="SEMUA">Semua Kelas</option></select></div>' +
                '<div class="col-md-5"><label class="form-label">Cari Siswa</label><div class="filter-input-icon"><i class="bi bi-search"></i><input id="dataSiswaKeyword" class="form-control" placeholder="Nama atau NIS..." oninput="filterDataSiswaUI()"></div></div>' +
                '<div class="col-md-2"><button class="btn btn-outline-primary w-100" onclick="loadDataSiswa()"><i class="bi bi-arrow-clockwise me-1"></i> Muat</button></div>' +
            '</div>' +
            '</div>' +
            '<div class="card-flat p-3">' +
                '<div class="d-flex justify-content-between align-items-center mb-3"><h6 class="fw-bold mb-0"><i class="bi bi-table me-1"></i> Daftar Siswa</h6><span id="dataSiswaCount" class="badge-total">0 siswa</span></div>' +
                '<div id="dataSiswaTable" class="table-responsive"><div class="text-center text-secondary py-5">Memuat data...</div></div>' +
            '</div>';

        loadKelasDataSiswaDropdown();
    }

    var dataSiswaMaster = [];

    function loadKelasDataSiswaDropdown() {
        var sel = document.getElementById('dataSiswaKelas');
        if (!sel) return;
        google.script.run
            .withSuccessHandler(function(data) {
                sel.innerHTML = '<option value="SEMUA">Semua Kelas</option>';
                (Array.isArray(data) ? data : []).forEach(function(k) {
                    if (!k || !k.id || !k.nama) return;
                    var opt = document.createElement('option');
                    opt.value = String(k.id);
                    opt.textContent = String(k.nama);
                    sel.appendChild(opt);
                });
                loadDataSiswa();
            })
            .withFailureHandler(function(err) {
                var box = document.getElementById('dataSiswaTable');
                if (box) box.innerHTML = '<div class="text-danger py-4">Gagal memuat kelas: ' + escapeHtmlDashboard(err.message || 'Kesalahan') + '</div>';
            })
            .getKelasDropdown();
    }

    function loadDataSiswa() {
        var box = document.getElementById('dataSiswaTable');
        var kelas = document.getElementById('dataSiswaKelas');
        if (!box || !kelas) return;
        box.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><div class="small text-secondary mt-2">Memuat data siswa...</div></div>';
        google.script.run
            .withSuccessHandler(function(res) {
                if (!res || res.success === false) {
                    box.innerHTML = '<div class="text-danger py-4">' + escapeHtmlDashboard((res && res.message) || 'Gagal memuat data siswa.') + '</div>';
                    return;
                }
                dataSiswaMaster = res.data || [];
                renderDataSiswaTable();
            })
            .withFailureHandler(function(err) {
                box.innerHTML = '<div class="text-danger py-4">Gagal memuat data siswa: ' + escapeHtmlDashboard(err.message || 'Kesalahan') + '</div>';
            })
            .getDaftarSiswa(kelas.value, getCredential());
    }

    function filterDataSiswaUI() {
        renderDataSiswaTable();
    }

    function renderDataSiswaTable() {
        var box = document.getElementById('dataSiswaTable');
        var count = document.getElementById('dataSiswaCount');
        if (!box) return;
        var keywordEl = document.getElementById('dataSiswaKeyword');
        var keyword = (keywordEl ? keywordEl.value : '').toLowerCase().trim();
        var data = (dataSiswaMaster || []).filter(function(s) {
            if (!keyword) return true;
            return String(s.nama || '').toLowerCase().includes(keyword) || String(s.nis || '').toLowerCase().includes(keyword);
        });
        if (count) count.textContent = data.length + ' siswa';
        if (!data.length) {
            box.innerHTML = '<div class="text-center text-secondary py-5"><i class="bi bi-person-x display-6"></i><div class="fw-bold mt-2">Tidak ada data siswa.</div></div>';
            return;
        }
        var html = '<table class="table table-sm table-hover align-middle mb-0"><thead><tr><th style="width:55px;">No</th><th>NIS</th><th>Nama Siswa</th><th>Kelas</th><th>Email Orang Tua</th><th style="width:90px;">Aksi</th></tr></thead><tbody>';
        data.forEach(function(s, i) {
            html += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td><strong>' + escapeHtmlDashboard(s.nis) + '</strong></td>' +
                '<td>' + escapeHtmlDashboard(s.nama) + '</td>' +
                '<td><span class="badge-kelas">' + escapeHtmlDashboard(s.kelas) + '</span></td>' +
                '<td class="small text-secondary">' + escapeHtmlDashboard(s.emailOrtu || '-') + '</td>' +
                '<td class="text-nowrap">' +
                '<button class="btn btn-sm btn-outline-primary me-1" title="Ubah data siswa" onclick="editDataSiswa(\'' + escapeHtmlDashboard(s.id) + '\')"><i class="bi bi-pencil-fill"></i></button>' +
                '<button class="btn btn-sm btn-outline-danger" title="Hapus siswa" onclick="hapusDataSiswa(\'' + escapeHtmlDashboard(s.id) + '\', \'' + escapeHtmlDashboard(s.nama).replace(/'/g, '&#39;') + '\')"><i class="bi bi-trash3-fill"></i></button>' +
                '</td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        box.innerHTML = html;
    }

    function bukaFormSiswa(siswa) {
        if (String(getUserRoleLocal() || '').toLowerCase() !== 'superadmin') {
            showToast('Akses ditolak. Hanya Superadmin yang dapat mengelola data siswa.', 'error');
            return;
        }

        var isEdit = !!siswa;
        var modalId = 'modalFormDataSiswa';
        var oldModal = document.getElementById(modalId);
        if (oldModal) oldModal.remove();

        var modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<div><h5 class="modal-title"><i class="bi ' + (isEdit ? 'bi-pencil-square' : 'bi-person-plus-fill') + ' me-2 text-primary"></i>' + (isEdit ? 'Ubah Data Siswa' : 'Tambah Data Siswa') + '</h5>' +
                        '<small class="text-secondary">' + (isEdit ? 'ID siswa tetap dipertahankan agar seluruh riwayat presensi tetap terhubung.' : 'Isi identitas siswa baru dengan benar.') + '</small></div>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<input type="hidden" id="formSiswaId" value="' + (isEdit ? escapeHtmlDashboard(siswa.id) : '') + '">' +
                        '<div class="mb-3"><label class="form-label">NIS</label><input id="formSiswaNis" class="form-control" maxlength="30" value="' + (isEdit ? escapeHtmlDashboard(siswa.nis) : '') + '" placeholder="Contoh: 12345"></div>' +
                        '<div class="mb-3"><label class="form-label">Nama Siswa</label><input id="formSiswaNama" class="form-control" maxlength="120" value="' + (isEdit ? escapeHtmlDashboard(siswa.nama) : '') + '" placeholder="Nama lengkap siswa"></div>' +
                        '<div class="mb-3"><label class="form-label">Kelas</label><select id="formSiswaKelas" class="form-select"><option value="">Memuat kelas...</option></select></div>' +
                        '<div><label class="form-label">Email Orang Tua <span class="text-secondary fw-normal">(opsional)</span></label><input id="formSiswaEmail" type="email" class="form-control" maxlength="150" value="' + (isEdit ? escapeHtmlDashboard(siswa.emailOrtu || '') : '') + '" placeholder="orangtua@email.com"></div>' +
                        (isEdit ? '<div class="alert alert-info small mt-3 mb-0"><i class="bi bi-info-circle me-1"></i> Anda boleh mengubah NIS, nama, kelas, atau email. <strong>ID Siswa tidak diubah</strong>, sehingga presensi lama tetap aman.</div>' : '') +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Batal</button>' +
                        '<button type="button" class="btn btn-primary" id="btnSimpanDataSiswa" onclick="simpanFormSiswa()"><i class="bi bi-check-circle-fill me-1"></i>' + (isEdit ? 'Simpan Perubahan' : 'Tambah Siswa') + '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);

        var bsModal = new bootstrap.Modal(modal);
        bsModal.show();

        google.script.run
            .withSuccessHandler(function(data) {
                var sel = document.getElementById('formSiswaKelas');
                if (!sel) return;
                sel.innerHTML = '<option value="">Pilih Kelas</option>';
                (Array.isArray(data) ? data : []).forEach(function(k) {
                    if (!k || !k.id || !k.nama) return;
                    var opt = document.createElement('option');
                    opt.value = String(k.id);
                    opt.textContent = String(k.nama);
                    if (isEdit && String(k.id) === String(siswa.idKelas)) opt.selected = true;
                    sel.appendChild(opt);
                });
            })
            .withFailureHandler(function(err) {
                var sel = document.getElementById('formSiswaKelas');
                if (sel) sel.innerHTML = '<option value="">Gagal memuat kelas</option>';
                showToast('Gagal memuat daftar kelas: ' + (err.message || 'Kesalahan'), 'error');
            })
            .getKelasDropdown();

        modal.addEventListener('hidden.bs.modal', function() {
            modal.remove();
        }, { once: true });
    }

    function editDataSiswa(idSiswa) {
        var siswa = (dataSiswaMaster || []).find(function(s) { return String(s.id) === String(idSiswa); });
        if (!siswa) {
            showToast('Data siswa tidak ditemukan. Silakan muat ulang.', 'error');
            return;
        }
        bukaFormSiswa(siswa);
    }

    function simpanFormSiswa() {
        var id = (document.getElementById('formSiswaId')?.value || '').trim();
        var nis = (document.getElementById('formSiswaNis')?.value || '').trim();
        var nama = (document.getElementById('formSiswaNama')?.value || '').trim();
        var idKelas = (document.getElementById('formSiswaKelas')?.value || '').trim();
        var emailOrtu = (document.getElementById('formSiswaEmail')?.value || '').trim();

        if (!nis || !nama || !idKelas) {
            showToast('NIS, Nama Siswa, dan Kelas wajib diisi.', 'error');
            return;
        }

        var btn = document.getElementById('btnSimpanDataSiswa');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Menyimpan...';
        }

        var success = function(res) {
            if (!res || res.success === false) {
                showToast((res && res.message) || 'Gagal menyimpan data siswa.', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i>' + (id ? 'Simpan Perubahan' : 'Tambah Siswa');
                }
                return;
            }

            showToast(res.message, 'success');
            var modal = document.getElementById('modalFormDataSiswa');
            if (modal) {
                var bs = bootstrap.Modal.getInstance(modal);
                if (bs) bs.hide();
            }

            AppCache.clear();
            loadDataSiswa();

            var kelasInput = document.getElementById('selectKelasSiswa');
            if (kelasInput) AppCache.clear('siswa_' + idKelas);
        };

        var failure = function(err) {
            showToast('Gagal menyimpan data siswa: ' + (err.message || 'Kesalahan'), 'error');
            if (btn) btn.disabled = false;
        };

        if (id) {
            google.script.run.withSuccessHandler(success).withFailureHandler(failure)
                .updateSiswa({ id:id, nis:nis, nama:nama, idKelas:idKelas, emailOrtu:emailOrtu }, getCredential());
        } else {
            google.script.run.withSuccessHandler(success).withFailureHandler(failure)
                .tambahSiswa({ nis:nis, nama:nama, idKelas:idKelas, emailOrtu:emailOrtu }, getCredential());
        }
    }

    function hapusDataSiswa(idSiswa, namaSiswa) {
        if (String(getUserRoleLocal() || '').toLowerCase() !== 'superadmin') {
            showToast('Akses ditolak. Hanya Superadmin yang dapat menghapus siswa.', 'error');
            return;
        }
        var pesan = 'Yakin ingin menghapus siswa berikut?\n\n' + namaSiswa + '\n\nPERHATIAN: seluruh data kehadiran siswa ini yang sudah tersimpan juga akan dihapus dan tidak dapat dikembalikan.';
        if (!confirm(pesan)) return;
        var btns = document.querySelectorAll('#dataSiswaTable button');
        btns.forEach(function(b) { b.disabled = true; });
        google.script.run
            .withSuccessHandler(function(res) {
                if (!res || res.success === false) {
                    showToast((res && res.message) || 'Gagal menghapus siswa.', 'error');
                    btns.forEach(function(b) { b.disabled = false; });
                    return;
                }
                showToast(res.message, 'success');
                dataSiswaMaster = dataSiswaMaster.filter(function(s) { return String(s.id) !== String(idSiswa); });
                renderDataSiswaTable();
                AppCache.clear();
                // Jika kelas yang sedang dipilih adalah kelas siswa yang dihapus,
                // refresh input presensi juga agar siswa langsung hilang dari tabel.
                var kelasInput = document.getElementById('selectKelasSiswa');
                if (kelasInput && String(kelasInput.value) === String(res.idKelas || '')) {
                    AppCache.clear('siswa_' + kelasInput.value);
                }
            })
            .withFailureHandler(function(err) {
                showToast('Gagal menghapus siswa: ' + (err.message || 'Kesalahan'), 'error');
                btns.forEach(function(b) { b.disabled = false; });
            })
            .hapusSiswa(idSiswa, getCredential());
    }

    function renderKelasContent(container) {
        container.innerHTML =
            '<div class="card-flat p-3 mb-3">' +
            '<h6 class="fw-bold"><i class="bi bi-plus-circle"></i> Tambah Kelas Baru</h6>' +
            '<div class="row g-2">' +
            '<div class="col-md-6"><input type="text" id="inputKelasBaru" class="form-control" placeholder="Contoh: X-RPL-3" /></div>' +
            '<div class="col-md-3"><button onclick="tambahKelasBaru()" class="btn btn-success"><i class="bi bi-plus-circle"></i> Tambah</button></div>' +
            '</div>' +
            '<div id="kelasAlert" class="alert d-none mt-2 py-1 small"></div>' +
            '</div>' +
            '<div class="card-flat p-3">' +
            '<h6 class="fw-bold"><i class="bi bi-table"></i> Daftar Kelas</h6>' +
            '<div id="daftarKelasContainer" style="max-height:400px; overflow-y:auto;"></div>' +
            '</div>';
        loadDaftarKelas();
    }

    function loadDaftarKelas() {
        var container = document.getElementById('daftarKelasContainer');
        if (!container) return;
        container.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"></div></div>';
        var username = getCredential();
        google.script.run
            .withSuccessHandler(function(data) {
                if (data.success === false) { container.innerHTML = '<div class="text-danger">' + data.message + '</div>'; return; }
                if (!data.length) { container.innerHTML = '<div class="text-secondary text-center py-3">Belum ada data kelas.</div>'; return; }
                var html = '<table class="table table-sm table-striped"><thead><tr><th>ID</th><th>Nama Kelas</th><th style="width:150px;">Aksi</th></tr></thead><tbody>';
                data.forEach(function(k) {
                    html += '<tr><td><code>' + k.id + '</code></td><td><span id="kelas-nama-' + k.id + '">' + k.nama + '</span></td>' +
                        '<td><button class="btn btn-sm btn-outline-primary" onclick="editKelasData(\'' + k.id + '\')"><i class="bi bi-pencil"></i></button>' +
                        '<button class="btn btn-sm btn-outline-danger" onclick="hapusKelasData(\'' + k.id + '\')"><i class="bi bi-trash"></i></button></td></tr>';
                });
                html += '</tbody></table>';
                container.innerHTML = html;
            })
            .getDaftarKelas(username);
    }

    function tambahKelasBaru() {
        var input = document.getElementById('inputKelasBaru');
        var nama = input.value.trim();
        var alertBox = document.getElementById('kelasAlert');
        if (!nama) { alertBox.className = 'alert alert-warning d-block py-1 small'; alertBox.textContent = 'Nama kelas tidak boleh kosong!'; return; }
        alertBox.className = 'sisjar-upload-alert d-none';
        var username = getCredential();
        google.script.run
            .withSuccessHandler(function(res) {
                if (res.success) { 
                    alertBox.className = 'sisjar-upload-alert d-block'; 
                    alertBox.textContent = res.message; 
                    input.value = ''; 
                    loadDaftarKelas(); 
                    refreshAllKelasDropdowns(); 
                    showToast(res.message, 'success'); 
                    AppCache.clear();
                } else { 
                    alertBox.className = 'sisjar-upload-alert d-block'; 
                    alertBox.textContent = res.message; 
                    showToast(res.message, 'error'); 
                }
            })
            .tambahKelas(nama, username);
    }

    function editKelasData(idKelas) {
        var span = document.getElementById('kelas-nama-' + idKelas);
        if (!span) return;
        var namaLama = span.textContent;
        var namaBaru = prompt('Edit nama kelas:', namaLama);
        if (namaBaru === null || namaBaru.trim() === namaLama) return;
        if (!namaBaru.trim()) { alert('Nama tidak boleh kosong!'); return; }
        var username = getCredential();
        google.script.run
            .withSuccessHandler(function(res) { 
                if (res.success) { 
                    showToast(res.message, 'success'); 
                    loadDaftarKelas(); 
                    refreshAllKelasDropdowns(); 
                    AppCache.clear();
                } else showToast(res.message, 'error'); 
            })
            .editKelas(idKelas, namaBaru.trim(), username);
    }

    function hapusKelasData(idKelas) {
        if (!confirm('Yakin ingin menghapus kelas ini?\nData siswa dan jadwal yang menggunakan kelas ini tidak akan terhapus, tapi ID kelas akan menjadi tidak valid.')) return;
        var username = getCredential();
        google.script.run
            .withSuccessHandler(function(res) { 
                showToast(res.message, res.success ? 'success' : 'error'); 
                if (res.success) { 
                    loadDaftarKelas(); 
                    refreshAllKelasDropdowns(); 
                    AppCache.clear();
                } 
            })
            .hapusKelas(idKelas, username);
    }

    function refreshAllKelasDropdowns() {
        var dropdownIds = ['selectKelasSiswa', 'rekapKelasSiswa', 'laporanKelasSiswa'];
        dropdownIds.forEach(function(id) {
            var sel = document.getElementById(id);
            if (sel) loadKelasDropdown(id);
        });
    }

    // ==============================================================
    // UPLOAD
    // ==============================================================
    function downloadTemplate(type) {
        // Kode harus sama persis dengan kolom schools.code di Master Sekolah.
        // Dua kode awal SISJAR multi-sekolah ditampilkan sebagai contoh.
        var data = [
            { Kode_Sekolah: 'IC', NIS: '1001', Nama_Siswa: 'Budi Santoso', Kelas: 'X-1', Email_Ortu: 'ortu@email.com' },
            { Kode_Sekolah: 'SMAN20', NIS: '2001', Nama_Siswa: 'Siti Aminah', Kelas: 'X-1', Email_Ortu: 'ortu@email.com' }
        ];
        var wb = XLSX.utils.book_new();
        var ws = XLSX.utils.json_to_sheet(data);
        ws['!cols'] = [{wch:16},{wch:16},{wch:28},{wch:18},{wch:30}];
        XLSX.utils.book_append_sheet(wb, ws, 'Data_Siswa');
        var master = XLSX.utils.aoa_to_sheet([
            ['Kode_Sekolah','Nama_Sekolah','Keterangan'],
            ['IC','SMA Islamic Centre','Gunakan untuk siswa SMA Islamic Centre'],
            ['SMAN20','SMAN 20 Kabupaten Tangerang','Gunakan untuk siswa SMAN 20 Kabupaten Tangerang']
        ]);
        master['!cols'] = [{wch:18},{wch:34},{wch:44}];
        XLSX.utils.book_append_sheet(wb, master, 'Referensi_Kode');
        XLSX.writeFile(wb, 'Template_Siswa_Multi_Sekolah.xlsx');
        showToast('Template diunduh. Isi Kode_Sekolah pada setiap baris sesuai sekolah siswa.', 'info');
    }

    function updateSiswaFileName(input) {
        var el = document.getElementById('siswaFileName');
        if (!el) return;
        if (input && input.files && input.files.length) {
            el.textContent = input.files[0].name;
            el.title = input.files[0].name;
        } else {
            el.textContent = 'Belum ada file dipilih';
            el.removeAttribute('title');
        }
    }

    async function processUpload(type) {
        var input = document.getElementById('fileSiswa');
        var alertBox = document.getElementById('uploadAlertSiswa');
        if (!input || !input.files || !input.files.length) {
            alertBox.className = 'sisjar-upload-alert d-block';
            alertBox.textContent = 'Pilih file Excel terlebih dahulu.';
            return;
        }
        alertBox.className = 'sisjar-upload-alert d-none';
        try {
            showLoading('Memeriksa file dan kode sekolah...');
            var buffer = await input.files[0].arrayBuffer();
            var wb = XLSX.read(buffer, { type: 'array' });
            var ws = wb.Sheets[wb.SheetNames[0]];
            var raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
            var parsed = [], invalid = [];
            raw.forEach(function(row, idx) {
                var n = {};
                Object.keys(row).forEach(function(key) {
                    n[String(key).trim().toLowerCase().replace(/[\\s_-]+/g, '')] = row[key];
                });
                var schoolCode = String(n.kodesekolah || n.schoolcode || '').trim().toUpperCase();
                var nis = String(n.nis || '').trim();
                var nama = String(n.namasiswa || n.nama || n.name || '').trim();
                var kelas = String(n.kelas || n.class || '').trim();
                var email = String(n.emailortu || n.email || '').trim();
                if (!schoolCode || !nis || !nama || !kelas) {
                    invalid.push('Baris ' + (idx + 2) + ': Kode_Sekolah, NIS, Nama_Siswa, dan Kelas wajib diisi.');
                    return;
                }
                parsed.push({ school_code:schoolCode, nis:nis, nama:nama, kelas:kelas, email:email });
            });
            if (invalid.length) throw new Error(invalid.slice(0,5).join(' ') + (invalid.length>5?' Dan '+(invalid.length-5)+' baris lain tidak valid.':''));
            if (!parsed.length) throw new Error('Excel tidak berisi data siswa yang valid.');
            var result = await window.SISJAR_API.call('importDataSiswa', [parsed, getCredential()]);
            hideLoading();
            if (!result || !result.success) throw new Error(result && result.message || 'Import siswa gagal.');
            alertBox.className = 'sisjar-upload-alert d-block alert alert-success';
            alertBox.textContent = result.message || (result.count + ' siswa berhasil diimpor.');
            showToast(alertBox.textContent, 'success');
            input.value = '';
            updateSiswaFileName(input);
            if (typeof loadSiswaList === 'function') loadSiswaList();
            if (typeof AppCache !== 'undefined') AppCache.clear();
        } catch (err) {
            hideLoading();
            alertBox.className = 'sisjar-upload-alert d-block';
            alertBox.textContent = err.message || 'Gagal membaca atau mengimpor file.';
            showToast(alertBox.textContent, 'error');
        }
    }

    // BACKUP & RESTORE
    // ==============================================================
    function renderBackupContent(container) {
        var isSuper = String(getUserRoleLocal() || '').toLowerCase() === 'superadmin';
        if (!isSuper) {
            container.innerHTML = '<div class="empty-dashboard error"><i class="bi bi-shield-x"></i><strong>Akses ditolak</strong><span>Backup & Restore hanya tersedia untuk Superadmin.</span></div>';
            return;
        }
        container.innerHTML = `
            <div class="late-hero">
                <div class="late-hero-icon"><i class="bi bi-database-fill-gear"></i></div>
                <div><span>KEAMANAN DATA</span><h3>Backup & Restore</h3><p>Buat file backup seluruh database Sistem Informasi Mengajar dan gunakan kembali untuk memulihkan data.</p></div>
            </div>
            <div class="backup-grid">
                <section class="backup-card">
                    <div class="backup-icon blue"><i class="bi bi-download"></i></div>
                    <h5 class="fw-bold">Buat Backup</h5>
                    <p class="small text-secondary">Menyimpan Users, kelas, siswa, presensi, kalender libur, log login, dan antrean email.</p>
                    <button class="btn btn-primary" onclick="buatBackupDatabase()"><i class="bi bi-cloud-download-fill me-1"></i> Buat & Download Backup</button>
                </section>
                <section class="backup-card">
                    <div class="backup-icon orange"><i class="bi bi-upload"></i></div>
                    <h5 class="fw-bold">Restore Backup</h5>
                    <p class="small text-secondary">Pilih file JSON backup Sistem Informasi Mengajar yang sebelumnya dibuat. Data database akan diganti dengan isi backup.</p>
                    <input type="file" id="restoreBackupFile" class="form-control mb-2" accept=".json,application/json">
                    <button class="btn btn-warning" onclick="restoreBackupDatabase()"><i class="bi bi-database-up me-1"></i> Pulihkan Database</button>
                </section>
            </div>
            <div class="alert alert-warning mt-3 small"><i class="bi bi-exclamation-triangle-fill me-1"></i><strong>Perhatian:</strong> Restore akan mengganti isi sheet database yang ada dengan isi file backup. Pastikan file berasal dari Sistem Informasi Mengajar dan gunakan backup terbaru.</div>`;
    }

    function buatBackupDatabase() {
        showLoading('Membuat backup database...');
        google.script.run.withSuccessHandler(function(res) {
            hideLoading();
            if (!res || !res.success) { showToast((res && res.message) || 'Gagal membuat backup.', 'error'); return; }
            var blob = new Blob([JSON.stringify(res.backup)], {type:'application/json;charset=utf-8'});
            var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = res.filename || 'Backup_SISJAR.json'; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
            showToast('Backup berhasil dibuat dan diunduh.', 'success');
        }).withFailureHandler(function(err){ hideLoading(); showToast('Gagal membuat backup: ' + (err.message || 'Kesalahan'), 'error'); }).getDatabaseBackup(getCredential());
    }

    function restoreBackupDatabase() {
        var input = document.getElementById('restoreBackupFile');
        if (!input || !input.files || !input.files[0]) { showToast('Pilih file backup JSON terlebih dahulu.', 'error'); return; }
        if (!confirm('Yakin ingin RESTORE database dari file ini? Data yang sedang ada akan diganti dengan isi backup.')) return;
        var file = input.files[0];
        var reader = new FileReader();
        showLoading('Mempersiapkan restore...');
        reader.onload = function(e) {
            try {
                var text = String(e.target.result || '');
                var obj = JSON.parse(text);
                if (!obj || obj.format !== 'SISJAR-BACKUP') throw new Error('Bukan file backup SISJAR.');
                var base64 = btoa(unescape(encodeURIComponent(text)));
                google.script.run.withSuccessHandler(function(res){
                    hideLoading();
                    showToast((res && res.message) || 'Restore selesai.', res && res.success ? 'success' : 'error');
                    if (res && res.success) { AppCache.clear(); setTimeout(function(){ switchMenu('dashboard'); }, 700); }
                }).withFailureHandler(function(err){ hideLoading(); showToast('Gagal restore: ' + (err.message || 'Kesalahan'), 'error'); }).restoreDatabaseBackup(base64, getCredential());
            } catch(err) { hideLoading(); showToast('File backup tidak valid: ' + err.message, 'error'); }
        };
        reader.readAsText(file);
    }


    // ==============================================================
    // GURU MAPEL UI
    // ==============================================================
    var gmState={schedules:[],attendance:null,grades:null,journals:[],report:null};
    function gmEsc(v){return escapeHtmlDashboard(v==null?'':v);}
    function gmJam(v){
      if(v===null || v===undefined || v==='') return '';
      var s=String(v).trim();
      if(!s) return '';

      // Format waktu normal: HH:mm atau HH:mm:ss.
      var t=s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
      if(t) return String(t[1]).padStart(2,'0')+':'+t[2];

      // Format Date dari Google Sheets, termasuk tanggal dasar 30 Dec 1899.
      t=s.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
      if(t) return String(t[1]).padStart(2,'0')+':'+t[2];

      // ISO Date / Date string sebagai fallback terakhir.
      var d=new Date(s);
      if(!isNaN(d.getTime())){
        var hh=String(d.getHours()).padStart(2,'0');
        var mm=String(d.getMinutes()).padStart(2,'0');
        return hh+':'+mm;
      }
      return s;
    }
    function gmToday(){var d=new Date();var y=d.getFullYear();var m=String(d.getMonth()+1).padStart(2,'0');var day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day;}
    function normalizeDate(v){var value=String(v==null?'':v).trim();return /^\d{4}-\d{2}-\d{2}$/.test(value)?value:gmToday();}
    function gmDateKey(d){var x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
    function gmDate(v){
        if(!v)return '-';
        var s=String(v).trim();
        var m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if(m)return m[3]+'/'+m[2]+'/'+m[1];
        var d=new Date(s.indexOf('T')>=0?s:s+'T00:00:00');
        return isNaN(d)?s:d.toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'});
    }
    var sisjarBusyCount=0;
    function showLoading(text){var o=document.getElementById('loading-overlay');if(!o)return;document.getElementById('loading-text').textContent=text||'Memuat data...';o.classList.add('active');document.body.classList.add('sisjar-busy');}
    function hideLoading(){if(sisjarBusyCount>0)return;var o=document.getElementById('loading-overlay');if(o)o.classList.remove('active');document.body.classList.remove('sisjar-busy');}
    function gmCall(name,args,ok,fail){
      sisjarBusyCount++;
      showLoading('Memuat '+String(name).replace(/^gm/,'').replace(/([A-Z])/g,' $1').trim()+'...');
      var done=function(){sisjarBusyCount=Math.max(0,sisjarBusyCount-1);if(sisjarBusyCount===0)hideLoading();};
      var runner=google.script.run.withSuccessHandler(function(res){done();if(res&&res.success===false&&/Sesi tidak valid|Sesi kedaluwarsa/i.test(String(res.message||''))){showToast('Sesi perlu diverifikasi ulang. Memeriksa sesi...','error');checkLocalSession();return;}if(ok)ok(res);}).withFailureHandler(function(e){done();(fail||function(err){showToast(err.message||'Terjadi kesalahan.','error');})(e);});
      runner[name].apply(runner,args||[]);
    }
    function renderGuruDashboard(c){
      c.innerHTML='<div class="gm-ui gm-page-hero"><span class="toolbar-label">RUANG KERJA GURU</span><h3>Mengajar dengan Hati, Membangun Masa Depan</h3><p>Kelola jadwal, absensi, jurnal, dan penilaian dalam satu sistem terintegrasi. pilih kelas yang aktif, isi absensi, lanjutkan jurnal, lalu kelola penilaian.</p></div><div class="gm-kpi-grid"><div class="gm-kpi"><span>Jadwal Hari Ini</span><strong id="gmDashCount">0</strong></div><div class="gm-kpi"><span>Kelas yang Diajar</span><strong id="gmDashClass">0</strong></div><div class="gm-kpi"><span>Penilaian</span><strong id="gmDashAssessment">0</strong></div><div class="gm-kpi"><span>Status Sistem</span><strong style="font-size:1rem">Aktif</strong></div></div><div class="card-flat"><div class="d-flex justify-content-between align-items-center mb-3"><div><h6 class="fw-bold mb-1">Jadwal Hari Ini</h6><small class="text-secondary">Hanya jadwal milik akun guru yang sedang login.</small></div><button class="btn btn-primary btn-sm" onclick="switchMenu(&#39;guruAbsensi&#39;)"><i class="bi bi-person-check me-1"></i> Isi Absensi</button></div><div id="gmDashSchedules" class="row g-3"><div class="gm-empty">Memuat jadwal...</div></div></div>';
      gmCall('gmGetMySchedules',[getCredential(),gmToday()],function(res){if(!res.success){document.getElementById('gmDashSchedules').innerHTML='<div class="gm-empty text-danger">'+gmEsc(res.message)+'</div>';return;}gmState.schedules=res.data||[];document.getElementById('gmDashCount').textContent=gmState.schedules.length;var cls=new Set(gmState.schedules.map(x=>x.idKelas));document.getElementById('gmDashClass').textContent=cls.size;document.getElementById('gmDashSchedules').innerHTML=gmState.schedules.length?gmState.schedules.map(function(x){return '<div class="col-md-6 col-xl-4"><div class="gm-schedule-card"><div class="time">JAM KE-'+gmEsc(x.jamKe)+' • '+gmJam(x.jamMulai)+'–'+gmJam(x.jamSelesai)+'</div><h5>'+gmEsc(x.mapel)+'</h5><small>'+gmEsc(x.kelas)+'</small><div class="gm-schedule-actions"><button class="btn btn-primary" onclick="openGuruAttendance(\''+gmEsc(x.id)+'\')"><i class="bi bi-check2-circle me-1"></i>Absensi</button><button class="btn btn-outline-secondary" onclick="openGuruJournal(\''+gmEsc(x.id)+'\')"><i class="bi bi-journal-text me-1"></i>Jurnal</button></div></div></div>';}).join(''):'<div class="gm-empty">Tidak ada jadwal hari ini.</div>';},function(e){document.getElementById('gmDashSchedules').innerHTML='<div class="gm-empty text-danger">'+gmEsc(e.message)+'</div>';});
      gmCall('gmGetAssessmentTypes',[getCredential(),'',''],function(r){if(r.success)document.getElementById('gmDashAssessment').textContent=(r.data||[]).length;});
    }

    function renderGuruAgenda(c){
      c.innerHTML='<div class="gm-page-hero"><span>AGENDA PRIBADI GURU</span><h3>Agenda Tidak Mengajar</h3><p>Pilih jadwal atau kelas yang tidak dilaksanakan. Jadwal lain pada hari yang sama tetap berjalan normal.</p></div>'+
      '<div class="card-flat"><div class="section-title"><i class="bi bi-calendar2-minus-fill"></i><span>Tambah Pengecualian Jadwal</span></div>'+
      '<div class="row g-3"><div class="col-md-4"><label class="form-label">Tanggal</label><input id="gmAgendaDate" type="date" class="form-control" value="'+normalizeDate(gmToday())+'"></div>'+
      '<div class="col-md-8"><label class="form-label">Jadwal / Kelas yang tidak dilaksanakan</label><select id="gmAgendaSchedule" class="form-select"><option value="">Memuat jadwal...</option></select></div>'+
      '<div class="col-12"><label class="form-label">Alasan / Kegiatan</label><input id="gmAgendaReason" class="form-control" maxlength="180" placeholder="Contoh: Mengikuti pelatihan kurikulum di luar sekolah"></div></div>'+
      '<div class="d-flex justify-content-end mt-3"><button class="btn btn-primary" onclick="saveGuruAgenda()"><i class="bi bi-check2-circle"></i> Simpan Agenda</button></div>'+
      '<div class="alert alert-info small mt-3 mb-0"><i class="bi bi-info-circle me-1"></i> Pengecualian berlaku hanya untuk satu jadwal pada tanggal yang dipilih. Jika pagi tidak mengajar tetapi siang tetap mengajar, cukup pilih jadwal pagi saja. Presensi yang sudah tersimpan tidak dapat dikecualikan.</div></div>'+
      '<div class="card-flat"><div class="d-flex justify-content-between align-items-center gap-2 mb-3"><h6 class="fw-bold mb-0">Agenda Saya</h6><button class="btn btn-outline-secondary btn-sm" onclick="loadGuruAgenda()"><i class="bi bi-arrow-clockwise"></i></button></div><div id="gmAgendaList"><div class="gm-empty">Memuat agenda...</div></div></div>';
      gmCall('gmGetMySchedules',[getCredential()],function(r){
        var sel=document.getElementById('gmAgendaSchedule');if(!sel)return;
        if(!r.success){sel.innerHTML='<option value="">'+gmEsc(r.message)+'</option>';return;}
        sel.innerHTML='<option value="">Pilih jadwal...</option>'+(r.data||[]).map(x=>'<option value="'+gmEsc(x.id)+'">'+gmEsc(x.hari)+' • Jam '+gmEsc(x.jamKe)+' • '+gmEsc(x.kelas)+' • '+gmEsc(x.mapel)+(x.jamMulai?' ('+gmEsc(x.jamMulai)+'–'+gmEsc(x.jamSelesai)+')':'')+'</option>').join('');
      });
      loadGuruAgenda();
    }
    function loadGuruAgenda(){
      var box=document.getElementById('gmAgendaList');if(!box)return;
      gmCall('gmGetMyScheduleExceptions',['',''],function(r){
        if(!r||!r.success){box.innerHTML='<div class="gm-empty text-danger">'+gmEsc(r&&r.message||'Agenda gagal dimuat.')+'</div>';return;}
        if(!(r.data||[]).length){box.innerHTML='<div class="gm-empty">Belum ada agenda tidak mengajar.</div>';return;}
        box.innerHTML='<div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>Tanggal</th><th>Jadwal</th><th>Alasan</th><th>Aksi</th></tr></thead><tbody>'+
          r.data.map(x=>'<tr><td>'+gmEsc(formatHolidayDate(x.tanggal))+'</td><td><strong>'+gmEsc(x.kelas)+'</strong><br><small>'+gmEsc(x.mapel)+' • '+gmEsc(x.hari)+' • Jam '+gmEsc(x.jamKe)+'</small></td><td>'+gmEsc(x.reason)+'</td><td><button class="btn btn-sm btn-icon btn-outline-danger" title="Hapus agenda" aria-label="Hapus agenda" onclick="deleteGuruAgenda(\''+gmEsc(x.id)+'\')"><i class="bi bi-trash3"></i></button></td></tr>').join('')+
          '</tbody></table></div>';
      });
    }
    function saveGuruAgenda(){
      var payload={tanggal:document.getElementById('gmAgendaDate')?.value||'',schedule_id:document.getElementById('gmAgendaSchedule')?.value||'',reason:document.getElementById('gmAgendaReason')?.value.trim()||''};
      if(!payload.tanggal||!payload.schedule_id||!payload.reason)return showToast('Tanggal, jadwal, dan alasan wajib diisi.','error');
      showLoading('Menyimpan agenda tidak mengajar...');
      gmCall('gmSaveMyScheduleException',[payload],function(r){hideLoading();showToast(r&&r.message||'Selesai.',r&&r.success?'success':'error');if(r&&r.success){document.getElementById('gmAgendaReason').value='';loadGuruAgenda();}},function(e){hideLoading();showToast(e&&e.message||'Gagal menyimpan agenda.','error');});
    }
    function deleteGuruAgenda(id){
      if(!confirm('Hapus agenda ini? Jadwal akan kembali dihitung sebagai kesempatan mengajar.'))return;
      gmCall('gmDeleteMyScheduleException',[id],function(r){showToast(r&&r.message||'Selesai.',r&&r.success?'success':'error');if(r&&r.success)loadGuruAgenda();});
    }

    function renderGuruSchedule(c){c.innerHTML='<div class="gm-page-hero"><span>JADWAL MENGAJAR</span><h3>Jadwal Anda</h3><p>Jika satu kelas diajar lebih dari satu hari, setiap hari tampil sebagai jadwal tersendiri.</p></div><div class="card-flat"><div class="gm-actionbar mb-3"><div class="grow"><label class="form-label">Tanggal</label><input id="gmJadwalTanggal" type="date" class="form-control" value="'+normalizeDate(gmToday())+'"></div><button class="btn btn-primary" onclick="loadGuruSchedule()"><i class="bi bi-search me-1"></i>Tampilkan</button><button class="btn btn-outline-secondary" onclick="document.getElementById(\'gmJadwalTanggal\').value=gmToday();loadGuruSchedule()"><i class="bi bi-calendar-day me-1"></i>Hari Ini</button></div><div id="gmScheduleList"><div class="gm-empty">Memuat...</div></div></div>';document.getElementById('gmJadwalTanggal').addEventListener('change',loadGuruSchedule);loadGuruSchedule();}
    function loadGuruSchedule(){var t=document.getElementById('gmJadwalTanggal').value;gmCall('gmGetMySchedules',[getCredential(),t],function(r){var b=document.getElementById('gmScheduleList');if(!r.success){b.innerHTML='<div class="gm-empty text-danger">'+gmEsc(r.message)+'</div>';return;}gmState.schedules=r.data||[];b.innerHTML=r.data.length?'<div class="row g-3">'+r.data.map(function(x){return '<div class="col-md-6 col-xl-4"><div class="gm-schedule-card"><div class="time">'+gmEsc(x.hari)+' • Jam ke-'+gmEsc(x.jamKe)+'</div><h5>'+gmEsc(x.mapel)+'</h5><small>'+gmEsc(x.kelas)+'</small><div class="mt-2 small text-secondary">'+gmJam(x.jamMulai)+' – '+gmJam(x.jamSelesai)+'</div><div class="mt-3"><span class="gm-schedule-pill"><i class="bi bi-whatsapp"></i>'+gmEsc(x.noWaPerwakilan||'Nomor belum diatur')+'</span></div></div></div>';}).join('')+'</div>':'<div class="gm-empty"><i class="bi bi-calendar-x"></i><div class="fw-bold mt-2">Tidak ada jadwal pada hari tersebut.</div></div>';});}
    function renderGuruAttendance(c){c.innerHTML='<div class="gm-page-hero"><span>ABSENSI MAPEL</span><h3>Presensi Berdasarkan Jadwal</h3><p>Pilih tanggal. Sistem hanya menampilkan jadwal guru pada hari tersebut; server juga memvalidasi agar tanggal di luar jadwal ditolak.</p></div><div class="card-flat mb-3"><div class="row g-2 align-items-end"><div class="col-md-3"><label class="form-label">Tanggal</label><input id="gmAttDate" type="date" class="form-control" value="'+normalizeDate(gmToday())+'"></div><div class="col-md-6"><label class="form-label">Jadwal Kelas</label><select id="gmAttSchedule" class="form-select"><option value="">Memuat jadwal...</option></select></div><div class="col-md-3"><button class="btn btn-primary w-100" onclick="loadGuruAttendance()"><i class="bi bi-arrow-clockwise me-1"></i>Muat Absensi</button></div></div><div id="gmAttHint" class="gm-alert mt-3">Pilih tanggal dan jadwal.</div></div><div class="card-flat"><div id="gmAttTable"><div class="gm-empty">Belum ada data.</div></div><div class="gm-att-save-row d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap"><small id="gmAttSummary" class="text-secondary"></small><button id="gmAttSave" class="btn btn-success" onclick="saveGuruAttendance()" disabled><i class="bi bi-check-circle-fill me-1"></i>Simpan Presensi</button></div></div>';document.getElementById('gmAttDate').addEventListener('change',loadGuruAttendanceSchedules);loadGuruAttendanceSchedules();}

    function loadGuruAttendanceSchedules(){var d=document.getElementById('gmAttDate').value,sel=document.getElementById('gmAttSchedule');sel.innerHTML='<option>Memuat jadwal...</option>';gmCall('gmGetMySchedules',[getCredential(),d],function(r){if(!r.success){sel.innerHTML='<option value="">'+gmEsc(r.message)+'</option>';return;}gmState.schedules=r.data||[];sel.innerHTML='<option value="">Pilih jadwal...</option>'+gmState.schedules.map(x=>'<option value="'+gmEsc(x.id)+'">Jam '+gmEsc(x.jamKe)+' • '+gmEsc(x.kelas)+' • '+gmEsc(x.mapel)+' ('+gmJam(x.jamMulai)+'–'+gmJam(x.jamSelesai)+')</option>').join('');document.getElementById('gmAttTable').innerHTML='<div class="gm-empty">Pilih jadwal untuk memuat siswa.</div>';document.getElementById('gmAttSave').disabled=true;});}
    function loadGuruAttendance(){
      var sel=document.getElementById('gmAttSchedule'), dateEl=document.getElementById('gmAttDate');
      if(!sel||!dateEl)return;
      var id=sel.value,d=dateEl.value;
      if(!id){showToast('Pilih jadwal kelas terlebih dahulu.','error');return;}
      gmCall('gmGetAttendance',[id,d,getCredential()],function(r){
        var table=document.getElementById('gmAttTable');
        if(!table)return;
        if(!r.success){table.innerHTML='<div class="gm-empty text-danger">'+gmEsc(r.message)+'</div>';return;}
        gmState.attendance=r;
        var p=r.presensi||{};
        gmCall('gmGetStudentsForSchedule',[r.schedule.idKelas,getCredential()],function(st){
          if(!st.success){table.innerHTML='<div class="gm-empty text-danger">'+gmEsc(st.message||'Gagal memuat siswa.')+'</div>';return;}
          var rows=st.data||[];
          var opts=[['H','Hadir'],['S','Sakit'],['I','Izin'],['A','Alfa'],['T','Terlambat']];
          var hint=document.getElementById('gmAttHint');
          if(hint)hint.innerHTML='<strong>'+gmEsc(r.schedule.mapel)+'</strong> <span class="att-dot">•</span> '+gmEsc(r.schedule.kelas)+' <span class="att-dot">•</span> '+gmEsc(r.schedule.hari)+' <span class="att-dot">•</span> Jam ke-'+gmEsc(r.schedule.jamKe)+' <span class="att-dot">•</span> '+gmEsc(r.schedule.jamMulai)+'–'+gmEsc(r.schedule.jamSelesai);

          function statusButtons(st,id,nama){
            return '<input type="hidden" class="gm-att-status" data-id="'+gmEsc(id)+'" data-name="'+gmEsc(nama)+'" value="'+gmEsc(st)+'">'+
              '<div class="gm-att-choice-group" role="group" aria-label="Status kehadiran">'+
              opts.map(function(o){return '<button type="button" class="gm-att-choice st-'+o[0]+(st===o[0]?' active':'')+'" data-status="'+o[0]+'" data-id="'+gmEsc(id)+'" onclick="setGuruAttendanceStatus(this)" title="'+o[1]+'"><span>'+o[0]+'</span><small>'+o[1]+'</small></button>';}).join('')+
              '</div>';
          }
          var desktop='<div class="gm-table-wrap gm-att-desktop"><table class="gm-table gm-att-table"><thead><tr><th class="att-no">No</th><th class="att-nis">NIS</th><th>Nama Siswa</th><th class="att-status-head">Kehadiran</th></tr></thead><tbody>'+
            rows.map(function(s,i){var st=String(p[s.id]||'H').toUpperCase();return '<tr><td class="att-no">'+(i+1)+'</td><td class="att-nis">'+gmEsc(s.nis)+'</td><td><strong class="att-student-name">'+gmEsc(s.nama)+'</strong></td><td class="att-status-cell">'+statusButtons(st,s.id,s.nama)+'</td></tr>';}).join('')+
            '</tbody></table></div>';
          var mobile='<div class="gm-att-mobile">'+rows.map(function(s,i){var st=String(p[s.id]||'H').toUpperCase();return '<article class="gm-att-mobile-card"><div class="gm-att-mobile-head"><span class="gm-att-mobile-no">'+(i+1)+'</span><div><strong>'+gmEsc(s.nama)+'</strong><small>NIS '+gmEsc(s.nis)+'</small></div></div>'+statusButtons(st,s.id,s.nama)+'</article>';}).join('')+'</div>';
          table.innerHTML=desktop+mobile;
          var summary=document.getElementById('gmAttSummary'); if(summary)summary.textContent=rows.length+' siswa • '+gmDate(d);
          var save=document.getElementById('gmAttSave'); if(save)save.disabled=!rows.length;
        });
      });
    }
    function setGuruAttendanceStatus(btn){
      if(!btn)return;
      var id=btn.dataset.id||'';
      var st=String(btn.dataset.status||'H').toUpperCase();
      var root=btn.closest('td')||btn.closest('.gm-att-mobile-card');
      if(!root)return;
      /* Tabel desktop & kartu mobile sama-sama ada di DOM; sinkronkan keduanya agar nilai yang disimpan = yang dipilih */
      document.querySelectorAll('.gm-att-status').forEach(function(inp){if(inp.dataset.id===id)inp.value=st;});
      document.querySelectorAll('.gm-att-choice').forEach(function(b){if(b.dataset.id===id)b.classList.toggle('active',b.dataset.status===st);});
    }
    function setGuruMobileAttendance(btn){setGuruAttendanceStatus(btn);}

    function saveGuruAttendance(){if(!gmState.attendance)return;var seen={};var items=Array.from(document.querySelectorAll('.gm-att-status')).map(function(x){return {idSiswa:x.dataset.id,status:String(x.value||'H').toUpperCase()};}).filter(function(x){if(seen[x.idSiswa])return false;seen[x.idSiswa]=true;return true;});gmCall('gmSaveAttendance',[gmState.attendance.schedule.id,document.getElementById('gmAttDate').value,items,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success){gmState.attendance.presensi={};items.forEach(x=>gmState.attendance.presensi[x.idSiswa]=x.status);loadGuruAttendance();}});}
    function openGuruAttendance(id){
      var scheduleId=String(id||'');
      if(!scheduleId){switchMenu('guruAbsensi');return;}
      switchMenu('guruAbsensi');
      var wait=0;
      var ready=function(){
        var dateEl=document.getElementById('gmAttDate');
        var sel=document.getElementById('gmAttSchedule');
        if(!dateEl||!sel){if(wait++<40)setTimeout(ready,50);return;}
        dateEl.value=gmToday();
        gmCall('gmGetMySchedules',[getCredential(),dateEl.value],function(r){
          if(!r.success){sel.innerHTML='<option value="">'+gmEsc(r.message)+'</option>';return;}
          gmState.schedules=r.data||[];
          sel.innerHTML='<option value="">Pilih jadwal...</option>'+gmState.schedules.map(function(x){return '<option value="'+gmEsc(x.id)+'">Jam '+gmEsc(x.jamKe)+' • '+gmEsc(x.kelas)+' • '+gmEsc(x.mapel)+' ('+gmJam(x.jamMulai)+'–'+gmJam(x.jamSelesai)+')</option>';}).join('');
          if(!gmState.schedules.some(function(x){return String(x.id)===scheduleId})){
            showToast('Jadwal tersebut tidak tersedia pada tanggal ini.','error');return;
          }
          sel.value=scheduleId;
          loadGuruAttendance();
        });
      };
      setTimeout(ready,50);
    }
    function renderGuruJournal(c){
        c.innerHTML='<div class="gm-page-hero"><span>JURNAL MENGAJAR</span><h3>Absensi → Jurnal</h3><p>Jumlah hadir, sakit, izin, dan alfa diambil langsung dari absensi kelas yang dipilih.</p></div><div class="card-flat mb-3"><div class="row g-2 align-items-end"><div class="col-md-3"><label class="form-label">Tanggal</label><input id="gmJrnDate" type="date" class="form-control" value="'+normalizeDate(gmToday())+'"></div><div class="col-md-6"><label class="form-label">Jadwal Kelas</label><select id="gmJrnSchedule" class="form-select"></select></div><div class="col-md-3"><button class="btn btn-primary w-100" onclick="loadGuruJournal()"><i class="bi bi-journal-check me-1"></i>Muat Jurnal</button></div></div></div><div id="gmJournalBody"><div class="gm-empty">Pilih jadwal.</div></div>';
        var dateEl=document.getElementById('gmJrnDate');
        if(dateEl) dateEl.addEventListener('change',loadGuruJournalSchedules);
        loadGuruJournalSchedules();
    }
    function loadGuruJournalSchedules(){
        var dateEl=document.getElementById('gmJrnDate');
        var scheduleEl=document.getElementById('gmJrnSchedule');
        if(!dateEl || !scheduleEl) return;
        var d=dateEl.value;
        gmCall('gmGetMySchedules',[getCredential(),d],function(r){
            // User may have navigated away while the request was in flight.
            // Never write into a DOM node that no longer belongs to the active page.
            var s=document.getElementById('gmJrnSchedule');
            if(!s) return;
            s.innerHTML='<option value="">Pilih jadwal...</option>'+(r&&r.data||[]).map(x=>'<option value="'+gmEsc(x.id)+'">Jam '+gmEsc(x.jamKe)+' • '+gmEsc(x.kelas)+' • '+gmEsc(x.mapel)+'</option>').join('');
        });
    }
    function loadGuruJournal(preserveSaveStatus){
        var scheduleEl=document.getElementById('gmJrnSchedule'),dateEl=document.getElementById('gmJrnDate');
        if(!scheduleEl || !dateEl) return;
        var id=scheduleEl.value,d=dateEl.value;if(!id)return;
        gmCall('gmGetJournal',[id,d,getCredential()],function(r){
            var b=document.getElementById('gmJournalBody');
            if(!b) return;
            if(!r.success){b.innerHTML='<div class="gm-empty text-danger">'+gmEsc(r.message)+'</div>';return;}var j=r.jurnal||{},ns=r.namaStatus||{},names=function(k){return (ns[k]||[]).length?(ns[k]||[]).map(gmEsc).join(', '):'—';};b.innerHTML='<div id="gmJournalSaveStatus" class="gm-journal-save-status d-none" role="status"></div><div class="row g-3"><div class="col-lg-5"><div class="card-flat"><h6 class="fw-bold mb-3">Rekap Kehadiran</h6><div class="gm-status-grid"><div class="gm-status h">Hadir<strong class="d-block fs-5">'+r.rekap.hadir+'</strong></div><div class="gm-status t">Terlambat<strong class="d-block fs-5">'+r.rekap.terlambat+'</strong></div><div class="gm-status s">Sakit<strong class="d-block fs-5">'+r.rekap.sakit+'</strong></div><div class="gm-status i">Izin<strong class="d-block fs-5">'+r.rekap.izin+'</strong></div><div class="gm-status a">Alfa<strong class="d-block fs-5">'+r.rekap.alfa+'</strong></div></div><div class="gm-journal-names"><div><b>Terlambat:</b> '+names('T')+'</div><div><b>Sakit:</b> '+names('S')+'</div><div><b>Izin:</b> '+names('I')+'</div><div><b>Alfa:</b> '+names('A')+'</div></div><div class="gm-alert mt-3">'+gmEsc(r.schedule.kelas)+' • '+gmEsc(r.schedule.mapel)+' • '+gmEsc(r.schedule.hari)+' • Jam ke-'+gmEsc(r.schedule.jamKe)+'</div></div></div><div class="col-lg-7"><div class="card-flat"><div class="mb-3"><label class="form-label">Apa yang dipelajari hari ini?</label><textarea id="gmJrnMateri" class="form-control gm-textarea" placeholder="Materi, tujuan, aktivitas, atau capaian pembelajaran...">'+gmEsc(j.materi)+'</textarea></div><div class="mb-3"><label class="form-label">Catatan untuk minggu depan</label><textarea id="gmJrnNext" class="form-control gm-textarea" placeholder="Persiapan, tindak lanjut, remedial, alat/bahan...">'+gmEsc(j.catatanMingguDepan)+'</textarea></div><div class="mb-3"><label class="form-label">Catatan kelas</label><textarea id="gmJrnClass" class="form-control" placeholder="Catatan khusus kelas atau siswa...">'+gmEsc(j.catatanKelas)+'</textarea></div><div class="d-flex gap-2 flex-wrap align-items-center"><button id="gmSaveJournalBtn" class="btn btn-success" onclick="saveGuruJournal()"><i class="bi bi-save me-1"></i>Simpan Jurnal</button><button class="btn gm-wa" onclick="sendGuruClassWA()"><i class="bi bi-whatsapp me-1"></i>WhatsApp Perwakilan Kelas</button></div></div></div></div>';gmState.journalBundle=r;});}

    function saveGuruJournal(){
        var r=gmState.journalBundle;
        if(!r){showToast('Muat jurnal terlebih dahulu.','error');return;}
        var btn=document.getElementById('gmSaveJournalBtn'),status=document.getElementById('gmJournalSaveStatus');
        var payload={idJadwal:r.schedule.id,tanggal:r.tanggal,materi:document.getElementById('gmJrnMateri').value,catatanMingguDepan:document.getElementById('gmJrnNext').value,catatanKelas:document.getElementById('gmJrnClass').value};
        if(btn){btn.disabled=true;btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan...';}
        if(status){status.className='gm-journal-save-status saving';status.innerHTML='<i class="bi bi-cloud-arrow-up me-1"></i><strong>Menyimpan perubahan...</strong> Mohon tunggu sampai ada konfirmasi.';}
        gmCall('gmSaveJournal',[payload,getCredential()],function(x){
            if(btn){btn.disabled=false;btn.innerHTML='<i class="bi bi-save me-1"></i>Simpan Jurnal';}
            if(x&&x.success){
                var action=x.action==='updated'?'PERUBAHAN JURNAL BERHASIL DISIMPAN':'JURNAL BERHASIL DISIMPAN';
                var when=x.savedAt?' • '+gmEsc(x.savedAt):'';
                if(status){status.className='gm-journal-save-status success';status.innerHTML='<i class="bi bi-check-circle-fill me-1"></i><strong>'+action+'</strong><br><span>Data sudah diperbarui di Google Sheets.</span>'+when;}
                showToast('✓ '+action,'success');
                // Muat ulang dari server agar tampilan pasti merefleksikan data yang benar-benar tersimpan.
                setTimeout(function(){loadGuruJournal(true);},800);
            }else{
                var msg=(x&&x.message)||'Jurnal gagal disimpan.';
                if(status){status.className='gm-journal-save-status error';status.innerHTML='<i class="bi bi-exclamation-triangle-fill me-1"></i><strong>Gagal menyimpan jurnal</strong><br>'+gmEsc(msg);}
                showToast(msg,'error');
            }
        },function(e){
            if(btn){btn.disabled=false;btn.innerHTML='<i class="bi bi-save me-1"></i>Simpan Jurnal';}
            var msg=e&&e.message?e.message:'Kesalahan koneksi';
            if(status){status.className='gm-journal-save-status error';status.innerHTML='<i class="bi bi-exclamation-triangle-fill me-1"></i><strong>Gagal menyimpan jurnal</strong><br>'+gmEsc(msg);}
            showToast('Gagal menyimpan jurnal: '+msg,'error');
        });
    }

    function sendGuruClassWA(){var r=gmState.journalBundle;if(!r)return;var msg='Persiapan pembelajaran '+r.schedule.mapel+' kelas '+r.schedule.kelas+' pada '+gmDate(r.tanggal)+'.\nJam ke-'+r.schedule.jamKe+' ('+r.schedule.jamMulai+'–'+r.schedule.jamSelesai+').\n\nCatatan: '+(document.getElementById('gmJrnNext')?.value||'-')+'\n\nTerima kasih.';var phone=String(r.schedule.noWaPerwakilan||'').replace(/\D/g,'');if(!phone){showToast('Nomor WhatsApp perwakilan kelas belum diatur.','error');return;}window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank');}
    function openGuruJournal(id){switchMenu('guruJurnal');setTimeout(function(){document.getElementById('gmJrnDate').value=gmToday();loadGuruJournalSchedules();setTimeout(function(){document.getElementById('gmJrnSchedule').value=id;loadGuruJournal();},350);},100);}
    function renderGuruGrades(c){
      c.innerHTML='<div class="gm-page-hero"><span>PENILAIAN & NILAI</span><h3>Kelola Penilaian Siswa</h3><p>Buat penilaian lalu pilih satu atau beberapa penilaian untuk mengisi nilai siswa sekaligus dalam satu tabel.</p></div><div class="row g-3"><div class="col-lg-4"><div class="card-flat grade-create-card"><h6 class="fw-bold mb-3">Tambah Penilaian</h6><div class="mb-2"><label class="form-label">Kelas</label><select id="gmGradeClass" class="form-select"></select></div><div class="mb-2"><label class="form-label">Mata Pelajaran</label><select id="gmGradeMapel" class="form-select"></select></div><div class="mb-2"><label class="form-label">Jenis Penilaian</label><select id="gmGradeType" class="form-select"><option value="Tugas">Tugas</option><option value="UH">UH</option><option value="Kuis">Kuis</option><option value="Praktikum">Praktikum</option><option value="Proyek">Proyek</option><option value="Presentasi">Presentasi</option><option value="Portofolio">Portofolio</option><option value="PTS">PTS</option><option value="PAS">PAS</option><option value="Lainnya">Lainnya</option></select></div><div class="mb-2"><label class="form-label">Nama Penilaian</label><input id="gmGradeName" class="form-control" placeholder="Contoh: Tugas 1 – Stoikiometri"></div><div class="mb-2"><label class="form-label">Detail / Keterangan</label><textarea id="gmGradeDetail" class="form-control gm-grade-detail" placeholder="Contoh: Latihan menghitung mol, massa, dan jumlah partikel."></textarea></div><div class="row g-2"><div class="col-6"><label class="form-label">Tanggal</label><input id="gmGradeDate" type="date" class="form-control" value="'+normalizeDate(gmToday())+'"></div><div class="col-3"><label class="form-label">Bobot (angka)</label><input id="gmGradeWeight" type="number" class="form-control" value="0" min="0"></div><div class="col-3"><label class="form-label">KKTP</label><input id="gmGradeKktp" type="number" class="form-control" value="75" min="0" max="100"></div></div><button class="btn btn-primary w-100 mt-3" onclick="addGuruAssessment()"><i class="bi bi-plus-circle me-1"></i>Tambah Penilaian</button></div></div><div class="col-lg-8"><div class="card-flat"><div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2"><div><h6 class="fw-bold mb-0">Daftar Penilaian</h6><small class="text-secondary">Centang beberapa penilaian untuk membuka input nilai dalam kolom berdampingan.</small></div><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-secondary" onclick="loadGuruAssessments()"><i class="bi bi-arrow-clockwise"></i></button><button id="gmFillSelectedBtn" class="btn btn-sm btn-dark" onclick="editGuruScoresBatch()"><i class="bi bi-grid-3x3-gap me-1"></i>Isi Nilai Terpilih <span id="gmSelectedCount" class="badge bg-warning text-dark ms-1">0</span></button></div></div><div class="small text-secondary mb-2" id="gmAssessmentHint">Contoh: centang <strong>1-Tugas 1</strong>, <strong>2-UH1</strong>, <strong>3-Tugas Stoikiometri</strong>, lalu klik <strong>Isi Nilai Terpilih</strong>.</div><div id="gmAssessmentList" class="gm-assessment-list"><div class="gm-empty">Memuat...</div></div></div></div></div><div id="gmScoreEditor" class="card-flat mt-3 d-none"><div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2"><div><span class="grade-editor-kicker">INPUT NILAI</span><h6 id="gmScoreTitle" class="fw-bold mb-1"></h6><small id="gmScoreMeta" class="text-secondary"></small></div><button id="gmScoreSaveBtn" class="btn btn-success" onclick="saveGuruScores()"><i class="bi bi-save me-1"></i>Simpan Nilai</button></div><div id="gmScoreTable"></div></div>';
      loadGuruGradeClasses();
    }
    function updateGuruSelectedCount(){var n=document.querySelectorAll('.gm-assessment-check:checked').length;var el=document.getElementById('gmSelectedCount');if(el)el.textContent=n;var btn=document.getElementById('gmFillSelectedBtn');if(btn)btn.disabled=n===0;}
    function toggleAllGuruAssessments(checked){document.querySelectorAll('.gm-assessment-check').forEach(function(x){x.checked=checked;});updateGuruSelectedCount();}
    function loadGuruGradeClasses(){gmCall('gmGetMyClasses',[getCredential()],function(r){var c=document.getElementById('gmGradeClass');if(!c)return;c.innerHTML='<option value="">Pilih kelas...</option>'+(r.data||[]).map(x=>'<option value="'+gmEsc(x.idKelas)+'">'+gmEsc(x.nama)+' • '+gmEsc(x.mapel)+'</option>').join('');c.addEventListener('change',loadGuruAssessments);loadGuruAssessments();});}
    function loadGuruAssessments(){var sel=document.getElementById('gmGradeClass');if(!sel)return;var id=sel.value||'';var txt=sel.selectedOptions[0]?.textContent||'';var m=txt.split(' • ').slice(1).join(' • ');var mapel=document.getElementById('gmGradeMapel');if(mapel)mapel.innerHTML=m?'<option value="'+gmEsc(m)+'">'+gmEsc(m)+'</option>':'<option value="">Pilih kelas...</option>';var b=document.getElementById('gmAssessmentList');if(b)b.innerHTML='<div class="gm-empty">Memuat penilaian...</div>';var ed=document.getElementById('gmScoreEditor');if(ed)ed.classList.add('d-none');gmCall('gmGetAssessmentTypes',[getCredential(),id,m],function(r){if(!b)return;if(!r.success){b.innerHTML='<div class="gm-empty text-danger">'+gmEsc(r.message)+'</div>';return;}gmState.assessments=r.data||[];if(!gmState.assessments.length){b.innerHTML='<div class="gm-empty">Belum ada penilaian. Tambahkan penilaian pertama.</div>';updateGuruSelectedCount();return;}b.innerHTML='<div class="gm-assessment-selectbar"><label class="gm-check-all"><input type="checkbox" onchange="toggleAllGuruAssessments(this.checked)"> <strong>Pilih semua</strong></label><span class="small text-secondary">'+gmState.assessments.length+' penilaian tersedia</span></div>'+gmState.assessments.map(function(x,i){return '<div class="gm-assessment-item gm-assessment-row"><label class="gm-assessment-check-wrap"><input type="checkbox" class="gm-assessment-check" value="'+gmEsc(x.id)+'" onchange="updateGuruSelectedCount()"><span class="gm-assessment-index">'+(i+1)+'</span></label><div class="assessment-copy"><div><span class="assessment-type">'+gmEsc(x.jenis||'Penilaian')+'</span><strong>'+gmEsc(x.nama)+'</strong></div><small>'+gmEsc(x.detail||'Tidak ada detail.')+'</small><small>'+gmEsc(x.tanggal||'-')+' • Bobot '+gmFormatWeightPercent(x,gmState.assessments||[])+'% • KKTP '+x.kktp+'</small></div><div class="d-flex gap-1 flex-shrink-0"><button class="btn btn-sm btn-primary" onclick="editGuruScores(\''+gmEsc(x.id)+'\')"><i class="bi bi-pencil-square me-1"></i>Satu</button><button class="btn btn-sm btn-outline-danger" onclick="deleteGuruAssessment(\''+gmEsc(x.id)+'\')"><i class="bi bi-trash"></i></button></div></div>';}).join('');updateGuruSelectedCount();});}
    function addGuruAssessment(){var id=document.getElementById('gmGradeClass').value,mapel=document.getElementById('gmGradeMapel').value,jenis=document.getElementById('gmGradeType').value,nama=document.getElementById('gmGradeName').value.trim(),detail=document.getElementById('gmGradeDetail').value.trim(),tgl=document.getElementById('gmGradeDate').value;if(!id||!mapel||!jenis||!nama)return showToast('Kelas, mata pelajaran, jenis, dan nama penilaian wajib diisi.','error');gmCall('gmAddAssessment',[{idKelas:id,mapel:mapel,jenis:jenis,nama:nama,detail:detail,tanggal:tgl,bobot:Number(document.getElementById('gmGradeWeight').value)||0,kktp:Number(document.getElementById('gmGradeKktp').value)||0},getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success){document.getElementById('gmGradeName').value='';document.getElementById('gmGradeDetail').value='';loadGuruAssessments();}});}
    function deleteGuruAssessment(id){if(!confirm('Hapus penilaian ini?'))return;gmCall('gmDeleteAssessment',[id,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success)loadGuruAssessments();});}
    function editGuruScores(id){gmCall('gmGetScores',[id,getCredential()],function(r){if(!r.success){showToast(r.message,'error');return;}gmState.scoreBundle=r;gmState.scoreBatchBundle=null;document.getElementById('gmScoreEditor').classList.remove('d-none');document.getElementById('gmScoreTitle').textContent=(r.assessment.jenis?r.assessment.jenis+' — ':'')+r.assessment.nama;document.getElementById('gmScoreMeta').textContent=r.assessment.detail+' • '+r.assessment.mapel+' • '+r.assessment.tanggal+' • '+r.students.length+' siswa';document.getElementById('gmScoreSaveBtn').setAttribute('onclick','saveGuruScores()');var html='<div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>No</th><th>NIS</th><th>Nama Siswa</th><th>Nilai 0–100</th><th>Catatan</th></tr></thead><tbody>'+r.students.map(function(s,i){var v=r.scores[s.id]?.nilai??'';var n=r.scores[s.id]?.catatan??'';return '<tr><td>'+(i+1)+'</td><td>'+gmEsc(s.nis)+'</td><td><strong>'+gmEsc(s.nama)+'</strong></td><td><input type="number" min="0" max="100" class="form-control form-control-sm gm-score" data-id="'+gmEsc(s.id)+'" value="'+gmEsc(v)+'"></td><td><input class="form-control form-control-sm gm-score-note" data-id="'+gmEsc(s.id)+'" value="'+gmEsc(n)+'" placeholder="Opsional"></td></tr>';}).join('')+'</tbody></table></div>';document.getElementById('gmScoreTable').innerHTML=html;document.getElementById('gmScoreEditor').scrollIntoView({behavior:'smooth',block:'start'});});}
    function editGuruScoresBatch(){var ids=Array.from(document.querySelectorAll('.gm-assessment-check:checked')).map(function(x){return x.value;});if(!ids.length)return showToast('Pilih minimal satu penilaian.','error');gmCall('gmGetScoresBatch',[ids,getCredential()],function(r){if(!r.success){showToast(r.message,'error');return;}gmState.scoreBatchBundle=r;gmState.scoreBundle=null;document.getElementById('gmScoreEditor').classList.remove('d-none');document.getElementById('gmScoreTitle').textContent='Input Beberapa Penilaian';document.getElementById('gmScoreMeta').textContent=r.assessments.length+' penilaian • '+r.assessments[0].mapel+' • '+r.students.length+' siswa';document.getElementById('gmScoreSaveBtn').setAttribute('onclick','saveGuruScoresBatch()');var cols=r.assessments.map(function(a,i){return '<th class="gm-score-head"><span class="gm-score-no">'+(i+1)+'</span><strong>'+gmEsc(a.jenis||'Penilaian')+'</strong><br><span>'+gmEsc(a.nama)+'</span><small>'+gmEsc(a.tanggal||'')+'</small></th>';}).join('');var rows=r.students.map(function(st,ri){var cells=r.assessments.map(function(a){var z=(r.scoresByAssessment[a.id]||{})[st.id]||{};var v=z.nilai??'';return '<td class="gm-score-cell"><input type="number" min="0" max="100" inputmode="numeric" class="form-control form-control-sm gm-batch-score" data-aid="'+gmEsc(a.id)+'" data-sid="'+gmEsc(st.id)+'" value="'+gmEsc(v)+'" aria-label="'+gmEsc(a.nama)+' - '+gmEsc(st.nama)+'"></td>';}).join('');return '<tr><td class="gm-sticky-no">'+(ri+1)+'</td><td class="gm-sticky-nis">'+gmEsc(st.nis)+'</td><td class="gm-sticky-name"><strong>'+gmEsc(st.nama)+'</strong></td>'+cells+'</tr>';}).join('');document.getElementById('gmScoreTable').innerHTML='<div class="gm-batch-note"><i class="bi bi-info-circle me-1"></i>Nilai dimasukkan ke kolom sesuai penilaian. Satu kali Simpan akan menyimpan seluruh penilaian yang dipilih.</div><div class="gm-table-wrap gm-batch-table-wrap"><table class="gm-table gm-batch-score-table"><thead><tr><th>No</th><th>NIS</th><th>Nama Siswa</th>'+cols+'</tr></thead><tbody>'+rows+'</tbody></table></div>';document.getElementById('gmScoreEditor').scrollIntoView({behavior:'smooth',block:'start'});});}
    function saveGuruScores(){if(gmState.scoreBatchBundle)return saveGuruScoresBatch();var items=Array.from(document.querySelectorAll('.gm-score')).map(x=>({idSiswa:x.dataset.id,nilai:x.value,catatan:document.querySelector('.gm-score-note[data-id="'+x.dataset.id+'"]').value||''}));gmCall('gmSaveScores',[gmState.scoreBundle.assessment.id,items,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success)editGuruScores(gmState.scoreBundle.assessment.id);});}
    function saveGuruScoresBatch(){var b=gmState.scoreBatchBundle;if(!b||!b.assessments)return showToast('Data penilaian belum dimuat.','error');var payload=b.assessments.map(function(a){return {idPenilaian:a.id,items:b.students.map(function(s){var el=document.querySelector('.gm-batch-score[data-aid="'+CSS.escape(a.id)+'"][data-sid="'+CSS.escape(s.id)+'"]');return {idSiswa:s.id,nilai:el?el.value:''};})};});var btn=document.getElementById('gmScoreSaveBtn');if(btn){btn.disabled=true;btn.innerHTML='<i class="bi bi-hourglass-split me-1"></i>Menyimpan...';}gmCall('gmSaveScoresBatch',[payload,getCredential()],function(r){if(btn){btn.disabled=false;btn.innerHTML='<i class="bi bi-save me-1"></i>Simpan Nilai';}showToast(r.message,r.success?'success':'error');if(r.success){editGuruScoresBatch();}});}
    function renderGuruReports(c){
      var now=gmToday(),first=new Date();first.setDate(1);
      var firstDay=first.getFullYear()+'-'+String(first.getMonth()+1).padStart(2,'0')+'-'+String(first.getDate()).padStart(2,'0');
      function dateFields(prefix){
        return '<div class="gm-report-date-grid">'+
          '<div><label class="form-label" for="'+prefix+'Start">Tanggal Mulai</label><input id="'+prefix+'Start" type="date" class="form-control" value="'+normalizeDate(firstDay)+'"></div>'+
          '<div><label class="form-label" for="'+prefix+'End">Tanggal Selesai</label><input id="'+prefix+'End" type="date" class="form-control" value="'+normalizeDate(now)+'"></div>'+
        '</div>';
      }
      c.innerHTML=
        '<div class="gm-page-hero"><span>LAPORAN GURU</span><h3>Rekapitulasi & Cetak</h3><p>Pilih jenis laporan melalui tab. Filter dan hasil hanya ditampilkan pada tab yang sedang dibuka.</p></div>'+
        '<ul class="nav nav-tabs gm-report-tabs" role="tablist">'+
          '<li class="nav-item" role="presentation"><button class="nav-link active" type="button" role="tab" aria-selected="true" data-bs-toggle="tab" data-bs-target="#gmRepAtt"><i class="bi bi-person-check me-2"></i>Absensi</button></li>'+
          '<li class="nav-item" role="presentation"><button class="nav-link" type="button" role="tab" aria-selected="false" data-bs-toggle="tab" data-bs-target="#gmRepGrade"><i class="bi bi-clipboard-data me-2"></i>Nilai</button></li>'+
          '<li class="nav-item" role="presentation"><button class="nav-link" type="button" role="tab" aria-selected="false" data-bs-toggle="tab" data-bs-target="#gmRepJrn"><i class="bi bi-journal-text me-2"></i>Jurnal</button></li>'+
        '</ul>'+
        '<div class="tab-content gm-report-tab-content">'+
          '<section class="tab-pane fade show active" id="gmRepAtt" role="tabpanel">'+
            '<div class="card-flat gm-report-panel"><div class="gm-report-panel-heading"><span class="gm-report-icon"><i class="bi bi-person-check"></i></span><div><h4>Laporan Absensi</h4><p>Atur kelas dan periode, lalu tampilkan rekap kehadiran siswa.</p></div></div>'+
            dateFields('gmRepAtt')+
            '<div class="row g-3 align-items-end gm-report-filter-row"><div class="col-md-8"><label class="form-label" for="gmRepAttClass">Kelas</label><select id="gmRepAttClass" class="form-select"><option value="SEMUA">Semua Kelas</option></select></div><div class="col-md-4"><button class="btn btn-primary w-100" type="button" onclick="loadGuruAttendanceReport()"><i class="bi bi-eye me-1"></i>Tampilkan Absensi</button></div></div>'+
            '<div class="gm-report-result" id="gmRepAttBody"><div class="gm-empty">Pilih periode dan kelas, lalu klik Tampilkan Absensi.</div></div></div>'+
          '</section>'+
          '<section class="tab-pane fade" id="gmRepGrade" role="tabpanel">'+
            '<div class="card-flat gm-report-panel"><div class="gm-report-panel-heading"><span class="gm-report-icon"><i class="bi bi-clipboard-data"></i></span><div><h4>Laporan Nilai</h4><p>Pilih kelas, mata pelajaran, dan periode penilaian yang ingin direkap.</p></div></div>'+
            dateFields('gmRepGrade')+
            '<div class="row g-3 align-items-end gm-report-filter-row"><div class="col-md-4"><label class="form-label" for="gmRepGradeClass">Kelas</label><select id="gmRepGradeClass" class="form-select"><option value="SEMUA">Semua Kelas</option></select></div><div class="col-md-4"><label class="form-label" for="gmRepGradeMapel">Mata Pelajaran</label><select id="gmRepGradeMapel" class="form-select"><option value="SEMUA">Semua Mata Pelajaran</option></select></div><div class="col-md-4"><button class="btn btn-primary w-100" type="button" onclick="loadGuruGradeReport()"><i class="bi bi-grid-3x3-gap me-1"></i>Tampilkan Nilai</button></div></div>'+
            '<div id="gmGradeReportAssessments" class="gm-report-result"></div><div class="gm-report-result" id="gmRepGradeBody"></div></div>'+
          '</section>'+
          '<section class="tab-pane fade" id="gmRepJrn" role="tabpanel">'+
            '<div class="card-flat gm-report-panel"><div class="gm-report-panel-heading"><span class="gm-report-icon"><i class="bi bi-journal-text"></i></span><div><h4>Laporan Jurnal</h4><p>Pilih kelas dan periode untuk melihat jurnal pembelajaran.</p></div></div>'+
            dateFields('gmRepJrn')+
            '<div class="row g-3 align-items-end gm-report-filter-row"><div class="col-md-8"><label class="form-label" for="gmRepJrnClass">Kelas</label><select id="gmRepJrnClass" class="form-select"><option value="SEMUA">Semua Kelas</option></select></div><div class="col-md-4"><button class="btn btn-primary w-100" type="button" onclick="loadGuruJournalReport()"><i class="bi bi-journal-check me-1"></i>Tampilkan Jurnal</button></div></div>'+
            '<div class="gm-report-result" id="gmRepJrnBody"><div class="gm-empty">Pilih periode dan kelas, lalu klik Tampilkan Jurnal.</div></div></div>'+
          '</section>'+
        '</div><div id="gmReportPrint" class="gm-print-area"></div>';

      gmState.reportAtt=null;gmState.reportAttSummary=null;gmState.reportJournal=null;
      gmState.reportGrade=null;gmState.reportGradeAssessments=[];gmState.reportGradeStudents=[];gmState.reportGradeSelected=[];gmState.reportGradeRows=[];gmState.reportGradeMatrix=null;
      ['gmRepAtt','gmRepGrade','gmRepJrn'].forEach(function(prefix){
        [prefix+'Start',prefix+'End'].forEach(function(id){
          var el=document.getElementById(id);
          if(el)el.addEventListener('change',function(){
            if(prefix==='gmRepAtt'){gmState.reportAtt=null;gmState.reportAttSummary=null;var b=document.getElementById('gmRepAttBody');if(b)b.innerHTML='<div class="gm-empty">Periode berubah. Klik Tampilkan Absensi untuk memuat ulang.</div>';}
            if(prefix==='gmRepGrade'){clearGuruGradeReportSelection();}
            if(prefix==='gmRepJrn'){gmState.reportJournal=null;var b=document.getElementById('gmRepJrnBody');if(b)b.innerHTML='<div class="gm-empty">Periode berubah. Klik Tampilkan Jurnal untuk memuat ulang.</div>';}
          });
        });
      });
      gmCall('gmGetMyClasses',[getCredential()],function(r){
        var classes=r.data||[];
        var opts=classes.map(function(x){return '<option value="'+gmEsc(x.idKelas)+'">'+gmEsc(x.nama)+'</option>';}).join('');
        ['gmRepAttClass','gmRepGradeClass','gmRepJrnClass'].forEach(function(id){var el=document.getElementById(id);if(el)el.innerHTML='<option value="SEMUA">Semua Kelas</option>'+opts;});
        gmState.reportGradeClassPairs=classes;
        populateGuruGradeMapelOptions();
        var gc=document.getElementById('gmRepGradeClass');if(gc)gc.addEventListener('change',function(){populateGuruGradeMapelOptions();clearGuruGradeReportSelection();});
        var gm=document.getElementById('gmRepGradeMapel');if(gm)gm.addEventListener('change',clearGuruGradeReportSelection);
      });
    }
    function getGuruReportDateRange(kind){
      var prefix=kind==='grade'?'gmRepGrade':(kind==='journal'?'gmRepJrn':'gmRepAtt');
      var a=document.getElementById(prefix+'Start')?.value||'',b=document.getElementById(prefix+'End')?.value||'';
      if(!a||!b){showToast('Pilih tanggal mulai dan selesai terlebih dahulu.','error');return null;}
      if(a>b){showToast('Tanggal mulai tidak boleh melebihi tanggal selesai.','error');return null;}
      return {start:a,end:b};
    }
    function populateGuruGradeMapelOptions(){
      var sel=document.getElementById('gmRepGradeMapel');if(!sel)return;
      var classId=document.getElementById('gmRepGradeClass')?.value||'SEMUA';
      var pairs=gmState.reportGradeClassPairs||[];
      var seen={};var maps=[];
      pairs.forEach(function(x){if(classId!=='SEMUA'&&String(x.idKelas)!==String(classId))return;var m=String(x.mapel||'').trim();if(m&&!seen[m.toLowerCase()]){seen[m.toLowerCase()]=1;maps.push(m);}});
      maps.sort(function(a,b){return a.localeCompare(b,'id');});
      sel.innerHTML='<option value="SEMUA">Semua Mata Pelajaran</option>'+maps.map(function(m){return '<option value="'+gmEsc(m)+'">'+gmEsc(m)+'</option>';}).join('');
    }
    function clearGuruGradeReportSelection(){
      gmState.reportGrade=null;gmState.reportGradeSelected=[];gmState.reportGradeAssessments=[];gmState.reportGradeRows=[];gmState.reportGradeMatrix=null;
      var a=document.getElementById('gmGradeReportAssessments'),b=document.getElementById('gmRepGradeBody');
      if(a)a.innerHTML='<div class="gm-empty">Pilih filter lalu klik Tampilkan Data.</div>';
      if(b)b.innerHTML='';
    }
    function gmGetSelectedGradeAssessments(){
      var ids=Array.from(document.querySelectorAll('.gm-report-assessment-check:checked')).map(function(x){return String(x.value);});
      return (gmState.reportGradeAssessments||[]).filter(function(a){return ids.indexOf(String(a.id))>=0;});
    }
    function toggleGuruGradeReportAssessments(checked){document.querySelectorAll('.gm-report-assessment-check').forEach(function(x){x.checked=checked;});renderGuruGradeReportMatrix();}
    function updateGuruGradeReportSelection(){renderGuruGradeReportMatrix();}
function gmReportButtons(type){return '<div class="d-flex gap-2 flex-wrap mt-2"><button class="btn btn-success btn-sm" onclick="exportGuruReport(\''+type+'\')"><i class="bi bi-file-earmark-excel me-1"></i>Excel</button><button class="btn btn-danger btn-sm" onclick="printGuruReport(\''+type+'\')"><i class="bi bi-printer me-1"></i>PDF / Cetak</button></div>';}
    function loadGuruAttendanceReport(){
      var range=getGuruReportDateRange('att');if(!range)return;var a=range.start,b=range.end,k=document.getElementById('gmRepAttClass').value;
      gmCall('gmGetAttendanceReport',[getCredential(),a,b,k,'SEMUA'],function(r){
        gmState.reportAtt=r.data||[];
        gmCall('gmGetAttendanceSummaryReport',[getCredential(),a,b,k],function(sr){
          if(!sr.success){document.getElementById('gmRepAttBody').innerHTML='<div class="gm-empty text-danger">'+gmEsc(sr.message||'Gagal membuat rekap.')+'</div>';return;}
          gmState.reportAttSummary=sr;
          var o=sr.overall||{};
          var html='<div class="gm-report-summary-grid">'+
            '<div class="gm-report-summary-card"><span>Pertemuan Efektif</span><strong>'+Number(o.pertemuanEfektif||0)+'</strong></div>'+
            '<div class="gm-report-summary-card"><span>Total Kesempatan</span><strong>'+Number(o.totalKesempatan||0)+'</strong></div>'+
            '<div class="gm-report-summary-card h"><span>Hadir</span><strong>'+Number(o.hadir||0)+'</strong></div>'+
            '<div class="gm-report-summary-card t"><span>Terlambat</span><strong>'+Number(o.terlambat||0)+'</strong></div>'+
            '<div class="gm-report-summary-card s"><span>Sakit</span><strong>'+Number(o.sakit||0)+'</strong></div>'+
            '<div class="gm-report-summary-card i"><span>Izin</span><strong>'+Number(o.izin||0)+'</strong></div>'+
            '<div class="gm-report-summary-card a"><span>Alfa</span><strong>'+Number(o.alfa||0)+'</strong></div>'+
            '<div class="gm-report-summary-card pct"><span>% Kehadiran</span><strong>'+Number(o.persenKehadiran||0).toFixed(2)+'%</strong></div></div>'+
            '<div class="gm-alert mb-3"><strong>Periode:</strong> '+gmEsc(a)+' s.d. '+gmEsc(b)+' &nbsp; • &nbsp; <strong>Rumus:</strong> (H + T) ÷ Total Kesempatan Presensi × 100% &nbsp; • &nbsp; <strong>Terlambat dihitung hadir.</strong></div>'+
            '<div class="small text-secondary mb-2">Rekap per siswa • '+(sr.data||[]).length+' siswa</div>'+
            '<div class="gm-table-wrap"><table class="gm-table attendance-summary-table"><thead><tr><th>No</th><th>Kelas</th><th>Mata Pelajaran</th><th>NIS</th><th>Nama Siswa</th><th>Pertemuan Efektif</th><th>Total Kesempatan</th><th>H</th><th>T</th><th>S</th><th>I</th><th>A</th><th>% Kehadiran</th></tr></thead><tbody>'+
            (sr.data||[]).map(function(x,i){return '<tr><td>'+(i+1)+'</td><td>'+gmEsc(x.kelas)+'</td><td>'+gmEsc(x.mapel)+'</td><td>'+gmEsc(x.nis)+'</td><td><strong>'+gmEsc(x.nama)+'</strong></td><td>'+Number(x.pertemuanEfektif||0)+'</td><td>'+Number(x.totalKesempatan||0)+'</td><td>'+Number(x.hadir||0)+'</td><td>'+Number(x.terlambat||0)+'</td><td>'+Number(x.sakit||0)+'</td><td>'+Number(x.izin||0)+'</td><td>'+Number(x.alfa||0)+'</td><td><strong>'+Number(x.persenKehadiran||0).toFixed(2)+'%</strong></td></tr>';}).join('')+
            '</tbody></table></div>'+
            '<div class="small text-secondary mt-3 mb-2">Rekap per kelas / mata pelajaran</div>'+
            '<div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>No</th><th>Kelas</th><th>Mata Pelajaran</th><th>Pertemuan Efektif</th><th>Total Kesempatan</th><th>Jumlah Siswa</th><th>H</th><th>T</th><th>S</th><th>I</th><th>A</th><th>% Kehadiran</th></tr></thead><tbody>'+
            (sr.groups||[]).map(function(x,i){return '<tr><td>'+(i+1)+'</td><td>'+gmEsc(x.kelas)+'</td><td>'+gmEsc(x.mapel)+'</td><td>'+Number(x.pertemuanEfektif||0)+'</td><td>'+Number(x.totalKesempatan||0)+'</td><td>'+Number(x.jumlahSiswa||0)+'</td><td>'+Number(x.hadir||0)+'</td><td>'+Number(x.terlambat||0)+'</td><td>'+Number(x.sakit||0)+'</td><td>'+Number(x.izin||0)+'</td><td>'+Number(x.alfa||0)+'</td><td><strong>'+Number(x.persenKehadiran||0).toFixed(2)+'%</strong></td></tr>';}).join('')+
            '</tbody></table></div>'+gmReportButtons('att');
          document.getElementById('gmRepAttBody').innerHTML=html;
        });
      });
    }
    function loadGuruJournalReport(){
      var range=getGuruReportDateRange('journal');if(!range)return;
      var k=document.getElementById('gmRepJrnClass')?.value||'SEMUA',body=document.getElementById('gmRepJrnBody');
      if(body)body.innerHTML='<div class="gm-empty"><span class="spinner-border spinner-border-sm me-2"></span>Memuat laporan jurnal...</div>';
      gmCall('gmGetJournalReport',[getCredential(),range.start,range.end,k],function(r){
        if(!r||!r.success){if(body)body.innerHTML='<div class="gm-empty text-danger">'+gmEsc(r?.message||'Gagal memuat laporan jurnal.')+'</div>';return;}
        gmState.reportJournal=r.data||[];
        if(!body)return;
        var rows=gmState.reportJournal;
        if(!rows.length){body.innerHTML='<div class="gm-empty"><i class="bi bi-journal-x"></i><div class="fw-bold mt-2">Belum ada jurnal pada periode ini.</div><div>Periksa rentang tanggal atau pilihan kelas.</div></div>';return;}
        body.innerHTML='<div class="gm-report-period-line"><i class="bi bi-calendar3 me-2"></i>Periode '+gmEsc(gmDate(range.start))+' – '+gmEsc(gmDate(range.end))+' <span>•</span> '+rows.length+' jurnal</div><div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>No</th><th>Tanggal</th><th>Jam</th><th>Kelas</th><th>Mata Pelajaran</th><th>H</th><th>S</th><th>I</th><th>A</th><th>Materi</th><th>Catatan</th></tr></thead><tbody>'+rows.map(function(x,i){return '<tr><td>'+(i+1)+'</td><td>'+gmEsc(gmDate(x.tanggal))+'</td><td>'+gmEsc(x.jamKe||'-')+'</td><td><strong>'+gmEsc(x.kelas||x.idKelas||'-')+'</strong></td><td>'+gmEsc(x.mapel||'-')+'</td><td>'+Number(x.hadir||0)+'</td><td>'+Number(x.sakit||0)+'</td><td>'+Number(x.izin||0)+'</td><td>'+Number(x.alfa||0)+'</td><td class="gm-report-text-cell">'+gmEsc(x.materi||'—')+'</td><td class="gm-report-text-cell">'+gmEsc(x.catatanMingguDepan||x.catatanKelas||'—')+'</td></tr>';}).join('')+'</tbody></table></div>'+gmReportButtons('journal');
      });
    }

    function gmBuildGradeGroups(r){
      var assessments=r.penilaian||[], students=r.students||[], rows=r.data||[], scoreMap={};
      rows.forEach(function(x){var key=String(x.idPenilaian)+'|'+String(x.idSiswa||x.nis||'');scoreMap[key]=x.nilai;});
      var groups={};
      assessments.forEach(function(a){var key=String(a.idKelas)+'|'+String(a.mapel);if(!groups[key])groups[key]={idKelas:String(a.idKelas),mapel:String(a.mapel),assessments:[],students:[]};groups[key].assessments.push(a);});
      Object.keys(groups).forEach(function(key){
        var g=groups[key], classNames={};
        rows.forEach(function(x){if(g.assessments.some(function(a){return String(a.id)===String(x.idPenilaian)})&&x.kelas)classNames[String(x.kelas)]=1;});
        g.className=Object.keys(classNames)[0]||g.idKelas;
        g.students=students.filter(function(st){return String(st.idKelas)===String(g.idKelas);});
        if(!g.students.length){var seen={};rows.forEach(function(x){if(g.assessments.some(function(a){return String(a.id)===String(x.idPenilaian)})&&!seen[String(x.nis)]){seen[String(x.nis)]=1;g.students.push({id:String(x.idSiswa||x.nis),nis:String(x.nis||''),nama:String(x.nama||''),kelas:String(x.kelas||g.className),idKelas:g.idKelas});}});}
        g.students.sort(function(a,b){return String(a.nama).localeCompare(String(b.nama),'id');});
      });
      return {groups:Object.keys(groups).map(function(k){return groups[k];}),scoreMap:scoreMap};
    }

    function loadGuruGradeReport(){
      var range=getGuruReportDateRange('grade');if(!range)return;
      var k=document.getElementById('gmRepGradeClass').value;
      var m=document.getElementById('gmRepGradeMapel').value;
      var body=document.getElementById('gmRepGradeBody'),pick=document.getElementById('gmGradeReportAssessments');
      if(body)body.innerHTML='<div class="gm-empty">Memuat rekap nilai...</div>';
      if(pick)pick.innerHTML='';
      gmCall('gmGetScoreReport',[getCredential(),k,m==='SEMUA'?'':m,range.start,range.end],function(r){
        if(!r.success){if(body)body.innerHTML='<div class="gm-empty text-danger">'+gmEsc(r.message||'Gagal memuat laporan.')+'</div>';return;}
        gmState.reportGrade=r.data||[];gmState.reportGradeAssessments=r.penilaian||[];gmState.reportGradeStudents=r.students||[];gmState.reportGradeRows=r.data||[];gmState.reportGradeSelected=(r.penilaian||[]).map(function(a){return String(a.id);});gmState.reportGradeMatrix=null;
        if(!gmState.reportGradeAssessments.length){if(body)body.innerHTML='<div class="gm-empty"><i class="bi bi-table"></i><div class="mt-2">Belum ada penilaian untuk filter ini.</div></div>';return;}
        var selectedCount=gmState.reportGradeAssessments.length;
        if(pick)pick.innerHTML='<div class="gm-grade-select-panel"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2"><div><strong>Pilih nilai yang ditampilkan</strong><div class="small text-secondary">Nilai Akhir dihitung dari penilaian yang dicentang. Bobot yang Anda input berupa angka akan otomatis dinormalisasi menjadi persentase dari total bobot terpilih.</div></div><div class="d-flex gap-2"><label class="gm-check-all mb-0"><input id="gmGradeReportAll" type="checkbox" checked onchange="toggleGuruGradeReportAssessments(this.checked)"> <strong>Pilih semua</strong></label><span class="badge bg-dark" id="gmGradeReportSelectedCount">'+selectedCount+' terpilih</span></div></div><div class="gm-grade-report-checks">'+gmState.reportGradeAssessments.map(function(a,i){return '<label class="gm-grade-report-check"><input type="checkbox" class="gm-report-assessment-check" value="'+gmEsc(a.id)+'" checked onchange="updateGuruGradeReportSelection()"><span class="gm-assessment-index">'+(i+1)+'</span><span><strong>'+gmEsc(a.nama)+'</strong><small>'+gmEsc(a.jenis||'Penilaian')+' • Bobot '+gmFormatWeightPercent(a,gmState.reportGradeAssessments||[])+'% • KKTP '+Number(a.kktp||0)+'</small></span></label>';}).join('')+'</div></div>';
        renderGuruGradeReportMatrix();
      });
    }
    function gmBuildGradeReportMatrix(selected){
      var assessments=selected||[], students=gmState.reportGradeStudents||[], rows=gmState.reportGradeRows||[], scoreMap={};
      rows.forEach(function(x){scoreMap[String(x.idPenilaian)+'|'+String(x.idSiswa||x.nis||'')]=x.nilai;});
      var groups={};
      assessments.forEach(function(a){var key=String(a.idKelas)+'|'+String(a.mapel);if(!groups[key])groups[key]={idKelas:String(a.idKelas),mapel:String(a.mapel),assessments:[],students:[]};groups[key].assessments.push(a);});
      Object.keys(groups).forEach(function(key){
        var g=groups[key], className='';
        g.students=students.filter(function(st){return String(st.idKelas)===String(g.idKelas);});
        var firstRow=rows.find(function(x){return String(x.idPenilaian)===String(g.assessments[0].id);});
        className=(g.students[0]&&g.students[0].kelas)||((firstRow&&firstRow.kelas)||g.idKelas);g.className=className;
        if(!g.students.length){var seen={};rows.forEach(function(x){if(g.assessments.some(function(a){return String(a.id)===String(x.idPenilaian)})&&!seen[String(x.nis)]){seen[String(x.nis)]=1;g.students.push({id:String(x.idSiswa||x.nis),nis:String(x.nis||''),nama:String(x.nama||''),kelas:String(x.kelas||className),idKelas:g.idKelas});}});}
        g.students.sort(function(a,b){return String(a.nama).localeCompare(String(b.nama),'id');});
      });
      return {groups:Object.keys(groups).map(function(k){return groups[k];}),scoreMap:scoreMap};
    }
    function gmAssessmentWeightPercent(assessment, assessments){
      var total=(assessments||[]).reduce(function(sum,a){var w=Number(a.bobot);return sum+(isFinite(w)&&w>0?w:0);},0);
      var w=Number(assessment&&assessment.bobot)||0;
      if(total<=0||w<=0)return 0;
      return Math.round((w/total)*10000)/100;
    }
    function gmFormatWeightPercent(assessment, assessments){
      var p=gmAssessmentWeightPercent(assessment,assessments);
      return Number.isInteger(p)?String(p):p.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
    }
    function gmFinalGrade(st,assessments,scoreMap){
      var weighted=0,totalWeight=0,simple=0,count=0;
      assessments.forEach(function(a){var v=scoreMap[String(a.id)+'|'+String(st.id)];if(v===undefined){var alt=(gmState.reportGradeRows||[]).find(function(x){return String(x.idPenilaian)===String(a.id)&&String(x.nis)===String(st.nis);});v=alt?alt.nilai:'';}if(v!==''&&v!==null&&v!==undefined&&isFinite(Number(v))){var n=Number(v);var w=Number(a.bobot)||0;simple+=n;count++;if(w>0){weighted+=n*w;totalWeight+=w;}}});
      if(totalWeight>0)return Math.round((weighted/totalWeight)*100)/100;
      return count?Math.round((simple/count)*100)/100:null;
    }
    function renderGuruGradeReportMatrix(){
      var body=document.getElementById('gmRepGradeBody');if(!body)return;
      var selected=gmGetSelectedGradeAssessments();
      gmState.reportGradeSelected=selected.map(function(a){return String(a.id);});
      var countEl=document.getElementById('gmGradeReportSelectedCount');if(countEl)countEl.textContent=selected.length+' terpilih';
      var all=document.getElementById('gmGradeReportAll');if(all)all.checked=selected.length===(gmState.reportGradeAssessments||[]).length;
      if(!selected.length){body.innerHTML='<div class="gm-empty"><i class="bi bi-check2-square"></i><div class="mt-2 fw-bold">Belum ada nilai yang dipilih.</div><div>Pilih minimal satu penilaian untuk menampilkan rekap dan Nilai Akhir.</div></div>';return;}
      var matrix=gmBuildGradeReportMatrix(selected);gmState.reportGradeMatrix=matrix;
      var html='<div class="gm-grade-report-toolbar"><div><strong>'+((gmState.reportGradeStudents||[]).length)+' siswa</strong> • <strong>'+selected.length+' penilaian terpilih</strong></div><div class="small text-secondary">Nilai Akhir = rata-rata berbobot dari nilai yang tersedia. Jika bobot terpilih = 0, digunakan rata-rata sederhana.</div></div>';
      matrix.groups.forEach(function(g,gi){
        if(gi)html+='<div class="gm-page-break"></div>';
        html+='<div class="gm-grade-report-group '+(gi?'mt-4':'')+'"><div class="gm-grade-report-heading"><div><span class="grade-editor-kicker">KELAS / MAPEL</span><h5>'+gmEsc(g.className)+' <span class="mx-1">•</span> '+gmEsc(g.mapel)+'</h5></div><span class="badge text-bg-light">'+g.assessments.length+' nilai terpilih</span></div>';
        html+='<div class="gm-table-wrap gm-grade-report-wrap"><table class="gm-table gm-batch-score-table gm-grade-report-table"><thead><tr><th rowspan="2" class="gm-sticky-no">No</th><th rowspan="2" class="gm-sticky-nis">NIS</th><th rowspan="2" class="gm-sticky-name">Nama Siswa</th>'+g.assessments.map(function(a,i){return '<th class="gm-score-head" data-assessment="'+gmEsc(a.id)+'"><div class="gm-assessment-header-top">'+gmEsc(a.nama)+' <b>('+gmFormatWeightPercent(a,g.assessments)+'%)</b></div><div class="gm-assessment-header-no">N-'+(i+1)+'</div></th>';}).join('')+'<th rowspan="2" class="gm-final-head">Nilai Akhir</th></tr><tr>'+g.assessments.map(function(a){return '<th class="gm-score-subhead">'+gmEsc(a.jenis||'Penilaian')+' • KKTP '+Number(a.kktp||0)+'</th>';}).join('')+'</tr></thead><tbody>';
        html+=g.students.map(function(st,i){return '<tr><td class="gm-sticky-no">'+(i+1)+'</td><td class="gm-sticky-nis">'+gmEsc(st.nis)+'</td><td class="gm-sticky-name"><strong>'+gmEsc(st.nama)+'</strong></td>'+g.assessments.map(function(a){var v=matrix.scoreMap[String(a.id)+'|'+String(st.id)];if(v===undefined){var alt=(gmState.reportGradeRows||[]).find(function(x){return String(x.idPenilaian)===String(a.id)&&String(x.nis)===String(st.nis);});v=alt?alt.nilai:'';}return '<td class="gm-score-cell gm-report-score">'+(v!==''&&v!==null&&v!==undefined?'<strong>'+gmEsc(v)+'</strong>':'<span class="text-secondary">—</span>')+'</td>';}).join('')+'<td class="gm-score-cell gm-final-score">'+(function(){var f=gmFinalGrade(st,g.assessments,matrix.scoreMap);return f===null?'<span class="text-secondary">—</span>':'<strong>'+Number(f).toFixed(2)+'</strong>';})()+'</td></tr>';}).join('');
        html+='</tbody></table></div></div>';
      });
      body.innerHTML=html+gmReportButtons('grade');
    }
    
function exportGuruReport(type){
      var data=type==='att'?gmState.reportAttSummary:(type==='grade'?gmState.reportGrade:gmState.reportJournal);
      if(type==='grade'){
        if(!(gmState.reportGradeAssessments||[]).length || !(gmState.reportGradeStudents||[]).length) return showToast('Tampilkan data rekap nilai terlebih dahulu.','error');
        data=gmState.reportGradeRows||data||[];
      }else if(!data || (type==='att' ? !(data.data||[]).length : !data.length)){
        return showToast('Tampilkan data terlebih dahulu.','error');
      }
      gmCall('gmGetPrintIdentity',[getCredential()],function(ir){
        var x=ir.data||{},wb=XLSX.utils.book_new(),ws;
        if(type==='att'){
          var rows=[['REKAP ABSENSI MATA PELAJARAN'],['Periode',data.periode.mulai+' s.d. '+data.periode.selesai],['Guru',x.guru||''],[],['No','Kelas','Mata Pelajaran','NIS','Nama Siswa','Pertemuan Efektif','Total Kesempatan','H','T','S','I','A','% Kehadiran']];
          (data.data||[]).forEach(function(r,i){rows.push([i+1,r.kelas,r.mapel,r.nis,r.nama,r.pertemuanEfektif,r.totalKesempatan,r.hadir,r.terlambat,r.sakit,r.izin,r.alfa,r.persenKehadiran+'%']);});
          rows.push([]);rows.push(['REKAP KELAS / MAPEL']);rows.push(['No','Kelas','Mata Pelajaran','Pertemuan Efektif','Total Kesempatan','Jumlah Siswa','H','T','S','I','A','% Kehadiran']);
          (data.groups||[]).forEach(function(r,i){rows.push([i+1,r.kelas,r.mapel,r.pertemuanEfektif,r.totalKesempatan,r.jumlahSiswa,r.hadir,r.terlambat,r.sakit,r.izin,r.alfa,r.persenKehadiran+'%']);});
          ws=XLSX.utils.aoa_to_sheet(rows);
        }else if(type==='grade'){
          var selected=gmGetSelectedGradeAssessments();
          if(!selected.length)return showToast('Pilih minimal satu nilai yang akan ditampilkan.','error');
          var matrix=gmBuildGradeReportMatrix(selected),out=[];
          matrix.groups.forEach(function(g,gi){
            if(gi)out.push([]);
            out.push(['KELAS / MAPEL',g.className,g.mapel]);
            out.push(['No','NIS','Nama Siswa'].concat(g.assessments.map(function(a,i){return 'N-'+(i+1)+' | '+a.nama+' | Bobot '+gmFormatWeightPercent(a,g.assessments)+'%';})).concat(['Nilai Akhir']));
            g.students.forEach(function(st,i){var row=[i+1,st.nis,st.nama];g.assessments.forEach(function(a){var v=matrix.scoreMap[String(a.id)+'|'+String(st.id)];if(v===undefined){var alt=(gmState.reportGradeRows||[]).find(function(x){return String(x.idPenilaian)===String(a.id)&&String(x.nis)===String(st.nis);});v=alt?alt.nilai:'';}row.push(v);});var f=gmFinalGrade(st,g.assessments,matrix.scoreMap);row.push(f===null?'':f);out.push(row);});
          });
          ws=XLSX.utils.aoa_to_sheet(out);
        }else{ws=XLSX.utils.json_to_sheet(data.data||data);}
        XLSX.utils.book_append_sheet(wb,ws,type==='att'?'Rekap Absensi':type==='grade'?'Rekap Nilai':'Jurnal');
        XLSX.writeFile(wb,'SISJAR_'+type+'_'+gmToday()+'.xlsx');
      });
    }

    function gmGetPrintReportPeriod(data, type){
      var start='', end='';
      if(data && data.periode){ start=data.periode.mulai||data.periode.start||''; end=data.periode.selesai||data.periode.end||''; }
      var prefix=type==='att'?'gmRepAtt':(type==='grade'?'gmRepGrade':'gmRepJrn');
      var startEl=document.getElementById(prefix+'Start'), endEl=document.getElementById(prefix+'End');
      start=start||(startEl&&startEl.value)||'';
      end=end||(endEl&&endEl.value)||'';
      if((!start||!end) && type==='journal' && Array.isArray(data) && data.length){
        var dates=data.map(function(r){return String(r.tanggal||'').slice(0,10);}).filter(Boolean).sort();
        if(dates.length){start=start||dates[0];end=end||dates[dates.length-1];}
      }
      if(!start&&!end)return 'Tidak ditentukan';
      return gmDate(start||end)+' s.d. '+gmDate(end||start);
    }

    function gmAttendanceStatusLabel(status){
      var map={H:'Hadir',T:'Terlambat',S:'Sakit',I:'Izin',A:'Alfa'};
      return map[String(status||'').toUpperCase()]||'—';
    }
    function gmAttendanceStatusClass(status){
      var map={H:'is-h',T:'is-t',S:'is-s',I:'is-i',A:'is-a'};
      return map[String(status||'').toUpperCase()]||'';
    }
    function gmBuildAttendancePrintReport(data, identity, mode){
      var o=data.overall||{}, groups=data.groups||[], detailRows=gmState.reportAtt||[];
      var n=function(v){return Number(v||0);}, pct=function(v){return n(v).toFixed(2)+'%';};
      var summary='<section class="ar-section"><div class="ar-section-title"><span>01</span><div><h4>Ringkasan Kehadiran</h4><p>Statistik kehadiran selama periode laporan</p></div></div>'+
        '<table class="ar-kpi-table"><tbody>'+
        '<tr><th>Pertemuan Efektif</th><td>'+n(o.pertemuanEfektif)+'</td><th>Total Kesempatan</th><td>'+n(o.totalKesempatan)+'</td></tr>'+
        '<tr><th>Hadir</th><td class="ar-good">'+n(o.hadir)+'</td><th>Terlambat</th><td>'+n(o.terlambat)+'</td></tr>'+
        '<tr><th>Sakit</th><td>'+n(o.sakit)+'</td><th>Izin</th><td>'+n(o.izin)+'</td></tr>'+
        '<tr><th>Alfa</th><td class="ar-bad">'+n(o.alfa)+'</td><th>Persentase Kehadiran</th><td class="ar-percent">'+pct(o.persenKehadiran)+'</td></tr>'+
        '</tbody></table></section>';
      var groupTable='<section class="ar-section"><div class="ar-section-title"><span>'+(mode==='daily'?'03':'02')+'</span><div><h4>Rekap Kelas dan Mata Pelajaran</h4><p>Akumulasi seluruh kelas dan sesi mengajar pada periode terpilih</p></div></div>'+
        '<table class="ar-table ar-group-table"><thead><tr><th>No</th><th>Kelas</th><th>Mata Pelajaran</th><th>Siswa</th><th>Pertemuan Ef.</th><th>Kesempatan</th><th>H</th><th>T</th><th>S</th><th>I</th><th>A</th><th>Kehadiran</th></tr></thead><tbody>'+
        groups.map(function(r,i){return '<tr><td class="ar-center">'+(i+1)+'</td><td>'+gmEsc(r.kelas||'')+'</td><td>'+gmEsc(r.mapel||'')+'</td><td class="ar-center">'+n(r.jumlahSiswa)+'</td><td class="ar-center">'+n(r.pertemuanEfektif)+'</td><td class="ar-center">'+n(r.totalKesempatan)+'</td><td class="ar-center">'+n(r.hadir)+'</td><td class="ar-center">'+n(r.terlambat)+'</td><td class="ar-center">'+n(r.sakit)+'</td><td class="ar-center">'+n(r.izin)+'</td><td class="ar-center">'+n(r.alfa)+'</td><td class="ar-center ar-percent">'+pct(r.persenKehadiran)+'</td></tr>';}).join('')+
        (groups.length?'':'<tr><td colspan="12" class="ar-empty">Tidak ada data rekap pada periode ini.</td></tr>')+'</tbody></table></section>';
      var daily='';
      if(mode==='daily'){
        var meetings=(data.meetings||[]).slice().sort(function(a,b){
          return String(a.tanggal).localeCompare(String(b.tanggal))||
            String(a.kelas).localeCompare(String(b.kelas),'id',{numeric:true})||
            String(a.mapel).localeCompare(String(b.mapel),'id')||
            String(a.jamKe).localeCompare(String(b.jamKe),'id',{numeric:true});
        });
        var statusMap={};
        detailRows.forEach(function(r){
          var key=[String(r.jadwal||''),String(r.tanggal||'').slice(0,10),String(r.idSiswa||'')].join('|');
          statusMap[key]=String(r.status||'').toUpperCase();
        });
        var matrixGroups={};
        (data.data||[]).forEach(function(st){
          var key=String(st.idKelas)+'|'+String(st.mapel);
          if(!matrixGroups[key])matrixGroups[key]={kelas:st.kelas||'',mapel:st.mapel||'',students:[]};
          matrixGroups[key].students.push(st);
        });
        Object.keys(matrixGroups).forEach(function(key){
          var g=matrixGroups[key];
          g.meetings=meetings.filter(function(m){return String(m.idKelas)+'|'+String(m.mapel)===key;});
          g.students.sort(function(a,b){return String(a.nama||'').localeCompare(String(b.nama||''),'id');});
        });
        var matrixHtml='';
        Object.keys(matrixGroups).sort(function(a,b){
          var x=matrixGroups[a],y=matrixGroups[b];
          return String(x.kelas).localeCompare(String(y.kelas),'id',{numeric:true})||String(x.mapel).localeCompare(String(y.mapel),'id');
        }).forEach(function(key,gi){
          var g=matrixGroups[key];
          if(!g.meetings.length)return;
          var head='<tr><th class="ar-matrix-no">No</th><th class="ar-matrix-name">Nama Siswa</th>'+
            g.meetings.map(function(m){
              return '<th class="ar-matrix-date"><span>'+gmEsc(gmDate(m.tanggal))+'</span><small>'+gmEsc(m.hari||'')+(m.jamKe?' · JP '+gmEsc(m.jamKe):'')+'</small></th>';
            }).join('')+'</tr>';
          var body=g.students.map(function(st,i){
            var cells=g.meetings.map(function(m){
              var status=statusMap[[String(m.id),String(m.tanggal),String(st.idSiswa)].join('|')]||'—';
              var valid=['H','T','S','I','A'].indexOf(status)>=0?status:'—';
              return '<td class="ar-matrix-status ar-status-cell-'+valid.toLowerCase()+'">'+valid+'</td>';
            }).join('');
            return '<tr><td class="ar-center">'+(i+1)+'</td><td class="ar-matrix-student">'+gmEsc(st.nama||'')+'</td>'+cells+'</tr>';
          }).join('');
          matrixHtml+='<div class="ar-matrix-group"><div class="ar-session-head"><div><strong>'+gmEsc(g.kelas)+'</strong><span>'+gmEsc(g.mapel)+'</span></div><div class="ar-session-meta">'+g.meetings.length+' sesi terjadwal</div></div>'+
            '<table class="ar-table ar-matrix-table"><thead>'+head+'</thead><tbody>'+body+'</tbody></table>'+
            '<div class="ar-matrix-legend"><b>Keterangan:</b> H Hadir · T Terlambat · S Sakit · I Izin · A Alfa · — Belum ada catatan presensi</div></div>';
        });
        daily='<section class="ar-section ar-detail-section"><div class="ar-section-title"><span>02</span><div><h4>Matriks Kehadiran per Jadwal</h4><p>Kolom tanggal hanya menampilkan pertemuan sesuai hari dan jadwal mata pelajaran yang efektif</p></div></div>'+
          (matrixHtml||'<div class="ar-empty">Tidak ada jadwal efektif pada periode ini.</div>')+'</section>';
      }
      var note='<div class="ar-method"><strong>Metode perhitungan.</strong> Persentase kehadiran = (Hadir + Terlambat) ÷ Total Kesempatan Presensi × 100%. Pertemuan efektif mengikuti jadwal mengajar dan memperhitungkan hari libur serta agenda tidak mengajar yang aktif. Tanggal setelah hari ini tidak dihitung. Terlambat tetap dihitung hadir.</div>';
      var sign='<div class="ar-signatures"><div><span>Mengetahui,</span><strong>Kepala Sekolah</strong><div class="ar-sign-space"></div><b>'+gmEsc(identity.kepalaSekolah||'')+'</b><small>'+(identity.nipKepala?'NIP. '+gmEsc(identity.nipKepala):'')+'</small></div><div><span>Guru Mata Pelajaran</span><strong>Guru Mata Pelajaran</strong><div class="ar-sign-space"></div><b>'+gmEsc(identity.guru||'')+'</b><small>'+(identity.nipGuru?'NIP. '+gmEsc(identity.nipGuru):'')+'</small></div></div>';
      return '<div class="ar-report"><div class="ar-report-title"><div class="ar-kicker">LAPORAN AKADEMIK</div><h2>REKAP ABSENSI MATA PELAJARAN</h2><div class="ar-teacher">Guru Mata Pelajaran: <strong>'+gmEsc(identity.guru||'')+'</strong>'+(identity.nipGuru?' · NIP '+gmEsc(identity.nipGuru):'')+'</div><div class="ar-period">Periode '+gmEsc(gmGetPrintReportPeriod(data,'att'))+'</div><div class="ar-mode">'+(mode==='daily'?'Laporan detail harian dan rekap':'Laporan rekapitulasi')+'</div></div>'+
        summary+(mode==='daily'?daily:'')+groupTable+note+sign+'<div class="ar-document-footer">SISJAR · Sistem Informasi Mengajar</div></div>';
    }
    function printGuruReport(type){
      var data=type==='att'?gmState.reportAttSummary:(type==='grade'?gmState.reportGrade:gmState.reportJournal);
      if(type==='grade'){
        if(!(gmState.reportGradeAssessments||[]).length || !(gmState.reportGradeStudents||[]).length) return showToast('Tampilkan data rekap nilai terlebih dahulu.','error');
        data=gmState.reportGradeRows||data||[];
      }else if(!data || (type==='att' ? !(data.data||[]).length : !data.length)){
        return showToast('Tampilkan data terlebih dahulu.','error');
      }
      if(type==='grade'&&!gmGetSelectedGradeAssessments().length)return showToast('Pilih minimal satu nilai yang akan ditampilkan.','error');
      gmCall('gmGetPrintIdentity',[getCredential()],function(ir){
        var x=ir.data||{};
        if(type==='att'){
          sisjarPrintDialog('landscape',function(options){
            var reportHTML=gmBuildAttendancePrintReport(gmState.reportAttSummary,x,options.reportMode||'daily');
            sisjarPrintDocument(reportHTML,x,options);
          },{attendanceMode:true});
          return;
        }
        var title=type==='grade'?'LAPORAN HASIL PENILAIAN':'JURNAL MENGAJAR';
        var reportPeriod=gmGetPrintReportPeriod(data,type);
        var reportHTML='<div class="gm-print-doc"><div class="gm-print-head"><h3>'+title+'</h3><div class="meta">Guru: <strong>'+gmEsc(x.guru||'')+'</strong>'+(x.nipGuru?' • NIP: '+gmEsc(x.nipGuru):'')+'</div><div class="gm-print-period"><strong>Periode Laporan:</strong> '+gmEsc(reportPeriod)+'</div></div>';
        if(type==='journal'){
          var statusPrint=function(num,names,cls){var arr=names||[];return '<td class="jp-status '+cls+'"><div class="jp-number">'+(Number(num)||0)+'</div>'+(arr.length?'<div class="jp-names">'+arr.map(gmEsc).join('<br>')+'</div>':'<div class="jp-names empty">—</div>')+'</td>';};
          reportHTML+='<table class="journal-print-table"><thead><tr><th>No</th><th>Tanggal</th><th>Hari</th><th>Jam Ke</th><th>Kelas</th><th>Mata Pelajaran</th><th>H</th><th>T</th><th>S</th><th>I</th><th>A</th><th>Materi yang Dipelajari</th><th>Catatan Minggu Depan</th><th>Catatan Kelas</th></tr></thead><tbody>'+(data||[]).map(function(r,i){return '<tr><td>'+(i+1)+'</td><td>'+gmEsc(r.tanggal)+'</td><td>'+gmEsc(r.hari||'-')+'</td><td><b>'+gmEsc(r.jamKe||'-')+'</b>'+(r.jamMulai?'<br><span class="jp-time">'+gmEsc(r.jamMulai)+'–'+gmEsc(r.jamSelesai||'')+'</span>':'')+'</td><td><b>'+gmEsc(r.kelas||r.idKelas||'')+'</b></td><td>'+gmEsc(r.mapel||'')+'</td>'+statusPrint(r.hadir,[],'jp-h')+statusPrint(r.terlambat,r.namaTerlambat,'jp-t')+statusPrint(r.sakit,r.namaSakit,'jp-s')+statusPrint(r.izin,r.namaIzin,'jp-i')+statusPrint(r.alfa,r.namaAlfa,'jp-a')+'<td class="jp-text">'+gmEsc(r.materi||'')+'</td><td class="jp-text">'+gmEsc(r.catatanMingguDepan||'')+'</td><td class="jp-text">'+gmEsc(r.catatanKelas||'')+'</td></tr>';}).join('')+'</tbody></table>';
        }else if(type==='grade'){
          var selected=gmGetSelectedGradeAssessments(),matrix=gmBuildGradeReportMatrix(selected);
          matrix.groups.forEach(function(g){
            reportHTML+='<h4 class="grade-print-title">'+gmEsc(g.className)+' • '+gmEsc(g.mapel)+'</h4><div class="grade-print-formula">Nilai Akhir dihitung dari penilaian terpilih menggunakan bobot. Jika total bobot terpilih = 0, digunakan rata-rata sederhana.</div><table class="grade-print-table"><thead><tr><th rowspan="2">No</th><th rowspan="2">NIS</th><th rowspan="2">Nama Siswa</th>'+g.assessments.map(function(a,i){return '<th><div class="print-assessment-name">'+gmEsc(a.nama)+' <b>('+gmFormatWeightPercent(a,g.assessments)+'%)</b></div><div class="print-assessment-no">N-'+(i+1)+'</div></th>';}).join('')+'<th rowspan="2">Nilai Akhir</th></tr><tr>'+g.assessments.map(function(a){return '<th>'+gmEsc(a.jenis||'Penilaian')+' • KKTP '+Number(a.kktp||0)+'</th>';}).join('')+'</tr></thead><tbody>'+g.students.map(function(st,i){return '<tr><td>'+(i+1)+'</td><td>'+gmEsc(st.nis)+'</td><td><b>'+gmEsc(st.nama)+'</b></td>'+g.assessments.map(function(a){var v=matrix.scoreMap[String(a.id)+'|'+String(st.id)];if(v===undefined){var alt=(gmState.reportGradeRows||[]).find(function(x){return String(x.idPenilaian)===String(a.id)&&String(x.nis)===String(st.nis);});v=alt?alt.nilai:'';}return '<td class="grade-print-score">'+(v!==''&&v!==null&&v!==undefined?gmEsc(v):'—')+'</td>';}).join('')+'<td class="grade-print-score"><b>'+((gmFinalGrade(st,g.assessments,matrix.scoreMap)===null)?'—':Number(gmFinalGrade(st,g.assessments,matrix.scoreMap)).toFixed(2))+'</b></td></tr>';}).join('')+'</tbody></table>';
          });
        }
        reportHTML+='</div>';
        sisjarPrintDialog('landscape',function(options){sisjarPrintDocument(reportHTML,x,options);});
      });
    }
function renderMasterSekolah(container){
      if(getUserRoleLocal()!=='superadmin'){container.innerHTML='<div class="gm-empty text-danger">Akses hanya untuk Superadmin.</div>';return;}
      container.innerHTML='<div class="gm-page-hero"><span>ADMINISTRASI PUSAT</span><h3>Master Sekolah</h3><p>Daftarkan sekolah baru di sini. Setiap sekolah memperoleh ID sendiri dan pengaturan terpisah.</p></div><div class="sisjar-settings-section mb-3"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><div><h5 class="mb-1">Daftar Sekolah</h5><div class="text-muted small">Sekolah yang sudah memiliki data tidak dihapus; pengelolaan status nonaktif dapat ditambahkan setelah kolom status tersedia.</div></div><button class="btn btn-primary" onclick="showMasterSchoolForm()"><i class="bi bi-plus-lg me-1"></i>Tambah Sekolah</button></div><div id="masterSchoolList"><div class="text-muted">Memuat data sekolah...</div></div></div><div id="masterSchoolFormHost"></div>';
      loadMasterSchools();
    }
    function loadMasterSchools(){
      gmCall('gmAdminGetSchools',[],function(r){var host=document.getElementById('masterSchoolList');if(!host)return;if(!r||!r.success){host.innerHTML='<div class="alert alert-danger">'+gmEsc(r?.message||'Gagal memuat sekolah.')+'</div>';return;}var rows=r.data||[];host.innerHTML=rows.length?'<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Kode</th><th>Nama Sekolah</th><th>ID Sekolah</th><th class="text-end">Aksi</th></tr></thead><tbody>'+rows.map(function(x){return '<tr><td><span class="badge bg-primary-subtle text-primary">'+gmEsc(x.code)+'</span></td><td class="fw-semibold">'+gmEsc(x.name)+'</td><td><small class="text-muted">'+gmEsc(x.id)+'</small></td><td class="text-end"><button class="btn btn-sm btn-outline-primary" onclick="editMasterSchool(\''+gmEsc(x.id)+'\')"><i class="bi bi-pencil-square me-1"></i>Edit</button> <button class="btn btn-sm btn-outline-secondary" onclick="useMasterSchool(\''+gmEsc(x.id)+'\')">Pilih</button></td></tr>';}).join('')+'</tbody></table></div>':'<div class="gm-empty">Belum ada sekolah.</div>';});
    }
    function showMasterSchoolForm(data){var x=data||{};var host=document.getElementById('masterSchoolFormHost');if(!host)return;host.innerHTML='<div class="sisjar-settings-section"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0">'+(x.id?'Ubah Data Sekolah':'Tambah Sekolah Baru')+'</h5><button class="btn btn-sm btn-light" onclick="document.getElementById(\'masterSchoolFormHost\').innerHTML=\'\'">Tutup</button></div><div class="row g-3"><div class="col-md-4"><label class="form-label">Kode Sekolah *</label><input id="msCode" class="form-control" maxlength="20" placeholder="Contoh: SMK01" value="'+gmEsc(x.code||'')+'"></div><div class="col-md-8"><label class="form-label">Nama Sekolah *</label><input id="msName" class="form-control" placeholder="Nama resmi sekolah" value="'+gmEsc(x.name||'')+'"></div><div class="col-md-4"><label class="form-label">NPSN</label><input id="msNpsn" class="form-control" maxlength="20" value="'+gmEsc(x.settings?.NPSN||'')+'"></div><div class="col-md-8"><label class="form-label">Alamat Sekolah</label><input id="msAddress" class="form-control" value="'+gmEsc(x.settings?.ALAMAT_SEKOLAH||'')+'"></div><div class="col-md-8"><label class="form-label">Nama Kepala Sekolah</label><input id="msPrincipal" class="form-control" value="'+gmEsc(x.settings?.NAMA_KEPALA_SEKOLAH||'')+'"></div></div><div class="d-flex justify-content-end gap-2 mt-3"><button class="btn btn-outline-secondary" onclick="document.getElementById(\'masterSchoolFormHost\').innerHTML=\'\'">Batal</button><button class="btn btn-primary" onclick="saveMasterSchool(\''+gmEsc(x.id||'')+'\')"><i class="bi bi-check2-circle me-1"></i>Simpan Sekolah</button></div><div class="small text-muted mt-2">ID sekolah dibuat otomatis oleh database. Kode harus unik. Sekolah tidak dihapus secara fisik dari menu ini.</div></div>';host.scrollIntoView({behavior:'smooth',block:'start'});}
    function editMasterSchool(id){gmCall('gmAdminGetSchoolDetails',[id],function(r){if(!r||!r.success)return showToast(r?.message||'Gagal mengambil data sekolah.','error');showMasterSchoolForm(r.data);});}
    function saveMasterSchool(id){var payload={id:id||undefined,code:document.getElementById('msCode').value,name:document.getElementById('msName').value,npsn:document.getElementById('msNpsn').value,address:document.getElementById('msAddress').value,principal:document.getElementById('msPrincipal').value};if(!payload.code.trim()||!payload.name.trim())return showToast('Kode dan nama sekolah wajib diisi.','warning');var method=id?'gmAdminUpdateSchool':'gmAdminCreateSchool';gmCall(method,[payload],function(r){if(!r||!r.success)return showToast(r?.message||'Gagal menyimpan sekolah.','error');showToast(r.message||'Sekolah tersimpan.',r.warning?'warning':'success');document.getElementById('masterSchoolFormHost').innerHTML='';loadMasterSchools();});}
    function useMasterSchool(id){gmCall('gmSetActiveSchool',[id],function(r){if(!r||!r.success)return showToast(r?.message||'Gagal memilih sekolah.','error');showToast('Sekolah aktif berhasil dipilih.','success');});}

    var appSettings={};
    function loadAppSettingsUI(cb){gmCall('gmGetAppSettings',[getCredential()],function(r){if(r&&r.success){appSettings=r.data||{};document.getElementById('brandAppName')&&(document.getElementById('brandAppName').textContent=appSettings.NAMA_APLIKASI||'SISJAR');document.getElementById('brandSchoolName')&&(document.getElementById('brandSchoolName').textContent=appSettings.NAMA_SEKOLAH||'');}if(cb)cb(r);});}
    function renderAppSettings(c){
      if(!['superadmin','admin_sekolah'].includes(getUserRoleLocal())){c.innerHTML='<div class="gm-empty text-danger"><i class="bi bi-shield-x"></i><div class="fw-bold">Akses ditolak</div></div>';return;}
      loadAppSettingsUI(function(){var x=appSettings||{};c.innerHTML='<div class="gm-page-hero"><span>IDENTITAS & DOKUMEN</span><h3>Pengaturan SISJAR</h3><p>Identitas ini digunakan pada tampilan aplikasi dan otomatis dicantumkan saat laporan dicetak atau diekspor.</p></div><div class="sisjar-settings-card"><div class="sisjar-settings-section mb-3"><div class="sisjar-settings-title mb-3"><i class="bi bi-building me-2 text-primary"></i>Identitas Aplikasi & Sekolah</div><div class="row g-3"><div class="col-md-4"><label class="form-label">Nama Aplikasi</label><input id="setNamaAplikasi" class="form-control" value="'+gmEsc(x.NAMA_APLIKASI||'SISJAR')+'"></div><div class="col-md-8"><label class="form-label">Subjudul Aplikasi</label><input id="setSubjudul" class="form-control" value="'+gmEsc(x.SUBJUDUL_APLIKASI||'Sistem Informasi Mengajar')+'"></div><div class="col-md-6"><label class="form-label">Nama Sekolah</label><input id="setNamaSekolah" class="form-control" value="'+gmEsc(x.NAMA_SEKOLAH||'')+'"></div><div class="col-md-6"><label class="form-label">Alamat Sekolah</label><input id="setAlamatSekolah" class="form-control" value="'+gmEsc(x.ALAMAT_SEKOLAH||'')+'"></div><div class="col-md-4"><label class="form-label">Tahun Ajaran</label><input id="setTahunAjaran" class="form-control" value="'+gmEsc(x.TAHUN_AJARAN||'')+'"></div><div class="col-md-4"><label class="form-label">Semester</label><select id="setSemester" class="form-select"><option '+(x.SEMESTER==='Ganjil'?'selected':'')+'>Ganjil</option><option '+(x.SEMESTER==='Genap'?'selected':'')+'>Genap</option></select></div><div class="col-md-4"><label class="form-label">Tagline</label><input id="setTagline" class="form-control" value="'+gmEsc(x.TAGLINE||'')+'"></div></div></div><div class="sisjar-settings-section mb-3"><div class="sisjar-settings-title mb-3"><i class="bi bi-person-badge me-2 text-primary"></i>Identitas Guru</div><div class="row g-3"><div class="col-md-7"><label class="form-label">Nama Guru</label><input id="setNamaGuru" class="form-control" value="'+gmEsc(x.NAMA_GURU||'')+'"></div><div class="col-md-5"><label class="form-label">NIP Guru</label><input id="setNipGuru" class="form-control" value="'+gmEsc(x.NIP_GURU||'')+'"></div></div></div><div class="sisjar-settings-section sisjar-sign-card mb-3"><div class="sisjar-settings-title mb-3"><i class="bi bi-pen me-2 text-primary"></i>Identitas Kepala Sekolah</div><div class="row g-3"><div class="col-md-7"><label class="form-label">Nama Kepala Sekolah</label><input id="setNamaKepala" class="form-control" value="'+gmEsc(x.NAMA_KEPALA_SEKOLAH||'')+'"></div><div class="col-md-5"><label class="form-label">NIP Kepala Sekolah</label><input id="setNipKepala" class="form-control" value="'+gmEsc(x.NIP_KEPALA_SEKOLAH||'')+'"></div></div></div><div class="sisjar-settings-section sisjar-print-header-settings mb-3"><div class="sisjar-settings-title mb-3"><i class="bi bi-layout-text-window-reverse me-2 text-primary"></i>Kop / Header Cetak Manual</div><div class="row g-3"><div class="col-md-6"><label class="form-label">Judul Kop</label><input id="setKopJudul" class="form-control" value="'+gmEsc(x.KOP_JUDUL||'')+'" placeholder="Contoh: NAMA SEKOLAH"></div><div class="col-md-6"><label class="form-label">Subjudul Kop</label><input id="setKopSubjudul" class="form-control" value="'+gmEsc(x.KOP_SUBJUDUL||'')+'" placeholder="Contoh: PROGRAM KEAHLIAN..."></div><div class="col-12"><label class="form-label">Alamat / Kontak Kop</label><textarea id="setKopAlamat" class="form-control" rows="2" placeholder="Alamat, telepon, email, website, dll.">'+gmEsc(x.KOP_ALAMAT||'')+'</textarea></div><div class="col-12"><label class="form-label">Footer Cetak</label><input id="setKopFooter" class="form-control" value="'+gmEsc(x.KOP_FOOTER||'')+'" placeholder="Teks tambahan di bawah dokumen"></div></div><div class="gm-print-a4-note mt-2"><i class="bi bi-file-earmark"></i> Setiap laporan dapat dicetak menggunakan kertas A4 atau F4, potret maupun lanskap.</div></div><div class="d-flex justify-content-end gap-2"><button class="btn btn-outline-secondary" onclick="renderAppSettings(document.getElementById(\'dynamicContent\'))">Batal</button><button class="btn btn-primary px-4" onclick="saveAppSettings()"><i class="bi bi-check2-circle me-1"></i>Simpan Pengaturan</button></div><div class="sisjar-preview mt-4"><div class="app">'+gmEsc(x.NAMA_APLIKASI||'SISJAR')+' — '+gmEsc(x.SUBJUDUL_APLIKASI||'Sistem Informasi Mengajar')+'</div><div class="school">'+gmEsc(x.NAMA_SEKOLAH||'Nama Sekolah')+'</div><div class="meta">'+gmEsc(x.ALAMAT_SEKOLAH||'Alamat sekolah')+'</div><div class="sign"><div>Mengetahui,<br>Kepala Sekolah<strong>'+gmEsc(x.NAMA_KEPALA_SEKOLAH||'Nama Kepala Sekolah')+'</strong><small>'+(x.NIP_KEPALA_SEKOLAH?'NIP. '+gmEsc(x.NIP_KEPALA_SEKOLAH):'')+'</small></div><div>Guru Mata Pelajaran<strong>'+gmEsc(x.NAMA_GURU||'Nama Guru')+'</strong><small>'+(x.NIP_GURU?'NIP. '+gmEsc(x.NIP_GURU):'')+'</small></div></div></div></div>';
      renderSchoolSettingsSelector(c);
    });}
    // Multi-school: Superadmin must explicitly choose the school whose settings are being edited.
    function renderSchoolSettingsSelector(container){
      if(!container || getUserRoleLocal()!=='superadmin')return;
      gmCall('gmGetAvailableSchools',[],function(r){
        if(!r || !r.success)return;
        var current=localStorage.getItem('sisjar_active_school_id')||'';
        var html='<div class="card-flat mb-3" id="sisjarSchoolScopeCard"><div class="d-flex flex-wrap align-items-center gap-3"><div class="flex-grow-1"><strong>Pengaturan berdasarkan sekolah</strong><div class="text-muted small">Pilih sekolah sebelum mengubah identitas dan kop laporan.</div></div><div style="min-width:260px"><select id="sisjarSchoolScopeSelect" class="form-select"><option value="">Pilih sekolah...</option>'+(r.data||[]).map(function(x){return '<option value="'+gmEsc(x.id)+'" '+(x.id===current?'selected':'')+'>'+gmEsc(x.name)+' ('+gmEsc(x.code)+')</option>';}).join('')+'</select></div></div></div>';
        container.insertAdjacentHTML('afterbegin',html);
        var select=document.getElementById('sisjarSchoolScopeSelect');
        if(select)select.addEventListener('change',function(){
          var id=this.value;if(!id)return;
          gmCall('gmSetActiveSchool',[id],function(result){
            if(!result||!result.success){showToast(result?.message||'Gagal memilih sekolah.','error');return;}
            showToast('Konteks sekolah diganti. Memuat pengaturan...','success');
            renderAppSettings(container);
          });
        });
      });
    }

    function saveAppSettings(){var data={NAMA_APLIKASI:document.getElementById('setNamaAplikasi').value,SUBJUDUL_APLIKASI:document.getElementById('setSubjudul').value,NAMA_SEKOLAH:document.getElementById('setNamaSekolah').value,ALAMAT_SEKOLAH:document.getElementById('setAlamatSekolah').value,TAHUN_AJARAN:document.getElementById('setTahunAjaran').value,SEMESTER:document.getElementById('setSemester').value,TAGLINE:document.getElementById('setTagline').value,NAMA_GURU:document.getElementById('setNamaGuru').value,NIP_GURU:document.getElementById('setNipGuru').value,NAMA_KEPALA_SEKOLAH:document.getElementById('setNamaKepala').value,NIP_KEPALA_SEKOLAH:document.getElementById('setNipKepala').value,KOP_JUDUL:document.getElementById('setKopJudul').value,KOP_SUBJUDUL:document.getElementById('setKopSubjudul').value,KOP_ALAMAT:document.getElementById('setKopAlamat').value,KOP_FOOTER:document.getElementById('setKopFooter').value};gmCall('gmAdminSaveAppSettings',[data,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success){appSettings=r.data||data;loadAppSettingsUI();}});}
    var gmAdminScheduleRows = [];
    var gmEditingScheduleId = '';
    function renderGuruAdmin(c){
if(getUserRoleLocal()!=='superadmin'){c.innerHTML='<div class="gm-empty text-danger">Akses ditolak</div>';return;}
c.innerHTML='<div class="gm-page-hero"><span>ADMINISTRASI</span><h3>Data Guru</h3><p>Tambah dan ubah identitas guru, sekolah penempatan, kontak, role, serta status akun.</p></div>'+
'<div class="row g-3"><div class="col-lg-5"><div class="card-flat gm-admin-account-card"><div class="gm-admin-card-head"><div><div class="gm-admin-kicker">AKUN PENGGUNA</div><h6 class="gm-admin-title">Tambah Guru</h6><p class="gm-admin-subtitle">Email Auth dibuat otomatis oleh sistem.</p></div></div>'+
'<div class="gm-admin-form"><div class="gm-form-field"><label>Username</label><input id="gmAdmGuruUsername" class="form-control" placeholder="contoh: ahmad"></div><div class="gm-form-field"><label>Nama Lengkap</label><input id="gmAdmGuruNama" class="form-control" placeholder="Nama guru"></div>'+
'<div class="gm-form-field"><label>Sekolah *</label><select id="gmAdmGuruSchool" class="form-select"><option value="">Memuat daftar sekolah...</option></select></div>'+
'<div class="gm-form-grid"><div class="gm-form-field"><label>NIP</label><input id="gmAdmGuruNip" class="form-control"></div><div class="gm-form-field"><label>WhatsApp</label><input id="gmAdmGuruWA" class="form-control"></div></div>'+
'<div class="gm-form-grid"><div class="gm-form-field"><label>Email</label><input id="gmAdmGuruEmail" type="email" class="form-control"></div><div class="gm-form-field"><label>Role</label><select id="gmAdmGuruRole" class="form-select"><option value="guru">Guru</option><option value="admin_sekolah">Admin Sekolah</option></select></div></div>'+
'<div class="gm-form-field"><label>Password awal</label><input id="gmAdmGuruPassword" type="password" class="form-control" value="guru123!"></div></div>'+
'<button class="btn btn-primary gm-save-account-btn" onclick="saveGuruAdmin()">Simpan Akun</button></div></div>'+
'<div class="col-lg-7"><div class="card-flat"><div class="d-flex justify-content-between align-items-center"><h6 class="gm-admin-title mb-0">Daftar Guru</h6><button class="btn btn-outline-primary btn-sm" onclick="loadGuruDirectory()">Muat ulang</button></div>'+
'<div class="gm-form-field mt-3"><input id="gmGuruSearch" class="form-control" placeholder="Cari nama, username, NIP, atau sekolah..." oninput="filterGuruDirectory()"></div><div id="gmGuruDirectory" class="gm-table-wrap mt-3"></div></div></div></div>'+
'<div class="modal fade" id="gmEditTeacherModal" tabindex="-1"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Edit Data Guru</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">'+
'<input type="hidden" id="gmEditTeacherId"><div class="gm-form-field"><label>Username (tidak dapat diubah)</label><input id="gmEditTeacherUsername" class="form-control" disabled></div>'+
'<div class="gm-form-field"><label>Nama Lengkap</label><input id="gmEditTeacherName" class="form-control"></div><div class="gm-form-field"><label>Sekolah</label><select id="gmEditTeacherSchool" class="form-select"></select></div>'+
'<div class="gm-form-grid"><div class="gm-form-field"><label>NIP</label><input id="gmEditTeacherNip" class="form-control"></div><div class="gm-form-field"><label>WhatsApp</label><input id="gmEditTeacherPhone" class="form-control"></div></div>'+
'<div class="gm-form-field"><label>Email</label><input id="gmEditTeacherEmail" type="email" class="form-control"></div><div class="gm-form-grid"><div class="gm-form-field"><label>Role</label><select id="gmEditTeacherRole" class="form-select"><option value="guru">Guru</option><option value="admin_sekolah">Admin Sekolah</option></select></div><div class="gm-form-field"><label>Status</label><select id="gmEditTeacherStatus" class="form-select"><option>Aktif</option><option>Nonaktif</option></select></div></div>'+
'<div class="gm-form-field"><label>Password baru (opsional)</label><input id="gmEditTeacherPassword" type="password" class="form-control" placeholder="Kosongkan jika tidak diubah"></div></div><div class="modal-footer"><button class="btn btn-outline-secondary" data-bs-dismiss="modal">Batal</button><button class="btn btn-primary" onclick="saveTeacherEdit()">Simpan Perubahan</button></div></div></div></div>';
loadGuruSchoolOptions();loadGuruDirectory();
}
var gmGuruDirectoryRows=[];
function renderAdminJadwal(c){
if(getUserRoleLocal()!=='superadmin'){c.innerHTML='<div class="gm-empty text-danger">Akses ditolak</div>';return;}
c.innerHTML='<div class="gm-page-hero"><span>ADMINISTRASI</span><h3>Jadwal Mengajar</h3><p>Pengelolaan jadwal dipisahkan dari master data guru.</p></div><div class="card-flat"><h6 class="gm-admin-title" id="gmAdmScheduleFormTitle">Tambah Jadwal Mengajar</h6>'+
'<div class="row g-2"><div class="col-md-4"><label class="form-label">Guru</label><select id="gmAdmJadGuru" class="form-select"></select></div><div class="col-md-4"><label class="form-label">Kelas</label><select id="gmAdmJadKelas" class="form-select"></select></div><div class="col-md-4"><label class="form-label">Mata Pelajaran</label><input id="gmAdmJadMapel" class="form-control"></div><div class="col-md-3"><label class="form-label">Hari</label><select id="gmAdmJadHari" class="form-select"><option>Senin</option><option>Selasa</option><option>Rabu</option><option>Kamis</option><option>Jumat</option></select></div><div class="col-md-3"><label class="form-label">Jam Ke</label><input id="gmAdmJadJamKe" class="form-control"></div><div class="col-md-3"><label class="form-label">Mulai</label><input id="gmAdmJadMulai" type="time" class="form-control"></div><div class="col-md-3"><label class="form-label">Selesai</label><input id="gmAdmJadSelesai" type="time" class="form-control"></div></div>'+
'<div class="gm-schedule-form-actions"><button id="gmAdmScheduleSaveBtn" class="btn btn-success" onclick="saveGuruScheduleAdmin()">Simpan Jadwal</button><button id="gmAdmScheduleCancelBtn" class="btn btn-outline-secondary" onclick="cancelEditGuruSchedule()" style="display:none">Batal Edit</button></div>'+
'<div class="gm-schedule-list-head mt-4"><strong>Daftar Jadwal Mengajar</strong><span id="gmAdmScheduleCount" class="gm-schedule-count">0 jadwal</span></div><div id="gmAdmSchedules" class="mt-3"></div></div><div class="card-flat mt-3"><h6 class="fw-bold">Nomor WhatsApp Perwakilan Kelas</h6><div id="gmAdmClassWA"></div></div>';
loadAdminScheduleData();
}
async function loadGuruSchoolOptions(){var sel=document.getElementById('gmAdmGuruSchool');if(!sel)return;sel.innerHTML='<option value="">Memuat daftar sekolah...</option>';try{var r=await window.SISJAR_API.call('gmGetAvailableSchools');if(!r||!r.success)throw new Error(r?.message||'Gagal memuat sekolah.');var rows=r.data||[];var active=localStorage.getItem('sisjar_active_school_id')||'';sel.innerHTML='<option value="">Pilih sekolah...</option>'+rows.map(function(x){return '<option value="'+gmEsc(x.id)+'" '+(x.id===active?'selected':'')+'>'+gmEsc(x.name)+' ('+gmEsc(x.code)+')</option>';}).join('');}catch(e){sel.innerHTML='<option value="">'+gmEsc(e.message)+'</option>';}}
    async function loadGuruDirectory(){gmCall('gmAdminGetTeachers',[getCredential()],function(r){gmGuruDirectoryRows=r.data||[];filterGuruDirectory();});}
    function filterGuruDirectory(){var target=document.getElementById('gmGuruDirectory');if(!target)return;var q=(document.getElementById('gmGuruSearch')?.value||'').toLowerCase();var rows=gmGuruDirectoryRows.filter(x=>[x.nama,x.username,x.nip,x.school_name,x.school_code].join(' ').toLowerCase().includes(q));target.innerHTML='<table class="gm-table"><thead><tr><th>Guru</th><th>Sekolah</th><th>Role / Status</th><th>Aksi</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><strong>'+gmEsc(x.nama)+'</strong><br><small>'+gmEsc(x.username)+(x.nip?' • '+gmEsc(x.nip):'')+'</small></td><td>'+gmEsc(x.school_name||'Belum dipetakan')+'<br><small>'+gmEsc(x.school_code||'')+'</small></td><td>'+gmEsc(x.role||'guru')+'<br><small>'+gmEsc(x.status||'Aktif')+'</small></td><td class="gm-actions-cell"><button type="button" class="btn btn-sm btn-icon btn-outline-primary" title="Edit data guru" aria-label="Edit data guru" onclick="openTeacherEdit(\''+gmEsc(x.id)+'\')"><i class="bi bi-pencil-square"></i></button> <button type="button" class="btn btn-sm btn-icon btn-outline-danger" title="Hapus guru" aria-label="Hapus guru" onclick="deleteTeacherAccount(\''+gmEsc(x.id)+'\')"><i class="bi bi-trash3"></i></button></td></tr>').join('')+'</tbody></table>';}
    async function openTeacherEdit(id){var x=gmGuruDirectoryRows.find(r=>String(r.id)===String(id));if(!x)return;document.getElementById('gmEditTeacherId').value=x.id;document.getElementById('gmEditTeacherUsername').value=x.username||'';document.getElementById('gmEditTeacherName').value=x.nama||'';document.getElementById('gmEditTeacherNip').value=x.nip||'';document.getElementById('gmEditTeacherPhone').value=x.noWa||'';document.getElementById('gmEditTeacherEmail').value=x.email||'';document.getElementById('gmEditTeacherRole').value=x.role||'guru';document.getElementById('gmEditTeacherStatus').value=x.status||'Aktif';document.getElementById('gmEditTeacherPassword').value='';var sel=document.getElementById('gmEditTeacherSchool');var schools=await window.SISJAR_API.call('gmGetAvailableSchools');if(!schools.success)return showToast(schools.message||'Gagal memuat sekolah.','error');sel.innerHTML='<option value="">Pilih sekolah...</option>'+(schools.data||[]).map(z=>'<option value="'+gmEsc(z.id)+'">'+gmEsc(z.name)+' ('+gmEsc(z.code)+')</option>').join('');sel.value=x.school_id||'';gmShowModal('gmEditTeacherModal');}
    async function saveTeacherEdit(){var data={teacher_id:document.getElementById('gmEditTeacherId').value,username:document.getElementById('gmEditTeacherUsername').value,nama:document.getElementById('gmEditTeacherName').value.trim(),school_id:document.getElementById('gmEditTeacherSchool').value,nip:document.getElementById('gmEditTeacherNip').value.trim(),noWa:document.getElementById('gmEditTeacherPhone').value.trim(),email:document.getElementById('gmEditTeacherEmail').value.trim(),role:document.getElementById('gmEditTeacherRole').value,status:document.getElementById('gmEditTeacherStatus').value,password:document.getElementById('gmEditTeacherPassword').value};if(!data.nama||!data.school_id)return showToast('Nama dan sekolah wajib diisi.','error');showLoading('Menyimpan perubahan data guru...');try{var r=await SISJAR_AUTH.updateTeacher(data);hideLoading();showToast(r.message||'Data guru diperbarui.',r.success?'success':'error');if(r.success){gmHideModal('gmEditTeacherModal');loadGuruDirectory();}}catch(e){hideLoading();showToast(e.message||'Gagal memperbarui guru.','error');}}
    function gmShowModal(id){
      var el=document.getElementById(id);if(!el)return;
      if(window.bootstrap&&bootstrap.Modal){
        if(typeof bootstrap.Modal.getOrCreateInstance==='function'){bootstrap.Modal.getOrCreateInstance(el).show();return;}
        if(typeof bootstrap.Modal.getInstance==='function'){var existing=bootstrap.Modal.getInstance(el);if(existing){existing.show();return;}}
        try{new bootstrap.Modal(el).show();return;}catch(e){}
      }
      if(window.jQuery&&typeof jQuery.fn.modal==='function'){jQuery(el).modal('show');return;}
      el.style.display='block';el.classList.add('show');el.removeAttribute('aria-hidden');el.setAttribute('aria-modal','true');el.setAttribute('role','dialog');document.body.classList.add('modal-open');
      var backdrop=document.createElement('div');backdrop.className='modal-backdrop fade show';backdrop.dataset.gmModalBackdrop=id;document.body.appendChild(backdrop);
    }
    function gmHideModal(id){
      var el=document.getElementById(id);if(!el)return;
      if(window.bootstrap&&bootstrap.Modal){
        if(typeof bootstrap.Modal.getInstance==='function'){var existing=bootstrap.Modal.getInstance(el);if(existing){existing.hide();return;}}
        try{new bootstrap.Modal(el).hide();return;}catch(e){}
      }
      if(window.jQuery&&typeof jQuery.fn.modal==='function'){jQuery(el).modal('hide');return;}
      el.classList.remove('show');el.style.display='none';el.setAttribute('aria-hidden','true');el.removeAttribute('aria-modal');document.body.classList.remove('modal-open');document.querySelectorAll('[data-gm-modal-backdrop="'+id+'"]').forEach(x=>x.remove());
    }
    async function deleteTeacherAccount(id){
      var x=gmGuruDirectoryRows.find(r=>String(r.id)===String(id));if(!x)return;
      if(!confirm('Hapus akun guru '+(x.nama||x.username)+'?\\n\\nPenghapusan hanya diizinkan jika guru belum memiliki jadwal atau riwayat akademik. Jika sudah memiliki riwayat, ubah status menjadi Nonaktif melalui Edit agar data lama tetap aman.'))return;
      showLoading('Memeriksa data guru dan menghapus akun...');
      try{var r=await SISJAR_AUTH.deleteTeacher({teacher_id:x.id});hideLoading();if(!r||!r.success){showToast(r&&r.message||'Guru tidak dapat dihapus.','error');return;}showToast(r.message||'Akun guru dihapus.','success');loadGuruDirectory();}
      catch(e){hideLoading();showToast(e.message||'Gagal menghapus akun guru.','error');}
    }
    function loadAdminScheduleData(){gmCall('gmAdminGetTeachers',[getCredential()],function(r){var t=document.getElementById('gmAdmJadGuru');if(t)t.innerHTML=(r.data||[]).map(x=>'<option value="'+gmEsc(x.username)+'" data-id="'+gmEsc(x.id)+'">'+gmEsc(x.nama)+' ('+gmEsc(x.username)+')</option>').join('');});gmCall('gmAdminGetClasses',[getCredential()],function(r){var k=document.getElementById('gmAdmJadKelas');if(k)k.innerHTML=(r.data||[]).map(x=>'<option value="'+gmEsc(x.id)+'">'+gmEsc(x.nama)+'</option>').join('');});gmCall('gmAdminGetSchedules',[getCredential()],function(r){gmAdminScheduleRows=r.data||[];var count=document.getElementById('gmAdmScheduleCount');if(count)count.textContent=gmAdminScheduleRows.length+' jadwal';var target=document.getElementById('gmAdmSchedules');if(!target)return;target.innerHTML=gmAdminScheduleRows.length?'<div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>Guru</th><th>Kelas</th><th>Mapel</th><th>Hari</th><th>Jam</th><th>Aksi</th></tr></thead><tbody>'+gmAdminScheduleRows.map(x=>'<tr><td>'+gmEsc(x.guru)+'</td><td>'+gmEsc(x.kelas)+'</td><td>'+gmEsc(x.mapel)+'</td><td>'+gmEsc(x.hari)+'</td><td>'+gmEsc(x.jamMulai)+'–'+gmEsc(x.jamSelesai)+'</td><td><button class="btn btn-sm btn-outline-primary" onclick="editGuruSchedule(\''+gmEsc(x.id)+'\')">Edit</button> <button class="btn btn-sm btn-outline-danger" onclick="deleteGuruSchedule(\''+gmEsc(x.id)+'\')">Hapus</button></td></tr>').join('')+'</tbody></table></div>':'<div class="gm-empty">Belum ada jadwal.</div>';});gmCall('gmAdminGetClasses',[getCredential()],function(r){var el=document.getElementById('gmAdmClassWA');if(!el)return;el.innerHTML='<div class="gm-table-wrap"><table class="gm-table"><thead><tr><th>Kelas</th><th>No WhatsApp</th><th>Aksi</th></tr></thead><tbody>'+(r.data||[]).map(x=>'<tr><td>'+gmEsc(x.nama)+'</td><td><input id="gmwa_'+gmEsc(x.id)+'" class="form-control form-control-sm" value="'+gmEsc(x.wa)+'"></td><td><button class="btn btn-sm btn-primary" onclick="saveClassWA(\''+gmEsc(x.id)+'\')">Simpan</button></td></tr>').join('')+'</tbody></table></div>';});}
    function editGuruSchedule(id){var x=gmAdminScheduleRows.find(function(row){return String(row.id)===String(id);});if(!x)return showToast('Jadwal tidak ditemukan.','error');gmEditingScheduleId=String(x.id);var guru=document.getElementById('gmAdmJadGuru'),kelas=document.getElementById('gmAdmJadKelas');guru.value=x.username||'';kelas.value=x.idKelas||'';document.getElementById('gmAdmJadMapel').value=x.mapel||'';document.getElementById('gmAdmJadHari').value=x.hari||'Senin';document.getElementById('gmAdmJadJamKe').value=x.jamKe||'';document.getElementById('gmAdmJadMulai').value=x.jamMulai||'';document.getElementById('gmAdmJadSelesai').value=x.jamSelesai||'';document.getElementById('gmAdmScheduleFormTitle').textContent='Edit Jadwal Mengajar';var btn=document.getElementById('gmAdmScheduleSaveBtn');btn.innerHTML='<i class="bi bi-check2-circle me-1"></i>Perbarui Jadwal';btn.classList.remove('btn-success');btn.classList.add('btn-primary');document.getElementById('gmAdmScheduleCancelBtn').style.display='inline-flex';document.querySelector('.gm-schedule-form-actions').scrollIntoView({behavior:'smooth',block:'center'});}
    function cancelEditGuruSchedule(){gmEditingScheduleId='';['gmAdmJadMapel','gmAdmJadJamKe','gmAdmJadMulai','gmAdmJadSelesai'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});document.getElementById('gmAdmScheduleFormTitle').textContent='Tambah Jadwal Mengajar';var btn=document.getElementById('gmAdmScheduleSaveBtn');btn.innerHTML='<i class="bi bi-calendar-plus me-1"></i>Simpan Jadwal';btn.classList.remove('btn-primary');btn.classList.add('btn-success');document.getElementById('gmAdmScheduleCancelBtn').style.display='none';}
    function saveGuruScheduleAdmin(){var o=document.getElementById('gmAdmJadGuru').selectedOptions[0];var payload={id:gmEditingScheduleId||undefined,usernameGuru:document.getElementById('gmAdmJadGuru').value,idGuru:o?.dataset.id||'',idKelas:document.getElementById('gmAdmJadKelas').value,mapel:document.getElementById('gmAdmJadMapel').value,hari:document.getElementById('gmAdmJadHari').value,jamKe:document.getElementById('gmAdmJadJamKe').value,jamMulai:document.getElementById('gmAdmJadMulai').value,jamSelesai:document.getElementById('gmAdmJadSelesai').value};gmCall('gmAdminSaveSchedule',[payload,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success){cancelEditGuruSchedule();loadAdminScheduleData();}});}
    function deleteGuruSchedule(id){if(!confirm('Hapus jadwal ini?'))return;gmCall('gmAdminDeleteSchedule',[id,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success)loadAdminScheduleData();});}
    function saveClassWA(id){gmCall('gmAdminSaveClassWA',[id,document.getElementById('gmwa_'+id).value,getCredential()],function(r){showToast(r.message,r.success?'success':'error');});}
function toggleGuruPassword(){var i=document.getElementById('gmAdmGuruPassword');var b=document.querySelector('.gm-password-toggle i');if(!i)return;var show=i.type==='password';i.type=show?'text':'password';if(b)b.className=show?'bi bi-eye-slash':'bi bi-eye';}
    function updateGuruExcelName(input){var el=document.getElementById('gmAdmGuruExcelName');if(el)el.textContent=input&&input.files&&input.files.length?input.files[0].name:'Belum ada file dipilih';}
    async function saveGuruAdmin(){var data={username:document.getElementById('gmAdmGuruUsername').value,nama:document.getElementById('gmAdmGuruNama').value,noWa:document.getElementById('gmAdmGuruWA').value,nip:document.getElementById('gmAdmGuruNip')?.value||'',email:document.getElementById('gmAdmGuruEmail')?.value||'',school_id:document.getElementById('gmAdmGuruSchool')?.value||'',role:document.getElementById('gmAdmGuruRole').value,password:document.getElementById('gmAdmGuruPassword').value||'guru123!'};if(!data.username.trim()||!data.nama.trim()||!data.school_id)return showToast('Username, nama, dan sekolah wajib diisi.','error');try{showLoading('Membuat akun...');var r=await SISJAR_AUTH.provisionTeacher(data);hideLoading();showToast(r.message||'Akun berhasil disimpan.',r.success?'success':'error');if(r.success){document.getElementById('gmAdmGuruUsername').value='';document.getElementById('gmAdmGuruNama').value='';document.getElementById('gmAdmGuruWA').value='';document.getElementById('gmAdmGuruNip').value='';document.getElementById('gmAdmGuruEmail').value='';document.getElementById('gmAdmGuruRole').value='guru';document.getElementById('gmAdmGuruPassword').value='guru123!';loadGuruDirectory();}}catch(e){hideLoading();showToast(e.message||'Gagal membuat akun.','error');}}
async function importGuruExcel(){const input=document.getElementById('gmAdmGuruExcel');if(!input||!input.files.length)return showToast('Pilih file Excel guru terlebih dahulu.','error');try{const wb=XLSX.read(await input.files[0].arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:''}).map(r=>{const n={};Object.keys(r).forEach(k=>{const key=String(k).trim().toLowerCase().replace(/[\s_-]+/g,'');n[key]=r[k];});return {username:n.username||'',nama:n.nama||n.name||'',email:n.email||'',password:n.password||'guru123!',role:n.role||'guru',nip:n.nip||'',noWa:n.nowa||n.whatsapp||''};});if(!rows.length)return showToast('Excel tidak berisi data.','error');showLoading('Mengimpor akun guru...');const r=await SISJAR_AUTH.importTeachers(rows);hideLoading();showToast(r.message||'Import selesai.',r.success?'success':'error');loadGuruDirectory();}catch(e){hideLoading();showToast(e.message||'Import guru gagal.','error');}}
    function saveGuruScheduleAdmin(){var o=document.getElementById('gmAdmJadGuru').selectedOptions[0];var payload={id:gmEditingScheduleId||undefined,usernameGuru:document.getElementById('gmAdmJadGuru').value,idGuru:o?.dataset.id||'',idKelas:document.getElementById('gmAdmJadKelas').value,mapel:document.getElementById('gmAdmJadMapel').value,hari:document.getElementById('gmAdmJadHari').value,jamKe:document.getElementById('gmAdmJadJamKe').value,jamMulai:document.getElementById('gmAdmJadMulai').value,jamSelesai:document.getElementById('gmAdmJadSelesai').value};gmCall('gmAdminSaveSchedule',[payload,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success){cancelEditGuruSchedule();loadAdminScheduleData();}});}
    function deleteGuruSchedule(id){if(!confirm('Hapus jadwal ini?'))return;gmCall('gmAdminDeleteSchedule',[id,getCredential()],function(r){showToast(r.message,r.success?'success':'error');if(r.success)loadAdminScheduleData();});}
    function saveClassWA(id){gmCall('gmAdminSaveClassWA',[id,document.getElementById('gmwa_'+id).value,getCredential()],function(r){showToast(r.message,r.success?'success':'error');});}
    // ==============================================================
        // ==============================================================
    // INIT
    // ==============================================================
    document.addEventListener('DOMContentLoaded', function() {
        var todayLabel = document.getElementById('todayLabel');
        if (todayLabel) {
            todayLabel.textContent = new Intl.DateTimeFormat('id-ID', {
                weekday:'long', day:'2-digit', month:'long', year:'numeric'
            }).format(new Date());
        }
        setAppView(false);
        checkLocalSession();
        
        // Preload laporan bulan berjalan di background menggunakan satu bundle request.
        setTimeout(function() {
            var username = getCredential();
            if (!username) return;
            var selectKelas = document.getElementById('laporanKelasSiswa');
            if (!selectKelas || selectKelas.options.length <= 1) return;

            var today = new Date();
            var firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            var tglMulai = firstDay.toISOString().slice(0, 10);
            var tglSelesai = today.toISOString().slice(0, 10);
            var statuses = ['H', 'T', 'S', 'I', 'A'];
            var firstKelas = selectKelas.options[1].value;

            google.script.run
                .withSuccessHandler(function(res) {
                    if (res && res.success) {
                        AppCache.set('laporan_siswa_bundle_' + firstKelas + '_' + tglMulai + '_' + tglSelesai + '_' + statuses.slice().sort().join(''), {
                            rekap: res,
                            detail: res,
                            hariEfektif: res.hariEfektif
                        });
                    }
                })
                .getLaporanSiswaBundle(firstKelas, tglMulai, tglSelesai, statuses, username);
        }, 1500);
    });

/* ================================================================
   SISJAR GLOBAL TABLE SEARCH
   Adds contextual search to data tables that do not already have one.
   Filters currently loaded rows only; it does not replace server queries.
   ================================================================ */
(function(){
  'use strict';
  function hasExistingSearch(table){
    var card=table.closest('.card-flat,.card,.gm-panel,.gm-section,.table-responsive');
    if(!card) card=table.parentElement;
    if(!card) return false;
    return !!card.querySelector('input[type="search"],input[placeholder*="Cari" i],input[placeholder*="Search" i],[data-table-search]');
  }
  function headerTerms(table){
    var heads=Array.from(table.querySelectorAll('thead th')).map(function(th){return th.textContent.trim();}).filter(Boolean);
    var useful=heads.filter(function(x){return !/^(no|nomor|aksi|action|#)$/i.test(x);}).slice(0,3);
    return useful.length ? useful.join(', ') : 'nama, kelas, NIS, atau data lainnya';
  }
  function installTableSearch(table){
    if(!table || table.dataset.sisjarSearchInstalled==='1' || table.closest('.gm-print-area,.no-search,[data-no-search="true"]')) return;
    if(hasExistingSearch(table)) return;
    var parent=table.closest('.table-responsive,.gm-table-wrap') || table;
    var host=parent.parentElement || parent;
    if(!host || host.querySelector(':scope > .sisjar-table-search')) return;
    var bar=document.createElement('div');
    bar.className='sisjar-table-search';
    bar.innerHTML='<label><i class="bi bi-search" aria-hidden="true"></i><span class="visually-hidden">Cari data tabel</span><input type="search" autocomplete="off" placeholder="Cari '+headerTerms(table).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];})+'…" aria-label="Cari data pada tabel"></label><small class="sisjar-table-search-count" aria-live="polite"></small>';
    host.insertBefore(bar,parent);
    var input=bar.querySelector('input');
    var count=bar.querySelector('small');
    var apply=function(){
      var q=input.value.trim().toLocaleLowerCase('id');
      var rows=Array.from(table.querySelectorAll('tbody tr')).filter(function(tr){return !tr.classList.contains('sisjar-search-empty');});
      var visible=0;
      rows.forEach(function(tr){
        var match=!q || tr.textContent.toLocaleLowerCase('id').includes(q);
        tr.hidden=!match;
        if(match) visible++;
      });
      var empty=table.querySelector('tbody tr.sisjar-search-empty');
      if(!empty && rows.length){empty=document.createElement('tr');empty.className='sisjar-search-empty';var td=document.createElement('td');td.colSpan=Math.max(1,table.querySelectorAll('thead th').length);td.textContent='Tidak ada data yang cocok dengan pencarian.';empty.appendChild(td);table.querySelector('tbody')?.appendChild(empty);}
      if(empty) empty.hidden=(!q || visible>0 || rows.length===0);
      count.textContent=q ? visible+' dari '+rows.length+' baris' : rows.length+' baris';
    };
    input.addEventListener('input',apply);
    table.dataset.sisjarSearchInstalled='1';
    apply();
  }
  function scan(root){
    if(!root || !root.querySelectorAll) return;
    root.querySelectorAll('table').forEach(installTableSearch);
    if(root.matches && root.matches('table')) installTableSearch(root);
  }
  function start(){
    var content=document.getElementById('dynamicContent');
    if(!content) return;
    scan(content);
    var observer=new MutationObserver(function(records){
      records.forEach(function(record){record.addedNodes.forEach(function(node){if(node.nodeType===1) scan(node);});});
    });
    observer.observe(content,{childList:true,subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();

