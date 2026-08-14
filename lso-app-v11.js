(function(){
'use strict';
window.__LSO_APP_STARTED = true;

const START_HOUR = 10;
const END_HOUR = 18; // End of final 5 PM–6 PM interview.
const POSITION = 'APPLICANT';
const TABLE = 'recruitment_bookings';
const VALID_HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i); // 10..17
const PH_TIMEZONE = 'Asia/Manila';
const RECRUITMENT_START = '2026-08-24';
const RECRUITMENT_END = '2026-08-29';
const RECRUITMENT_DAYS = 6;
const CONNECTION_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 5000;
const $ = (id) => document.getElementById(id);

let bookings = [];
let selected = { date: RECRUITMENT_START, hour: START_HOUR };
let liveMode = false;
let supabaseClient = null;
let currentUid = null;
let realtimeChannel = null;
let pollTimer = null;
let refreshTimer = null;
let startupInProgress = false;
let formDraft = { applicant: '', notes: '' };
let lastFocusedField = null;
let printSelection = RECRUITMENT_START;

function pad(n){ return String(n).padStart(2,'0'); }
function parseISODate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); }
function isoUTC(d){ return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; }
function addDaysISO(s,n){ const d=parseISODate(s); d.setUTCDate(d.getUTCDate()+n); return isoUTC(d); }
function todayPHISO(){
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:PH_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const map=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function weekDates(){ return Array.from({length:RECRUITMENT_DAYS},(_,i)=>addDaysISO(RECRUITMENT_START,i)); }
function fmtDate(s,opt={weekday:'short',month:'short',day:'numeric'}){ return new Intl.DateTimeFormat('en-PH',{...opt,timeZone:'UTC'}).format(parseISODate(s)); }
function fmtHour(h){ const hh=((Number(h)+11)%12)+1; return `${hh}:00 ${Number(h)>=12?'PM':'AM'}`; }
function fmtEnd(h){ return fmtHour(Number(h)+1); }
function esc(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function isToday(date){ return date===todayPHISO(); }
function isValidHour(hour){ return VALID_HOURS.includes(Number(hour)); }
function isOfficialDate(date){ return date >= RECRUITMENT_START && date <= RECRUITMENT_END; }
function findBooking(date,hour){ return bookings.find(b=>b.date===date && Number(b.hour)===Number(hour)); }
function openHours(date){ return VALID_HOURS.filter(h=>!findBooking(date,h)); }
function initials(name){ return String(name||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase() || '?'; }
function weekOpenCount(){ return weekDates().reduce((sum,date)=>sum+openHours(date).length,0); }

function withTimeout(promise, ms, label){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{ timer=setTimeout(()=>reject(new Error(label || 'Request timed out')),ms); })
  ]).finally(()=>clearTimeout(timer));
}

function isSupabaseConfigured(){
  const c=window.LSO_SUPABASE_CONFIG;
  return !!(c && c.url && c.publishableKey && /^https:\/\/.+\.supabase\.co\/?$/i.test(String(c.url).trim()) && !String(c.url).includes('YOUR_') && !String(c.publishableKey).includes('YOUR_'));
}

function setSyncStatus(status,text){
  const pill=$('syncPill');
  if(!pill) return;
  pill.classList.remove('live','offline');
  if(status==='live') pill.classList.add('live');
  if(status==='offline') pill.classList.add('offline');
  $('syncText').textContent=text;
}

function showSetup(title,message){
  $('setupTitle').textContent=title;
  $('setupMessage').textContent=message;
  $('setupBanner').classList.remove('hidden');
}
function hideSetup(){ $('setupBanner').classList.add('hidden'); }

function normalizeRow(row){
  return {
    id: row.id,
    applicant: row.applicant,
    position: row.position,
    notes: row.notes || '',
    date: row.interview_date,
    hour: Number(row.interview_hour),
    durationMinutes: Number(row.duration_minutes),
    ownerUid: row.owner_id || null,
    createdAt: row.created_at
  };
}

