const START_HOUR = 10;
const END_HOUR = 17;
const POSITION = 'APPLICANT';
const TABLE = 'recruitment_bookings';
const VALID_HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const LOCAL_KEY = 'lsoRecruitmentSupabasePreview_v1';
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
    setSyncStatus('','Connecting to Supabase…');
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
    setSyncStatus('offline','Live sync unavailable');
    showToast('Supabase live sync could not connect. This device is using preview mode.');
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
  setSyncStatus('live','Live sync connected');
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
          setSyncStatus('offline','Sync interrupted');
        });
      },80);
    })
    .subscribe((status)=>{
      if(status==='SUBSCRIBED') setSyncStatus('live','Live sync connected');
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

function render(){ renderWeekRange(); renderDesktopCalendar(); renderMobileCalendar(); renderPanel(); }
function renderWeekRange(){
  const d=weekDates();
  $('weekRange').textContent=`${fmtDate(d[0],{month:'short',day:'numeric'})} – ${fmtDate(d[6],{month:'short',day:'numeric',year:'numeric'})}`;
}
function renderDesktopCalendar(){
  const grid=$('calendarGrid'); const dates=weekDates(); grid.innerHTML='';
  const corner=document.createElement('div'); corner.className='cal-cell cal-corner'; corner.innerHTML='<span class="section-kicker">Time</span>'; grid.appendChild(corner);
  dates.forEach(date=>{
    const el=document.createElement('div'); el.className=`cal-cell cal-day ${isToday(date)?'today':''}`;
    el.innerHTML=`<span class="weekday">${fmtDate(date,{weekday:'short'})}${isToday(date)?' · Today':''}</span><span class="date">${fmtDate(date,{month:'short',day:'numeric'})}</span>`; grid.appendChild(el);
  });
  VALID_HOURS.forEach(hour=>{
    const time=document.createElement('div'); time.className='cal-cell cal-time'; time.textContent=fmtHour(hour); grid.appendChild(time);
    dates.forEach(date=>grid.appendChild(makeDesktopSlot(date,hour)));
  });
}
function makeDesktopSlot(date,hour){
  const booking=findBooking(date,hour); const isSelected=selected.date===date&&Number(selected.hour)===hour;
  const el=document.createElement('button'); el.type='button'; el.className=`cal-cell slot ${booking?'booked':''} ${isSelected?'selected':''}`;
  el.setAttribute('aria-label',booking?`${fmtDate(date)} ${fmtHour(hour)} booked by ${booking.applicant}`:`${fmtDate(date)} ${fmtHour(hour)} available`);
  el.innerHTML=booking?`<span class="slot-content"><span class="booking-name">${esc(booking.applicant)}</span><span class="booking-meta">${POSITION} · ${fmtHour(hour)}–${fmtEnd(hour)}</span></span>`:`<span class="slot-content"><span class="available-label">Available</span></span>`;
  el.addEventListener('click',()=>selectSlot(date,hour)); return el;
}
function renderMobileCalendar(){
  const dates=weekDates(); const strip=$('dayStrip'); strip.innerHTML='';
  dates.forEach(date=>{
    const btn=document.createElement('button'); btn.type='button'; btn.className=`day-tab ${date===selected.date?'active':''} ${isToday(date)?'today':''}`;
    btn.setAttribute('role','tab'); btn.setAttribute('aria-selected',date===selected.date?'true':'false');
    btn.innerHTML=`<span class="dow">${fmtDate(date,{weekday:'short'})}</span><span class="num">${fmtDate(date,{day:'numeric'})}</span>`;
    btn.addEventListener('click',()=>{ selected.date=date; const first=openHours(date)[0]; if(!findBooking(date,selected.hour)) selected.hour=first??START_HOUR; renderMobileCalendar(); renderPanel(); });
    strip.appendChild(btn);
  });
  const slots=$('mobileSlots'); slots.innerHTML='';
  VALID_HOURS.forEach(hour=>{
    const booking=findBooking(selected.date,hour); const active=Number(selected.hour)===hour;
    const btn=document.createElement('button');btn.type='button';btn.className=`mobile-slot ${booking?'booked':''} ${active?'selected':''}`;
    btn.innerHTML=`<span><span class="mobile-slot-time">${fmtHour(hour)} – ${fmtEnd(hour)}</span><span class="mobile-slot-status">${booking?'Booked interview':'Available · Tap to select'}</span></span>${booking?`<span class="mobile-slot-name">${esc(booking.applicant)}</span>`:'<span class="available-label">Available</span>'}`;
    btn.addEventListener('click',()=>selectSlot(selected.date,hour)); slots.appendChild(btn);
  });
}
function selectSlot(date,hour){
  selected={date,hour:Number(hour)}; renderDesktopCalendar(); renderMobileCalendar(); renderPanel();
  if(window.matchMedia('(max-width: 980px)').matches) $('bookingCard').scrollIntoView({behavior:'smooth',block:'start'});
}

function renderPanel(){
  const body=$('panelBody'); const booking=findBooking(selected.date,selected.hour);
  if(booking){ renderBookingDetail(body,booking); return; }
  $('panelTitle').textContent='Book an Applicant';
  const available=openHours(selected.date); const fullyBooked=available.length===0;
  body.innerHTML=`
    <div class="selection-card"><p class="section-kicker">Selected slot</p><div class="selection-date">${fmtDate(selected.date,{weekday:'long',month:'long',day:'numeric'})}</div><div class="selection-time">${fmtHour(selected.hour)} – ${fmtEnd(selected.hour)} · Philippine Time</div></div>
    <div class="form-alert" id="formAlert"></div>
    <form class="booking-form" id="bookingForm">
      <div class="field"><label for="applicant">Applicant name *</label><input class="control" id="applicant" maxlength="120" required autocomplete="name" placeholder="Enter applicant name" /></div>
      <div class="field"><div class="position-row"><label for="position">Position type</label><span class="fixed-tag">Fixed</span></div><input class="control" id="position" value="${POSITION}" readonly /></div>
      <div class="field"><label for="dateInput">Interview date *</label><select class="control" id="dateInput">${weekDates().map(d=>`<option value="${d}" ${d===selected.date?'selected':''}>${fmtDate(d,{weekday:'short',month:'short',day:'numeric'})}</option>`).join('')}</select></div>
      <div class="field"><label for="timeInput">Interview time *</label><select class="control" id="timeInput" ${fullyBooked?'disabled':''}>${hourOptions(selected.date,selected.hour)}</select><div class="field-hint">Each applicant receives exactly one hour. The final interview starts at 4:00 PM and ends at 5:00 PM.</div></div>
      <div class="field"><label for="notes">Notes</label><textarea class="control" id="notes" maxlength="1000" rows="3" placeholder="Optional recruitment notes"></textarea></div>
      <button class="button button-primary" type="submit" ${fullyBooked?'disabled':''}>${fullyBooked?'No Slots Available':'Confirm Interview'}</button>
    </form>
    <div class="availability-box"><div class="availability-head"><strong>Available times</strong><span>${fmtDate(selected.date,{weekday:'short',month:'short',day:'numeric'})}</span></div><div class="chips">${availabilityChips(selected.date)}</div></div>`;
  $('dateInput').addEventListener('change',(e)=>{
    const date=e.target.value; const first=openHours(date)[0]; selected={date,hour:first??START_HOUR}; renderDesktopCalendar();renderMobileCalendar();renderPanel();
  });
  $('timeInput')?.addEventListener('change',(e)=>{selected.hour=Number(e.target.value);renderDesktopCalendar();renderMobileCalendar();renderPanel();});
  $('bookingForm').addEventListener('submit',submitBooking);
  body.querySelectorAll('.time-chip').forEach(btn=>btn.addEventListener('click',()=>selectSlot(selected.date,Number(btn.dataset.hour))));
}
function renderBookingDetail(body,b){
  $('panelTitle').textContent='Interview Details';
  const canCancel=!liveMode || b.ownerUid===currentUid;
  body.innerHTML=`
    <div class="selection-card"><p class="section-kicker">Confirmed interview</p><div class="selection-date">${fmtDate(b.date,{weekday:'long',month:'long',day:'numeric'})}</div><div class="selection-time">${fmtHour(b.hour)} – ${fmtEnd(b.hour)} · Philippine Time</div></div>
    <div class="detail-list">
      <div class="detail-row"><span>Applicant name</span><strong>${esc(b.applicant)}</strong></div>
      <div class="detail-row"><span>Position type</span><strong>${POSITION}</strong></div>
      <div class="detail-row"><span>Interview time</span><strong>${fmtHour(b.hour)} – ${fmtEnd(b.hour)}</strong></div>
      <div class="detail-row"><span>Notes</span><p>${esc(b.notes||'No notes added.')}</p></div>
    </div>
    ${canCancel?`<div class="cancel-wrap"><button class="button button-danger" id="deleteBtn" type="button">Cancel Interview</button></div>`:`<div class="ownership-note">For safety, a live booking can only be cancelled from the browser/device that originally created it.</div>`}`;
  if(canCancel)$('deleteBtn').addEventListener('click',async()=>{
    if(!confirm('Cancel this interview booking?')) return;
    try{await deleteBooking(b);showToast('Interview cancelled.');if(!liveMode)render();}
    catch(error){showToast(error.message==='NOT_OWNER'?'This booking cannot be cancelled from this device.':'Unable to cancel the interview.');}
  });
}
function hourOptions(date,current){
  return VALID_HOURS.map(hour=>{const busy=!!findBooking(date,hour);return `<option value="${hour}" ${hour===Number(current)?'selected':''} ${busy?'disabled':''}>${fmtHour(hour)} – ${fmtEnd(hour)}${busy?' · Booked':''}</option>`;}).join('');
}
function availabilityChips(date){
  const hours=openHours(date); if(!hours.length)return '<span class="empty-message">This day is fully booked from 10:00 AM to 5:00 PM.</span>';
  return hours.map(h=>`<button class="time-chip ${Number(selected.hour)===h?'active':''}" type="button" data-hour="${h}">${fmtHour(h)}</button>`).join('');
}
async function submitBooking(e){
  e.preventDefault(); const alert=$('formAlert'); alert.classList.remove('show');
  const applicant=$('applicant').value.trim(); const notes=$('notes').value.trim(); const date=$('dateInput').value; const hour=Number($('timeInput')?.value);
  if(!applicant){return showFormError('Please enter the applicant name.');}
  if(!isValidHour(hour)){return showFormError('Please choose a valid one-hour interview between 10:00 AM and 5:00 PM.');}
  if(findBooking(date,hour)){return showFormError('This interview slot has already been booked. Please select another available time.');}
  const submit=e.submitter; if(submit){submit.disabled=true;submit.textContent='Booking…';}
  try{
    await createBooking({applicant,notes,date,hour,position:POSITION,durationMinutes:60});
    selected={date,hour}; showToast(liveMode?'Interview confirmed and synced live.':'Interview saved on this device.'); if(!liveMode)render();
  }catch(error){
    if(error.message==='SLOT_TAKEN'){showFormError('Someone else just booked this time. The calendar has been refreshed—please choose another slot.');showToast('Booking rejected: this slot was taken.');if(liveMode)loadBookings().catch(()=>{});}
    else{console.error(error);showFormError('The booking could not be saved. Please check your connection and try again.');}
  }finally{if(submit && document.body.contains(submit)){submit.disabled=false;submit.textContent='Confirm Interview';}}
}
function showFormError(message){const alert=$('formAlert');if(alert){alert.textContent=message;alert.classList.add('show');}showToast(message);}
function showToast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove('show'),2800);}

$('prevWeek').addEventListener('click',()=>{weekStart=addDaysISO(weekStart,-7);selected={date:weekStart,hour:START_HOUR};render();});
$('nextWeek').addEventListener('click',()=>{weekStart=addDaysISO(weekStart,7);selected={date:weekStart,hour:START_HOUR};render();});
$('thisWeek').addEventListener('click',()=>{const today=todayPHISO();weekStart=getMondayISO(today);selected={date:today,hour:START_HOUR};render();});
$('printBtn').addEventListener('click',()=>window.print());
window.addEventListener('online',()=>{if(liveMode){setSyncStatus('','Reconnecting…');loadBookings().then(()=>setSyncStatus('live','Live sync connected')).catch(()=>setSyncStatus('offline','Sync interrupted'));}});
window.addEventListener('offline',()=>setSyncStatus('offline',liveMode?'Offline — reconnecting':'Device-only preview'));
if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});

initializeSelection();
render();
startDataLayer();
