(function(){
'use strict';
window.__LSO_ADMIN_STARTED=true;
const BOOKINGS_TABLE='recruitment_bookings',BATCHES_TABLE='recruitment_batches';
const TIMEOUT=10000,$=id=>document.getElementById(id);
let sb=null,adminUser=null,bookings=[],batches=[],activeBatch=null,viewBatchId=null,selectedId=null,channel=null,printSelection=null,editingBatchId=null;
function pad(n){return String(n).padStart(2,'0')}
function parseISODate(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(Date.UTC(y,m-1,d))}
function isoUTC(d){return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`}
function addDaysISO(s,n){const d=parseISODate(s);d.setUTCDate(d.getUTCDate()+n);return isoUTC(d)}
function diffDays(a,b){return Math.round((parseISODate(b)-parseISODate(a))/86400000)}
function batchDays(b){return b?Math.max(1,diffDays(b.start_date,b.end_date)+1):0}
function batchDates(b){return b?Array.from({length:batchDays(b)},(_,i)=>addDaysISO(b.start_date,i)):[]}
function batchHours(b){return b?Array.from({length:Math.max(0,Number(b.end_hour)-Number(b.start_hour))},(_,i)=>Number(b.start_hour)+i):[]}
function fmtDate(s,opt={weekday:'short',month:'short',day:'numeric'}){return new Intl.DateTimeFormat('en-PH',{...opt,timeZone:'UTC'}).format(parseISODate(s))}
function fmtHour(h){h=Number(h);return `${((h+11)%12)+1}:00 ${h>=12?'PM':'AM'}`}
function fmtEnd(h){return fmtHour(Number(h)+1)}
function fmtRange(b){if(!b)return 'No active calendar';const a=b.start_date,e=b.end_date;if(a===e)return fmtDate(a,{month:'long',day:'numeric',year:'numeric'});const da=parseISODate(a),de=parseISODate(e);if(da.getUTCFullYear()===de.getUTCFullYear()&&da.getUTCMonth()===de.getUTCMonth())return `${fmtDate(a,{month:'long',day:'numeric'})} – ${fmtDate(e,{day:'numeric',year:'numeric'})}`;return `${fmtDate(a,{month:'long',day:'numeric',year:'numeric'})} – ${fmtDate(e,{month:'long',day:'numeric',year:'numeric'})}`}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function timeout(p,ms=TIMEOUT){let t;return Promise.race([p,new Promise((_,r)=>t=setTimeout(()=>r(new Error('Request timed out')),ms))]).finally(()=>clearTimeout(t))}
function normalizeBooking(r){return{id:r.id,applicant:r.applicant,notes:r.notes||'',date:r.interview_date,hour:Number(r.interview_hour),ownerUid:r.owner_id||null,batchId:r.batch_id||null,createdAt:r.created_at}}
function normalizeBatch(r){return{id:r.id,batch_name:r.batch_name,start_date:r.start_date,end_date:r.end_date,start_hour:Number(r.start_hour),end_hour:Number(r.end_hour),duration_minutes:Number(r.duration_minutes||60),is_active:!!r.is_active,created_at:r.created_at,updated_at:r.updated_at}}
function setStatus(kind,text){const p=$('adminSyncPill');p?.classList.remove('live','offline');if(kind)p?.classList.add(kind);if($('adminSyncText'))$('adminSyncText').textContent=text}
function toast(msg,error=false){const t=$('adminToast');if(!t)return;$('adminToastText').textContent=msg;t.classList.toggle('error',error);t.querySelector('.toast-icon').textContent=error?'!':'✓';t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),3200)}
function formError(id,msg){const e=$(id);if(e){e.textContent=msg;e.classList.remove('hidden')}}function clearError(id){$(id)?.classList.add('hidden')}
function configPresent(){const c=window.LSO_SUPABASE_CONFIG;return !!(c?.url&&c?.publishableKey)}
function setLoginReady(ready,label){const btn=$('loginBtn');if(!btn)return;btn.disabled=!ready;btn.setAttribute('aria-disabled',String(!ready));btn.textContent=label||(ready?'Sign in securely':'Preparing secure sign-in…')}
async function ensureClient(){
 if(sb?.auth)return sb;
 if(!configPresent())throw new Error('Supabase configuration is missing. Upload supabase-config.js beside admin.html.');
 if(!window.LSO_NATIVE_SUPABASE?.createClient)throw new Error('The local secure connection module did not load. Make sure lso-native-supabase-v18.js is uploaded beside admin.html.');
 const c=window.LSO_SUPABASE_CONFIG;
 sb=window.LSO_NATIVE_SUPABASE.createClient(c.url,c.publishableKey,{storageKey:'lso_admin_session_v16'});
 if(!sb?.auth)throw new Error('Secure connection could not initialize.');
 return sb;
}
function currentBatch(){return batches.find(b=>b.id===viewBatchId)||activeBatch||batches[0]||null}
function bookingBatch(b){return batches.find(x=>x.id===b?.batchId)||currentBatch()}
function totalSlots(b){return batchDays(b)*batchHours(b).length}
async function isAdmin(){await ensureClient();const {data,error}=await timeout(sb.rpc('is_lso_admin'));if(error)throw error;return data===true}

async function start(){clearError('loginError');setLoginReady(false,'Preparing secure sign-in…');setStatus('','Connecting…');try{await ensureClient();const {data,error}=await timeout(sb.auth.getSession());if(error)throw error;const user=data?.session?.user;if(user){try{if(await isAdmin()){adminUser=user;await enterAdmin();return}}catch(e){console.warn('[LSO Admin] Existing session authorization check failed:',e)}}showLogin();setLoginReady(true)}catch(e){console.error('[LSO Admin] Startup failed:',e);showLogin(false);setLoginReady(true,'Retry secure connection');formError('loginError',friendlyInitError(e));setStatus('offline','Connection issue')}}
function friendlyInitError(e){const m=String(e?.message||e||'').trim();if(/configuration/i.test(m))return 'Supabase configuration is missing. Make sure supabase-config.js is uploaded beside admin.html.';if(/timed out|network|fetch|connection/i.test(m))return 'Supabase could not be reached. Check your internet connection, then try again.';return m||'The secure sign-in service could not initialize.'}
function showLogin(markReady=true){$('loginView').classList.remove('hidden');$('adminApp').classList.add('hidden');$('logoutBtn').classList.add('hidden');setStatus('','Sign in required');if(markReady&&sb?.auth)setLoginReady(true)}
async function login(e){e.preventDefault();clearError('loginError');setLoginReady(false,'Signing in…');try{await ensureClient();const email=$('adminEmail').value.trim(),password=$('adminPassword').value;if(!email||!password)throw new Error('Enter your administrator email address and password.');const {data,error}=await timeout(sb.auth.signInWithPassword({email,password}),15000);if(error)throw error;if(!data?.user)throw new Error('Supabase did not return an authenticated user. Please try again.');if(!(await isAdmin())){await sb.auth.signOut();throw new Error('This Supabase account is not authorized as an LSO administrator.')}adminUser=data.user;await enterAdmin()}catch(e){console.error('[LSO Admin] Sign in failed:',e);formError('loginError',e.message||'Unable to sign in.');setStatus('offline','Access denied');setLoginReady(true,sb?.auth?'Sign in securely':'Retry secure connection')}finally{if(!$('loginView').classList.contains('hidden'))setLoginReady(true,sb?.auth?'Sign in securely':'Retry secure connection')}}
async function logout(){if(adminPollTimer){clearInterval(adminPollTimer);adminPollTimer=null}try{if(channel)await sb.removeChannel(channel);await sb.auth.signOut()}catch(_){ }bookings=[];batches=[];activeBatch=null;viewBatchId=null;selectedId=null;adminUser=null;showLogin()}
async function enterAdmin(){$('loginView').classList.add('hidden');$('adminApp').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');setStatus('live','Admin · Live');populateHourSelects();await loadBatches(true);await loadBookings();subscribe()}

async function loadBatches(initial=false){
  const {data,error}=await timeout(sb.from(BATCHES_TABLE).select('id,batch_name,start_date,end_date,start_hour,end_hour,duration_minutes,is_active,created_at,updated_at').order('is_active',{ascending:false}).order('created_at',{ascending:false}));if(error){if(error.code==='42P01')throw new Error('Run supabase-upgrade-v13-batches.sql first.');throw error}
  const oldActive=activeBatch?.id;batches=(data||[]).map(normalizeBatch);activeBatch=batches.find(b=>b.is_active)||null;if(!viewBatchId||!batches.some(b=>b.id===viewBatchId))viewBatchId=activeBatch?.id||batches[0]?.id||null;
  renderBatchManager();populateBatchFilter();populateDateFilters();if(initial||oldActive!==activeBatch?.id)loadBatchForm(activeBatch,false)
}
async function loadBookings(){setStatus('','Syncing…');const {data,error}=await timeout(sb.from(BOOKINGS_TABLE).select('id,applicant,notes,interview_date,interview_hour,owner_id,batch_id,created_at').order('interview_date').order('interview_hour'));if(error)throw error;bookings=(data||[]).map(normalizeBooking);renderAll();setStatus('live','Admin · Live')}
let adminPollTimer=null;function subscribe(){if(adminPollTimer)clearInterval(adminPollTimer);adminPollTimer=setInterval(async()=>{if(document.visibilityState!=='visible'||!adminUser)return;try{await loadBatches();await loadBookings()}catch(e){console.warn('[LSO Admin] refresh failed:',e)}},5000);setStatus('live','Admin · Live')}

function populateHourSelects(){const start=$('batchStartHour'),end=$('batchEndHour');start.innerHTML=Array.from({length:23},(_,h)=>`<option value="${h}">${fmtHour(h)}</option>`).join('');end.innerHTML=Array.from({length:23},(_,i)=>i+1).map(h=>`<option value="${h}">${fmtHour(h)}</option>`).join('')}
function renderBatchManager(){if(!activeBatch){$('activeBatchName').textContent='No active recruitment batch';$('activeBatchRange').textContent='Publish a calendar to open applicant scheduling.';$('activeBatchHours').textContent='—';$('activeBatchSlots').textContent='0 slots';$('adminHeroPeriod').textContent='No active calendar';return}$('activeBatchName').textContent=activeBatch.batch_name;$('activeBatchRange').textContent=fmtRange(activeBatch);$('activeBatchHours').textContent=`${fmtHour(activeBatch.start_hour)} – ${fmtHour(activeBatch.end_hour)}`;$('activeBatchSlots').textContent=`${totalSlots(activeBatch)} slots`;$('adminHeroPeriod').textContent=fmtRange(activeBatch)}
function loadBatchForm(batch,newMode){clearError('batchError');editingBatchId=newMode?null:batch?.id||null;$('batchFormMode').textContent=newMode?'New recruitment batch':'Calendar settings';$('batchFormTitle').textContent=newMode?'Create next batch':'Edit active calendar';$('batchModeChip').textContent=newMode?'NEW':'ACTIVE';$('publishBatchBtn').textContent=newMode?'Publish next batch':'Save active calendar';if(newMode){$('batchName').value='';$('batchStartDate').value='';$('batchEndDate').value='';$('batchStartHour').value=String(activeBatch?.start_hour??10);$('batchEndHour').value=String(activeBatch?.end_hour??18)}else if(batch){$('batchName').value=batch.batch_name;$('batchStartDate').value=batch.start_date;$('batchEndDate').value=batch.end_date;$('batchStartHour').value=String(batch.start_hour);$('batchEndHour').value=String(batch.end_hour)}updateBatchPreview()}
function updateBatchPreview(){const s=$('batchStartDate').value,e=$('batchEndDate').value,sh=Number($('batchStartHour').value),eh=Number($('batchEndHour').value);let text='Choose dates and hours.';if(s&&e&&e>=s&&eh>sh){const d=diffDays(s,e)+1,slots=d*(eh-sh);text=`${d} day${d===1?'':'s'} · ${fmtHour(sh)}–${fmtHour(eh)} · ${slots} total slots`}$('batchPreview').querySelector('span').textContent=text}
function existingBookingsOutside(candidate,batchId){return bookings.filter(b=>b.batchId===batchId&&(b.date<candidate.start_date||b.date>candidate.end_date||b.hour<candidate.start_hour||b.hour>=candidate.end_hour))}
async function saveBatch(e){e.preventDefault();clearError('batchError');const name=$('batchName').value.trim(),start=$('batchStartDate').value,end=$('batchEndDate').value,sh=Number($('batchStartHour').value),eh=Number($('batchEndHour').value);if(!name)return formError('batchError','Batch name is required.');if(!start||!end||end<start)return formError('batchError','Choose a valid start and end date.');if(eh<=sh)return formError('batchError','The end of interviews must be later than the first interview time.');if(eh-sh<1)return formError('batchError','The calendar must contain at least one interview slot per day.');const candidate={start_date:start,end_date:end,start_hour:sh,end_hour:eh};if(editingBatchId){const outside=existingBookingsOutside(candidate,editingBatchId);if(outside.length)return formError('batchError',`This change would place ${outside.length} existing booking${outside.length===1?'':'s'} outside the calendar. Keep the current range or use “Create next batch” so those records stay visible.`)}const btn=$('publishBatchBtn');btn.disabled=true;btn.textContent='Publishing…';try{const {data,error}=await timeout(sb.rpc('save_recruitment_batch',{p_batch_id:editingBatchId,p_batch_name:name,p_start_date:start,p_end_date:end,p_start_hour:sh,p_end_hour:eh,p_activate:true}));if(error)throw error;viewBatchId=data;await loadBatches();await loadBookings();loadBatchForm(activeBatch,false);toast(editingBatchId?'Active applicant calendar updated.':'Next recruitment batch is now live on the applicant page.')}catch(e){console.error(e);formError('batchError',e.message||'Unable to publish the calendar.');toast('Calendar update failed.',true)}finally{btn.disabled=false;btn.textContent=editingBatchId?'Save active calendar':'Publish next batch'}}

function populateBatchFilter(){const el=$('batchFilter');if(!el)return;el.innerHTML=batches.map(b=>`<option value="${b.id}">${b.is_active?'● LIVE · ':''}${esc(b.batch_name)} · ${fmtRange(b)}</option>`).join('');if(viewBatchId)el.value=viewBatchId}
function populateDateFilters(){const b=currentBatch(),day=$('dayFilter'),edit=$('editDate');if(!b){day.innerHTML='<option value="all">No batch</option>';edit.innerHTML='';return}day.innerHTML=`<option value="all">All ${batchDays(b)} days</option>`+batchDates(b).map(d=>`<option value="${d}">${fmtDate(d,{weekday:'short',month:'short',day:'numeric'})}</option>`).join('');const eb=bookingBatch(bookings.find(x=>x.id===selectedId))||b;edit.innerHTML=batchDates(eb).map(d=>`<option value="${d}">${fmtDate(d,{weekday:'long',month:'long',day:'numeric'})}</option>`).join('')}
function viewBookings(){const b=currentBatch();if(!b)return[];return bookings.filter(x=>x.batchId===b.id||(!x.batchId&&x.date>=b.start_date&&x.date<=b.end_date))}
function openCount(){const b=currentBatch();return Math.max(0,totalSlots(b)-viewBookings().length)}
function filtered(){const q=$('bookingSearch').value.trim().toLowerCase(),day=$('dayFilter').value;return viewBookings().filter(b=>(day==='all'||b.date===day)&&(!q||b.applicant.toLowerCase().includes(q))).sort((a,b)=>a.date.localeCompare(b.date)||a.hour-b.hour)}
function renderAll(){const b=currentBatch(),vb=viewBookings();$('bookedCount').textContent=vb.length;$('adminOpenCount').textContent=openCount();$('adminDayCount').textContent=batchDays(b);$('adminPeriodText').textContent=b?fmtRange(b):'No batch';renderRows();renderEditor()}
function renderRows(){const rows=filtered(),body=$('adminBookingRows');body.innerHTML=rows.map(b=>`<tr data-id="${b.id}" class="${b.id===selectedId?'active':''}"><td>${esc(fmtDate(b.date,{weekday:'short',month:'short',day:'numeric'}))}</td><td class="time-cell">${fmtHour(b.hour)} – ${fmtEnd(b.hour)}</td><td class="name-cell">${esc(b.applicant)}</td><td><button type="button" class="row-edit-btn" data-id="${b.id}">Edit</button></td></tr>`).join('');$('adminEmpty').classList.toggle('hidden',rows.length>0);body.querySelectorAll('tr').forEach(tr=>tr.addEventListener('click',()=>selectBooking(tr.dataset.id)));body.querySelectorAll('.row-edit-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();selectBooking(btn.dataset.id)}))}
function selectBooking(id){selectedId=id;const b=bookings.find(x=>x.id===id);if(b?.batchId&&b.batchId!==viewBatchId){viewBatchId=b.batchId;populateBatchFilter();populateDateFilters()}renderRows();renderEditor();if(innerWidth<1050)$('editorPanel').scrollIntoView({behavior:'smooth',block:'start'})}
function renderEditor(){const b=bookings.find(x=>x.id===selectedId);$('editorEmpty').classList.toggle('hidden',!!b);$('editorPanel').classList.toggle('hidden',!b);if(!b)return;const bb=bookingBatch(b);$('editorTitle').textContent=b.applicant;$('editorSlotLabel').textContent=`${fmtDate(b.date,{month:'short',day:'numeric'})} · ${fmtHour(b.hour)}`;$('editApplicant').value=b.applicant;$('editNotes').value=b.notes;$('editDate').innerHTML=batchDates(bb).map(d=>`<option value="${d}">${fmtDate(d,{weekday:'long',month:'long',day:'numeric'})}</option>`).join('');$('editDate').value=b.date;renderTimeOptions(b);clearError('editError')}
function renderTimeOptions(b){const bb=bookingBatch(b),date=$('editDate').value||b.date,occupied=new Set(bookings.filter(x=>x.date===date&&x.id!==b.id).map(x=>x.hour));$('editHour').innerHTML=batchHours(bb).map(h=>`<option value="${h}" ${occupied.has(h)?'disabled':''}>${fmtHour(h)} – ${fmtEnd(h)}${occupied.has(h)?' · Booked':''}</option>`).join('');if(date===b.date)$('editHour').value=String(b.hour);else{const first=batchHours(bb).find(h=>!occupied.has(h));if(first!=null)$('editHour').value=String(first)}}
async function saveEdit(e){e.preventDefault();clearError('editError');const b=bookings.find(x=>x.id===selectedId);if(!b)return;const applicant=$('editApplicant').value.trim(),date=$('editDate').value,hour=Number($('editHour').value),notes=$('editNotes').value.trim();if(!applicant)return formError('editError','Full name is required.');const btn=$('saveBookingBtn');btn.disabled=true;btn.textContent='Saving…';try{const {error}=await timeout(sb.from(BOOKINGS_TABLE).update({applicant,notes,interview_date:date,interview_hour:hour}).eq('id',b.id));if(error){if(error.code==='23505')throw new Error('That interview slot is already booked. Choose another time.');throw error}await loadBookings();selectedId=b.id;renderAll();toast('Booking updated successfully.')}catch(e){formError('editError',e.message||'Unable to update booking.');toast('Booking update failed.',true)}finally{btn.disabled=false;btn.textContent='Save changes'}}
async function removeBooking(){const b=bookings.find(x=>x.id===selectedId);if(!b)return;if(!confirm(`Delete the booking for ${b.applicant} on ${fmtDate(b.date,{month:'long',day:'numeric'})} at ${fmtHour(b.hour)}?`))return;try{const {error}=await timeout(sb.from(BOOKINGS_TABLE).delete().eq('id',b.id));if(error)throw error;selectedId=null;await loadBookings();toast('Booking deleted.')}catch(e){toast(e.message||'Unable to delete booking.',true)}}

function bookedForDate(date){return viewBookings().filter(b=>b.date===date).slice().sort((a,b)=>a.hour-b.hour||a.applicant.localeCompare(b.applicant))}
function updatePrintAuthorizationState(){
 const officer=$('printAuthorizedOfficer')?.value.trim()||'',president=$('printApprovedBy')?.value.trim()||'',btn=$('printConfirmBtn');
 const ready=!!printSelection&&!!officer&&!!president;
 if(btn){btn.disabled=!ready;btn.setAttribute('aria-disabled',String(!ready));const span=btn.querySelector('span');if(span)span.textContent=printSelection==='all'?'Print complete batch':'Print selected day'}
 if(officer&&president)$('printAuthError')?.classList.add('hidden');
 return ready;
}
function renderPrintOptions(){const b=currentBatch(),wrap=$('printDayOptions');if(!b)return;const total=viewBookings().length,arr=batchDates(b).map(d=>{const n=bookedForDate(d).length,a=printSelection===d;return `<button class="print-day-option ${a?'active':''}" type="button" role="radio" aria-checked="${a}" data-print-date="${d}"><span class="print-option-date"><small>${fmtDate(d,{weekday:'long'})}</small><strong>${fmtDate(d,{month:'short',day:'numeric'})}</strong></span><span class="print-option-count"><b>${n}</b> ${n===1?'applicant':'applicants'}</span></button>`});const all=printSelection==='all';arr.push(`<button class="print-day-option print-all-option ${all?'active':''}" type="button" role="radio" aria-checked="${all}" data-print-date="all"><span class="print-option-date"><small>Complete record</small><strong>All ${batchDays(b)} Days</strong></span><span class="print-option-count"><b>${total}</b> applicants</span></button>`);wrap.innerHTML=arr.join('');wrap.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{printSelection=btn.dataset.printDate;renderPrintOptions()}));updatePrintAuthorizationState()}
async function openPrint(){try{await loadBookings()}catch(e){toast('Could not refresh bookings before printing.',true);return}const b=currentBatch();if(!b)return toast('Select a recruitment batch first.',true);printSelection=$('dayFilter').value!=='all'?$('dayFilter').value:(bookings.find(x=>x.id===selectedId)?.date||b.start_date);$('printAuthorizedOfficer').value='';$('printApprovedBy').value='';$('printAuthError').classList.add('hidden');renderPrintOptions();$('printModal').classList.remove('hidden');document.body.classList.add('modal-open');setTimeout(()=>$('printAuthorizedOfficer')?.focus(),80)}
function closePrint(){$('printModal').classList.add('hidden');document.body.classList.remove('modal-open');$('printAuthError')?.classList.add('hidden')}
function buildPrintPage(date,authorization){
 const b=currentBatch(),day=bookedForDate(date),rows=day.length
  ?day.map(x=>`<tr><td class="print-name">${esc(x.applicant)}</td><td class="print-time">${fmtHour(x.hour)} – ${fmtEnd(x.hour)}</td></tr>`).join('')
  :'<tr class="print-empty-row"><td colspan="2">No applicants are scheduled for this day.</td></tr>';
 return `<section class="print-sheet">
  <img class="official-header" src="./lso-print-header.png" alt="Lasallian Symphony Orchestra official header">
  <main class="document-body">
   <header class="document-heading">
    <p>OFFICIAL RECRUITMENT DOCUMENT · ${esc(b.batch_name)}</p>
    <h1>Recruitment Interview Schedule</h1>
    <div class="document-date">${fmtDate(date,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>
   </header>
   <table class="schedule-table" aria-label="Interview schedule for ${esc(date)}">
    <thead><tr><th>Full Name</th><th>Scheduled Interview</th></tr></thead>
    <tbody>${rows}</tbody>
   </table>
   <div class="document-spacer"></div>
   <section class="approval-block" aria-label="Document authorization">
    <div class="approval-item"><div class="approval-name">${esc(authorization.authorizedOfficer)}</div><div class="approval-line"></div><strong>Authorized Officer</strong><span>Membership</span></div>
    <div class="approval-item"><div class="approval-name">${esc(authorization.approvedBy)}</div><div class="approval-line"></div><strong>Approved By</strong><span>President</span></div>
   </section>
  </main>
  <img class="official-footer" src="./lso-print-footer.png" alt="Lasallian Symphony Orchestra official footer">
 </section>`
}
function printStyles(){return `
 @page{size:8.5in 13in;margin:0}
 *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
 html,body{margin:0!important;padding:0!important;background:#fff!important;color:#15241c;font-family:Arial,Helvetica,sans-serif}
 body{width:8.5in}
 .print-sheet{width:8.5in;height:13in;min-height:13in;margin:0;padding:.28in .34in .24in;display:flex;flex-direction:column;background:#fff;overflow:hidden;break-after:page;page-break-after:always}
 .print-sheet:last-child{break-after:auto;page-break-after:auto}
 .official-header,.official-footer{display:block;width:100%;height:auto;object-fit:contain;flex:0 0 auto}
 .official-header{max-height:1.34in;margin:0 auto .08in}
 .official-footer{max-height:1.03in;margin:.12in auto 0}
 .document-body{flex:1;min-height:0;padding:0 .08in;display:flex;flex-direction:column}
 .document-heading{text-align:center;margin:.02in 0 .15in;padding:.03in 0 .12in;border-bottom:1.5px solid #c5d2cb}
 .document-heading p{margin:0 0 .045in;color:#397357;font-size:8.7pt;font-weight:800;letter-spacing:.09em}
 .document-heading h1{margin:0;color:#063d25;font:700 20pt/1.12 Georgia,'Times New Roman',serif}
 .document-date{margin-top:.055in;color:#18271f;font-size:11pt;font-weight:800}
 .schedule-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11.5pt}
 .schedule-table th{background:#075734!important;color:#fff!important;border:1px solid #075734;padding:.105in .13in;text-align:left;font-size:10.5pt;letter-spacing:.025em}
 .schedule-table td{border:1px solid #aebfb5;padding:.115in .13in;vertical-align:middle;line-height:1.25;background:#fff}
 .schedule-table th:first-child,.schedule-table td:first-child{width:58%}
 .schedule-table th:last-child,.schedule-table td:last-child{width:42%}
 .print-name{font-weight:800;color:#0a2f1d;word-break:break-word}
 .print-time{font-weight:750;color:#1e392b;white-space:nowrap}
 .print-empty-row td{text-align:center;color:#66736c;font-style:italic;padding:.26in .12in}
 .document-spacer{flex:1;min-height:.1in}
 .approval-block{display:grid;grid-template-columns:1fr 1fr;gap:.42in;margin:.08in .16in .02in;align-items:end}
 .approval-item{text-align:center;min-width:0;color:#173126}
 .approval-name{min-height:.24in;display:flex;align-items:flex-end;justify-content:center;padding:0 .08in .04in;font-size:10.5pt;font-weight:800;line-height:1.18;overflow-wrap:anywhere}
 .approval-line{border-top:1.2px solid #435e50;margin:0 auto .045in;width:92%}
 .approval-item strong{display:block;color:#063d25;font-size:9.5pt;line-height:1.15}
 .approval-item span{display:block;margin-top:.025in;color:#53665b;font-size:8.5pt;font-weight:700}
 @media print{html,body{width:8.5in;height:auto}}
 `}
function buildPrintHtml(dates,authorization){const pages=dates.map(date=>buildPrintPage(date,authorization)).join('');return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LSO Interview Schedule</title><base href="${location.href.replace(/[^/]*$/,'')}"><style>${printStyles()}</style></head><body>${pages}</body></html>`}
function waitForPrintFrame(frame,timeout=5000){return new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;resolve()};const timer=setTimeout(finish,timeout);frame.onload=()=>{clearTimeout(timer);const doc=frame.contentDocument;if(!doc)return finish();const imgs=[...doc.images];if(!imgs.length)return finish();let left=imgs.length;const one=()=>{left--;if(left<=0)finish()};imgs.forEach(img=>img.complete?one():(img.addEventListener('load',one,{once:true}),img.addEventListener('error',one,{once:true})))}})}
async function doPrint(){
 const b=currentBatch();if(!b)return toast('Select a recruitment batch first.',true);
 const authorizedOfficer=$('printAuthorizedOfficer').value.trim(),approvedBy=$('printApprovedBy').value.trim();
 if(!authorizedOfficer||!approvedBy){$('printAuthError').classList.remove('hidden');updatePrintAuthorizationState();(!authorizedOfficer?$('printAuthorizedOfficer'):$('printApprovedBy')).focus();return}
 const authorization={authorizedOfficer,approvedBy};
 const dates=printSelection==='all'?batchDates(b):[printSelection];if(!dates[0])return toast('Choose a day to print.',true);
 closePrint();
 const frame=document.createElement('iframe');frame.setAttribute('title','LSO official print document');frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;right:100%;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';document.body.appendChild(frame);
 const ready=waitForPrintFrame(frame);frame.srcdoc=buildPrintHtml(dates,authorization);await ready;await new Promise(r=>setTimeout(r,120));
 try{const w=frame.contentWindow;if(!w)throw new Error('Print frame unavailable');const cleanup=()=>{setTimeout(()=>{if(frame.isConnected)frame.remove()},300)};w.addEventListener('afterprint',cleanup,{once:true});w.focus();w.print();setTimeout(cleanup,60000)}catch(e){if(frame.isConnected)frame.remove();console.error(e);toast('The print preview could not be opened. Please try again.',true)}
}

function boot(){
 $('adminLoginForm').addEventListener('submit',login);$('logoutBtn').addEventListener('click',logout);$('bookingSearch').addEventListener('input',renderRows);$('batchFilter').addEventListener('change',()=>{viewBatchId=$('batchFilter').value;selectedId=null;populateDateFilters();renderAll()});$('dayFilter').addEventListener('change',renderRows);$('adminRefreshBtn').addEventListener('click',async()=>{try{await loadBatches();await loadBookings()}catch(e){toast(e.message,true)}});$('editDate').addEventListener('change',()=>{const b=bookings.find(x=>x.id===selectedId);if(b)renderTimeOptions(b)});$('adminEditForm').addEventListener('submit',saveEdit);$('deleteBookingBtn').addEventListener('click',removeBooking);
 $('editActiveBatchBtn').addEventListener('click',()=>loadBatchForm(activeBatch,false));$('newBatchBtn').addEventListener('click',()=>loadBatchForm(null,true));$('resetBatchBtn').addEventListener('click',()=>loadBatchForm(editingBatchId?activeBatch:null,!editingBatchId));$('batchForm').addEventListener('submit',saveBatch);['batchStartDate','batchEndDate','batchStartHour','batchEndHour'].forEach(id=>$(id).addEventListener('change',updateBatchPreview));
 $('adminPrintBtn').addEventListener('click',openPrint);$('printModalBackdrop').addEventListener('click',closePrint);$('printCloseBtn').addEventListener('click',closePrint);$('printCancelBtn').addEventListener('click',closePrint);$('printConfirmBtn').addEventListener('click',doPrint);['printAuthorizedOfficer','printApprovedBy'].forEach(id=>$(id).addEventListener('input',updatePrintAuthorizationState));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('printModal').classList.contains('hidden'))closePrint()});start()
}
window.addEventListener('online',()=>{if(!sb?.auth&&!$('loginView')?.classList.contains('hidden'))start()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