function explainSupabaseError(error){
  const msg=String(error?.message || error || 'Unknown error');
  const lower=msg.toLowerCase();
  if(error?.code==='42501' || lower.includes('permission denied') || lower.includes('row-level security') || lower.includes('row level security')){
    return ['Database permission setup required','Run supabase-upgrade-v11.sql once in Supabase → SQL Editor, then press Retry connection.'];
  }
  if(lower.includes('anonymous') && (lower.includes('disabled') || lower.includes('not enabled'))){
    return ['Anonymous sign-in is disabled','The v7 database supports a public fallback after you run supabase-upgrade-v11.sql. Run the SQL, then retry.'];
  }
  if(lower.includes('failed to fetch') || lower.includes('network') || lower.includes('timed out')){
    return ['Cannot reach Supabase','Check the internet connection, then press Retry connection. The calendar itself remains visible.'];
  }
  return ['Live sync could not start',msg.length > 180 ? msg.slice(0,177)+'…' : msg];
}

async function startDataLayer(){
  if(startupInProgress) return;
  startupInProgress=true;
  stopPolling();
  if(realtimeChannel && supabaseClient){ try{ await supabaseClient.removeChannel(realtimeChannel); }catch(_){} realtimeChannel=null; }
  liveMode=false;
  currentUid=null;
  hideSetup();
  setSyncStatus('','Connecting…');

  try{
    if(!isSupabaseConfigured()) throw new Error('Supabase Project URL or publishable key is missing from supabase-config.js.');
    if(!window.supabase || typeof window.supabase.createClient!=='function') throw new Error('Supabase browser library did not load from the CDN.');

    const cfg=window.LSO_SUPABASE_CONFIG;
    supabaseClient=window.supabase.createClient(cfg.url,cfg.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}
    });

    // Prefer an authenticated anonymous session so same-device cancellation works.
    let session=null;
    try{
      const sessionResult=await withTimeout(supabaseClient.auth.getSession(),CONNECTION_TIMEOUT_MS,'Supabase session check timed out.');
      if(sessionResult.error) throw sessionResult.error;
      session=sessionResult.data?.session || null;
      if(!session){
        const signInResult=await withTimeout(supabaseClient.auth.signInAnonymously(),CONNECTION_TIMEOUT_MS,'Anonymous sign-in timed out.');
        if(signInResult.error) throw signInResult.error;
        session=signInResult.data?.session || null;
      }
      currentUid=session?.user?.id || null;
    }catch(authError){
      // v6 SQL grants a constrained anon fallback. Do not get stuck just because Auth is unavailable.
      console.warn('Anonymous auth unavailable; trying public RLS fallback:',authError);
      currentUid=null;
    }

    await loadBookings(true);
    liveMode=true;
    hideSetup();
    setSyncStatus('live', currentUid ? 'Live' : 'Live · public');
    renderPanel(); // Re-enable booking controls after the connection is ready. Draft text is preserved.
    subscribeBookings();
    startPolling(); // Safety net even if Realtime publication/socket is unavailable.
  }catch(error){
    console.error('Supabase initialization failed:',error);
    liveMode=false;
    bookings=[];
    render();
    setSyncStatus('offline','Connection issue');
    const [title,message]=explainSupabaseError(error);
    showSetup(title,message);
  }finally{
    startupInProgress=false;
  }
}

async function loadBookings(initial=false){
  if(!supabaseClient) throw new Error('Supabase client is not initialized.');

  // Remember whether the currently selected slot was free/booked before the refresh.
  // The booking form must NOT be rebuilt for unrelated realtime/polling updates because
  // replacing its input elements while a user is typing clears the browser's live input state.
  const beforeSelected=findBooking(selected.date,selected.hour);
  const beforeSelectedId=beforeSelected?.id || null;

  const query=supabaseClient
    .from(TABLE)
    .select('id,applicant,position,notes,interview_date,interview_hour,duration_minutes,owner_id,created_at')
    .gte('interview_date',RECRUITMENT_START)
    .lte('interview_date',RECRUITMENT_END)
    .order('interview_date',{ascending:true})
    .order('interview_hour',{ascending:true});
  const {data,error}=await withTimeout(query,CONNECTION_TIMEOUT_MS,initial?'Initial bookings request timed out.':'Bookings refresh timed out.');
  if(error) throw error;

  bookings=(data||[]).map(normalizeRow).filter(b=>isOfficialDate(b.date)&&isValidHour(b.hour));

  // Calendar/availability can refresh live without replacing the applicant form.
  renderWeekRange();
  renderDesktopCalendar();
  renderMobileCalendar();

  const afterSelected=findBooking(selected.date,selected.hour);
  const afterSelectedId=afterSelected?.id || null;
  if(beforeSelectedId !== afterSelectedId){
    // The selected slot itself changed (for example another applicant just booked it),
    // so the side panel must transition between booking form and booking details.
    renderPanel();
  }else{
    updateAvailabilityBox();
  }
}

