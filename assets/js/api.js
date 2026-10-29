/* SISJAR API adapter: replaces google.script.run with direct Supabase queries. */
(function () {
  const sb = () => window.SISJAR_SB;
  const DAY = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const esc = v => String(v ?? '');
  const dateObj = d => new Date(`${d}T00:00:00`);
  const dayName = d => DAY[dateObj(d).getDay()];
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone: 'Asia/Jakarta'});
  const ok = data => ({success:true, data});
  const fail = message => ({success:false, message});

  async function profile() {
    const {data:{user}, error:uerr} = await sb().auth.getUser();
    if (uerr || !user) throw new Error('Sesi login tidak ditemukan.');
    const {data, error} = await sb().from('profiles').select('id,username,role,status,teacher_id,email,phone').eq('id', user.id).single();
    if (error) throw error;
    return data;
  }

  function scheduleShape(r, classes, teachers, subjects={}) {
    return {
      id: r.id, usernameGuru: r.teacher_username || '', idGuru: r.teacher_id || '',
      idKelas: r.class_id || '', kelas: classes[r.class_id]?.name || r.class_id || '',
      mapel: r.subject_name || subjects[r.subject_id]?.name || '', hari: r.day_name || '', jamKe: String(r.period_no ?? ''),
      jamMulai: r.start_time || '', jamSelesai: r.end_time || '',
      status: r.status || 'Aktif', noWaPerwakilan: classes[r.class_id]?.whatsapp || '',
      guru: teachers[r.teacher_id]?.name || r.teacher_username || ''
    };
  }

  async function classesMap() {
    const {data,error}=await sb().from('classes').select('id,name,whatsapp,status').eq('status','Aktif');
    if(error) throw error; return Object.fromEntries((data||[]).map(x=>[x.id,x]));
  }
  async function teachersMap() {
    const {data,error}=await sb().from('teachers').select('id,name,username,status').eq('status','Aktif');
    if(error) throw error; return Object.fromEntries((data||[]).map(x=>[x.id,x]));
  }

  async function gmGetMySchedules(_credential, tanggal='') {
    const p = await effectiveProfile();
    let q=sb().from('teaching_schedules').select('*').eq('teacher_id',p.teacher_id).neq('status','Nonaktif').order('day_name').order('period_no');
    if(tanggal) q=q.eq('day_name',dayName(tanggal));
    const {data,error}=await q; if(error) return fail(error.message);
    const [cm,tm,sm]=await Promise.all([classesMap(),teachersMap(),allSubjects()]);
    return ok((data||[]).map(x=>scheduleShape(x,cm,tm,mapSubject(sm))));
  }

  async function gmGetStudentsForSchedule(idKelas) {
    if(!idKelas) return fail('Kelas wajib dipilih.');
    const {data,error}=await sb().from('students').select('id,nis,name,class_id,parent_email,status').eq('class_id',idKelas).eq('status','Aktif').order('name');
    if(error) return fail(error.message);
    return ok((data||[]).map(x=>({id:x.id,nis:esc(x.nis),nama:x.name,idKelas:x.class_id,emailOrtu:x.parent_email||''})));
  }

  async function validateSchedule(idJadwal,tanggal) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return fail('Tanggal tidak valid.');
    if(tanggal>today()) return fail('Presensi belum dapat diisi untuk tanggal yang akan datang.');
    const p=await effectiveProfile();
    const {data,error}=await sb().from('teaching_schedules').select('*').eq('id',idJadwal).eq('teacher_id',p.teacher_id).single();
    if(error) return fail('Jadwal tidak ditemukan atau bukan milik akun guru.');
    if(data.day_name!==dayName(tanggal)) return fail(`Tanggal ${tanggal} tidak sesuai hari jadwal (${data.day_name}).`);
    const [cm,sm]=await Promise.all([classesMap(),allSubjects()]); return ok(scheduleShape(data,cm,{},mapSubject(sm)));
  }

  async function gmGetAttendance(idJadwal,tanggal) {
    const v=await validateSchedule(idJadwal,tanggal); if(!v.success) return v;
    const {data,error}=await sb().from('student_attendance').select('student_id,status').eq('schedule_id',idJadwal).eq('attendance_date',tanggal);
    if(error) return fail(error.message);
    const presensi={}; (data||[]).forEach(x=>presensi[x.student_id]=x.status);
    return {success:true,schedule:v.data,presensi};
  }

  async function gmSaveAttendance(idJadwal,tanggal,items) {
    const v=await validateSchedule(idJadwal,tanggal); if(!v.success) return v;
    if(!Array.isArray(items)) return fail('Data presensi tidak valid.');
    const students=await gmGetStudentsForSchedule(v.data.idKelas); if(!students.success)return students;
    const allowed=new Set(['H','T','S','I','A']);
    const validStudents=new Set(students.data.map(x=>x.id));
    const seen=new Set(); const rows=[];
    for(const item of items){const sid=esc(item.idSiswa).trim();const st=esc(item.status).toUpperCase();if(!sid||seen.has(sid))continue;seen.add(sid);if(!validStudents.has(sid))return fail('Ada siswa yang tidak terdaftar pada kelas jadwal.');if(!allowed.has(st))return fail('Status presensi tidak valid.');rows.push({attendance_date:tanggal,student_id:sid,class_id:v.data.idKelas,status:st,last_updated:new Date().toISOString(),schedule_id:idJadwal});}
    if(rows.length){const {error}=await sb().from('student_attendance').upsert(rows,{onConflict:'schedule_id,attendance_date,student_id'});if(error){
      // Existing schema has no declared composite unique constraint in the supplied schema.
      // Fall back to update/insert without assuming a new constraint.
      for(const r of rows){
        const {data:old,error:e1}=await sb().from('student_attendance').select('id').eq('schedule_id',r.schedule_id).eq('attendance_date',r.attendance_date).eq('student_id',r.student_id).limit(1);
        if(e1) return fail(e1.message);
        if(old&&old.length){const {error:e2}=await sb().from('student_attendance').update({status:r.status,last_updated:r.last_updated,class_id:r.class_id}).eq('id',old[0].id);if(e2)return fail(e2.message);}
        else {const {error:e3}=await sb().from('student_attendance').insert(r);if(e3)return fail(e3.message);}
      }
    }}
    return {success:true,message:`Presensi ${v.data.mapel} ${v.data.kelas} berhasil disimpan.`,schedule:v.data};
  }

  async function gmGetJournal(idJadwal,tanggal) {
    const att=await gmGetAttendance(idJadwal,tanggal); if(!att.success)return att;
    const {data,error}=await sb().from('teaching_journals').select('*').eq('schedule_id',idJadwal).eq('journal_date',tanggal).order('updated_at',{ascending:false}).limit(1);
    if(error)return fail(error.message);
    const students=await gmGetStudentsForSchedule(att.schedule.idKelas); if(!students.success)return students;
    const sm=Object.fromEntries(students.data.map(x=>[x.id,x.nama])); const cnt={H:0,T:0,S:0,I:0,A:0}; const names={H:[],T:[],S:[],I:[],A:[]};
    Object.entries(att.presensi).forEach(([sid,st])=>{st=esc(st).toUpperCase();if(cnt[st]!==undefined){cnt[st]++;if(sm[sid])names[st].push(sm[sid]);}});
    Object.values(names).forEach(a=>a.sort((a,b)=>a.localeCompare(b,'id')));
    const j=(data && data[0]) || null;
    return {success:true,schedule:att.schedule,tanggal,rekap:{hadir:cnt.H,terlambat:cnt.T,sakit:cnt.S,izin:cnt.I,alfa:cnt.A},namaStatus:names,jurnal:j?{id:j.id,hadir:j.present_count||0,sakit:j.sick_count||0,izin:j.permission_count||0,alfa:j.absent_count||0,materi:j.material||'',catatanMingguDepan:j.next_week_notes||'',catatanKelas:j.class_notes||''}:{hadir:cnt.H,terlambat:cnt.T,sakit:cnt.S,izin:cnt.I,alfa:cnt.A,materi:'',catatanMingguDepan:'',catatanKelas:''}};
  }

  async function gmSaveJournal(payload) {
    const {idJadwal,tanggal,materi='',catatanMingguDepan='',catatanKelas=''}=payload||{};
    const g=await gmGetJournal(idJadwal,tanggal); if(!g.success)return g;
    const p=await effectiveProfile(); const now=new Date().toISOString();
    const row={id:g.jurnal.id||`JRN-${Date.now()}-${crypto.randomUUID().slice(0,8)}`,teacher_id:p.teacher_id,teacher_username:p.username,schedule_id:idJadwal,class_id:g.schedule.idKelas,subject_name:g.schedule.mapel,journal_date:tanggal,period_no:Number(g.schedule.jamKe)||null,present_count:g.rekap.hadir,sick_count:g.rekap.sakit,permission_count:g.rekap.izin,absent_count:g.rekap.alfa,material:String(materi).trim(),next_week_notes:String(catatanMingguDepan).trim(),class_notes:String(catatanKelas).trim(),updated_at:now};
    const {error}=await sb().from('teaching_journals').upsert(row,{onConflict:'id'}); if(error)return fail(error.message);
    return {success:true,message:g.jurnal.id?'Jurnal mengajar berhasil diperbarui.':'Jurnal mengajar berhasil disimpan.',jurnal:row};
  }

  async function gmGetMyClasses(){const p=await effectiveProfile();if(String(p.role||'').toLowerCase()!=='guru')return fail('Akses ditolak.');const {data,error}=await sb().from('teaching_schedules').select('*').eq('teacher_id',p.teacher_id).neq('status','Nonaktif');if(error)return fail(error.message);const [classes,subjects]=await Promise.all([allActiveClasses(),allSubjects()]);const cm=mapClass(classes),sm=mapSubject(subjects),map={};(data||[]).forEach(x=>{const key=String(x.class_id)+'|'+String(x.subject_id||x.subject_name||'');if(!map[key])map[key]={idKelas:String(x.class_id),nama:String(cm[x.class_id]?.name||x.class_id),wa:String(cm[x.class_id]?.whatsapp||''),mapel:String(x.subject_name||sm[x.subject_id]?.name||'')};});return ok(Object.values(map).sort((a,b)=>a.nama.localeCompare(b.nama,'id',{numeric:true})||a.mapel.localeCompare(b.mapel,'id'))); }

  async function fetchAll(queryFactory, pageSize=1000) {
    const all=[];
    for(let from=0;;from+=pageSize){
      const {data,error}=await queryFactory().range(from,from+pageSize-1);
      if(error) throw error;
      const rows=data||[]; all.push(...rows);
      if(rows.length<pageSize) break;
    }
    return all;
  }

  async function getDashboardData(period='custom', _credential='', tglMulai='', tglSelesai='') {
    const todayStr=today();
    period=String(period||'custom').toLowerCase();
    let startStr='', endStr=todayStr;
    if(period==='custom'){
      startStr=String(tglMulai||'').trim();
      endStr=String(tglSelesai||'').trim();
      if(!/^\d{4}-\d{2}-\d{2}$/.test(startStr)||!/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return fail('Rentang tanggal dashboard belum valid.');
      if(endStr<startStr) return fail('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    }else{
      const base=new Date(`${todayStr}T00:00:00`);
      if(period==='daily') startStr=todayStr;
      else if(period==='weekly'){base.setDate(base.getDate()-6);startStr=base.toLocaleDateString('en-CA');}
      else if(period==='monthly'){base.setDate(base.getDate()-29);startStr=base.toLocaleDateString('en-CA');}
      else startStr='1970-01-01';
    }

    const [attendance, students, holidays] = await Promise.all([
      fetchAll(()=>sb().from('student_attendance').select('attendance_date,student_id,status').gte('attendance_date',startStr).lte('attendance_date',endStr).order('attendance_date')),
      fetchAll(()=>sb().from('students').select('id,name,status').eq('status','Aktif')),
      fetchAll(()=>sb().from('holidays').select('start_date,end_date,status').lte('start_date',endStr).gte('end_date',startStr))
    ]);

    const holidaySet=new Set();
    for(const h of holidays){
      if(String(h.status||'Aktif').toLowerCase()==='nonaktif') continue;
      let d=new Date(`${h.start_date}T00:00:00`), e=new Date(`${h.end_date||h.start_date}T00:00:00`);
      for(;d<=e;d.setDate(d.getDate()+1)) holidaySet.add(d.toLocaleDateString('en-CA'));
    }
    const effective=[];
    for(let d=new Date(`${startStr}T00:00:00`), e=new Date(`${endStr}T00:00:00`);d<=e;d.setDate(d.getDate()+1)){
      const key=d.toLocaleDateString('en-CA'), day=d.getDay();
      if(day!==0&&day!==6&&!holidaySet.has(key)) effective.push(key);
    }

    const statusCount={H:0,S:0,I:0,A:0,T:0};
    const siswaMap={};
    for(const row of attendance){
      const st=String(row.status||'').trim().toUpperCase();
      if(statusCount[st]===undefined) continue;
      statusCount[st]++;
      const sid=String(row.student_id||'').trim();
      if(!siswaMap[sid]) siswaMap[sid]={alfa:0};
      if(st==='A') siswaMap[sid].alfa++;
    }
    const totalKehadiran=Object.values(statusCount).reduce((a,b)=>a+b,0);
    const statusPercent={};
    Object.keys(statusCount).forEach(k=>statusPercent[k]=totalKehadiran?Math.round(statusCount[k]/totalKehadiran*1000)/10:0);
    const names=Object.fromEntries((students||[]).map(s=>[String(s.id),s.name]));
    const topAlfa=Object.entries(siswaMap).filter(([,v])=>v.alfa>0).sort((a,b)=>b[1].alfa-a[1].alfa).slice(0,5).map(([id,v])=>({nama:names[id]||id,alfa:v.alfa}));
    const hadirEfektif=statusCount.H+statusCount.T;
    const jumlahSiswa=students.length;
    return {success:true,period:'custom',start:startStr,end:endStr,hariEfektif:effective.length,jumlahSiswa,persenKehadiran:effective.length&&jumlahSiswa?Math.round(hadirEfektif/(effective.length*jumlahSiswa)*100):0,statusCount,statusPercent,totalKehadiran,topAlfa};
  }



  // ---------------------------------------------------------------------------
  // KALENDER LIBUR — migrasi penuh dari Master_Libur / getKalenderLibur()
  // Menggunakan tabel Supabase `holidays` yang sudah ada. Tidak membuat schema baru.
  // ---------------------------------------------------------------------------
  function isValidDateKey(v){ return /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')); }
  function dateKeyPlusOne(d){ const x=dateObj(d); x.setDate(x.getDate()+1); return x.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}); }
  function holidayDateRange(row){
    const start=String(row.start_date||row.tanggal_mulai||row.start||'').slice(0,10);
    const end=String(row.end_date||row.tanggal_selesai||row.end||start).slice(0,10) || start;
    return {start,end};
  }
  function holidayDescription(row){
    return String(row.keterangan ?? row.description ?? row.name ?? row.title ?? row.nama ?? 'Hari Libur').trim() || 'Hari Libur';
  }
  function holidayStatus(row){ return String(row.status ?? 'Aktif').trim() || 'Aktif'; }
  function holidayId(row){
    return row.id ?? row.holiday_id ?? row.id_libur ?? row.ID_Libur ?? `${holidayDateRange(row).start}__${holidayDateRange(row).end}`;
  }
  function isActiveHoliday(row){ return holidayStatus(row).toLowerCase() !== 'nonaktif'; }

  async function getHolidayRows(){
    const {data,error}=await sb().from('holidays').select('*').order('start_date',{ascending:true});
    if(error) throw error;
    return data||[];
  }

  async function requireHolidayRole(write=false){
    const p=await profile();
    const role=String(p.role||'').toLowerCase();
    if(write && role!=='superadmin') return {ok:false,profile:p,result:fail('Akses ditolak. Hanya Superadmin yang dapat mengubah kalender libur.')};
    if(!write && role!=='superadmin' && role!=='piket') return {ok:false,profile:p,result:fail('Akses ditolak.')};
    return {ok:true,profile:p};
  }

  async function getKalenderLibur(_credential=''){
    // Kalender Libur adalah modul administrasi Superadmin, bukan modul Guru/Piket.
    const access=await requireHolidayRole(true); if(!access.ok)return access.result;
    const rows=await getHolidayRows();
    const data=rows.filter(isActiveHoliday).map(r=>{
      const x=holidayDateRange(r);
      return {id:holidayId(r),start:x.start,end:x.end,keterangan:holidayDescription(r),status:holidayStatus(r)};
    }).filter(x=>isValidDateKey(x.start)).sort((a,b)=>a.start.localeCompare(b.start));
    return {success:true,data};
  }

  function rangeContainsWeekday(start,end){
    let d=dateObj(start), e=dateObj(end);
    while(d<=e){ const day=d.getDay(); if(day!==0 && day!==6)return true; d.setDate(d.getDate()+1); }
    return false;
  }

  async function insertHolidayRow(start,end,keterangan){
    const base={start_date:start,end_date:end,status:'Aktif'};
    // The existing `holidays` table may call the text column either
    // `description` or `keterangan`. Try the most conventional form first,
    // then the legacy name. No schema is created or altered here.
    const attempts=[
      {...base,description:keterangan},
      {...base,keterangan:keterangan},
      base
    ];
    let lastError=null;
    for(const row of attempts){
      const {data,error}=await sb().from('holidays').insert(row).select('*').single();
      if(!error)return data;
      lastError=error;
      const msg=String(error.message||'').toLowerCase();
      const missingColumn=/column .* does not exist|could not find .* column|schema cache/.test(msg);
      if(!missingColumn)break;
    }
    throw lastError || new Error('Gagal menyimpan hari libur.');
  }

  async function tambahLiburRange(tanggalMulai,tanggalSelesai,keterangan,_credential=''){
    const access=await requireHolidayRole(true); if(!access.ok)return access.result;
    const start=String(tanggalMulai||''), end=String(tanggalSelesai||''), desc=String(keterangan||'').trim();
    if(!isValidDateKey(start)||!isValidDateKey(end))return fail('Tanggal mulai dan selesai wajib valid.');
    if(end<start)return fail('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if(!desc)return fail('Keterangan libur wajib diisi.');
    if(!rangeContainsWeekday(start,end))return fail('Rentang tersebut hanya berisi Sabtu/Minggu. Keduanya sudah otomatis LIBUR.');

    const rows=await getHolidayRows();
    const overlap=rows.filter(isActiveHoliday).some(r=>{
      const x=holidayDateRange(r);
      return isValidDateKey(x.start) && start<=x.end && end>=x.start;
    });
    if(overlap)return fail('Rentang tersebut bertabrakan dengan hari libur yang sudah ada.');

    try{
      const saved=await insertHolidayRow(start,end,desc);
      return {success:true,message:'Rentang hari libur berhasil disimpan.',data:{id:holidayId(saved),start,end,keterangan:holidayDescription(saved)}};
    }catch(e){ return fail(e.message||'Gagal menyimpan rentang hari libur.'); }
  }

  async function tambahLibur(tanggal,keterangan,credential=''){
    return tambahLiburRange(tanggal,tanggal,keterangan,credential);
  }

  async function hapusLibur(idLibur,_credential=''){
    const access=await requireHolidayRole(true); if(!access.ok)return access.result;
    const id=String(idLibur||'');
    if(!id)return fail('ID hari libur tidak valid.');
    const rows=await getHolidayRows();
    const target=rows.find(r=>String(holidayId(r))===id);
    if(!target)return fail('Data hari libur tidak ditemukan.');

    let q=sb().from('holidays').delete();
    const key = target.id!=null ? 'id' : target.holiday_id!=null ? 'holiday_id' : target.id_libur!=null ? 'id_libur' : target.ID_Libur!=null ? 'ID_Libur' : null;
    if(key) q=q.eq(key,target[key]);
    else {
      const x=holidayDateRange(target);
      q=q.eq('start_date',x.start).eq('end_date',x.end);
    }
    const {error}=await q;
    if(error)return fail(error.message);
    return {success:true,message:'Rentang hari libur berhasil dihapus.'};
  }

  async function getInfoHari(tanggal,_credential=''){
    const access=await requireHolidayRole(false); if(!access.ok)return access.result;
    const t=String(tanggal||'');
    if(!isValidDateKey(t))return {success:true,tanggal:t,valid:false,libur:false,jenis:'',keterangan:''};
    const d=dateObj(t); if(isNaN(d.getTime()))return {success:true,tanggal:t,valid:false,libur:false,jenis:'',keterangan:''};
    if(d.getDay()===0)return {success:true,tanggal:t,valid:true,libur:true,jenis:'Minggu',keterangan:'Hari Libur (Minggu)'};
    if(d.getDay()===6)return {success:true,tanggal:t,valid:true,libur:true,jenis:'Sabtu',keterangan:'Hari Libur (Sabtu)'};
    const rows=await getHolidayRows();
    const h=rows.find(r=>isActiveHoliday(r) && (()=>{const x=holidayDateRange(r);return isValidDateKey(x.start)&&t>=x.start&&t<=x.end;})());
    if(h)return {success:true,tanggal:t,valid:true,libur:true,jenis:'Libur Nasional/Sekolah',keterangan:holidayDescription(h)};
    return {success:true,tanggal:t,valid:true,libur:false,jenis:'Hari Efektif',keterangan:''};
  }

  async function getHariEfektif(tglMulai,tglSelesai,_credential=''){
    const access=await requireHolidayRole(false); if(!access.ok)return access.result;
    const start=String(tglMulai||''), end=String(tglSelesai||'');
    if(!isValidDateKey(start)||!isValidDateKey(end)||end<start)return fail('Rentang tanggal tidak valid.');
    const rows=await getHolidayRows();
    const holidays=rows.filter(isActiveHoliday).map(holidayDateRange).filter(x=>isValidDateKey(x.start));
    const dates=[];
    for(let d=dateObj(start),e=dateObj(end);d<=e;d.setDate(d.getDate()+1)){
      const key=d.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});
      if(d.getDay()===0||d.getDay()===6)continue;
      if(holidays.some(h=>key>=h.start&&key<=h.end))continue;
      dates.push(key);
    }
    return {success:true,data:dates};
  }


  // ========================================================================
  // COMPLETE SUPABASE MIGRATION — legacy/admin/report compatibility
  // Semua fungsi di bawah membaca/menulis schema Supabase yang sudah ada.
  // Tidak membuat tabel baru dan tidak mengubah schema.
  // ========================================================================
  const currentRole = async () => {
    const p = await profile();
    return String(p.role || '').toLowerCase();
  };

  async function effectiveProfile() {
    const p = await profile();
    const switched = String(localStorage.getItem('ePiket_isSuperMode') || '') === '1';
    const target = String(localStorage.getItem('ePiket_user') || '').trim();
    if (p.role === 'superadmin' && switched && target) {
      const {data,error}=await sb().from('teachers').select('*').eq('username',target).eq('status','Aktif').single();
      if (!error && data) return { ...p, role:'guru', username:data.username, teacher_id:data.id, _superadmin:true };
    }
    return p;
  }

  async function requireSuperadmin() {
    const p=await profile();
    if(String(p.role||'').toLowerCase()!=='superadmin') return {ok:false,profile:p,result:fail('Akses ditolak. Hanya Superadmin yang dapat mengakses fungsi ini.')};
    return {ok:true,profile:p};
  }
  async function requirePiketOrAdmin() {
    const p=await effectiveProfile();
    const role=String(p.role||'').toLowerCase();
    if(role!=='piket' && role!=='superadmin' && !(p._superadmin&&role==='guru')) return {ok:false,profile:p,result:fail('Akses ditolak.')};
    return {ok:true,profile:p};
  }
  async function requireGuruOrAdmin() {
    const p=await effectiveProfile();
    const role=String(p.role||'').toLowerCase();
    if(role!=='guru' && role!=='superadmin') return {ok:false,profile:p,result:fail('Akses ditolak.')};
    return {ok:true,profile:p};
  }

  const fmtTime = v => String(v ?? '').slice(0,5);
  const mapClass = rows => Object.fromEntries((rows||[]).map(x=>[String(x.id),x]));
  const mapTeacher = rows => Object.fromEntries((rows||[]).map(x=>[String(x.id),x]));
  const mapSubject = rows => Object.fromEntries((rows||[]).map(x=>[String(x.id),x]));

  async function allActiveClasses(){
    const {data,error}=await sb().from('classes').select('*').order('name');
    if(error) throw error; return data||[];
  }
  async function allActiveTeachers(){
    const {data,error}=await sb().from('teachers').select('*').order('name');
    if(error) throw error; return data||[];
  }
  async function allSubjects(){
    const {data,error}=await sb().from('subjects').select('*').order('name');
    if(error) throw error; return data||[];
  }
  const subjectName = s => String(s?.name ?? s?.nama ?? s?.subject_name ?? s?.title ?? '');

  async function getKelasDropdown(){
    try { return (await allActiveClasses()).filter(x=>String(x.status||'Aktif').toLowerCase()!=='nonaktif').map(x=>({id:String(x.id),nama:String(x.name||x.nama||x.id)})).sort((a,b)=>a.nama.localeCompare(b.nama,'id',{numeric:true})); }
    catch(e){ return []; }
  }
  async function getDaftarKelas(_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result;
    return (await allActiveClasses()).map(x=>({id:String(x.id),nama:String(x.name||x.nama||x.id),wa:String(x.whatsapp||x.wa||'')}));
  }
  async function tambahKelas(namaKelas,_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result;
    const nama=String(namaKelas||'').trim(); if(!nama)return fail('Nama kelas tidak boleh kosong.');
    const id='KLS-'+Date.now(); const {error}=await sb().from('classes').insert({id,name:nama,whatsapp:'',status:'Aktif'});
    if(error)return fail(error.message); return {success:true,message:'Kelas berhasil ditambahkan.',id};
  }
  async function editKelas(idKelas,namaBaru,_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result;
    const nama=String(namaBaru||'').trim(); if(!nama)return fail('Nama kelas tidak boleh kosong.');
    const {error}=await sb().from('classes').update({name:nama}).eq('id',String(idKelas));
    if(error)return fail(error.message); return {success:true,message:'Kelas berhasil diupdate.'};
  }
  async function hapusKelas(idKelas,_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result;
    const {error}=await sb().from('classes').delete().eq('id',String(idKelas));
    if(error)return fail(error.message); return {success:true,message:'Kelas berhasil dihapus.'};
  }

  async function getDaftarSiswa(idKelas='SEMUA',_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result;
    let q=sb().from('students').select('id,nis,name,class_id,parent_email,status').order('name');
    if(idKelas && idKelas!=='SEMUA')q=q.eq('class_id',idKelas);
    const {data,error}=await q; if(error)return fail(error.message);
    const classes=mapClass(await allActiveClasses());
    const rows=(data||[]).map(x=>({id:String(x.id),nis:String(x.nis??''),nama:String(x.name??''),idKelas:String(x.class_id??''),kelas:String(classes[x.class_id]?.name||x.class_id||''),emailOrtu:String(x.parent_email||''),status:String(x.status||'Aktif')}));
    return {success:true,data:rows,total:rows.length};
  }
  async function tambahSiswa(data,_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result; data=data||{};
    const nis=String(data.nis||'').trim(),nama=String(data.nama||'').trim(),idKelas=String(data.idKelas||'').trim(),email=String(data.emailOrtu||'').trim();
    if(!nis||!nama||!idKelas)return fail('NIS, Nama Siswa, dan Kelas wajib diisi.');
    const c=await sb().from('classes').select('id').eq('id',idKelas).single(); if(c.error)return fail('Kelas tidak ditemukan.');
    const d=await sb().from('students').select('id').eq('nis',nis).limit(1); if(d.error)return fail(d.error.message); if((d.data||[]).length)return fail('NIS '+nis+' sudah digunakan oleh siswa lain.');
    const id='SIS-'+crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase();
    const {data:s,error}=await sb().from('students').insert({id,nis,name:nama,class_id:idKelas,parent_email:email,status:'Aktif'}).select('*').single();
    if(error)return fail(error.message); return {success:true,message:'Siswa '+nama+' berhasil ditambahkan.',data:{id:s.id,nis:s.nis,nama:s.name,idKelas:s.class_id,emailOrtu:s.parent_email||''}};
  }
  async function updateSiswa(data,_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result; data=data||{};
    const id=String(data.id||'').trim(),nis=String(data.nis||'').trim(),nama=String(data.nama||'').trim(),idKelas=String(data.idKelas||'').trim(),email=String(data.emailOrtu||'').trim();
    if(!id||!nis||!nama||!idKelas)return fail('ID, NIS, Nama Siswa, dan Kelas wajib diisi.');
    const dup=await sb().from('students').select('id').eq('nis',nis).neq('id',id).limit(1); if(dup.error)return fail(dup.error.message); if((dup.data||[]).length)return fail('NIS '+nis+' sudah digunakan oleh siswa lain.');
    const {data:s,error}=await sb().from('students').update({nis,name:nama,class_id:idKelas,parent_email:email}).eq('id',id).select('*').single(); if(error)return fail(error.message);
    return {success:true,message:'Data siswa '+nama+' berhasil diperbarui.',data:{id:s.id,nis:s.nis,nama:s.name,idKelas:s.class_id,emailOrtu:s.parent_email||''}};
  }
  async function hapusSiswa(idSiswa,_username=''){
    const a=await requireSuperadmin(); if(!a.ok)return a.result; const id=String(idSiswa||'').trim(); if(!id)return fail('ID siswa tidak valid.');
    const st=await sb().from('students').select('id,name,class_id').eq('id',id).single(); if(st.error)return fail('Siswa tidak ditemukan.');
    const sc=await sb().from('student_scores').delete().eq('student_id',id); if(sc.error)return fail(sc.error.message);
    const at=await sb().from('student_attendance').delete().eq('student_id',id); if(at.error)return fail(at.error.message);
    const {error}=await sb().from('students').delete().eq('id',id); if(error)return fail(error.message);
    return {success:true,message:'Siswa '+st.data.name+' berhasil dihapus beserta riwayat presensi dan nilainya.',idSiswa:id,idKelas:st.data.class_id,nama:st.data.name};
  }
  async function getSiswaByKelas(idKelas,_username=''){
    const a=await requirePiketOrAdmin(); if(!a.ok)return a.result;
    const {data,error}=await sb().from('students').select('id,nis,name,class_id,parent_email,status').eq('class_id',idKelas).eq('status','Aktif').order('name'); if(error)return fail(error.message);
    return (data||[]).map(x=>({id:x.id,nis:String(x.nis??''),nama:x.name,idKelas:x.class_id,emailOrtu:x.parent_email||''}));
  }

  async function attendanceScheduleForClassDate(idKelas,tanggal){ const {data,error}=await sb().from('teaching_schedules').select('id').eq('class_id',idKelas).eq('day_name',dayName(tanggal)).neq('status','Nonaktif').order('period_no').limit(1); if(error)throw error; return data?.[0]?.id||null; }
  async function getPresensiSiswa(tanggal,idKelas,_username=''){
    const a=await requirePiketOrAdmin(); if(!a.ok)return {};
    const {data,error}=await sb().from('student_attendance').select('student_id,status').eq('attendance_date',tanggal).eq('class_id',idKelas); if(error)return {};
    const out={}; (data||[]).forEach(x=>out[x.student_id]=x.status); return out;
  }
  async function savePresensiSiswa(tanggal,idKelas,dataPresensi,_username=''){
    const a=await requirePiketOrAdmin(); if(!a.ok)return a.result;
    const info=await getInfoHari(tanggal); if(!info.success)return info; if(info.libur)return fail('Presensi tidak dapat diisi karena '+info.keterangan+'.');
    if(tanggal>today())return fail('Presensi belum dapat diisi untuk tanggal yang akan datang.');
    const students=await getSiswaByKelas(idKelas); if(!Array.isArray(students))return students; const attendanceScheduleId=await attendanceScheduleForClassDate(idKelas,tanggal); if(!attendanceScheduleId)return fail('Tidak ada jadwal kelas pada hari tersebut untuk mengikat data presensi.');
    const allowed=new Set(['H','S','I','A','T']), valid=new Set(students.map(x=>x.id)), seen=new Set(), rows=[];
    for(const item of (Array.isArray(dataPresensi)?dataPresensi:[])){
      const sid=String(item.idSiswa||'').trim(),st=String(item.status||'').toUpperCase(); if(!sid||seen.has(sid))continue; seen.add(sid);
      if(!valid.has(sid))return fail('Ada siswa yang tidak terdaftar pada kelas yang dipilih.'); if(!allowed.has(st))return fail('Status presensi tidak valid.');
      rows.push({attendance_date:tanggal,student_id:sid,class_id:idKelas,status:st,last_updated:new Date().toISOString(),schedule_id:attendanceScheduleId});
    }
    for(const r of rows){const q=await sb().from('student_attendance').select('id').eq('attendance_date',r.attendance_date).eq('student_id',r.student_id).eq('class_id',r.class_id).limit(1);if(q.error)return fail(q.error.message);if(q.data?.length){const u=await sb().from('student_attendance').update({status:r.status,last_updated:r.last_updated}).eq('id',q.data[0].id);if(u.error)return fail(u.error.message);}else{const ins={...r,id:'PRS-'+crypto.randomUUID().replace(/-/g,'').slice(0,14)};const z=await sb().from('student_attendance').insert(ins);if(z.error)return fail(z.error.message);}}
    return {success:true,message:'Presensi siswa berhasil disimpan! ('+rows.length+' siswa)'};
  }
  async function deletePresensiSiswa(tanggal,idKelas,_username=''){
    const a=await requirePiketOrAdmin(); if(!a.ok)return a.result; const {data,error}=await sb().from('student_attendance').select('id').eq('attendance_date',tanggal).eq('class_id',idKelas); if(error)return fail(error.message);
    const ids=(data||[]).map(x=>x.id); if(ids.length){const z=await sb().from('student_attendance').delete().in('id',ids);if(z.error)return fail(z.error.message);} return {success:true,message:ids.length+' data presensi dihapus.'};
  }

  function mondayDates(tglSenin){
    if(!isValidDateKey(tglSenin))return null; const d=dateObj(tglSenin); if(d.getDay()!==1)return null; const out=[];for(let i=0;i<5;i++){const x=new Date(d);x.setDate(d.getDate()+i);out.push(x.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}));}return out;
  }
  async function getPresensiSiswaMingguan(tglSenin,idKelas,_username=''){
    const a=await requirePiketOrAdmin(); if(!a.ok)return a.result; const dates=mondayDates(String(tglSenin)); if(!dates||!idKelas)return fail('Parameter minggu atau kelas tidak valid.');
    const {data,error}=await sb().from('student_attendance').select('attendance_date,student_id,status').eq('class_id',idKelas).gte('attendance_date',dates[0]).lte('attendance_date',dates[4]); if(error)return fail(error.message);
    const presensi={};(data||[]).forEach(x=>presensi[x.attendance_date+'|'+x.student_id]=x.status); const hari={};for(const d of dates){const info=await getInfoHari(d);hari[d]={libur:!!info.libur,keterangan:info.keterangan||''};}
    return {success:true,tglSenin:String(tglSenin),today:today(),dates,presensi,hari};
  }
  async function savePresensiSiswaMingguan(tglSenin,idKelas,dataPresensi,_username=''){
    const a=await requirePiketOrAdmin(); if(!a.ok)return a.result; const dates=mondayDates(String(tglSenin)); if(!dates||!idKelas||!Array.isArray(dataPresensi))return fail('Parameter presensi mingguan tidak valid.');
    const allowed=new Set(['H','S','I','A','T']), students=await getSiswaByKelas(idKelas); if(!Array.isArray(students))return students; const valid=new Set(students.map(x=>x.id)); const seen=new Set();
    for(const item of dataPresensi){const tanggal=String(item.tanggal||''),sid=String(item.idSiswa||''),st=String(item.status||'').toUpperCase();const key=tanggal+'|'+sid;if(!dates.includes(tanggal)||!sid||seen.has(key))continue;if(tanggal>today())continue;seen.add(key);if(!allowed.has(st))return fail('Status presensi tidak valid.');if(!valid.has(sid))return fail('Siswa tidak terdaftar pada kelas.');const info=await getInfoHari(tanggal);if(!info.success)return info;if(info.libur)continue;const attendanceScheduleId=await attendanceScheduleForClassDate(idKelas,tanggal);if(!attendanceScheduleId)return fail('Tidak ada jadwal kelas pada '+tanggal+' untuk mengikat data presensi.');const q=await sb().from('student_attendance').select('id').eq('attendance_date',tanggal).eq('student_id',sid).eq('class_id',idKelas).limit(1);if(q.error)return fail(q.error.message);if(q.data?.length){const u=await sb().from('student_attendance').update({status:st,last_updated:new Date().toISOString()}).eq('id',q.data[0].id);if(u.error)return fail(u.error.message);}else{const ins=await sb().from('student_attendance').insert({id:'PRS-'+crypto.randomUUID().replace(/-/g,'').slice(0,14),attendance_date:tanggal,student_id:sid,class_id:idKelas,status:st,last_updated:new Date().toISOString(),schedule_id:attendanceScheduleId});if(ins.error)return fail(ins.error.message);}}
    return {success:true,message:'Presensi Senin–Jumat berhasil disimpan ('+dates.length+' hari).'};
  }

  async function getReportBundleCore(kelas,tglMulai,tglSelesai,selectedStatuses){
    const allDates=[];for(let d=dateObj(tglMulai),e=dateObj(tglSelesai);d<=e;d.setDate(d.getDate()+1))allDates.push(d.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'}));
    const effectiveSet=new Set(await getHariEfektif(tglMulai,tglSelesai).then(r=>r.data||[]));
    const [students,classes,attendance]=await Promise.all([
      fetchAll(()=>sb().from('students').select('id,nis,name,class_id,status').eq('status','Aktif').order('name')),
      allActiveClasses(),
      fetchAll(()=>sb().from('student_attendance').select('attendance_date,student_id,class_id,status,schedule_id,last_updated').gte('attendance_date',tglMulai).lte('attendance_date',tglSelesai))
    ]);
    const cm=mapClass(classes), wanted=String(kelas||''); const filtered=(students||[]).filter(s=>!wanted||wanted==='SEMUA'||String(s.class_id)===wanted); const sm=Object.fromEntries(filtered.map(s=>[String(s.id),s]));
    const statusSet=new Set((selectedStatuses||['H','T','S','I','A']).filter(x=>['H','T','S','I','A'].includes(x))); const counts={H:0,T:0,S:0,I:0,A:0}; const per={}; const detail={};
    filtered.forEach(s=>{per[s.id]={id:s.id,nis:String(s.nis??''),nama:s.name,kelas:cm[s.class_id]?.name||s.class_id,H:0,T:0,S:0,I:0,A:0,total:0,hariEfektif:effectiveSet.size,persen:0,persenTerlambat:0};detail[s.id]={};allDates.forEach(d=>detail[s.id][d]=effectiveSet.has(d)?'-':'LIBUR');});
    const latest={};(attendance||[]).forEach(r=>{const sid=String(r.student_id),d=String(r.attendance_date),st=String(r.status||'').toUpperCase();if(!sm[sid]||!effectiveSet.has(d)||!statusSet.has(st))return;const key=sid+'|'+d;const ts=new Date(r.last_updated||0).getTime();if(!latest[key]||ts>=latest[key].ts)latest[key]={st,ts};});
    Object.entries(latest).forEach(([key,v])=>{const [sid,d]=key.split('|');per[sid][v.st]++;per[sid].total++;counts[v.st]++;detail[sid][d]=v.st;});
    const detailSiswa=Object.values(per).map(s=>({...s,persen:s.hariEfektif?Math.round((s.H+s.T)/s.hariEfektif*100):0,persenTerlambat:s.hariEfektif?Math.round(s.T/s.hariEfektif*100):0})).sort((a,b)=>a.nama.localeCompare(b.nama,'id'));
    const detailRows=detailSiswa.map(s=>({id:s.id,nis:s.nis,nama:s.nama,kelas:s.kelas,hari:detail[s.id]}));
    return {success:true,rekap:counts,total:Object.values(counts).reduce((a,b)=>a+b,0),hariEfektif:effectiveSet.size,dates:allDates,effectiveDates:[...effectiveSet],detailSiswa,detail:detailRows,holidayMap:Object.fromEntries(allDates.map(d=>[d,!effectiveSet.has(d)]))};
  }
  async function getRekapLaporan(kelas,tglMulai,tglSelesai,statuses,_username=''){const a=await requirePiketOrAdmin();if(!a.ok)return a.result;if(!isValidDateKey(tglMulai)||!isValidDateKey(tglSelesai)||tglSelesai<tglMulai)return fail('Rentang tanggal tidak valid.');return getReportBundleCore(kelas,tglMulai,tglSelesai,statuses);}
  async function getDetailHarian(kelas,tglMulai,tglSelesai,statuses,_username=''){const r=await getRekapLaporan(kelas,tglMulai,tglSelesai,statuses,_username);if(!r.success)return r;return {success:true,dates:r.dates,effectiveDates:r.effectiveDates,detail:r.detail,holidayMap:r.holidayMap};}
  async function getLaporanSiswaBundle(kelas,tglMulai,tglSelesai,statuses,_username=''){return getRekapLaporan(kelas,tglMulai,tglSelesai,statuses,_username);}

  async function getTerlambatSiswa(tglMulai,tglSelesai,idKelas,keyword,_username=''){
    const a=await requirePiketOrAdmin();if(!a.ok)return a.result;if(!isValidDateKey(tglMulai)||!isValidDateKey(tglSelesai)||tglSelesai<tglMulai)return fail('Rentang tanggal tidak valid.');
    const effective=new Set((await getHariEfektif(tglMulai,tglSelesai)).data||[]); const q=String(keyword||'').toLowerCase().trim();
    let aq=sb().from('student_attendance').select('attendance_date,student_id,class_id,status').eq('status','T').gte('attendance_date',tglMulai).lte('attendance_date',tglSelesai);if(idKelas&&idKelas!=='SEMUA')aq=aq.eq('class_id',idKelas);const {data,error}=await aq;if(error)return fail(error.message);
    const [students,classes]=await Promise.all([fetchAll(()=>sb().from('students').select('id,nis,name,class_id,status').eq('status','Aktif')),allActiveClasses()]);const sm=Object.fromEntries(students.map(s=>[s.id,s])),cm=mapClass(classes),g={};
    for(const r of (data||[])){const d=String(r.attendance_date);if(!effective.has(d)||!sm[r.student_id])continue;const s=sm[r.student_id],text=(s.name+' '+s.nis+' '+(cm[s.class_id]?.name||s.class_id)).toLowerCase();if(q&&!text.includes(q))continue;if(!g[s.id])g[s.id]={idSiswa:s.id,nis:String(s.nis??''),nama:s.name,kelas:cm[s.class_id]?.name||s.class_id,idKelas:s.class_id,jumlahTerlambat:0,tanggalTerlambat:[]};if(!g[s.id].tanggalTerlambat.includes(d)){g[s.id].tanggalTerlambat.push(d);g[s.id].jumlahTerlambat++;}}
    const out=Object.values(g).map(x=>({...x,tanggalTerlambat:x.tanggalTerlambat.sort(),tanggal:x.tanggalTerlambat[0]||''})).sort((a,b)=>b.jumlahTerlambat-a.jumlahTerlambat||a.nama.localeCompare(b.nama,'id'));const total=out.reduce((n,x)=>n+Number(x.jumlahTerlambat||0),0);return {success:true,tglMulai,tglSelesai,hariEfektif:effective.size,total,totalSiswa:out.length,data:out};
  }

  async function gmGetAssessmentTypes(_credential='',idKelas='',mapel=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;let q=sb().from('assessments').select('*').neq('status','Nonaktif').order('assessment_date',{ascending:true});if(a.profile.role==='guru'&&a.profile.teacher_id)q=q.eq('teacher_id',a.profile.teacher_id);if(idKelas)q=q.eq('class_id',idKelas);
    const {data,error}=await q;if(error)return fail(error.message);const subjects=mapSubject(await allSubjects());let rows=(data||[]).map(r=>({id:String(r.id),idKelas:String(r.class_id||''),mapel:String(r.subject_name||subjects[r.subject_id]?.name||r.mapel||''),nama:String(r.name||r.nama||r.title||''),tanggal:String(r.assessment_date||r.date||'').slice(0,10),bobot:Number(r.weight??r.bobot??0),kktp:Number(r.kktp??0),status:String(r.status||'Aktif'),jenis:String(r.type||r.jenis||'Penilaian'),detail:String(r.detail||r.description||'')}));if(mapel)rows=rows.filter(x=>x.mapel===mapel);return {success:true,data:rows};
  }
  async function gmAddAssessment(data,_credential=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;data=data||{};const idKelas=String(data.idKelas||''),mapel=String(data.mapel||'').trim(),nama=String(data.nama||'').trim();if(!idKelas||!mapel||!nama)return fail('Kelas, mata pelajaran, dan nama penilaian wajib diisi.');
    const subjects=await allSubjects();let sub=subjects.find(x=>subjectName(x).trim().toLowerCase()===mapel.toLowerCase());if(!sub)return fail('Mata pelajaran tidak ditemukan di master Subjects.');
    const id='ASM-'+crypto.randomUUID().replace(/-/g,'').slice(0,14);const row={id,teacher_id:a.profile.teacher_id,class_id:idKelas,subject_id:sub.id,name:nama,assessment_date:data.tanggal||today(),weight:Number(data.bobot)||0,kktp:Number(data.kktp)||0,status:'Aktif',type:String(data.jenis||'Lainnya'),detail:String(data.detail||'').trim()};const {error}=await sb().from('assessments').insert(row);if(error)return fail(error.message);return {success:true,message:'Penilaian berhasil ditambahkan.',id};
  }
  async function gmDeleteAssessment(id,_credential=''){const a=await requireGuruOrAdmin();if(!a.ok)return a.result;let q=sb().from('assessments').delete().eq('id',String(id));if(a.profile.role==='guru')q=q.eq('teacher_id',a.profile.teacher_id);const {error}=await q;if(error)return fail(error.message);return {success:true,message:'Penilaian dihapus.'};}

  async function getAssessmentById(id, p){let q=sb().from('assessments').select('*').eq('id',String(id)).single();const r=await q;if(r.error)return null;if(p.role==='guru'&&String(r.data.teacher_id)!==String(p.teacher_id))return null;return r.data;}
  function assessmentShape(r,subjects){return {id:String(r.id),idKelas:String(r.class_id||''),mapel:String(r.subject_name||subjects[r.subject_id]?.name||r.mapel||''),nama:String(r.name||r.nama||r.title||''),tanggal:String(r.assessment_date||r.date||'').slice(0,10),bobot:Number(r.weight??r.bobot??0),kktp:Number(r.kktp??0),jenis:String(r.type||r.jenis||'Penilaian'),detail:String(r.detail||r.description||'')};}
  async function gmGetScores(idPenilaian,_credential=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;const assessment=await getAssessmentById(idPenilaian,a.profile);if(!assessment)return fail('Penilaian tidak ditemukan.');const students=await gmGetStudentsForSchedule(assessment.class_id);if(!students.success)return students;let q=sb().from('student_scores').select('*').eq('assessment_id',idPenilaian);if(a.profile.role==='guru')q=q.eq('teacher_id',a.profile.teacher_id);const {data,error}=await q;if(error)return fail(error.message);const scores={};(data||[]).forEach(r=>scores[String(r.student_id)]={nilai:r.score??r.nilai??'',catatan:String(r.note??r.catatan??'')});const subjects=mapSubject(await allSubjects());return {success:true,assessment:assessmentShape(assessment,subjects),students:students.data,scores};
  }
  async function gmSaveScores(idPenilaian,items,_credential=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;const bundle=await gmGetScores(idPenilaian);if(!bundle.success)return bundle;if(!Array.isArray(items))return fail('Data nilai tidak valid.');
    for(const x of items){const sid=String(x.idSiswa||'').trim();if(!sid)continue;let val=x.nilai;if(val!==''&&val!==null&&val!==undefined){val=Number(val);if(!isFinite(val)||val<0||val>100)return fail('Nilai harus 0–100.');}else val=null;const q=await sb().from('student_scores').select('id').eq('assessment_id',idPenilaian).eq('student_id',sid).limit(1);if(q.error)return fail(q.error.message);const payload={assessment_id:idPenilaian,student_id:sid,teacher_id:a.profile.teacher_id,class_id:bundle.assessment.idKelas,score:val,note:String(x.catatan||''),updated_at:new Date().toISOString()};if(q.data?.length){const u=await sb().from('student_scores').update(payload).eq('id',q.data[0].id);if(u.error)return fail(u.error.message);}else{payload.id='SCR-'+crypto.randomUUID().replace(/-/g,'').slice(0,14);const z=await sb().from('student_scores').insert(payload);if(z.error)return fail(z.error.message);}}
    return {success:true,message:'Nilai '+bundle.assessment.nama+' berhasil disimpan.'};
  }
  async function gmGetScoresBatch(idsPenilaian,_credential=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;if(!Array.isArray(idsPenilaian)||!idsPenilaian.length)return fail('Pilih minimal satu penilaian.');const ass=[];for(const id of idsPenilaian){const x=await getAssessmentById(id,a.profile);if(!x)return fail('Sebagian penilaian tidak ditemukan atau bukan milik guru ini.');ass.push(x);}const base=ass[0];if(ass.some(x=>String(x.class_id)!==String(base.class_id)||String(x.subject_id)!==String(base.subject_id)))return fail('Penilaian yang dipilih harus berasal dari kelas dan mata pelajaran yang sama.');const students=await gmGetStudentsForSchedule(base.class_id);if(!students.success)return students;let q=sb().from('student_scores').select('*').in('assessment_id',idsPenilaian);if(a.profile.role==='guru')q=q.eq('teacher_id',a.profile.teacher_id);const {data,error}=await q;if(error)return fail(error.message);const subjects=mapSubject(await allSubjects()),scoresByAssessment={};ass.forEach(x=>scoresByAssessment[x.id]={});(data||[]).forEach(r=>{if(scoresByAssessment[r.assessment_id])scoresByAssessment[r.assessment_id][String(r.student_id)]={nilai:r.score??r.nilai??'',catatan:String(r.note??r.catatan??'')}});return {success:true,assessments:ass.map(x=>assessmentShape(x,subjects)),students:students.data,scoresByAssessment};
  }
  async function gmSaveScoresBatch(payload,_credential=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;if(!Array.isArray(payload)||!payload.length)return fail('Tidak ada penilaian yang akan disimpan.');const ids=payload.map(x=>String(x.idPenilaian||''));const bundle=await gmGetScoresBatch(ids);if(!bundle.success)return bundle;for(const block of payload){for(const item of (block.items||[])){const r=await gmSaveScores(block.idPenilaian,[item]);if(!r.success)return r;}}return {success:true,message:payload.length+' penilaian berhasil disimpan.'};
  }

  async function gmGetGuruProfile(_credential=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;const p=a.profile;const {data,error}=await sb().from('teachers').select('*').eq('id',p.teacher_id).single();if(error)return {success:true,data:{id:String(p.teacher_id||''),username:String(p.username||''),nama:String(p.username||''),noWa:'',email:String(p.email||''),nip:''}};return {success:true,data:{id:String(data.id),username:String(data.username||p.username||''),nama:String(data.name||''),noWa:String(data.whatsapp||''),email:String(data.email||''),nip:String(data.nip||'')}};
  }
  async function gmGetJournalReport(_credential,tglMulai,tglSelesai,idKelas='SEMUA'){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;if(tglMulai&&!isValidDateKey(tglMulai)||tglSelesai&&!isValidDateKey(tglSelesai))return fail('Tanggal tidak valid.');if(tglMulai&&tglSelesai&&tglSelesai<tglMulai)return fail('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    let q=sb().from('teaching_journals').select('*').order('journal_date').order('period_no');if(a.profile.role==='guru')q=q.eq('teacher_id',a.profile.teacher_id);if(tglMulai)q=q.gte('journal_date',tglMulai);if(tglSelesai)q=q.lte('journal_date',tglSelesai);if(idKelas&&idKelas!=='SEMUA')q=q.eq('class_id',idKelas);const {data,error}=await q;if(error)return fail(error.message);const [classes,subjects]=await Promise.all([allActiveClasses(),allSubjects()]);const cm=mapClass(classes),sm=mapSubject(subjects);const rows=(data||[]).map(r=>({id:String(r.id),tanggal:String(r.journal_date||'').slice(0,10),hari:dayName(String(r.journal_date||'').slice(0,10)),idKelas:String(r.class_id||''),kelas:String(cm[r.class_id]?.name||r.class_id||''),mapel:String(r.subject_name||sm[r.subject_id]?.name||''),jamKe:String(r.period_no??''),jamMulai:'',jamSelesai:'',hadir:Number(r.present_count||0),terlambat:0,sakit:Number(r.sick_count||0),izin:Number(r.permission_count||0),alfa:Number(r.absent_count||0),namaTerlambat:[],namaSakit:[],namaIzin:[],namaAlfa:[],materi:String(r.material||''),catatanMingguDepan:String(r.next_week_notes||''),catatanKelas:String(r.class_notes||'')}));
    return {success:true,periode:{mulai:tglMulai||'',selesai:tglSelesai||''},data:rows};
  }
  async function gmGetAttendanceReport(_credential,tglMulai,tglSelesai,idKelas='SEMUA',idJadwal='SEMUA'){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;let q=sb().from('student_attendance').select('*').gte('attendance_date',tglMulai).lte('attendance_date',tglSelesai);if(idKelas&&idKelas!=='SEMUA')q=q.eq('class_id',idKelas);const {data,error}=await q;if(error)return fail(error.message);const [students,classes,schedules,subjects]=await Promise.all([fetchAll(()=>sb().from('students').select('id,nis,name,class_id,status').eq('status','Aktif')),allActiveClasses(),fetchAll(()=>sb().from('teaching_schedules').select('*').neq('status','Nonaktif')),allSubjects()]);const sm=Object.fromEntries(students.map(x=>[x.id,x])),cm=mapClass(classes),tm=mapSubject(subjects),sched=Object.fromEntries(schedules.map(x=>[x.id,x]));const teacherId=a.profile.teacher_id;const out=[];(data||[]).forEach(r=>{const s=sched[r.schedule_id];if(!s||String(s.teacher_id)!==String(teacherId))return;if(idJadwal&&idJadwal!=='SEMUA'&&String(r.schedule_id)!==String(idJadwal))return;const st=sm[r.student_id];if(!st)return;out.push({tanggal:String(r.attendance_date),jadwal:String(r.schedule_id),kelas:cm[r.class_id]?.name||r.class_id,mapel:s.subject_name||tm[s.subject_id]?.name||'',hari:s.day_name||'',jamKe:String(s.period_no??''),nis:String(st.nis??''),nama:st.name,status:String(r.status||'').toUpperCase()});});out.sort((x,y)=>x.tanggal.localeCompare(y.tanggal)||x.kelas.localeCompare(y.kelas,'id',{numeric:true})||x.nama.localeCompare(y.nama,'id'));return {success:true,data:out};
  }
  async function gmGetAttendanceSummaryReport(_credential,tglMulai,tglSelesai,idKelas='SEMUA'){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;
    if(!isValidDateKey(tglMulai)||!isValidDateKey(tglSelesai)||tglSelesai<tglMulai)return fail('Rentang tanggal belum valid.');
    const [schedules,classes,students,attendance,subjects]=await Promise.all([
      fetchAll(()=>sb().from('teaching_schedules').select('*').neq('status','Nonaktif')),
      allActiveClasses(),
      fetchAll(()=>sb().from('students').select('id,nis,name,class_id,status').eq('status','Aktif')),
      fetchAll(()=>sb().from('student_attendance').select('id,attendance_date,student_id,class_id,status,schedule_id,last_updated').gte('attendance_date',tglMulai).lte('attendance_date',tglSelesai)),
      allSubjects()
    ]);
    const cm=mapClass(classes),sm=Object.fromEntries(students.map(x=>[String(x.id),x])),subm=mapSubject(subjects);
    const teacherSchedules=(schedules||[]).filter(x=>String(x.teacher_id||'')===String(a.profile.teacher_id||''));
    const allowedClass=idKelas&&idKelas!=='SEMUA'?String(idKelas):'';
    const effectiveCache={};
    const dayIndex={Minggu:0,Senin:1,Selasa:2,Rabu:3,Kamis:4,Jumat:5,Sabtu:6};
    const holidayRows=await getHolidayRows();
    const activeRanges=holidayRows.filter(isActiveHoliday).map(holidayDateRange).filter(x=>isValidDateKey(x.start));
    function effectiveMeetings(schedule){
      const key=String(schedule.id);if(effectiveCache[key]!==undefined)return effectiveCache[key];const target=dayIndex[String(schedule.day_name||'')];if(target===undefined){effectiveCache[key]=0;return 0;}let count=0;for(let d=dateObj(tglMulai),e=dateObj(tglSelesai);d<=e;d.setDate(d.getDate()+1)){const ds=d.toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'});if(ds>today())continue;if(d.getDay()!==target||d.getDay()===0||d.getDay()===6)continue;if(activeRanges.some(h=>ds>=h.start&&ds<=h.end))continue;count++;}effectiveCache[key]=count;return count;
    }
    const scheduleInfo={};
    const aggregate={};
    teacherSchedules.forEach(r=>{
      if(allowedClass&&String(r.class_id)!==allowedClass)return;
      const mapel=String(r.subject_name||subm[r.subject_id]?.name||'');const keyBase=String(r.class_id)+'|'+mapel;const perJadwal=effectiveMeetings(r);
      scheduleInfo[String(r.id)]={id:String(r.id),idKelas:String(r.class_id),kelas:String(cm[r.class_id]?.name||r.class_id),mapel,hari:String(r.day_name||''),jamKe:String(r.period_no??''),pertemuanEfektif:perJadwal,keyBase};
      students.forEach(st=>{if(String(st.class_id)!==String(r.class_id))return;const key=keyBase+'|'+String(st.id);if(!aggregate[key])aggregate[key]={idSiswa:String(st.id),nis:String(st.nis??''),nama:st.name,idKelas:String(st.class_id),kelas:String(cm[st.class_id]?.name||st.class_id),mapel,hadir:0,terlambat:0,sakit:0,izin:0,alfa:0,pertemuanEfektif:0,jadwalCount:0};aggregate[key].pertemuanEfektif+=perJadwal;aggregate[key].jadwalCount++;
      });
    });
    const latest={};
    (attendance||[]).forEach(r=>{
      const st=scheduleInfo[String(r.schedule_id)];if(!st)return;const sid=String(r.student_id),student=sm[sid];if(!student||String(student.class_id)!==st.idKelas)return;const d=String(r.attendance_date),status=String(r.status||'').toUpperCase();if(!['H','T','S','I','A'].includes(status))return;const key=String(r.schedule_id)+'|'+sid+'|'+d;const ts=new Date(r.last_updated||0).getTime();if(!latest[key]||ts>=latest[key].ts)latest[key]={status,ts};
    });
    Object.entries(latest).forEach(([key,v])=>{const [jid,sid]=key.split('|');const st=scheduleInfo[jid];if(!st)return;const agg=aggregate[st.keyBase+'|'+sid];if(!agg)return;agg[v.status==='H'?'hadir':v.status==='T'?'terlambat':v.status==='S'?'sakit':v.status==='I'?'izin':'alfa']++;});
    const data=Object.values(aggregate).map(x=>{const total=x.hadir+x.terlambat+x.sakit+x.izin+x.alfa;const kesempatan=x.pertemuanEfektif;return {...x,total,hariEfektif:kesempatan,totalKesempatan:kesempatan,persenKehadiran:kesempatan?Math.min(100,Math.round((x.hadir+x.terlambat)/kesempatan*10000)/100):0,persenKetidakhadiran:kesempatan?Math.min(100,Math.round((x.sakit+x.izin+x.alfa)/kesempatan*10000)/100):0,dataLengkap:kesempatan>0&&total>=kesempatan};}).filter(x=>x.total>0||x.pertemuanEfektif>0).sort((a,b)=>a.kelas.localeCompare(b.kelas,'id',{numeric:true})||a.mapel.localeCompare(b.mapel,'id')||a.nama.localeCompare(b.nama,'id'));
    const groups={};data.forEach(x=>{const k=x.idKelas+'|'+x.mapel;if(!groups[k])groups[k]={kelas:x.kelas,idKelas:x.idKelas,mapel:x.mapel,pertemuanEfektif:x.pertemuanEfektif,jumlahSiswa:0,totalKesempatan:0,hadir:0,terlambat:0,sakit:0,izin:0,alfa:0};const g=groups[k];g.hadir+=x.hadir;g.terlambat+=x.terlambat;g.sakit+=x.sakit;g.izin+=x.izin;g.alfa+=x.alfa;g.jumlahSiswa++;g.totalKesempatan+=x.pertemuanEfektif;});
    Object.values(groups).forEach(g=>{g.total=g.hadir+g.terlambat+g.sakit+g.izin+g.alfa;g.totalKesempatan=g.pertemuanEfektif*g.jumlahSiswa;g.persenKehadiran=g.totalKesempatan?Math.min(100,Math.round((g.hadir+g.terlambat)/g.totalKesempatan*10000)/100):0;g.persenKetidakhadiran=g.totalKesempatan?Math.min(100,Math.round((g.sakit+g.izin+g.alfa)/g.totalKesempatan*10000)/100):0;});
    const overall={hariEfektif:0,pertemuanEfektif:0,totalKesempatan:0,jumlahSiswa:0,hadir:0,terlambat:0,sakit:0,izin:0,alfa:0};Object.values(groups).forEach(g=>{overall.pertemuanEfektif+=g.pertemuanEfektif;overall.totalKesempatan+=g.totalKesempatan;overall.jumlahSiswa+=g.jumlahSiswa;overall.hadir+=g.hadir;overall.terlambat+=g.terlambat;overall.sakit+=g.sakit;overall.izin+=g.izin;overall.alfa+=g.alfa;});overall.hariEfektif=overall.pertemuanEfektif;overall.persenKehadiran=overall.totalKesempatan?Math.min(100,Math.round((overall.hadir+overall.terlambat)/overall.totalKesempatan*10000)/100):0;overall.persenKetidakhadiran=overall.totalKesempatan?Math.min(100,Math.round((overall.sakit+overall.izin+overall.alfa)/overall.totalKesempatan*10000)/100):0;
    return {success:true,periode:{mulai:tglMulai,selesai:tglSelesai},data,groups:Object.values(groups),overall,formula:{denominator:'Pertemuan efektif setiap jadwal, dikurangi Sabtu/Minggu, hari libur, dan tanggal setelah hari ini.',numerator:'Hadir + Terlambat',attendance:'(Hadir + Terlambat) / Total Kesempatan Presensi × 100%',absence:'(Sakit + Izin + Alfa) / Total Kesempatan Presensi × 100%'}};
  }
  async function gmGetScoreReport(_credential,idKelas,mapel=''){
    const a=await requireGuruOrAdmin();if(!a.ok)return a.result;let q=sb().from('assessments').select('*').neq('status','Nonaktif');if(a.profile.role==='guru')q=q.eq('teacher_id',a.profile.teacher_id);if(idKelas&&idKelas!=='SEMUA')q=q.eq('class_id',idKelas);const {data:ass,error}=await q;if(error)return fail(error.message);const subjects=mapSubject(await allSubjects());const assessments=(ass||[]).map(x=>assessmentShape(x,subjects)).filter(x=>!mapel||x.mapel===mapel);const ids=assessments.map(x=>x.id);let scores=[];if(ids.length){const z=await sb().from('student_scores').select('*').in('assessment_id',ids);if(z.error)return fail(z.error.message);scores=z.data||[];}const studentRows=idKelas&&idKelas!=='SEMUA'?await gmGetStudentsForSchedule(idKelas):ok((await fetchAll(()=>sb().from('students').select('id,nis,name,class_id,status').eq('status','Aktif'))).map(x=>({id:x.id,nis:String(x.nis??''),nama:x.name,idKelas:x.class_id,emailOrtu:x.parent_email||''})));const cls=mapClass(await allActiveClasses());const sts=(studentRows.success?studentRows.data:[]).map(x=>({...x,kelas:cls[x.idKelas]?.name||x.idKelas}));const data=scores.map(r=>{const a0=assessments.find(x=>String(x.id)===String(r.assessment_id)),st=sts.find(x=>String(x.id)===String(r.student_id));if(!a0||!st)return null;return {idPenilaian:a0.id,penilaian:a0.nama,jenis:a0.jenis,detail:a0.detail,tanggal:a0.tanggal,bobot:a0.bobot,nis:st.nis,nama:st.nama,kelas:st.kelas,idSiswa:st.id,nilai:r.score??r.nilai??'',catatan:String(r.note??r.catatan??'')};}).filter(Boolean);return {success:true,penilaian:assessments,students:sts,data};
  }

  async function gmGetPrintIdentity(_credential=''){
    const p=await effectiveProfile();const settings=(await gmGetAppSettings()).data||{};let guru=settings.NAMA_GURU||'';let nip=settings.NIP_GURU||'';if(p.role==='guru'){const {data}=await sb().from('teachers').select('name,nip').eq('id',p.teacher_id).single();if(data){guru=data.name||guru;nip=data.nip||nip;}}return {success:true,data:{aplikasi:settings.NAMA_APLIKASI||'SISJAR',subjudul:settings.SUBJUDUL_APLIKASI||'Sistem Informasi Mengajar',sekolah:settings.NAMA_SEKOLAH||'',alamat:settings.ALAMAT_SEKOLAH||'',guru,nipGuru:nip,kepalaSekolah:settings.NAMA_KEPALA_SEKOLAH||'',nipKepala:settings.NIP_KEPALA_SEKOLAH||'',tahunAjaran:settings.TAHUN_AJARAN||'',semester:settings.SEMESTER||'',tagline:settings.TAGLINE||'',kopJudul:settings.KOP_JUDUL||'',kopSubjudul:settings.KOP_SUBJUDUL||'',kopAlamat:settings.KOP_ALAMAT||'',kopFooter:settings.KOP_FOOTER||''}};
  }
  async function gmAdminSaveAppSettings(data,_credential=''){
    const a=await requireSuperadmin();if(!a.ok)return a.result;const allowed=['NAMA_APLIKASI','SUBJUDUL_APLIKASI','NAMA_SEKOLAH','ALAMAT_SEKOLAH','NAMA_GURU','NIP_GURU','NAMA_KEPALA_SEKOLAH','NIP_KEPALA_SEKOLAH','TAHUN_AJARAN','SEMESTER','TAGLINE','KOP_JUDUL','KOP_SUBJUDUL','KOP_ALAMAT','KOP_FOOTER'];for(const key of allowed){if(Object.prototype.hasOwnProperty.call(data||{},key)){const val=String(data[key]??'').trim();const q=await sb().from('app_settings').upsert({key,value:val,updated_at:new Date().toISOString()},{onConflict:'key'});if(q.error)return fail(q.error.message);}}return {success:true,message:'Pengaturan SISJAR berhasil disimpan.',data:(await gmGetAppSettings()).data};
  }

  async function gmAdminGetTeachers(){const a=await requireSuperadmin();if(!a.ok)return a.result;const data=await allActiveTeachers();return {success:true,data:data.map(x=>({id:String(x.id),username:String(x.username||''),nama:String(x.name||x.nama||''),noWa:String(x.whatsapp||x.no_wa||''),email:String(x.email||''),nip:String(x.nip||''),status:String(x.status||'Aktif')}))};}
  async function gmAdminSaveTeacher(data){const a=await requireSuperadmin();if(!a.ok)return a.result;data=data||{};const uname=String(data.username||'').trim(),nama=String(data.nama||'').trim();if(!uname||!nama)return fail('Username dan nama guru wajib diisi.');const q=await sb().from('teachers').select('id').eq('username',uname).limit(1);if(q.error)return fail(q.error.message);const row={username:uname,name:nama,whatsapp:String(data.noWa||''),email:String(data.email||''),nip:String(data.nip||''),status:'Aktif'};let result;if(q.data?.length){result=await sb().from('teachers').update(row).eq('id',q.data[0].id).select('*').single();}else{row.id='GRU-'+Date.now();result=await sb().from('teachers').insert(row).select('*').single();}if(result.error)return fail(result.error.message);return {success:true,message:'Data guru berhasil disimpan. Akun login Supabase Auth perlu diprovisikan terpisah jika belum ada.',id:result.data.id};}
  async function gmAdminGetSchedules(){const a=await requireSuperadmin();if(!a.ok)return a.result;const [schedules,classes,teachers,subjects]=await Promise.all([fetchAll(()=>sb().from('teaching_schedules').select('*').neq('status','Nonaktif').order('day_name').order('period_no')),allActiveClasses(),allActiveTeachers(),allSubjects()]);const cm=mapClass(classes),tm=mapTeacher(teachers),sm=mapSubject(subjects);return {success:true,data:schedules.map(r=>({id:String(r.id),username:String(r.teacher_username||tm[r.teacher_id]?.username||''),guru:String(r.teacher_name||tm[r.teacher_id]?.name||''),idGuru:String(r.teacher_id||''),idKelas:String(r.class_id||''),kelas:String(cm[r.class_id]?.name||r.class_id||''),mapel:String(r.subject_name||sm[r.subject_id]?.name||''),hari:String(r.day_name||''),jamKe:String(r.period_no??''),jamMulai:fmtTime(r.start_time),jamSelesai:fmtTime(r.end_time),status:String(r.status||'Aktif')}))};}
  async function gmAdminSaveSchedule(data){const a=await requireSuperadmin();if(!a.ok)return a.result;data=data||{};const username=String(data.usernameGuru||'').trim(),idGuru=String(data.idGuru||'').trim(),idKelas=String(data.idKelas||'').trim(),mapel=String(data.mapel||'').trim(),hari=String(data.hari||'').trim();if(!username||!idKelas||!mapel||!hari)return fail('Guru, kelas, mata pelajaran, dan hari wajib diisi.');const teachers=await allActiveTeachers(),classes=await allActiveClasses(),subjects=await allSubjects();const teacher=teachers.find(x=>String(x.username)===username),cl=classes.find(x=>String(x.id)===idKelas),sub=subjects.find(x=>subjectName(x).trim().toLowerCase()===mapel.toLowerCase());if(!teacher||!cl||!sub)return fail('Guru, kelas, atau mata pelajaran tidak ditemukan.');const row={id:String(data.id||'JDW-'+Date.now()),teacher_id:teacher.id,subject_id:sub.id,class_id:idKelas,day_name:hari,period_no:String(data.jamKe||''),start_time:data.jamMulai||null,end_time:data.jamSelesai||null,status:'Aktif',teacher_username:teacher.username,subject_name:subjectName(sub)};const q=await sb().from('teaching_schedules').upsert(row,{onConflict:'id'});if(q.error)return fail(q.error.message);return {success:true,message:'Jadwal mengajar berhasil disimpan.',id:row.id};}
  async function gmAdminDeleteSchedule(id){const a=await requireSuperadmin();if(!a.ok)return a.result;const {error}=await sb().from('teaching_schedules').delete().eq('id',String(id));if(error)return fail(error.message);return {success:true,message:'Jadwal dihapus.'};}
  async function gmAdminGetClasses(){const a=await requireSuperadmin();if(!a.ok)return a.result;const data=await allActiveClasses();return {success:true,data:data.map(x=>({id:String(x.id),nama:String(x.name||x.nama||x.id),wa:String(x.whatsapp||x.wa||'')}))};}
  async function gmAdminSaveClassWA(idKelas,wa){const a=await requireSuperadmin();if(!a.ok)return a.result;const {error}=await sb().from('classes').update({whatsapp:String(wa||'')}).eq('id',String(idKelas));if(error)return fail(error.message);return {success:true,message:'Nomor WhatsApp perwakilan kelas disimpan.'};}

  async function gmSwitchRole(_token,targetRole,targetUsername){
    const p=await profile();if(String(p.role||'').toLowerCase()!=='superadmin')return fail('Hanya Superadmin yang dapat membuka mode Guru.');targetRole=String(targetRole||'').toLowerCase();
    if(targetRole==='guru'){const target=String(targetUsername||'').trim();if(!target)return fail('Guru tujuan wajib dipilih.');const {data,error}=await sb().from('teachers').select('id,username,name,status').eq('username',target).eq('status','Aktif').single();if(error||!data)return fail('Guru tidak ditemukan atau nonaktif.');return {success:true,username:data.username,role:'guru',nama:data.name,teacher_id:data.id};}
    if(targetRole==='superadmin')return {success:true,username:p.username,role:'superadmin'};
    return fail('Mode role tidak dikenal.');
  }

  async function importDataSiswa(dataArray,_username=''){
    const a=await requireSuperadmin();if(!a.ok)return a.result;if(!Array.isArray(dataArray))return fail('Data import tidak valid.');const classes=await allActiveClasses();const byName=Object.fromEntries(classes.map(x=>[String(x.name||'').trim().toLowerCase(),x.id]));const rows=[];for(const item of dataArray){const nis=String(item.nis||'').trim(),nama=String(item.nama||'').trim(),kelas=String(item.kelas||'').trim(),email=String(item.email||'').trim();const idKelas=byName[kelas.toLowerCase()];if(nis&&nama&&idKelas)rows.push({id:'SIS-'+crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase(),nis,name:nama,class_id:idKelas,parent_email:email,status:'Aktif'});}if(!rows.length)return fail('Data tidak valid atau kelas tidak ditemukan.');const {error}=await sb().from('students').insert(rows);if(error)return fail(error.message);return {success:true,count:rows.length,message:rows.length+' siswa berhasil diimpor.'};
  }
  async function getDatabaseBackup(){
    const a=await requireSuperadmin();if(!a.ok)return a.result;
    const tables=['app_settings','profiles','teachers','classes','subjects','students','teaching_schedules','student_attendance','assessments','student_scores','teaching_journals','holidays','login_logs','email_queue'];const backup={format:'SISJAR-SUPABASE-BACKUP',version:2,createdAt:new Date().toISOString(),tables:{}};for(const t of tables){try{backup.tables[t]=await fetchAll(()=>sb().from(t).select('*'));}catch(e){backup.tables[t]=[];backup['warning_'+t]=e.message;}}return {success:true,filename:'Backup_SISJAR_'+new Date().toISOString().slice(0,10)+'.json',backup};
  }
  async function restoreDatabaseBackup(base64Data){
    const a=await requireSuperadmin();if(!a.ok)return a.result;let text;try{text=decodeURIComponent(escape(atob(String(base64Data||''))));}catch(e){return fail('File backup tidak valid.');}let obj;try{obj=JSON.parse(text);}catch(e){return fail('File backup bukan JSON yang valid.');}if(obj.format!=='SISJAR-SUPABASE-BACKUP')return fail('Format backup tidak dikenali.');const order=['app_settings','classes','teachers','subjects','students','teaching_schedules','holidays','assessments','student_attendance','student_scores','teaching_journals'];for(const t of order){const rows=Array.isArray(obj.tables?.[t])?obj.tables[t]:[];if(!rows.length)continue;const {error}=await sb().from(t).upsert(rows,{onConflict:'id'});if(error)return fail('Restore '+t+' gagal: '+error.message);}return {success:true,message:'Restore Supabase selesai.'};
  }

  async function gmGetAppSettings(){const {data,error}=await sb().from('app_settings').select('key,value');if(error)return fail(error.message);return {success:true,data:Object.fromEntries((data||[]).map(x=>[x.key,x.value]))};}

  const methods={gmGetMySchedules,gmGetStudentsForSchedule,gmGetAttendance,gmSaveAttendance,gmGetJournal,gmSaveJournal,gmGetMyClasses,gmGetAppSettings,getDashboardData,getKalenderLibur,tambahLiburRange,tambahLibur,hapusLibur,getInfoHari,getHariEfektif,getKelasDropdown,getDaftarKelas,tambahKelas,editKelas,hapusKelas,getDaftarSiswa,tambahSiswa,updateSiswa,hapusSiswa,importDataSiswa,getSiswaByKelas,getPresensiSiswa,savePresensiSiswa,deletePresensiSiswa,getPresensiSiswaMingguan,savePresensiSiswaMingguan,getRekapLaporan,getDetailHarian,getLaporanSiswaBundle,getTerlambatSiswa,gmGetAssessmentTypes,gmAddAssessment,gmDeleteAssessment,gmGetScores,gmSaveScores,gmGetScoresBatch,gmSaveScoresBatch,gmGetGuruProfile,gmGetJournalReport,gmGetAttendanceReport,gmGetAttendanceSummaryReport,gmGetScoreReport,gmGetPrintIdentity,gmAdminSaveAppSettings,gmAdminGetTeachers,gmAdminSaveTeacher,gmAdminGetSchedules,gmAdminSaveSchedule,gmAdminDeleteSchedule,gmAdminGetClasses,gmAdminSaveClassWA,gmSwitchRole,getDatabaseBackup,restoreDatabaseBackup};
  window.SISJAR_API={call:async(name,args=[])=>{if(!methods[name])return fail(`Fungsi ${name} belum dimigrasikan ke Supabase.`);try{return await methods[name](...args);}catch(e){console.error(e);return fail(e.message||'Terjadi kesalahan.');}}};
})();
