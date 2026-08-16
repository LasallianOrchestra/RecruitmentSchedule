(function(){
'use strict';
window.__LSO_APP_STARTED = true;

const POSITION='APPLICANT';
const BOOKINGS_TABLE='recruitment_bookings';
const BATCHES_TABLE='recruitment_batches';
const PH_TIMEZONE='Asia/Manila';
const CONNECTION_TIMEOUT_MS=10000;
const POLL_INTERVAL_MS=5000;
const $=id=>document.getElementById(id);

const FALLBACK_BATCH={
  id:null,
  batch_name:'Recruitment Batch · August 24–29, 2026',
  start_date:'2026-08-24',
  end_date:'2026-08-29',
  start_hour:10,
  end_hour:18,
  duration_minutes:60,
  is_active:true
};

let activeBatch={...FALLBACK_BATCH};
let bookings=[];
let selected={date:activeBatch.start_date,hour:activeBatch.start_hour};
let liveMode=false;
let supabaseClient=null;
let currentUid=null;
let realtimeChannel=null;
let pollTimer=null;
let refreshTimer=null;
let startupInProgress=false;
let formDraft={applicant:'',notes:''};

function pad(n){return String(n).padStart(2,'0')}
function parseISODate(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(Date.UTC(y,m-1,d))}
function isoUTC(d){return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
function addDaysISO(s,n){const d=parseISODate(s);d.setUTCDate(d.getUTCDate()+n);return isoUTC(d)}
function dateDiffDays(a,b){return Math.round((parseISODate(b)-parseISODate(a))/86400000)}
function recruitmentDays(){return Math.max(1,dateDiffDays(activeBatch.start_date,activeBatch.end_date)+1)}
function weekDates(){return Array.from({length:recruitmentDays()},(_,i)=>addDaysISO(activeBatch.start_date,i))}
function validHours(){return Array.from({length:Math.max(0,Number(activeBatch.end_hour)-Number(activeBatch.start_hour))},(_,i)=>Number(activeBatch.start_hour)+i)}
function todayPHISO(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:PH_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`}
function fmtDate(s,opt={weekday:'short',month:'short',day:'numeric'}){return new Intl.DateTimeFormat('en-PH',{...opt,timeZone:'UTC'}).format(parseISODate(s))}
function fmtHour(h){h=Number(h);return `${((h+11)%12)+1}:00 ${h>=12?'PM':'AM'}`}
function fmtEnd(h){return fmtHour(Number(h)+1)}
function fmtRangeShort(){const a=activeBatch.start_date,b=activeBatch.end_date;if(a===b)return fmtDate(a,{month:'short',day:'numeric',year:'numeric'});const da=parseISODate(a),db=parseISODate(b);if(da.getUTCFullYear()===db.getUTCFullYear()&&da.getUTCMonth()===db.getUTCMonth())return `${fmtDate(a,{month:'short',day:'numeric'})}–${fmtDate(b,{day:'numeric',year:'numeric'})}`;if(da.getUTCFullYear()===db.getUTCFullYear())return `${fmtDate(a,{month:'short',day:'numeric'})} – ${fmtDate(b,{month:'short',day:'numeric',year:'numeric'})}`;return `${fmtDate(a,{month:'short',day:'numeric',year:'numeric'})} – ${fmtDate(b,{month:'short',day:'numeric',year:'numeric'})}`}
function fmtRangeLong(){const a=activeBatch.start_date,b=activeBatch.end_date;if(a===b)return fmtDate(a,{month:'long',day:'numeric',year:'numeric'});const da=parseISODate(a),db=parseISODate(b);if(da.getUTCFullYear()===db.getUTCFullYear()&&da.getUTCMonth()===db.getUTCMonth())return `${fmtDate(a,{month:'long',day:'numeric'})} – ${fmtDate(b,{day:'numeric',year:'numeric'})}`;return `${fmtDate(a,{month:'long',day:'numeric',year:'numeric'})} – ${fmtDate(b,{month:'long',day:'numeric',year:'numeric'})}`}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function isToday(date){return date===todayPHISO()}
function isValidHour(h){return validHours().includes(Number(h))}
function isOfficialDate(date){return date>=activeBatch.start_date&&date<=activeBatch.end_date}
function findBooking(date,hour){return bookings.find(b=>b.date===date&&Number(b.hour)===Number(hour))}
function openHours(date){return validHours().filter(h=>!findBooking(date,h))}
function initials(name){return String(name||'?').trim().split(/\s+/).slice(0,2).map(p=>p[0]||'').join('').toUpperCase()||'?'}
function totalSlots(){return recruitmentDays()*validHours().length}
function openCount(){return weekDates().reduce((n,d)=>n+openHours(d).length,0)}
function withTimeout(p,ms,label){let t;return Promise.race([p,new Promise((_,r)=>t=setTimeout(()=>r(new Error(label||'Request timed out')),ms))]).finally(()=>clearTimeout(t))}
function configured(){const c=window.LSO_SUPABASE_CONFIG;return !!(c?.url&&c?.publishableKey&&window.LSO_NATIVE_SUPABASE?.createClient)}
function setStatus(kind,text){const p=$('syncPill');if(!p)return;p.classList.remove('live','offline');if(kind)p.classList.add(kind);$('syncText').textContent=text}
function showSetup(title,msg){$('setupTitle').textContent=title;$('setupMessage').textContent=msg;$('setupBanner').classList.remove('hidden')}
function hideSetup(){$('setupBanner').classList.add('hidden')}
function normalizeBooking(r){return{id:r.id,applicant:r.applicant,notes:r.notes||'',position:r.position,date:r.interview_date,hour:Number(r.interview_hour),durationMinutes:Number(r.duration_minutes),ownerUid:r.owner_id||null,batchId:r.batch_id||null,createdAt:r.created_at}}
function normalizeBatch(r){return{id:r.id,batch_name:r.batch_name,start_date:r.start_date,end_date:r.end_date,start_hour:Number(r.start_hour),end_hour:Number(r.end_hour),duration_minutes:Number(r.duration_minutes||60),is_active:!!r.is_active}}
function batchKey(b){return b?[b.id,b.batch_name,b.start_date,b.end_date,b.start_hour,b.end_hour,b.duration_minutes,b.is_active].join('|'):''}
function rememberDraft(){const a=$('applicant'),n=$('notes');if(a)formDraft.applicant=a.value;if(n)formDraft.notes=n.value}
function setActiveBatch(next){const previous=batchKey(activeBatch);activeBatch=normalizeBatch(next);const configChanged=previous!==batchKey(activeBatch);let selectionChanged=false;if(configChanged||!isOfficialDate(selected.date)||!isValidHour(selected.hour)){if(!isOfficialDate(selected.date)||!isValidHour(selected.hour)||previous!==batchKey(activeBatch)){rememberDraft();selected={date:activeBatch.start_date,hour:activeBatch.start_hour};selectionChanged=true}}return configChanged||selectionChanged}
function explain(error){const msg=String(error?.message||error||'Unknown error');const l=msg.toLowerCase();if(error?.code==='42P01'||l.includes('recruitment_batches'))return['Calendar setup required','Run supabase-upgrade-v13-batches.sql once in Supabase → SQL Editor, then press Retry connection.'];if(error?.code==='42501'||l.includes('permission')||l.includes('row-level'))return['Database permission setup required','Run supabase-upgrade-v13-batches.sql once in Supabase → SQL Editor, then press Retry connection.'];if(l.includes('failed to fetch')||l.includes('network')||l.includes('timed out'))return['Cannot reach Supabase','Check the internet connection, then press Retry connection.'];return['Live sync could not start',msg.slice(0,180)]}

async function loadActiveBatch(){
  const {data,error}=await withTimeout(supabaseClient.from(BATCHES_TABLE).select('id,batch_name,start_date,end_date,start_hour,end_hour,duration_minutes,is_active').eq('is_active',true).maybeSingle(),CONNECTION_TIMEOUT_MS,'Calendar settings request timed out.');
  if(error)throw error;
  if(!data)throw new Error('No active recruitment calendar is currently published. Ask the LSO administrator to publish a batch.');
  const changed=setActiveBatch(data);
  updateStaticBatchUI();
  return changed;
}

async function loadBookings(initial=false){
  if(!supabaseClient)throw new Error('Supabase client is not initialized.');
  rememberDraft();
  const before=findBooking(selected.date,selected.hour)?.id||null;
  let q=supabaseClient.from(BOOKINGS_TABLE).select('id,applicant,position,notes,interview_date,interview_hour,duration_minutes,owner_id,batch_id,created_at').order('interview_date').order('interview_hour');
  if(activeBatch.id)q=q.eq('batch_id',activeBatch.id);else q=q.gte('interview_date',activeBatch.start_date).lte('interview_date',activeBatch.end_date);
  const {data,error}=await withTimeout(q,CONNECTION_TIMEOUT_MS,initial?'Initial bookings request timed out.':'Bookings refresh timed out.');
  if(error)throw error;
  bookings=(data||[]).map(normalizeBooking).filter(b=>isOfficialDate(b.date)&&isValidHour(b.hour));
  renderRange();renderDesktop();renderMobile();
  const after=findBooking(selected.date,selected.hour)?.id||null;
  if(before!==after)renderPanel();else updateAvailabilityBox();
}

async function startDataLayer(){
  if(startupInProgress)return;startupInProgress=true;stopPolling();hideSetup();setStatus('','Connecting…');liveMode=false;
  if(realtimeChannel&&supabaseClient){try{await supabaseClient.removeChannel(realtimeChannel)}catch(_){ }realtimeChannel=null}
  try{
    if(!configured())throw new Error('Supabase configuration or browser library is missing.');
    const c=window.LSO_SUPABASE_CONFIG;supabaseClient=window.LSO_NATIVE_SUPABASE.createClient(c.url,c.publishableKey,{storageKey:'lso_app_session_v16'});
    let session=null;try{let r=await withTimeout(supabaseClient.auth.getSession(),CONNECTION_TIMEOUT_MS);if(r.error)throw r.error;session=r.data?.session||null;if(!session){r=await withTimeout(supabaseClient.auth.signInAnonymously(),CONNECTION_TIMEOUT_MS);if(r.error)throw r.error;session=r.data?.session||null}currentUid=session?.user?.id||null}catch(e){console.warn('Anonymous auth unavailable, using public fallback:',e);currentUid=null}
    await loadActiveBatch();
    await loadBookings(true);
    liveMode=true;hideSetup();setStatus('live',currentUid?'Live':'Live · public');renderPanel();subscribe();startPolling();
  }catch(error){console.error(error);liveMode=false;setStatus('offline','Connection issue');const [t,m]=explain(error);showSetup(t,m);renderPanel()}
  finally{startupInProgress=false}
}

function subscribe(){setStatus('live',currentUid?'Live':'Live · public')}
function scheduleRefresh(batchChanged){clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{try{const changed=batchChanged?await loadActiveBatch():false;await loadBookings();if(changed)renderPanel()}catch(e){console.warn(e)}},150)}
function startPolling(){stopPolling();pollTimer=setInterval(async()=>{if(document.visibilityState==='visible'&&navigator.onLine&&supabaseClient){try{const changed=await loadActiveBatch();await loadBookings();if(changed)renderPanel()}catch(e){console.warn('Polling refresh failed:',e)}}},POLL_INTERVAL_MS)}
function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}

async function createBooking(data){
  if(!liveMode||!supabaseClient)throw new Error('NOT_CONNECTED');
  const payload={applicant:data.applicant,position:POSITION,notes:data.notes,interview_date:data.date,interview_hour:Number(data.hour),duration_minutes:60,batch_id:activeBatch.id};
  const {error}=await withTimeout(supabaseClient.from(BOOKINGS_TABLE).insert(payload),CONNECTION_TIMEOUT_MS,'Booking request timed out.');
  if(error){if(error.code==='23505')throw new Error('SLOT_TAKEN');if(error.code==='23514')throw new Error('SCHEDULE_RULE_REJECTED');if(error.code==='42501')throw new Error('DATABASE_POLICY');throw error}
  await loadBookings();
}
async function deleteBooking(b){if(!currentUid||b.ownerUid!==currentUid)throw new Error('NOT_OWNER');const {error}=await withTimeout(supabaseClient.from(BOOKINGS_TABLE).delete().eq('id',b.id),CONNECTION_TIMEOUT_MS);if(error)throw error;await loadBookings()}

function updateStaticBatchUI(){
  const rangeShort=fmtRangeShort(),rangeLong=fmtRangeLong();
  if($('batchHeroRange'))$('batchHeroRange').textContent=rangeShort;
  if($('officialPeriodRange'))$('officialPeriodRange').textContent=rangeShort;
  if($('scheduleHoursLabel'))$('scheduleHoursLabel').textContent=`${fmtHour(activeBatch.start_hour)}–${fmtHour(activeBatch.end_hour)}`;
  document.title=`LSO Recruitment | ${rangeShort}`;
}
function render(){updateStaticBatchUI();renderRange();renderDesktop();renderMobile();renderPanel()}
function renderRange(){
  $('weekRange').textContent=fmtRangeLong();const open=openCount(),total=totalSlots();$('availableCount').textContent=open;
  $('weekCaption').textContent=open===0?`All ${total} interview slots are currently booked.`:`${open} of ${total} one-hour interview slots are currently available.`;
}
function renderDesktop(){
  const grid=$('calendarGrid'),ds=weekDates(),hours=validHours();grid.innerHTML='';grid.style.setProperty('--day-count',String(ds.length));grid.style.minWidth=`${76+ds.length*130}px`;
  const corner=document.createElement('div');corner.className='cal-cell cal-corner';corner.innerHTML='<span>Time</span>';grid.appendChild(corner);
  ds.forEach(date=>{const open=openHours(date).length,pct=hours.length?Math.round(open/hours.length*100):0,el=document.createElement('div');el.className=`cal-cell cal-day ${isToday(date)?'today':''}`;el.innerHTML=`<div class="day-top"><div><span class="day-name">${fmtDate(date,{weekday:'short'})}${isToday(date)?' · Today':''}</span><span class="day-date">${fmtDate(date,{month:'short',day:'numeric'})}</span></div>${isToday(date)?'<span class="today-mark"></span>':''}</div><div class="day-capacity"><div class="capacity-track"><div class="capacity-fill" style="width:${pct}%"></div></div><span class="capacity-text">${open}/${hours.length} open</span></div>`;grid.appendChild(el)});
  hours.forEach(hour=>{const t=document.createElement('div');t.className='cal-cell cal-time';t.textContent=fmtHour(hour);grid.appendChild(t);ds.forEach(d=>grid.appendChild(makeSlot(d,hour)))})
}
function makeSlot(date,hour){const b=findBooking(date,hour),active=selected.date===date&&Number(selected.hour)===hour,el=document.createElement('button');el.type='button';el.className=`cal-cell slot ${b?'booked':''} ${active?'selected':''}`;el.setAttribute('aria-pressed',active?'true':'false');el.innerHTML=b?`<span class="slot-content"><span class="booking-name-row"><span class="booking-avatar">${esc(initials(b.applicant))}</span><span class="booking-name">${esc(b.applicant)}</span></span><span class="booking-meta">Booked · ${fmtHour(hour)}–${fmtEnd(hour)}</span></span>`:`<span class="slot-content available-content"><span class="available-label">Available</span><span class="slot-cta">Book ${fmtHour(hour)}</span></span>`;el.addEventListener('click',()=>selectSlot(date,hour));return el}
function renderMobile(){
  const ds=weekDates(),strip=$('dayStrip');strip.innerHTML='';ds.forEach(date=>{const open=openHours(date).length,btn=document.createElement('button');btn.type='button';btn.className=`day-tab ${date===selected.date?'active':''} ${isToday(date)?'today':''}`;btn.innerHTML=`<span class="dow">${fmtDate(date,{weekday:'short'})}</span><span class="num">${fmtDate(date,{day:'numeric'})}</span><span class="open">${open} open</span>`;btn.addEventListener('click',()=>{selected.date=date;if(!isValidHour(selected.hour)||findBooking(date,selected.hour))selected.hour=openHours(date)[0]??activeBatch.start_hour;renderDesktop();renderMobile();renderPanel()});strip.appendChild(btn)});
  const open=openHours(selected.date).length;$('mobileDaySummary').innerHTML=`<strong>${fmtDate(selected.date,{weekday:'long',month:'long',day:'numeric'})}</strong><span>${open} of ${validHours().length} slots available</span>`;
  const slots=$('mobileSlots');slots.innerHTML='';validHours().forEach(hour=>{const b=findBooking(selected.date,hour),active=Number(selected.hour)===hour,btn=document.createElement('button');btn.type='button';btn.className=`mobile-slot ${b?'booked':''} ${active?'selected':''}`;btn.innerHTML=`<span><span class="mobile-slot-time">${fmtHour(hour)} – ${fmtEnd(hour)}</span><span class="mobile-slot-status">${b?'Booked interview':'Tap to select this interview time'}</span></span>${b?`<span class="mobile-slot-name">${esc(b.applicant)}</span>`:'<span class="available-pill">Available</span>'}`;btn.addEventListener('click',()=>selectSlot(selected.date,hour));slots.appendChild(btn)})
}
function selectSlot(date,hour){rememberDraft();selected={date,hour:Number(hour)};renderDesktop();renderMobile();renderPanel();if(matchMedia('(max-width:780px)').matches)setTimeout(()=>$('bookingCard').scrollIntoView({behavior:'smooth',block:'start'}),50)}
function availabilityChips(date){const hs=openHours(date);if(!hs.length)return `<span class="empty-message">This day is fully booked from ${fmtHour(activeBatch.start_hour)} to ${fmtHour(activeBatch.end_hour)}.</span>`;return hs.map(h=>`<button class="time-chip ${Number(selected.hour)===h?'active':''}" type="button" data-hour="${h}">${fmtHour(h).replace(':00 ',' ')}</button>`).join('')}
function renderPanel(){
  const body=$('panelBody'),b=findBooking(selected.date,selected.hour);if(b)return renderBookingDetail(body,b);$('panelTitle').textContent='Book an Applicant';const connected=liveMode;
  body.innerHTML=`<div class="slot-summary"><div class="slot-summary-top"><div><p class="eyebrow">Your selected time</p><div class="selection-date">${fmtDate(selected.date,{weekday:'long',month:'long',day:'numeric'})}</div><div class="selection-time">${fmtHour(selected.hour)} – ${fmtEnd(selected.hour)} · Philippine Time</div></div><span class="selected-check">✓</span></div></div>${connected?'':'<div class="form-alert show">Live connection is not ready yet. Please wait or use Retry connection above.</div>'}<div class="form-alert" id="formAlert"></div><form class="booking-form" id="bookingForm"><div class="field"><label for="applicant">Applicant name <span class="required">*</span></label><input class="control" id="applicant" maxlength="120" required autocomplete="name" placeholder="Full name" value="${esc(formDraft.applicant)}"></div><div class="field"><span class="field-label">Position type</span><div class="fixed-row"><div class="fixed-row-left"><span class="fixed-icon">♩</span><span class="fixed-copy"><strong>${POSITION}</strong><span>Recruitment interview</span></span></div><span class="locked-chip">Fixed</span></div></div><div class="field"><label for="notes">Notes <span style="color:var(--muted);font-weight:650">(optional)</span></label><textarea class="control" id="notes" maxlength="1000" rows="3" placeholder="Add any recruitment notes">${esc(formDraft.notes)}</textarea></div><button class="button button-primary" type="submit" ${connected?'':'disabled'}><span>${connected?'Confirm interview':'Waiting for live connection'}</span></button></form><div class="availability-box"><div class="availability-head"><strong>Other times this day</strong><span>${fmtDate(selected.date,{weekday:'short',month:'short',day:'numeric'})}</span></div><div class="chips">${availabilityChips(selected.date)}</div></div>`;
  $('bookingForm').addEventListener('submit',submitBooking);$('applicant').addEventListener('input',e=>formDraft.applicant=e.target.value);$('notes').addEventListener('input',e=>formDraft.notes=e.target.value);body.querySelectorAll('.time-chip').forEach(btn=>btn.addEventListener('click',()=>selectSlot(selected.date,Number(btn.dataset.hour))))
}
function updateAvailabilityBox(){const box=$('panelBody')?.querySelector('.availability-box');if(!box)return;box.querySelector('.availability-head span').textContent=fmtDate(selected.date,{weekday:'short',month:'short',day:'numeric'});box.querySelector('.chips').innerHTML=availabilityChips(selected.date);box.querySelectorAll('.time-chip').forEach(btn=>btn.addEventListener('click',()=>selectSlot(selected.date,Number(btn.dataset.hour))))}
function renderBookingDetail(body,b){$('panelTitle').textContent='Interview Booked';const canCancel=!!currentUid&&b.ownerUid===currentUid;body.innerHTML=`<div class="booking-confirmed"><div class="confirmed-icon">✓</div><p class="eyebrow">Confirmed interview</p><h3>${esc(b.applicant)}</h3><p>${fmtDate(b.date,{weekday:'long',month:'long',day:'numeric'})}</p></div><div class="detail-list"><div class="detail-row"><span>Position</span><strong>${POSITION}</strong></div><div class="detail-row"><span>Schedule</span><strong>${fmtHour(b.hour)} – ${fmtEnd(b.hour)} · PHT</strong></div><div class="detail-row"><span>Notes</span><p>${esc(b.notes||'No notes added.')}</p></div></div>${canCancel?'<div class="cancel-wrap"><button class="button button-danger" id="deleteBtn" type="button">Cancel this interview</button></div>':'<div class="ownership-note">This booked slot is protected. Only the browser session that created it can cancel it.</div>'}`;if(canCancel)$('deleteBtn').addEventListener('click',async()=>{if(!confirm('Cancel this interview booking?'))return;try{await deleteBooking(b);showToast('Interview cancelled.')}catch(e){showToast('Unable to cancel the interview.',true)}})}
async function submitBooking(e){e.preventDefault();const applicant=$('applicant').value.trim(),notes=$('notes').value.trim(),date=selected.date,hour=Number(selected.hour);formDraft={applicant:$('applicant').value,notes:$('notes').value};if(!liveMode)return formError('Live connection is not ready. Please press Retry connection.');if(!applicant)return formError('Please enter the applicant name.');if(!isOfficialDate(date))return formError(`Please choose a date within ${fmtRangeLong()}.`);if(!isValidHour(hour))return formError(`Please choose a valid interview time between ${fmtHour(activeBatch.start_hour)} and ${fmtHour(activeBatch.end_hour)}.`);if(findBooking(date,hour))return formError('This interview slot has already been booked. Please select another available time.');const btn=e.submitter;if(btn){btn.disabled=true;btn.textContent='Confirming…'}try{await createBooking({applicant,notes,date,hour});formDraft={applicant:'',notes:''};showToast('Interview confirmed and synced to the shared calendar.')}catch(error){if(error.message==='SLOT_TAKEN'){formError('Someone else just booked this time. Please choose another slot.');loadBookings().catch(()=>{})}else if(error.message==='SCHEDULE_RULE_REJECTED')formError('This date or time is outside the active recruitment calendar.');else if(error.message==='DATABASE_POLICY')formError('Database permissions need the v13 batch upgrade. Please notify the LSO recruitment team.');else{console.error(error);formError('The booking could not be saved. Please check the connection and try again.')}}finally{if(btn&&document.body.contains(btn)){btn.disabled=!liveMode;btn.textContent=liveMode?'Confirm interview':'Waiting for live connection'}}}
function formError(msg){const a=$('formAlert');if(a){a.textContent=msg;a.classList.add('show')}showToast(msg,true)}
function showToast(msg,error=false){const t=$('toast');$('toastText').textContent=msg;t.classList.toggle('error',error);t.querySelector('.toast-icon').textContent=error?'!':'✓';t.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>t.classList.remove('show'),3400)}
function boot(){$('retrySyncBtn').addEventListener('click',startDataLayer);window.addEventListener('online',startDataLayer);window.addEventListener('offline',()=>{liveMode=false;setStatus('offline','Offline');showSetup('Internet connection lost','Reconnect to the internet, then press Retry connection.');renderPanel()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&liveMode){loadActiveBatch().then(changed=>loadBookings().then(()=>{if(changed)renderPanel()})).catch(()=>{})}});render();startDataLayer()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