function subscribeBookings(){
  if(!supabaseClient) return;
  realtimeChannel=supabaseClient
    .channel('lso-recruitment-bookings-v11')
    .on('postgres_changes',{event:'*',schema:'public',table:TABLE},()=>{
      clearTimeout(refreshTimer);
      refreshTimer=setTimeout(()=>loadBookings().catch(err=>console.warn('Realtime refresh failed:',err)),120);
    })
    .subscribe((status)=>{
      if(status==='SUBSCRIBED') setSyncStatus('live',currentUid?'Live':'Live · public');
      else if(status==='CHANNEL_ERROR' || status==='TIMED_OUT') setSyncStatus('live','Connected · auto refresh');
      else if(status==='CLOSED' && navigator.onLine) setSyncStatus('live','Connected · auto refresh');
    });
}

function startPolling(){
  stopPolling();
  pollTimer=setInterval(()=>{
    if(document.visibilityState==='visible' && navigator.onLine && supabaseClient){
      loadBookings().catch(err=>console.warn('Polling refresh failed:',err));
    }
  },POLL_INTERVAL_MS);
}
function stopPolling(){ if(pollTimer){ clearInterval(pollTimer); pollTimer=null; } }

async function createBooking(data){
  if(!liveMode || !supabaseClient) throw new Error('NOT_CONNECTED');
  const payload={
    applicant:data.applicant,
    position:POSITION,
    notes:data.notes,
    interview_date:data.date,
    interview_hour:Number(data.hour),
    duration_minutes:60
  };
  const {error}=await withTimeout(supabaseClient.from(TABLE).insert(payload),CONNECTION_TIMEOUT_MS,'Booking request timed out.');
  if(error){
    if(error.code==='23505') throw new Error('SLOT_TAKEN');
    if(error.code==='23514') throw new Error('SCHEDULE_RULE_REJECTED');
    if(error.code==='42501') throw new Error('DATABASE_POLICY');
    throw error;
  }
  await loadBookings();
}

async function deleteBooking(booking){
  if(!liveMode || !supabaseClient) throw new Error('NOT_CONNECTED');
  if(!currentUid || booking.ownerUid!==currentUid) throw new Error('NOT_OWNER');
  const {error}=await withTimeout(supabaseClient.from(TABLE).delete().eq('id',booking.id),CONNECTION_TIMEOUT_MS,'Cancellation request timed out.');
  if(error) throw error;
  await loadBookings();
}

function render(){
  renderWeekRange();
  renderDesktopCalendar();
  renderMobileCalendar();
  renderPanel();
}

function renderWeekRange(){
  const d=weekDates();
  const first=d[0];
  const last=d[d.length-1];
  $('weekRange').textContent=`${fmtDate(first,{month:'long',day:'numeric'})} – ${fmtDate(last,{day:'numeric',year:'numeric'})}`;
  const open=weekOpenCount();
  $('availableCount').textContent=open;
  $('weekCaption').textContent=open===0?'All 48 interview slots are currently booked.':`${open} of ${VALID_HOURS.length*RECRUITMENT_DAYS} interview slots are currently available.`;
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
      renderDesktopCalendar(); renderMobileCalendar(); renderPanel();
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
  renderDesktopCalendar(); renderMobileCalendar(); renderPanel();
  if(window.matchMedia('(max-width: 780px)').matches){ setTimeout(()=>$('bookingCard').scrollIntoView({behavior:'smooth',block:'start'}),60); }
}

