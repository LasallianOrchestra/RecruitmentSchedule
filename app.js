const START_HOUR = 10;
const END_HOUR = 17;
const POSITION = 'APPLICANT';
const TABLE = 'recruitment_bookings';
const VALID_HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const LOCAL_KEY = 'lsoRecruitmentSupabasePreview_v2';
const PH_TIMEZONE = 'Asia/Manila';
const $ = (id) => document.getElementById(id);

let bookings = [];
let selected;
let weekStart;
let liveMode = false;
let supabase = null;
let currentUid = null;
let realtimeChannel = null;
let refreshTimer = null;

function pad(n){ return String(n).padStart(2,'0'); }
function parseISODate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); }
function isoUTC(d){ return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; }
function addDaysISO(s,n){ const d=parseISODate(s); d.setUTCDate(d.getUTCDate()+n); return isoUTC(d); }
function getMondayISO(s){ const d=parseISODate(s); const day=d.getUTCDay(); d.setUTCDate(d.getUTCDate()+(day===0?-6:1-day)); return isoUTC(d); }
function todayPHISO(){
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:PH_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const map=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function weekDates(){ return Array.from({length:7},(_,i)=>addDaysISO(weekStart,i)); }
function fmtDate(s,opt={weekday:'short',month:'short',day:'numeric'}){ return new Intl.DateTimeFormat('en-PH',{...opt,timeZone:'UTC'}).format(parseISODate(s)); }
function fmtHour(h){ const hh=((Number(h)+11)%12)+1; return `${hh}:00 ${Number(h)>=12?'PM':'AM'}`; }
function fmtEnd(h){ return fmtHour(Number(h)+1); }
function esc(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function isToday(date){ return date===todayPHISO(); }
function isValidHour(hour){ return VALID_HOURS.includes(Number(hour)); }
function findBooking(date,hour){ return bookings.find(b=>b.date===date && Number(b.hour)===Number(hour)); }
function openHours(date){ return VALID_HOURS.filter(h=>!findBooking(date,h)); }
function loadLocal(){ try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]')}catch{return[]} }
function saveLocal(){ localStorage.setItem(LOCAL_KEY,JSON.stringify(bookings)); }
function initials(name){ return String(name||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase() || '?'; }
function weekOpenCount(){ return weekDates().reduce((sum,date)=>sum+openHours(date).length,0); }

function isSupabaseConfigured(){
  const c=window.LSO_SUPABASE_CONFIG;
  return !!(
    c && c.url && c.publishableKey &&
    /^https:\/\/.+\.supabase\.co\/?$/i.test(String(c.url).trim()) &&
    !String(c.url).includes('YOUR_') &&
    !String(c.publishableKey).includes('YOUR_')
  );
}

function setSyncStatus(status,text){
  const pill=$('syncPill');
  pill.classList.remove('live','offline');
  if(status==='live') pill.classList.add('live');
  if(status==='offline') pill.classList.add('offline');
  $('syncText').textContent=text;
}

function normalizeRow(row){
  return {
    id: row.id,
    applicant: row.applicant,
    position: row.position,
    notes: row.notes || '',
    date: row.interview_date,
    hour: Number(row.interview_hour),
    durationMinutes: Number(row.duration_minutes),
    ownerUid: row.owner_id,
    createdAt: row.created_at
  };
}

async function startDataLayer(){
  if(!isSupabaseConfigured()){
    liveMode=false;
    bookings=loadLocal();
    $('setupBanner').classList.remove('hidden');
    setSyncStatus('offline','Device-only preview');
    render();
    return;
  }

  try{
    setSyncStatus('','Connecting…');
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const cfg=window.LSO_SUPABASE_CONFIG;
    supabase=createClient(cfg.url,cfg.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });

    let { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if(sessionError) throw sessionError;
    let session=sessionData.session;

    if(!session){
      const { data, error } = await supabase.auth.signInAnonymously();
      if(error) throw error;
      session=data.session;
    }

    currentUid=session?.user?.id || null;
    if(!currentUid) throw new Error('Anonymous Supabase session was not created.');

    liveMode=true;
    $('setupBanner').classList.add('hidden');
    await loadBookings();
    subscribeBookings();
  }catch(error){
    console.error('Supabase initialization failed:',error);
    liveMode=false;
    bookings=loadLocal();
    $('setupBanner').classList.remove('hidden');
    setSyncStatus('offline','Sync unavailable');
    showToast('Live sync could not connect. This device is using preview mode.',true);
    render();
  }
}

async function loadBookings(){
  if(!supabase || !liveMode) return;
  const { data, error } = await supabase
    .from(TABLE)
    .select('id,applicant,position,notes,interview_date,interview_hour,duration_minutes,owner_id,created_at')
    .order('interview_date',{ascending:true})
    .order('interview_hour',{ascending:true});
  if(error) throw error;
  bookings=(data||[]).map(normalizeRow);
  setSyncStatus('live','Live');
  render();
}

function subscribeBookings(){
  if(!supabase) return;
  if(realtimeChannel) supabase.removeChannel(realtimeChannel);

  realtimeChannel=supabase
    .channel('lso-recruitment-bookings-live')
    .on('postgres_changes',{event:'*',schema:'public',table:TABLE},()=>{
      clearTimeout(refreshTimer);
      refreshTimer=setTimeout(()=>{
        loadBookings().catch(error=>{
          console.error('Realtime refresh failed:',error);
          setSyncStatus('offline','Reconnecting…');
        });
      },90);
    })
    .subscribe((status)=>{
      if(status==='SUBSCRIBED') setSyncStatus('live','Live');
      else if(status==='CHANNEL_ERROR' || status==='TIMED_OUT') setSyncStatus('offline','Sync interrupted');
      else if(status==='CLOSED' && navigator.onLine) setSyncStatus('offline','Reconnecting…');
    });
}

async function createBooking(data){
  if(!liveMode){
    if(findBooking(data.date,data.hour)) throw new Error('SLOT_TAKEN');
    const id=crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    bookings.push({id,...data,ownerUid:'local',createdAt:new Date().toISOString()});
    saveLocal();
    return;
  }

  const { error } = await supabase.from(TABLE).insert({
    applicant:data.applicant,
    position:POSITION,
    notes:data.notes,
    interview_date:data.date,
    interview_hour:Number(data.hour),
    duration_minutes:60
  });

  if(error){
    if(error.code==='23505') throw new Error('SLOT_TAKEN');
    throw error;
  }
  await loadBookings();
}

async function deleteBooking(booking){
  if(!liveMode){
    bookings=bookings.filter(b=>b.id!==booking.id);
    saveLocal();
    render();
    return;
  }
  if(booking.ownerUid!==currentUid) throw new Error('NOT_OWNER');
  const { error } = await supabase.from(TABLE).delete().eq('id',booking.id);
  if(error) throw error;
  await loadBookings();
}

function initializeSelection(){
  const today=todayPHISO();
  weekStart=getMondayISO(today);
  selected={date:today,hour:START_HOUR};
  if(!weekDates().includes(selected.date)) selected.date=weekStart;
}

function render(){
  renderWeekRange();
  renderDesktopCalendar();
  renderMobileCalendar();
  renderPanel();
}

function renderWeekRange(){
  const d=weekDates();
  const sameMonth=parseISODate(d[0]).getUTCMonth()===parseISODate(d[6]).getUTCMonth();
  $('weekRange').textContent=sameMonth
    ? `${fmtDate(d[0],{month:'long',day:'numeric'})} – ${fmtDate(d[6],{day:'numeric',year:'numeric'})}`
    : `${fmtDate(d[0],{month:'short',day:'numeric'})} – ${fmtDate(d[6],{month:'short',day:'numeric',year:'numeric'})}`;
  const open=weekOpenCount();
  $('availableCount').textContent=open;
  $('weekCaption').textContent=open===0?'This recruitment week is fully booked.':`${open} of ${VALID_HOURS.length*7} interview slots are currently available.`;
}

function renderDesktopCalendar(){
  const grid=$('calendarGrid');
  const dates=weekDates();
  grid.innerHTML='';

  const corner=document.createElement('div');
  corner.className='cal-cell cal-corner';
  corner.innerHTML='<span>Time</span>';
  grid.appendChild(corner);

  dates.forEach(date=>{
    const open=openHours(date).length;
    const pct=Math.round((open/VALID_HOURS.length)*100);
    const el=document.createElement('div');
    el.className=`cal-cell cal-day ${isToday(date)?'today':''}`;
    el.innerHTML=`
      <div class="day-top">
        <div><span class="day-name">${fmtDate(date,{weekday:'short'})}${isToday(date)?' · Today':''}</span><span class="day-date">${fmtDate(date,{month:'short',day:'numeric'})}</span></div>
        ${isToday(date)?'<span class="today-mark" aria-hidden="true"></span>':''}
      </div>
      <div class="day-capacity"><div class="capacity-track"><div class="capacity-fill" style="width:${pct}%"></div></div><span class="capacity-text">${open}/${VALID_HOURS.length} open</span></div>`;
    grid.appendChild(el);
  });

  VALID_HOURS.forEach(hour=>{
    const time=document.createElement('div');
    time.className='cal-cell cal-time';
    time.textContent=fmtHour(hour);
    grid.appendChild(time);
    dates.forEach(date=>grid.appendChild(makeDesktopSlot(date,hour)));
  });
}

function makeDesktopSlot(date,hour){
  const booking=findBooking(date,hour);
  const isSelected=selected.date===date&&Number(selected.hour)===hour;
  const el=document.createElement('button');
  el.type='button';
  el.className=`cal-cell slot ${booking?'booked':''} ${isSelected?'selected':''}`;
  el.setAttribute('aria-pressed',isSelected?'true':'false');
  el.setAttribute('aria-label',booking?`${fmtDate(date)} ${fmtHour(hour)} booked by ${booking.applicant}`:`${fmtDate(date)} ${fmtHour(hour)} available`);
  el.innerHTML=booking
    ? `<span class="slot-content"><span class="booking-name-row"><span class="booking-avatar">${esc(initials(booking.applicant))}</span><span class="booking-name">${esc(booking.applicant)}</span></span><span class="booking-meta">Booked · ${fmtHour(hour)}–${fmtEnd(hour)}</span></span>`
    : `<span class="slot-content available-content"><span class="available-label">Available</span><span class="slot-cta">Book ${fmtHour(hour)}</span></span>`;
  el.addEventListener('click',()=>selectSlot(date,hour));
  return el;
}

function renderMobileCalendar(){
  const dates=weekDates();
  const strip=$('dayStrip');
  strip.innerHTML='';
  dates.forEach(date=>{
    const open=openHours(date).length;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className=`day-tab ${date===selected.date?'active':''} ${isToday(date)?'today':''}`;
    btn.setAttribute('role','tab');
    btn.setAttribute('aria-selected',date===selected.date?'true':'false');
    btn.innerHTML=`<span class="dow">${fmtDate(date,{weekday:'short'})}</span><span class="num">${fmtDate(date,{day:'numeric'})}</span><span class="open">${open} open</span>`;
    btn.addEventListener('click',()=>{
      selected.date=date;
      const first=openHours(date)[0];
      if(findBooking(date,selected.hour)) selected.hour=first??START_HOUR;
      renderMobileCalendar();
      renderDesktopCalendar();
      renderPanel();
    });
    strip.appendChild(btn);
  });

  const open=openHours(selected.date).length;
  $('mobileDaySummary').innerHTML=`<strong>${fmtDate(selected.date,{weekday:'long',month:'long',day:'numeric'})}</strong><span>${open} of ${VALID_HOURS.length} slots available</span>`;

  const slots=$('mobileSlots');
  slots.innerHTML='';
  VALID_HOURS.forEach(hour=>{
    const booking=findBooking(selected.date,hour);
    const active=Number(selected.hour)===hour;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className=`mobile-slot ${booking?'booked':''} ${active?'selected':''}`;
    btn.innerHTML=`<span><span class="mobile-slot-time">${fmtHour(hour)} – ${fmtEnd(hour)}</span><span class="mobile-slot-status">${booking?'Booked interview':'Tap to select this interview time'}</span></span>${booking?`<span class="mobile-slot-name">${esc(booking.applicant)}</span>`:'<span class="available-pill">Available</span>'}`;
    btn.addEventListener('click',()=>selectSlot(selected.date,hour));
    slots.appendChild(btn);
  });
}

function selectSlot(date,hour){
  selected={date,hour:Number(hour)};
  renderDesktopCalendar();
  renderMobileCalendar();
  renderPanel();
  if(window.matchMedia('(max-width: 780px)').matches){
    setTimeout(()=>$('bookingCard').scrollIntoView({behavior:'smooth',block:'start'}),60);
  }
}

function renderPanel(){
  const body=$('panelBody');
  const booking=findBooking(selected.date,selected.hour);
  if(booking){ renderBookingDetail(body,booking); return; }

  $('panelTitle').textContent='Book an Applicant';
  const available=openHours(selected.date);
  const fullyBooked=available.length===0;

  body.innerHTML=`
    <div class="slot-summary">
      <div class="slot-summary-top">
        <div><p class="eyebrow">Your selected time</p><div class="selection-date">${fmtDate(selected.date,{weekday:'long',month:'long',day:'numeric'})}</div><div class="selection-time">${fmtHour(selected.hour)} – ${fmtEnd(selected.hour)} · Philippine Time</div></div>
        <span class="selected-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8"/></svg></span>
      </div>
    </div>
    <div class="form-alert" id="formAlert"></div>
    <form class="booking-form" id="bookingForm">
      <div class="field">
        <label for="applicant">Applicant name <span class="required">*</span></label>
        <input class="control" id="applicant" maxlength="120" required autocomplete="name" placeholder="Full name" />
      </div>
      <div class="field">
        <span class="field-label">Position type</span>
        <div class="fixed-row" aria-label="Position type is fixed as applicant">
          <div class="fixed-row-left"><span class="fixed-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0"/></svg></span><span class="fixed-copy"><strong>${POSITION}</strong><span>Recruitment interview</span></span></div>
          <span class="locked-chip">Fixed</span>
        </div>
      </div>
      <div class="field">
        <label for="notes">Notes <span style="color:var(--muted);font-weight:650">(optional)</span></label>
        <textarea class="control" id="notes" maxlength="1000" rows="3" placeholder="Add any recruitment notes"></textarea>
      </div>
      <button class="button button-primary" type="submit" ${fullyBooked?'disabled':''}>
        <span>${fullyBooked?'No slots available':'Confirm interview'}</span>
        ${fullyBooked?'':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'}
      </button>
    </form>
    <div class="availability-box">
      <div class="availability-head"><strong>Other times this day</strong><span>${fmtDate(selected.date,{weekday:'short',month:'short',day:'numeric'})}</span></div>
      <div class="chips">${availabilityChips(selected.date)}</div>
    </div>`;

  $('bookingForm').addEventListener('submit',submitBooking);
  body.querySelectorAll('.time-chip').forEach(btn=>btn.addEventListener('click',()=>selectSlot(selected.date,Number(btn.dataset.hour))));
}

function renderBookingDetail(body,b){
  $('panelTitle').textContent='Interview Details';
  const canCancel=!liveMode || b.ownerUid===currentUid;
  body.innerHTML=`
    <div class="confirmation-card">
      <div class="confirmation-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8"/></svg></div>
      <p class="eyebrow">Confirmed interview</p>
      <h3>${esc(b.applicant)}</h3>
      <p>${fmtDate(b.date,{weekday:'long',month:'long',day:'numeric'})} · ${fmtHour(b.hour)} – ${fmtEnd(b.hour)}</p>
    </div>
    <div class="detail-list">
      <div class="detail-row"><span>Applicant</span><strong>${esc(b.applicant)}</strong></div>
      <div class="detail-row"><span>Position</span><strong>${POSITION}</strong></div>
      <div class="detail-row"><span>Schedule</span><strong>${fmtHour(b.hour)} – ${fmtEnd(b.hour)} · PHT</strong></div>
      <div class="detail-row"><span>Notes</span><p>${esc(b.notes||'No notes added.')}</p></div>
    </div>
    ${canCancel?`<div class="cancel-wrap"><button class="button button-danger" id="deleteBtn" type="button">Cancel this interview</button></div>`:`<div class="ownership-note">This live booking can only be cancelled from the browser/device that originally created it.</div>`}`;

  if(canCancel)$('deleteBtn').addEventListener('click',async()=>{
    if(!confirm('Cancel this interview booking?')) return;
    try{
      await deleteBooking(b);
      showToast('Interview cancelled.');
      if(!liveMode)render();
    }catch(error){
      showToast(error.message==='NOT_OWNER'?'This booking cannot be cancelled from this device.':'Unable to cancel the interview.',true);
    }
  });
}

function availabilityChips(date){
  const hours=openHours(date);
  if(!hours.length)return '<span class="empty-message">This day is fully booked from 10:00 AM to 5:00 PM.</span>';
  return hours.map(h=>`<button class="time-chip ${Number(selected.hour)===h?'active':''}" type="button" data-hour="${h}">${fmtHour(h).replace(':00 ',' ')}</button>`).join('');
}

async function submitBooking(e){
  e.preventDefault();
  const alert=$('formAlert');
  alert.classList.remove('show');
  const applicant=$('applicant').value.trim();
  const notes=$('notes').value.trim();
  const date=selected.date;
  const hour=Number(selected.hour);

  if(!applicant) return showFormError('Please enter the applicant name.');
  if(!isValidHour(hour)) return showFormError('Please choose a valid interview time between 10:00 AM and 5:00 PM.');
  if(findBooking(date,hour)) return showFormError('This interview slot has already been booked. Please select another available time.');

  const submit=e.submitter;
  if(submit){ submit.disabled=true; submit.innerHTML='<span>Confirming…</span>'; }

  try{
    await createBooking({applicant,notes,date,hour,position:POSITION,durationMinutes:60});
    selected={date,hour};
    showToast(liveMode?'Interview confirmed and synced live.':'Interview saved on this device.');
    if(!liveMode)render();
  }catch(error){
    if(error.message==='SLOT_TAKEN'){
      showFormError('Someone else just booked this time. The calendar has refreshed—please choose another slot.');
      if(liveMode)loadBookings().catch(()=>{});
    }else{
      console.error(error);
      showFormError('The booking could not be saved. Please check your connection and try again.');
    }
  }finally{
    if(submit && document.body.contains(submit)){
      submit.disabled=false;
      submit.innerHTML='<span>Confirm interview</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    }
  }
}

function showFormError(message){
  const alert=$('formAlert');
  if(alert){ alert.textContent=message; alert.classList.add('show'); }
  showToast(message,true);
}

function showToast(message,isError=false){
  const t=$('toast');
  $('toastText').textContent=message;
  t.classList.toggle('error',isError);
  t.querySelector('.toast-icon').textContent=isError?'!':'✓';
  t.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>t.classList.remove('show'),3000);
}

$('prevWeek').addEventListener('click',()=>{
  weekStart=addDaysISO(weekStart,-7);
  selected={date:weekStart,hour:START_HOUR};
  render();
});
$('nextWeek').addEventListener('click',()=>{
  weekStart=addDaysISO(weekStart,7);
  selected={date:weekStart,hour:START_HOUR};
  render();
});
$('thisWeek').addEventListener('click',()=>{
  const today=todayPHISO();
  weekStart=getMondayISO(today);
  selected={date:today,hour:START_HOUR};
  render();
});
$('printBtn').addEventListener('click',()=>window.print());
window.addEventListener('online',()=>{
  if(liveMode){
    setSyncStatus('','Reconnecting…');
    loadBookings().then(()=>setSyncStatus('live','Live')).catch(()=>setSyncStatus('offline','Sync interrupted'));
  }
});
window.addEventListener('offline',()=>setSyncStatus('offline',liveMode?'Offline':'Device-only preview'));
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});

initializeSelection();
render();
startDataLayer();