function renderPanel(){
  const body=$('panelBody');
  const booking=findBooking(selected.date,selected.hour);
  if(booking){ renderBookingDetail(body,booking); return; }
  $('panelTitle').textContent='Book an Applicant';
  const available=openHours(selected.date);
  const connected=liveMode;
  body.innerHTML=`
    <div class="slot-summary">
      <div class="slot-summary-top">
        <div><p class="eyebrow">Your selected time</p><div class="selection-date">${fmtDate(selected.date,{weekday:'long',month:'long',day:'numeric'})}</div><div class="selection-time">${fmtHour(selected.hour)} – ${fmtEnd(selected.hour)} · Philippine Time</div></div>
        <span class="selected-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8"/></svg></span>
      </div>
    </div>
    ${connected?'':'<div class="form-alert show">Live connection is not ready yet. Please wait or use Retry connection above.</div>'}
    <div class="form-alert" id="formAlert"></div>
    <form class="booking-form" id="bookingForm">
      <div class="field"><label for="applicant">Applicant name <span class="required">*</span></label><input class="control" id="applicant" maxlength="120" required autocomplete="name" placeholder="Full name" value="${esc(formDraft.applicant)}" /></div>
      <div class="field"><span class="field-label">Position type</span><div class="fixed-row" aria-label="Position type is fixed as applicant"><div class="fixed-row-left"><span class="fixed-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0"/></svg></span><span class="fixed-copy"><strong>${POSITION}</strong><span>Recruitment interview</span></span></div><span class="locked-chip">Fixed</span></div></div>
      <div class="field"><label for="notes">Notes <span style="color:var(--muted);font-weight:650">(optional)</span></label><textarea class="control" id="notes" maxlength="1000" rows="3" placeholder="Add any recruitment notes">${esc(formDraft.notes)}</textarea></div>
      <button class="button button-primary" type="submit" ${connected?'':'disabled'}><span>${connected?'Confirm interview':'Waiting for live connection'}</span>${connected?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>':''}</button>
    </form>
    <div class="availability-box"><div class="availability-head"><strong>Other times this day</strong><span>${fmtDate(selected.date,{weekday:'short',month:'short',day:'numeric'})}</span></div><div class="chips">${availabilityChips(selected.date)}</div></div>`;
  $('bookingForm').addEventListener('submit',submitBooking);
  const applicantInput=$('applicant');
  const notesInput=$('notes');
  applicantInput.addEventListener('input',()=>{ formDraft.applicant=applicantInput.value; });
  notesInput.addEventListener('input',()=>{ formDraft.notes=notesInput.value; });
  applicantInput.addEventListener('focus',()=>{ lastFocusedField='applicant'; });
  notesInput.addEventListener('focus',()=>{ lastFocusedField='notes'; });
  body.querySelectorAll('.time-chip').forEach(btn=>btn.addEventListener('click',()=>selectSlot(selected.date,Number(btn.dataset.hour))));
}

function updateAvailabilityBox(){
  const body=$('panelBody');
  if(!body) return;
  const box=body.querySelector('.availability-box');
  if(!box) return;
  const headDate=box.querySelector('.availability-head span');
  const chips=box.querySelector('.chips');
  if(headDate) headDate.textContent=fmtDate(selected.date,{weekday:'short',month:'short',day:'numeric'});
  if(chips){
    chips.innerHTML=availabilityChips(selected.date);
    chips.querySelectorAll('.time-chip').forEach(btn=>btn.addEventListener('click',()=>selectSlot(selected.date,Number(btn.dataset.hour))));
  }
}

function renderBookingDetail(body,b){
  $('panelTitle').textContent='Interview Details';
  const canCancel=!!(liveMode && currentUid && b.ownerUid===currentUid);
  body.innerHTML=`
    <div class="confirmation-card"><div class="confirmation-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-8"/></svg></div><p class="eyebrow">Confirmed interview</p><h3>${esc(b.applicant)}</h3><p>${fmtDate(b.date,{weekday:'long',month:'long',day:'numeric'})} · ${fmtHour(b.hour)} – ${fmtEnd(b.hour)}</p></div>
    <div class="detail-list"><div class="detail-row"><span>Applicant</span><strong>${esc(b.applicant)}</strong></div><div class="detail-row"><span>Position</span><strong>${POSITION}</strong></div><div class="detail-row"><span>Schedule</span><strong>${fmtHour(b.hour)} – ${fmtEnd(b.hour)} · PHT</strong></div><div class="detail-row"><span>Notes</span><p>${esc(b.notes||'No notes added.')}</p></div></div>
    ${canCancel?'<div class="cancel-wrap"><button class="button button-danger" id="deleteBtn" type="button">Cancel this interview</button></div>':'<div class="ownership-note">This booked slot is protected. Only the browser session that created an authenticated booking can cancel it.</div>'}`;
  if(canCancel)$('deleteBtn').addEventListener('click',async()=>{
    if(!confirm('Cancel this interview booking?')) return;
    try{ await deleteBooking(b); showToast('Interview cancelled.'); }
    catch(error){ showToast(error.message==='NOT_OWNER'?'This booking cannot be cancelled from this browser.':'Unable to cancel the interview.',true); }
  });
}

function availabilityChips(date){
  const hours=openHours(date);
  if(!hours.length)return '<span class="empty-message">This day is fully booked from 10:00 AM to 6:00 PM.</span>';
  return hours.map(h=>`<button class="time-chip ${Number(selected.hour)===h?'active':''}" type="button" data-hour="${h}">${fmtHour(h).replace(':00 ',' ')}</button>`).join('');
}

async function submitBooking(e){
  e.preventDefault();
  const alert=$('formAlert'); if(alert) alert.classList.remove('show');
  const applicant=$('applicant').value.trim();
  const notes=$('notes').value.trim();
  formDraft.applicant=$('applicant').value;
  formDraft.notes=$('notes').value;
  const date=selected.date; const hour=Number(selected.hour);
  if(!liveMode) return showFormError('Live connection is not ready. Please press Retry connection.');
  if(!applicant) return showFormError('Please enter the applicant name.');
  if(!isOfficialDate(date)) return showFormError('Please choose a date from August 24 to 29, 2026.');
  if(!isValidHour(hour)) return showFormError('Please choose a valid interview time between 10:00 AM and 6:00 PM.');
  if(findBooking(date,hour)) return showFormError('This interview slot has already been booked. Please select another available time.');
  const submit=e.submitter;
  if(submit){ submit.disabled=true; submit.innerHTML='<span>Confirming…</span>'; }
  try{
    await createBooking({applicant,notes,date,hour});
    selected={date,hour};
    formDraft={applicant:'',notes:''};
    lastFocusedField=null;
    showToast('Interview confirmed and synced to the shared calendar.');
  }catch(error){
    if(error.message==='SLOT_TAKEN'){ showFormError('Someone else just booked this time. Please choose another slot.'); loadBookings().catch(()=>{}); }
    else if(error.message==='SCHEDULE_RULE_REJECTED'){ showFormError('This date or time is outside the official recruitment schedule.'); }
    else if(error.message==='DATABASE_POLICY'){ showFormError('Database permissions need the v8 SQL upgrade. Please notify the LSO recruitment team.'); }
    else { console.error(error); showFormError('The booking could not be saved. Please check the connection and try again.'); }
  }finally{
    if(submit && document.body.contains(submit)){ submit.disabled=!liveMode; submit.innerHTML=liveMode?'<span>Confirm interview</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>':'<span>Waiting for live connection</span>'; }
  }
}


function bookedForDate(date){
  return bookings
    .filter(b=>b.date===date && isValidHour(b.hour))
    .slice()
    .sort((a,b)=>Number(a.hour)-Number(b.hour) || String(a.applicant||'').localeCompare(String(b.applicant||'')));
}

function renderPrintDayOptions(){
  const wrap=$('printDayOptions');
  if(!wrap) return;
  const totalBooked=weekDates().reduce((n,date)=>n+bookedForDate(date).length,0);
  const buttons=weekDates().map(date=>{
    const count=bookedForDate(date).length;
    const active=printSelection===date;
    return `<button class="print-day-option ${active?'active':''}" type="button" role="radio" aria-checked="${active?'true':'false'}" data-print-date="${date}">
      <span class="print-option-date"><small>${fmtDate(date,{weekday:'long'})}</small><strong>${fmtDate(date,{month:'short',day:'numeric'})}</strong></span>
      <span class="print-option-count"><b>${count}</b> ${count===1?'applicant':'applicants'}</span>
    </button>`;
  });
  const allActive=printSelection==='all';
  buttons.push(`<button class="print-day-option print-all-option ${allActive?'active':''}" type="button" role="radio" aria-checked="${allActive?'true':'false'}" data-print-date="all">
    <span class="print-option-date"><small>Complete record</small><strong>All 6 Days</strong></span>
    <span class="print-option-count"><b>${totalBooked}</b> ${totalBooked===1?'applicant':'applicants'}</span>
  </button>`);
  wrap.innerHTML=buttons.join('');
  wrap.querySelectorAll('.print-day-option').forEach(btn=>btn.addEventListener('click',()=>{
    printSelection=btn.dataset.printDate;
    renderPrintDayOptions();
    const confirm=$('printConfirmBtn');
    if(confirm){
      const label=confirm.querySelector('span');
      if(label) label.textContent=printSelection==='all'?'Print all recruitment days':'Print selected day';
    }
  }));
}

async function openPrintModal(){
  if(!liveMode){
    showToast('Please wait for the live calendar to connect before printing.',true);
    return;
  }
  try{
    await loadBookings(); // pull the newest shared schedule before official printing
  }catch(error){
    console.warn('Unable to refresh bookings before print:',error);
    showToast('Could not refresh the live schedule. Please retry the connection before printing.',true);
    return;
  }
  printSelection=isOfficialDate(selected.date)?selected.date:RECRUITMENT_START;
  renderPrintDayOptions();
  const confirm=$('printConfirmBtn');
  if(confirm){ const label=confirm.querySelector('span'); if(label) label.textContent='Print selected day'; }
  const modal=$('printModal');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(()=>{ const active=modal.querySelector('.print-day-option.active'); if(active) active.focus(); },30);
}

function closePrintModal(){
  const modal=$('printModal');
  if(modal) modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  if($('printBtn')) $('printBtn').focus();
}

function buildOfficialPrintPage(date){
  const dayBookings=bookedForDate(date);
  const rows=dayBookings.length
    ? dayBookings.map(b=>`<tr><td class="print-name">${esc(b.applicant)}</td><td class="print-time">${fmtHour(b.hour)} – ${fmtEnd(b.hour)}</td></tr>`).join('')
    : '<tr class="print-empty-row"><td colspan="2">No applicants are scheduled for this day.</td></tr>';
  return `<section class="print-page">
    <img class="print-official-header" src="./lso-print-header.png" alt="Lasallian Symphony Orchestra official header" />
    <div class="print-document-heading">
      <p>Official Recruitment Document</p>
      <h1>Recruitment Interview Schedule</h1>
      <div class="print-date-line">${fmtDate(date,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>
    </div>
    <div class="print-table-wrap">
      <table class="print-schedule-table">
        <thead><tr><th>Full Name</th><th>Scheduled Interview</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="print-page-spacer"></div>
    <img class="print-official-footer" src="./lso-print-footer.png" alt="Lasallian Symphony Orchestra official contact footer" />
  </section>`;
}

async function waitForPrintImages(container){
  const imgs=[...container.querySelectorAll('img')];
  await Promise.all(imgs.map(img=>{
    if(img.complete && img.naturalWidth>0) return Promise.resolve();
    return new Promise(resolve=>{
      const done=()=>resolve();
      img.addEventListener('load',done,{once:true});
      img.addEventListener('error',done,{once:true});
      setTimeout(done,2500);
    });
  }));
}

async function printSelectedSchedule(){
  const doc=$('printDocument');
  if(!doc) return;
  const dates=printSelection==='all'?weekDates():[printSelection];
  doc.innerHTML=dates.map(buildOfficialPrintPage).join('');
  closePrintModal();
  document.body.classList.add('official-print-ready');
  await waitForPrintImages(doc);
  // Give the browser one paint so the official assets and table are laid out before print preview opens.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  window.print();
}

function resetPrintDocument(){
  document.body.classList.remove('official-print-ready');
  const doc=$('printDocument');
  if(doc) doc.innerHTML='';
}

function showFormError(message){ const alert=$('formAlert'); if(alert){ alert.textContent=message; alert.classList.add('show'); } showToast(message,true); }
function showToast(message,isError=false){ const t=$('toast'); $('toastText').textContent=message; t.classList.toggle('error',isError); t.querySelector('.toast-icon').textContent=isError?'!':'✓'; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),3400); }

function boot(){
  $('printBtn').addEventListener('click',openPrintModal);
  $('printModalBackdrop').addEventListener('click',closePrintModal);
  $('printCloseBtn').addEventListener('click',closePrintModal);
  $('printCancelBtn').addEventListener('click',closePrintModal);
  $('printConfirmBtn').addEventListener('click',printSelectedSchedule);
  document.addEventListener('keydown',(event)=>{ if(event.key==='Escape' && !$('printModal').classList.contains('hidden')) closePrintModal(); });
  window.addEventListener('afterprint',resetPrintDocument);
  $('retrySyncBtn').addEventListener('click',()=>startDataLayer());
  window.addEventListener('online',()=>startDataLayer());
  window.addEventListener('offline',()=>{ liveMode=false; setSyncStatus('offline','Offline'); showSetup('Internet connection lost','Reconnect to the internet, then press Retry connection.'); renderPanel(); });
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && liveMode) loadBookings().catch(()=>{}); });
  window.addEventListener('unhandledrejection',(event)=>console.error('Unhandled promise rejection:',event.reason));
  render(); // Calendar appears immediately even before network connection finishes.
  startDataLayer();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
