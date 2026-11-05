/* Post-milking Sampling — Clean v1.0
 * One top-level QR reader, copied in configuration and lifecycle from the
 * standalone camera/QR diagnostic that was successfully tested on iPhone.
 * No iframes, secondary reader pages, added scanner scripts, or service worker.
 * Prototype only — data stays on the device; nothing is sent to NMR.
 */
'use strict';
const VERSION='1.4.0';
const STORAGE='postmilk-clean-1.0';
const SESSIONS_STORAGE='postmilk-sessions-v1';
const ACTIVE_SESSION_STORAGE='postmilk-active-session-v1';
// One-time migration for the 70-animal TEST herd release. An old sampling
// session includes previously linked IDs in localStorage, so clear that
// session once without touching the user's camera settings/preferences.
const DEMO_SESSION_RESET='postmilk-demo-clean-70-v1';
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2);
const timeNow=()=>new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const timestamp=()=>new Date().toISOString();
const demo=[['00001','2'],['00002','4'],['00003','14.2'],['00004','11.8'],['00005','12.6']];
function fresh(){return {org:'Brook Farm Partnership',site:'Brook Farm',herd:'123450',session:'S-2410-087',start:'',end:'',yields:true,phase:'setup',animals:[],testAssignments:{},boxes:[],boxesConfirmed:false,closedAt:'',startedAt:'',confirmedAt:''};}
function load(){
 let stored=null;
 try{
  // This runs once per device/profile. Clear ONLY the old test sampling
  // session (animals, linked sample IDs and scanned boxes), not the camera
  // preferences stored under postmilk-camera-preferences-v1.
  if(localStorage.getItem(DEMO_SESSION_RESET)!=='done'){
   localStorage.removeItem(STORAGE);
   localStorage.setItem(DEMO_SESSION_RESET,'done');
  }
  stored=JSON.parse(localStorage.getItem(STORAGE)||'null');
 }catch{}
 const d={...fresh(),...(stored||{})};
 // Import legacy v0.4/v0.5 exports without carrying over the old camera scripts.
 if(stored){
  if(stored.organisation&&!stored.org)d.org=stored.organisation;
  if(stored.farm&&!stored.site)d.site=stored.farm;
  if(stored.milkingStart&&!stored.start)d.start=stored.milkingStart;
  if(stored.milkingEnd&&!stored.end)d.end=stored.milkingEnd;
  const legacyPhases={'not-started':'setup','check-order':'check'};
  d.phase=legacyPhases[d.phase]||d.phase;
  if(stored.closed)d.phase='closed';
 }
 d.animals=(Array.isArray(d.animals)?d.animals:[]).map((a,i)=>({uid:a.uid||uid(),line:String(a.line||''),yield:String(a.yield||''),sample:String(a.sample||''),linkedSequence:Number(a.linkedSequence)||0,linkedAt:a.linkedAt||'',noSampleReason:String(a.noSampleReason||''),removed:!!a.removed,tests:Array.isArray(a.tests)?a.tests.filter(x=>['JOHNES','BVD','PAG','NEO'].includes(x)):[]}));
 d.animals.forEach((a,i)=>{if(a.sample&&!a.linkedSequence)a.linkedSequence=i+1});
 d.testAssignments=d.testAssignments&&typeof d.testAssignments==='object'&&!Array.isArray(d.testAssignments)?d.testAssignments:{};
 d.boxes=Array.isArray(d.boxes)?d.boxes.filter(b=>b&&b.id).map(b=>({id:String(b.id),time:String(b.time||'')})):[];
 return d;
}
// Keep the previous single-session storage readable, while saving multiple
// independent sessions in a registry. Existing session is migrated once.
function normaliseRecord(raw){
 const result={...fresh(),...raw};
 result.recordId=typeof result.recordId==='string'&&result.recordId?result.recordId:uid();
 result.animals=Array.isArray(result.animals)?result.animals:[];
 result.boxes=Array.isArray(result.boxes)?result.boxes:[];
 return result;
}
function readSessionRegistry(previous){
 try{
  const parsed=JSON.parse(localStorage.getItem(SESSIONS_STORAGE)||'null');
  if(Array.isArray(parsed))return parsed.filter(x=>x&&typeof x==='object').map(normaliseRecord);
 }catch{}
 // Preserve a real pre-existing single-session record. Do not manufacture a
 // blank session after Clear Test Data; the user creates a new session.
 let hasOld=false;
 try{hasOld=!!localStorage.getItem(STORAGE)}catch{}
 if(hasOld)return [normaliseRecord(previous)];
 return [];
}
let data=load(),sessions=readSessionRegistry(data),activeRecordId='',page='sessions',modal='',selectedUid='',filter='all';
try{activeRecordId=localStorage.getItem(ACTIVE_SESSION_STORAGE)||''}catch{}
if(!sessions.some(x=>x.recordId===activeRecordId))activeRecordId=sessions[0]?.recordId||'';
if(activeRecordId)data=sessions.find(x=>x.recordId===activeRecordId);
else data=normaliseRecord(fresh());
function persistRegistry(){
 try{
  localStorage.setItem(SESSIONS_STORAGE,JSON.stringify(sessions));
  if(activeRecordId)localStorage.setItem(ACTIVE_SESSION_STORAGE,activeRecordId);
  else localStorage.removeItem(ACTIVE_SESSION_STORAGE);
  if(activeRecordId)localStorage.setItem(STORAGE,JSON.stringify(data));
  else localStorage.removeItem(STORAGE);
  pendingSave=false;
 }catch(error){
  pendingSave=true;
  toast('Browser storage unavailable. Export the session.');
 }
 const indicator=$('#save-state');
 if(indicator)indicator.textContent=pendingSave?'NOT SAVED':'SAVED';
}
function syncActiveSession(){
 if(!activeRecordId)return;
 const idx=sessions.findIndex(x=>x.recordId===activeRecordId);
 if(idx>=0)sessions[idx]=data;
 else sessions.unshift(data);
}
function sessionPhaseLabel(record){
 if(record.phase==='closed')return 'Closed';
 if(record.phase==='confirmed')return record.boxesConfirmed?'Ready to close':'Sample boxes';
 return ({setup:'Not started',adding:'Adding animals',check:'Check animal order',linking:'Linking samples'})[record.phase]||'In progress';
}
function newSessionId(){
 const stamp=new Date().toLocaleDateString('en-CA').replace(/-/g,'');
 let serial=1,id='';
 do{id='S-'+stamp+'-'+String(serial++).padStart(3,'0');}
 while(sessions.some(x=>x.session===id));
 return id;
}

let pendingSave=false,toaster=0,soundCtx=null;
const animals=()=>data.animals.filter(a=>!a.removed);
const linked=()=>animals().filter(a=>!!a.sample);
const waiting=()=>animals().filter(a=>!a.sample&&!a.noSampleReason);
const noSample=()=>animals().filter(a=>!!a.noSampleReason);
const next=()=>waiting()[0]||null;
const latest=()=>linked().slice().sort((a,b)=>b.linkedSequence-a.linkedSequence)[0]||null;
const dupLines=()=>{const map=new Map();for(const a of animals())map.set(a.line,(map.get(a.line)||0)+1);return new Set([...map].filter(([,n])=>n>1).map(([line])=>line));};
const canFinish=()=>!waiting().length&&!dupLines().size;
function store(){syncActiveSession();persistRegistry();}
function toast(t){if(!$('#toast-root'))return;$('#toast-root').innerHTML=`<div class="toast">${safe(t)}</div>`;clearTimeout(toaster);toaster=setTimeout(()=>$('#toast-root').replaceChildren(),3000);}
function sound(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;soundCtx||=new Audio();const o=soundCtx.createOscillator(),g=soundCtx.createGain();o.frequency.value=840;g.gain.setValueAtTime(.075,soundCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,soundCtx.currentTime+.14);o.connect(g).connect(soundCtx.destination);o.start();o.stop(soundCtx.currentTime+.15);navigator.vibrate?.(40);}catch{}}
const btn=(label,act,cls='',attrs='')=>`<button class="btn ${cls}" type="button" data-action="${act}" ${attrs}>${label}</button>`;
function normalTime(value){let s=String(value||'').trim();if(!s)return '';if(/^\d{4}$/.test(s))s=s.slice(0,2)+':'+s.slice(2);const match=s.match(/^(\d{1,2}):(\d{2})$/);if(!match)return '';const h=+match[1],m=+match[2];return h<=23&&m<=59?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`:'';}
function timeInput(id,value){return `<input class="time-input" id="${id}" value="${safe(value)}" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="${id.includes('start')?'Milking start':'Milking end'} time" data-complete="${normalTime(value)?'1':'0'}">`;}
function header(){let name={sessions:'Sampling sessions',session:'Session management',linking:'Milk Sampling',animals:'Animals',boxes:'Scan sample boxes',tests:'Test management'}[page];return `<div class="top"><div class="top-inner"><div class="top-name">${page==='boxes'?'<button type="button" class="box-back" data-action="goto-session" aria-label="Back to Session management">‹</button>':(page==='session'||page==='tests')?'<button type="button" class="box-back" data-action="goto-sessions" aria-label="Back to Sampling sessions">‹</button>':''}${name}</div><div class="top-actions"><span class="top-save" id="save-state">${pendingSave?'NOT SAVED':'SAVED'}</span><button class="menu-button" type="button" data-action="menu" aria-label="Main menu">☰</button></div></div></div><div class="farm-strip">${page==='sessions'?'POST-MILKING · SESSION OVERVIEW':safe(data.site)+' · '+(page==='session'||page==='boxes'?'SESSION '+safe(data.session):'HERD '+safe(data.herd))}</div>`;}
function stage(number,title,state,content='',current=false){return `<section class="stage ${current?'current':state==='Complete'?'complete':''}">${current?'<span class="tinycap">CURRENT · NEXT STEP</span>':''}<div class="stage-row"><span class="stage-num">${state==='Complete'?'✓':number}</span><span class="stage-title">${safe(title)}</span><span class="stage-state ${state==='Complete'?'done':''}">${safe(state)}</span></div>${content}</section>`;}
function detail(k,v){return `<div><span class="tinycap">${safe(k)}</span><div class="detail-value">${safe(v)}</div></div>`;}
const TEST_TYPES=['JOHNES','BVD','PAG','NEO'];
let currentTest='JOHNES',testFilter='all',testQuery='',testDraft=null;
function lineTests(line){
 const persisted=Array.isArray(data.testAssignments?.[line])?data.testAssignments[line]:[];
 const selected=animals().find(a=>a.line===line)?.tests||[];
 return [...new Set([...persisted,...selected])].filter(x=>TEST_TYPES.includes(x));
}
function assignLineTest(line,test,enabled){
 if(!TEST_TYPES.includes(test))return;
 data.testAssignments||={};
 const values=new Set(lineTests(line));
 if(enabled)values.add(test);else values.delete(test);
 data.testAssignments[line]=[...values];
 for(const a of data.animals)if(a.line===line)a.tests=[...values];
}
function sessionsScreen(){
 const list=sessions.slice().reverse().map(rec=>{
  const added=(rec.animals||[]).filter(a=>!a.removed);
  const linkedCount=added.filter(a=>!!a.sample).length;
  return '<button type="button" class="sampling-session-row" data-action="open-session" data-record-id="'+safe(rec.recordId)+'">'+
   '<div class="sampling-session-main"><strong>'+safe(rec.site||'Farm')+'</strong><span>'+safe(rec.session||'No ID')+'</span></div>'+
   '<div class="sampling-session-sub"><span>'+safe(rec.herd||'')+' · '+added.length+' animals · '+linkedCount+' linked</span>'+
   '<span class="session-phase-label '+(rec.phase==='closed'?'is-closed':'')+'">'+safe(sessionPhaseLabel(rec))+'</span></div>'+
   '</button>';
 }).join('');
 return ['<div class="sessions-index"><div class="tinycap">SAMPLING SESSIONS · '+sessions.length+'</div>'+
  '<p class="hint">Choose a session to continue where you left off, or create a new one.</p>'+
  (list||'<div class="notice">No sampling sessions yet.</div>')+
  '<button type="button" class="btn primary wide" data-action="new-session">+ NEW SESSION</button></div>',''];
}
function testManagementScreen(){
 const view=HerdDemo.HERD.filter(a=>(testFilter==='with'?lineTests(a.line).includes(currentTest):testFilter==='without'?!lineTests(a.line).includes(currentTest):true)&&(!testQuery||a.line.includes(testQuery)));
 const rows=view.map(a=>'<label class="test-manager-row"><input type="checkbox" data-test-line="'+safe(a.line)+'" '+(lineTests(a.line).includes(currentTest)?'checked':'')+'><strong>'+safe(a.line)+'</strong></label>').join('');
 const selected=HerdDemo.HERD.filter(a=>lineTests(a.line).includes(currentTest)).length;
 return ['<div class="test-management"><div class="tinycap">TEST MANAGEMENT · '+HerdDemo.HERD.length+' COWS</div>'+
  '<div class="test-tabs">'+TEST_TYPES.map(t=>'<button type="button" data-action="test-select" data-test="'+t+'" class="'+(t===currentTest?'active':'')+'">'+t+'</button>').join('')+'</div>'+
  '<div class="test-filter-row">'+[['with','WITH TEST'],['without','WITHOUT TEST'],['all','ALL']].map(([k,v])=>'<button type="button" data-action="test-filter" data-filter="'+k+'" class="'+(k===testFilter?'active':'')+'">'+v+'</button>').join('')+'</div>'+
  '<input class="input" id="test-search" type="search" placeholder="Search line no." value="'+safe(testQuery)+'">'+
  '<button type="button" class="btn outline wide" data-action="test-select-all">SELECT ALL SHOWN</button>'+
  '<div class="test-management-rows">'+(rows||'<p class="hint">No animals match this filter.</p>')+'</div></div>',
  '<button type="button" class="btn secondary wide" data-action="test-save">SAVE '+currentTest+' · '+selected+' ANIMALS</button>'];
}
function sessionScreen(){
 const status=data.phase==='closed'?'Closed':data.phase==='confirmed'?'Completing session':data.phase==='setup'?'Not started':'In progress';
 const valid=normalTime(data.start)&&normalTime(data.end);
 const stage1=data.phase==='setup'?'Not started':data.phase==='confirmed'||data.phase==='closed'?'Complete':'In progress';
 let body='';
 if(data.phase==='setup')body=`<div class="time-row"><label><span class="tinycap">MILKING START</span>${timeInput('milking-start',data.start)}</label><label><span class="tinycap">MILKING END</span>${timeInput('milking-end',data.end)}</label></div>${btn('START LINKING','start-link','primary wide',valid?'':'disabled')}`;
 else if(data.phase==='closed')body='<div class="notice ok">Session is closed and read-only.</div>';
 else if(data.phase==='confirmed')body=`<div class="notice ok">${linked().length} linked · ${noSample().length} no sample</div>${btn('REOPEN LINKING','reopen-linking','outline wide')}`;
 else body=`${btn('OPEN SAMPLE LINKING','goto-linking','secondary wide')}<div style="height:7px"></div>${btn('ALL SAMPLES LINKED','confirm-linking','outline wide')}`;
 const stages=stage(1,'Sample linking',stage1,body,data.phase!=='confirmed'&&data.phase!=='closed')+
 stage(2,'Sync & consolidation',data.phase==='confirmed'||data.phase==='closed'?'Complete':'Locked',data.phase==='confirmed'||data.phase==='closed'?'<div class="hint">Single-device prototype: no synchronisation service connected.</div>':'')+
 stage(3,'Issues',dupLines().size?'Outstanding':data.phase==='confirmed'||data.phase==='closed'?'Complete':'Locked',dupLines().size?`${btn('REVIEW DUPLICATE LINE NUMBERS','goto-animals','outline wide')}`:'')+
 stage(4,'Sample boxes',data.boxesConfirmed?'Complete':data.phase==='confirmed'?'Outstanding':'Locked',data.phase==='confirmed'?btn('SCAN SAMPLE BOXES','goto-boxes','secondary wide'):'');
 const html=`<div class="tinycap">SESSION STATUS</div><div class="heading">${status}</div><section class="card"><div class="details-head"><span class="tinycap">SESSION DETAILS</span>${data.phase!=='closed'?btn('EDIT','edit-session','secondary smallbtn'):'<span>READ ONLY</span>'}</div><div class="details-grid">${detail('ORGANISATION',data.org)}${detail('SITE · ST-120455',data.site)}${detail('HERD',data.herd)}${detail('METHOD','Post-milking')}${detail('MILKING',`${data.start||'—'} – ${data.end||'—'}`)}${detail('SESSION ID',data.session)}${detail('YIELDS',data.yields?'Required':'Not required')}${detail('DEVICES','1 device')}</div></section>${stages}`;
 const foot=data.phase==='closed'?btn('EXPORT SESSION','export','outline wide'):btn('CLOSE SAMPLING SESSION','ask-close','primary wide',data.phase==='confirmed'&&data.boxesConfirmed&&!dupLines().size?'':'disabled');
 return [html,foot];
}
function animalCard(a,options={}){
 if(!a)return '';
 const idx=animals().indexOf(a)+1;
 const green=!!a.sample,not=!!a.noSampleReason;
 const duplicate=dupLines().has(a.line);
 const state=green?'LINKED ✓':not?'NO SAMPLE':(options.isNext?'NEXT':'AWAITING')+(duplicate?' · DUPLICATE':'');
 const number=green&&options.latest?'':String(idx);
 return `<button class="animal-card ${green?'green':not?'no-sample':''} ${options.isNext?'next':''} ${options.latest?'just-linked':''}" type="button" data-action="animal" data-uid="${safe(a.uid)}"><span class="pos">${number}</span><span class="line">${safe(a.line)}</span>${green?`<span class="sample-id">${safe(a.sample)}</span>`:''}${a.yield?`<span class="yield">${safe(a.yield)} kg</span>`:''}<span class="right-tag">${state}</span></button>`;
}
function cameraMarkup(){
 const panel=`<div class="camera-panel" id="camera-panel"><div class="camera-placeholder" id="camera-placeholder">Camera starting…<br>Point at the next sample pot</div><div class="camera-video" id="qr-reader"></div><div class="camera-hud"><div class="camera-title"><span>SCAN NEXT ${page==='boxes'?'BOX':'POT'}</span><span class="camera-badge" id="camera-badge">CAMERA OFF</span></div><div class="finder"></div></div><div class="scan-affirm" id="scan-affirm" hidden>✓ LINKED</div>${page==='linking'?'<div class="scan-status" id="scan-status" role="status" hidden></div><button class="btn secondary camera-retry" id="camera-retry" type="button" data-action="retry-camera" hidden>RETRY CAMERA</button>':''}</div>`;
 // The normal linking screen needs only the camera; no controls or diagnostics below it.
 if(page==='linking')return panel;
 // Preserve box-scanning controls; these are separate from the sample-linking screen.
 return panel+`<div class="scan-status" id="scan-status" role="status">Camera ready to start</div><div class="buttons camera-controls">${btn('START CAMERA','camera-toggle','secondary smallbtn')}${btn('TYPE BOX ID','manual-sample','outline smallbtn')}</div><details class="diag"><summary>Camera diagnostics</summary><pre id="scan-debug">Waiting for camera</pre><p class="frame-tip">Hold a QR code in view. Tap the button, then keep it steady for two seconds.</p><button type="button" class="btn secondary wide" data-action="test-frame" id="test-frame-button">CAPTURE &amp; TEST FRAME</button><div id="frame-result" class="frame-result" role="status" aria-live="polite">No frame tested yet.</div><img id="frame-preview" class="frame-preview" alt="Still frame captured from the camera" hidden></details>`;
}
function linkingScreen(){
 const n=waiting().length,l=linked().length,ns=noSample().length;
 let html='',footer='';
 if(!animals().length){html+=`<div class="notice">Add animals in the order their pots are laid out. You can also load demo animals for testing.</div><div class="buttons">${btn('+ ADD COWS','add-animal','primary wide')}${btn('LOAD DEMO','load-demo','outline wide')}</div>`;}
 else if(data.phase==='setup'||data.phase==='adding'){
  html+=`<div class="notice">Add cows in pot order. When finished, check the order and start the camera.</div><div class="section-head"><strong>ANIMALS · ${animals().length}</strong></div>${animals().map(a=>animalCard(a)).join('')}`;
  footer=`${btn('+ ADD COWS','add-animal','primary')}${btn('DONE ADDING','finish-adding','secondary')}`;
 }
 else if(data.phase==='check'){
  html+=`<div class="notice warning"><strong>CHECK ORDER</strong><br>Check the animals match the left-to-right sequence of physical pots before scanning.</div>${animals().map(a=>animalCard(a)).join('')}`;
  footer=`${btn('+ ADD COWS','add-animal','outline')}${btn('CONFIRM ORDER','confirm-order','primary')}`;
 }
 else {
  html+=`<div class="section-head"><strong>LAST LINKED ANIMAL</strong><button type="button" data-action="show-linked">VIEW ALL LINKED</button></div><div class="latest-slot" id="last-linked">${latest()?animalCard(latest()):'<div class="no-last">The last linked animal will appear here in green</div>'}</div>`;
  if(data.phase==='linking'){
   if(n)html+=cameraMarkup()+`<section id="awaiting-section"><div class="section-head"><strong>AWAITING · <span id="await-count">${n}</span></strong></div><div id="await-rows">${waiting().map((a,i)=>animalCard(a,{isNext:i===0})).join('')}</div></section>`;
   if(ns)html+=`<div class="section-head"><strong>NO SAMPLE · ${ns}</strong></div><div id="no-sample-rows">${noSample().map(a=>animalCard(a)).join('')}</div>`;
  }else html+=`<div class="notice ok">Sample linking confirmed. Return to Session Management to continue.</div>`;
  footer=`${btn('+ ADD COWS','add-animal','primary')}${btn('SESSION MANAGEMENT','goto-session','outline')}`;
 }
 return [html,footer];
}
function animalsScreen(){const chosen=animals().filter(a=>filter==='all'||filter==='linked'&&a.sample||filter==='awaiting'&&!a.sample&&!a.noSampleReason||filter==='no-sample'&&a.noSampleReason);
 const buttons=['all','awaiting','linked','no-sample'].map(key=>`<button type="button" class="pill ${filter===key?'active':''}" data-action="filter" data-filter="${key}">${safe(key.toUpperCase())}</button>`).join('');
 const html=`<div class="pillrow">${buttons}</div><div class="section-head"><strong>ANIMAL LIST · ${chosen.length}</strong></div><div>${chosen.map(a=>animalCard(a)).join('')||'<div class="empty">No animals in this view.</div>'}</div><p class="hint">Tap an animal to edit, remove a link or mark No sample.</p>`;
 return [html,btn('BACK TO LINKING','goto-linking','secondary wide')];}
// UI-39: Sample Boxes states in mockups 4.0.9, 4.0.10 and 4.0.11.
// The manual box-number entry is an intentional extra to the mockup.
function boxListMarkup(){
 return data.boxes.length
  ?data.boxes.map(b=>'<div class="box-scan-row"><strong>'+safe(b.id)+'</strong><span>Scanned '+safe(b.time)+'</span></div>').join('')
  :'<div class="box-scan-empty">No boxes scanned yet.</div>';
}
function boxCameraMarkup(){
 return '<div class="box-scan-frame" id="camera-panel">'+
  '<div class="box-scan-video" id="qr-reader"></div>'+
  '<div class="camera-placeholder" id="camera-placeholder">Starting camera…</div>'+
  '<div class="box-scan-overlay"><strong>SCAN NEXT BOX</strong><span class="box-camera-indicator" id="box-camera-indicator"><i aria-hidden="true"></i><span id="camera-badge">CAMERA OFF</span></span></div>'+
  '<div class="scan-affirm" id="scan-affirm" hidden>✓ BOX RECORDED</div>'+
  '<button type="button" class="btn secondary camera-retry" id="camera-retry" data-action="retry-camera" hidden>RETRY CAMERA</button>'+
  '</div>';
}
function boxesScreen(){
 const closed=data.phase==='closed',count=data.boxes.length;
 const canConfirm=count>0&&!closed,canDone=closed||(count>0&&data.boxesConfirmed);
 const html='<div class="box-scan-screen">'+
  ''+
  (closed?'<div class="box-scan-closed">This session is closed. Scanned boxes are shown below.</div>':boxCameraMarkup())+
  '<div class="scan-status" id="scan-status" role="status" hidden></div>'+
  (closed?'':'<button type="button" class="box-manual-button" data-action="manual-sample">+ ADD BOX NUMBER MANUALLY</button>')+
  '<section class="box-scan-card" aria-label="Scanned sample boxes">'+
   '<div class="box-scan-card-heading">SCANNED BOXES · <span id="box-count">'+count+'</span></div>'+
   '<div id="box-list" class="box-scan-list">'+boxListMarkup()+'</div>'+
  '</section></div>';
 const footer='<div class="box-scan-footer">'+
  '<label class="box-scan-confirm'+(canConfirm||closed?'':' inactive')+'" id="box-confirm-label">'+
   '<input type="checkbox" id="confirm-boxes" '+(data.boxesConfirmed?'checked':'')+' '+(canConfirm?'':'disabled')+'>'+
   '<span>I have scanned all sample boxes used for this sampling session.</span>'+
  '</label>'+
  '<button type="button" class="btn primary box-done" data-action="boxes-done" id="boxes-done" '+(canDone?'':'disabled')+'>DONE</button>'+
  '</div>';
 return [html,footer];
}
function render(){const [html,foot]=({sessions:sessionsScreen,session:sessionScreen,linking:linkingScreen,animals:animalsScreen,boxes:boxesScreen,tests:testManagementScreen}[page]||sessionsScreen)();$('#app').innerHTML=`<div class="app">${header()}<main class="body" id="main-scroll">${html}</main>${foot?`<footer class="bottom">${foot}</footer>`:''}</div>`;updateDebug();}
function refreshLinkingAfterScan(){
 // Intentionally never render() or replace #qr-reader during a successful QR read.
 const last=$('#last-linked');if(last)last.innerHTML=latest()?animalCard(latest(),{latest:true}):'<div class="no-last">The last linked animal will appear here in green</div>';
 const remain=$('#await-rows');if(remain)remain.innerHTML=waiting().map((a,i)=>animalCard(a,{isNext:i===0})).join('');
 const count=$('#await-count');if(count)count.textContent=String(waiting().length);
 if(!waiting().length){$('#awaiting-section')?.remove();}
}
function scanStatus(message,isError=false){const el=modal==='capture'?$('#capture-status'):$('#scan-status');if(el){el.textContent=message;el.classList.toggle('error',isError);if(page==='linking'||page==='boxes'||modal==='capture')el.hidden=!isError;}updateDebug();}
function flash(){const e=$('#scan-affirm');if(!e)return;e.textContent=page==='boxes'?'✓ BOX RECORDED':'✓ LINKED';e.hidden=false;setTimeout(()=>{if(e.isConnected)e.hidden=true},520);}
function linkSample(raw,specificUid=''){
 const code=String(raw??'').trim();if(!code){toast('Enter a Sample ID');return false}
 if(linked().some(a=>a.sample===code)){scanStatus(`Code recognised, but Sample ID ${code} is already linked to an animal.`,true);return false}
 const target=specificUid?animals().find(a=>a.uid===specificUid):next();
 if(!target||target.sample||target.noSampleReason){toast('No awaiting animal available');return false}
 target.sample=code;target.linkedSequence=Math.max(0,...linked().map(a=>a.linkedSequence||0))+1;
 target.linkedAt=timestamp();store();sound();refreshLinkingAfterScan();flash();
 scanStatus(`✓ Linked ${target.line} to ${code}. ${waiting().length?`Ready for ${next().line}`:'All animals processed.'}`);
 if(!waiting().length&&page==='linking')setTimeout(()=>{stopCamera();},350);
 return true;
}
function boxScan(raw){
 const code=String(raw||'').trim();if(!code)return false;
 if(data.boxes.some(b=>b.id===code)){scanStatus('Box '+code+' has already been scanned.',true);return false;}
 data.boxes.push({id:code,time:timeNow()});data.boxesConfirmed=false;store();sound();
 const list=$('#box-list');if(list)list.innerHTML=boxListMarkup();
 const count=$('#box-count');if(count)count.textContent=String(data.boxes.length);
 const cb=$('#confirm-boxes');if(cb){cb.checked=false;cb.disabled=false;}
 $('#box-confirm-label')?.classList.remove('inactive');
 const done=$('#boxes-done');if(done)done.disabled=true;
 scanStatus('✓ Box '+code+' recorded. Ready for next box.');flash();return true;
}

// ── The ONLY camera/decoder implementation in this app. ──
// Matches the actual iPhone-tested standalone QR diagnostic's Html5Qrcode options.
let scanner=null,scannerMode='',cameraState='off',cameraGeneration=0,stopping=Promise.resolve(),loadingLibrary=null;
let lastScanId='',lastScanTime=0,lastError='',lastDetected='';
let captureCompleting=false,captureCompletionTimer=null;
let scanAttempts=0,scanError='',decoderSource='',scanSuccessCount=0,videoTrackState='—',frameDebugTimer=0,frameTestBusy=false;
function getScannerVideo(){return modal==='capture'?$('#capture-reader video'):modal==='camera-settings'?$('#settings-reader video'):$('#qr-reader video')}
function readVideoTrack(){try{const v=getScannerVideo(),t=v?.srcObject?.getVideoTracks?.()[0],s=t?.getSettings?.()||{};return `${t?.readyState||'none'}${s.width&&s.height?` · ${s.width}×${s.height}`:''}${s.facingMode?` · ${s.facingMode}`:''}`}catch{return 'unknown'}}
function checkCameraVideo(){const v=getScannerVideo();return `${v?.videoWidth||0} × ${v?.videoHeight||0}${v?` · ready ${v.readyState} · paused ${v.paused}`:''}`}

function updateDebug(){const dbg=$('#scan-debug');if(!dbg)return;const v=$('#qr-reader video');const parts=[
 `App: ${VERSION}`,
 `Secure context: ${!!window.isSecureContext}`,
 `Camera API: ${!!navigator.mediaDevices?.getUserMedia}`,
 `QR decoder: ${typeof Html5Qrcode==='function'?'loaded':'not loaded'}`,
 `Camera: ${cameraState}`,
 `Video frames: ${checkCameraVideo()}`,
 `Camera track: ${readVideoTrack()}`,
 `Decoder source: ${decoderSource||'not loaded'}`,
 `Decode attempts: ${scanAttempts}`,
 `Successful reads: ${scanSuccessCount}`,
 `Last detected: ${lastDetected||'—'}`,
 `Last decoder feedback: ${scanError||'—'}`,
 `Startup error: ${lastError||'—'}`];dbg.textContent=parts.join('\n');}
function loadOneScannerScript(url){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=()=>reject(Error('Unable to load '+url));document.head.appendChild(s)})}
async function loadLibrary(){
 if(typeof Html5Qrcode==='function'&&typeof Html5QrcodeSupportedFormats!=='undefined'&&Html5QrcodeSupportedFormats.QR_CODE!==undefined){decoderSource ||= 'already present';return;}
 if(loadingLibrary)return loadingLibrary;
 // Match the diagnostic's on-demand loading sequence, rather than a parser-time deferred script.
 loadingLibrary=(async()=>{
  const sources=['https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js','https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'];
  for(const src of sources){
   try{await loadOneScannerScript(src);if(typeof Html5Qrcode==='function'&&typeof Html5QrcodeSupportedFormats!=='undefined'){decoderSource=src.split('/')[2];return;}}
   catch(e){lastError=String(e?.message||e);}
  }
  throw Error('QR decoder could not be loaded from either source');
 })();
 try{await loadingLibrary}finally{loadingLibrary=null}
}
// Diagnostic only: inspect the actual live scanner video without restarting its camera
// or linking a sample. Every image remains on the user's device.
async function testLiveFrame(){
 if(frameTestBusy)return;
 const result=$('#frame-result'),preview=$('#frame-preview'),button=$('#test-frame-button');
 const video=getScannerVideo();
 if(!result||!preview||!button)return;
 if(!video||video.readyState<2||!video.videoWidth||!video.videoHeight){
  result.textContent='Camera video is not ready. Start the camera first.';
  return;
 }
 const generation=cameraGeneration;
 frameTestBusy=true;
 button.disabled=true;
 const label=button.textContent;
 button.textContent='CAPTURING IN 2 SECONDS…';
 result.textContent='Keep the QR code fully visible and steady in the live camera picture.';
 let stillReader=null,host=null;
 try{
  await new Promise(resolve=>setTimeout(resolve,2000));
  if(generation!==cameraGeneration||!video.isConnected||video.readyState<2)throw Error('Camera changed during the test. Please try again.');
  const canvas=document.createElement('canvas');
  canvas.width=video.videoWidth;
  canvas.height=video.videoHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw Error('Cannot capture video frame on this device');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  // The image shown here is the raw video frame, not the CSS-cropped preview.
  preview.src=canvas.toDataURL('image/png');
  preview.hidden=false;
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Could not encode still frame')),'image/png'));
  const file=new File([blob],'postmilk-frame.png',{type:'image/png'});
  result.textContent='Frame captured ('+canvas.width+' × '+canvas.height+'). Running independent still-image QR decode…';
  if(typeof Html5Qrcode!=='function'||typeof Html5QrcodeSupportedFormats==='undefined')throw Error('QR library is not loaded');
  host=document.createElement('div');
  host.id='postmilk-still-decode-host';
  host.style.cssText='position:fixed;left:-10000px;top:-10000px;width:320px;height:320px;pointer-events:none;overflow:hidden';
  document.body.appendChild(host);
  stillReader=new Html5Qrcode(host.id,{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],useBarCodeDetectorIfSupported:false,verbose:false});
  try{
   const found=await stillReader.scanFile(file,true);
   result.textContent='STILL-IMAGE SUCCESS: '+String(found)+' ('+canvas.width+' × '+canvas.height+'). Main camera remains running. No animal was linked.';
  }catch(error){
   result.textContent='STILL-IMAGE FAILED ('+canvas.width+' × '+canvas.height+'): '+String(error?.message||error).slice(0,220)+'. Compare the captured picture with the QR visible in the live preview.';
  }
 }catch(error){
  result.textContent='FRAME TEST ERROR: '+String(error?.message||error).slice(0,220);
 }finally{
  if(stillReader){try{await stillReader.clear()}catch{}}
  if(host)host.remove();
  frameTestBusy=false;
  if(button.isConnected){button.disabled=false;button.textContent=label;}
 }
}
function updateCameraButton(){const e=$('[data-action="camera-toggle"]');if(e)e.textContent=cameraState==='live'?'STOP CAMERA':cameraState==='starting'?'STARTING…':'START CAMERA';const label=$('#camera-badge');if(label)label.textContent=cameraState==='live'?'CAMERA ON':cameraState==='starting'?'STARTING':'CAMERA OFF';const boxIndicator=$('#box-camera-indicator');if(boxIndicator)boxIndicator.classList.toggle('is-live',cameraState==='live');const capture=$('#capture-badge');if(capture)capture.textContent=cameraState==='live'?'CAMERA ON':cameraState==='starting'?'CAMERA STARTING':'CAMERA OFF';updateDebug();}
function onQrDecoded(value){
 const capturing=modal==='capture'&&!!selectedUid&&data.phase==='linking';
 if(captureCompleting||!scanner||(!capturing&&(modal||(page!=='linking'&&page!=='boxes'))))return;
 const code=String(value??'').trim();if(!code)return;
 const now=Date.now();lastDetected=code;scanSuccessCount++;scanError='';updateDebug();
 if(code===lastScanId&&now-lastScanTime<1100)return;
 lastScanId=code;lastScanTime=now;
 if(capturing){
  const uid=selectedUid;
  if(linkSample(code,uid))showCaptureLinked(uid,code);
 }else if(page==='boxes')boxScan(code);else linkSample(code);
}
// UI-20: briefly show mockup 4.3.2 after linking before the sheet closes.
// The selected animal can be out of sequence: NEXT is always determined by the
// first unresolved animal in the original list, not by this capture selection.
function showCaptureLinked(animalUid,sampleId){
 if(modal!=='capture'||selectedUid!==animalUid||captureCompleting)return;
 captureCompleting=true;
 const animal=animals().find(a=>a.uid===animalUid);
 const position=animal?animals().indexOf(animal)+1:0;
 const sheet=$('.capture-sheet');
 if(sheet)sheet.classList.add('capture-complete');
 const status=$('.capture-status-pill');
 if(status){status.textContent='Sample linked';status.classList.add('linked');}
 const cameraIndicator=$('.capture-camera-indicator');
 if(cameraIndicator)cameraIndicator.innerHTML='<span id="capture-badge">CAMERA OFF</span>';
 const camera=$('.capture-camera');
 if(camera){
  camera.classList.add('capture-linked');
  const overlay=document.createElement('div');
  overlay.className='capture-linked-result';
  overlay.innerHTML='<div class="capture-linked-caption">SAMPLE ID</div><div class="capture-linked-id">'+safe(sampleId)+'</div>';
  camera.appendChild(overlay);
 }
 const actions=$('.capture-actions');
 if(actions)actions.innerHTML='<button class="btn outline" disabled>NOT TO BE SAMPLED</button><button class="btn outline" disabled>TYPE SAMPLE ID</button><button class="btn outline capture-delete-display" disabled>DELETE SAMPLE ID</button><button class="btn outline" disabled>ANIMAL DETAILS</button><button class="btn outline capture-add-test" data-action="add-test">+ ADD TEST</button>';
 // Stop the popup camera, but preserve this confirmation view for a moment.
 stopCamera();
 clearTimeout(captureCompletionTimer);
 captureCompletionTimer=setTimeout(()=>{
  captureCompletionTimer=null;
  if(modal!=='capture'||selectedUid!==animalUid||!captureCompleting)return;
  closeModal(false);
  render(); // Move this animal into the one green latest-linked position above the camera.
  if(page==='linking'&&data.phase==='linking'&&waiting().length)startCamera();
 },950);
}
async function stopCamera(){
 FastMatrix.stop();
 CameraSettings.onStopped();
 const prev=scanner;const generation=++cameraGeneration;scanner=null;scannerMode='';cameraState='off';clearInterval(frameDebugTimer);frameDebugTimer=0;updateCameraButton();
 if(!prev)return stopping;
 stopping=stopping.catch(()=>{}).then(async()=>{try{await prev.stop()}catch{}try{await prev.clear()}catch{}});
 await stopping;
 if(generation===cameraGeneration){scanStatus('Camera stopped.');updateCameraButton();}
}
async function startCamera(){
 if(scanner||cameraState==='starting')return;
 const capturing=modal==='capture'&&!!selectedUid&&data.phase==='linking';
 const settingsMode=modal==='camera-settings';
 if(!capturing&&!settingsMode&&page==='linking'&&(data.phase!=='linking'||!waiting().length))return;
 if(!capturing&&!settingsMode&&page!=='linking'&&page!=='boxes')return;
 if(modal&&!capturing&&!settingsMode)return;
 const readerId=settingsMode?'settings-reader':capturing?'capture-reader':'qr-reader';
 const reader=document.getElementById(readerId);
 if(!reader)return;
 const generation=++cameraGeneration;cameraState='starting';lastError='';scanError='';scanAttempts=0;scanSuccessCount=0;updateCameraButton();scanStatus('Loading QR decoder…');
 let opened=null;
 try{
  await stopping.catch(()=>{});
  await loadLibrary();
  if(generation!==cameraGeneration||!reader.isConnected)return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera requires HTTPS and permission in Safari.');
  // Same exact tested options: QR_CODE = numeric zero, NEVER truthiness-filter it.
  // Sample boxes may have standard 1D barcodes (e.g. Code 128/EAN/UPC/ITF)
  // or 2D symbols. Omit formatsToSupport to enable the library's full set.
  // Pot scanning continues to use the customer's selected formats and
  // the optional fast Data Matrix engine. Never change that scanner here.
  const isBoxScan=page==='boxes'&&!settingsMode;
  const scannerOptions=isBoxScan
   ?{useBarCodeDetectorIfSupported:false,verbose:false}
   :{formatsToSupport:CameraSettings.formats(),useBarCodeDetectorIfSupported:false,verbose:false};
  reader.replaceChildren();
  opened=new Html5Qrcode(readerId,scannerOptions);
  scanner=opened;scannerMode=page;
  scanStatus('Asking iPhone for rear camera…');
  await opened.start(CameraSettings.cameraConstraint(),isBoxScan?{fps:10}:CameraSettings.scanConfig(),text=>{
   if(generation===cameraGeneration&&scanner===opened)onQrDecoded(text);
  },error=>{
   if(generation!==cameraGeneration||scanner!==opened)return;
   scanAttempts++;
   if(scanAttempts===1||scanAttempts%15===0){
    scanError=String(error?.message||error||'No code recognised').slice(0,220);
    updateDebug();
   }
  });
  if(generation!==cameraGeneration||scanner!==opened){try{await opened.stop()}catch{}try{await opened.clear()}catch{}return}
  cameraState='live';
  if(page==='boxes'&&!settingsMode)$('#camera-panel')?.classList.add('is-live');
  $('#camera-retry')?.setAttribute('hidden','');
  (capturing?$('#capture-placeholder'):$('#camera-placeholder'))?.setAttribute('hidden','');
  const video=reader.querySelector('video');if(video){video.setAttribute('playsinline','');video.muted=true}
  updateCameraButton();scanStatus('CAMERA LIVE — point at the next QR code');
  await CameraSettings.onStarted(opened);
  // Optional alternative decoder on the SAME running camera. The original JS
  // decoder continues until WASM is ready, and is restored if WASM fails.
  if(!settingsMode&&page!=='boxes'&&generation===cameraGeneration&&scanner===opened&&CameraSettings.fastMatrixSelected()){
   await FastMatrix.attach(opened,reader,
    ()=>generation===cameraGeneration&&scanner===opened,
    code=>onQrDecoded(code));
  }
  // Only update the diagnostics, never re-render the camera or animal list.
  clearInterval(frameDebugTimer);
  frameDebugTimer=setInterval(()=>{if(scanner===opened&&generation===cameraGeneration){updateDebug();CameraSettings.monitor(opened);}else{clearInterval(frameDebugTimer);frameDebugTimer=0}},1800);
 }catch(err){
  if(generation!==cameraGeneration)return;
  lastError=String(err?.message||err);cameraState='off';scanner=null;scannerMode='';
  if(opened){try{await opened.stop()}catch{}try{await opened.clear()}catch{}}
  updateCameraButton();scanStatus('CAMERA ERROR — '+lastError,true);(capturing?$('#capture-retry'):$('#camera-retry'))?.removeAttribute('hidden');if(settingsMode)CameraSettings.noteError(err);
 }
}
async function navigate(to,{autoCamera=false}={}){
 await stopCamera();page=to;modal='';$('#modal-root').replaceChildren();render();
 if(autoCamera&&((to==='linking'&&data.phase==='linking'&&waiting().length)||to==='boxes'))startCamera();
}
function openModal(name,which='',options={}){
 clearTimeout(captureCompletionTimer);captureCompletionTimer=null;captureCompleting=false;
 stopCamera();modal=name;selectedUid=which||'';
 const animal=animals().find(a=>a.uid===selectedUid);
 let html='';
 if(name==='menu')html=`<h2>Main menu</h2><span class="tinycap">CLEAN BUILD · VERSION ${VERSION}</span>${[['goto-sessions','Sampling sessions'],['goto-session','Current session'],['goto-tests','Test management'],['goto-linking','Post-milking linking'],['goto-animals','All animals'],['goto-boxes','Sample boxes'],['camera-settings','Camera settings'],['view-test-herd','Test herd · 70 animals'],['export','Export JSON session']].map(([k,v])=>`<button class="menu-row" data-action="${k}">${v}<span>›</span></button>`).join('')}<div class="notice">All data stays on this device. There is no NMR connection in this prototype.</div>${btn('LOAD DEMO ANIMALS','load-demo','outline wide')}${btn('IMPORT JSON SESSION','import','outline wide')}${btn('RESET DEMO SESSION','reset','danger wide')}`;
 if(name==='new-session')html='<h2>New sampling session</h2><p class="hint">Create a separate sampling session; existing sessions will be preserved.</p>'+
  '<label class="field-label">FARM / SITE</label><input class="input" id="new-session-site" value="'+safe(data.site)+'">'+
  '<label class="field-label">HERD NUMBER</label><input class="input" id="new-session-herd" value="'+safe(data.herd)+'">'+
  '<label class="field-label">SESSION ID</label><input class="input" id="new-session-id" value="'+safe(newSessionId())+'">'+
  '<label class="field-label">ORGANISATION</label><input class="input" id="new-session-org" value="'+safe(data.org)+'">'+
  '<div class="buttons">'+btn('CANCEL','modal-close','outline')+btn('CREATE SESSION','create-session','secondary')+'</div>';
 if(name==='add-test'&&animal&&animal.sample){
  const position=animals().indexOf(animal)+1;
  testDraft=new Set(lineTests(animal.line));
  html='<div class="test-add-sheet"><div class="tinycap">ADD TEST · LIST POSITION '+position+'</div>'+
   '<h2>'+safe(animal.line)+'</h2><p class="hint">Sample ID '+safe(animal.sample)+'</p><div class="tinycap">SELECT TESTS</div>'+
   '<div class="add-test-options">'+TEST_TYPES.map(t=>'<button type="button" class="add-test-option '+(testDraft.has(t)?'selected':'')+'" data-action="toggle-add-test" data-test="'+t+'"><span class="test-check">'+(testDraft.has(t)?'✓':'')+'</span>'+t+'</button>').join('')+'</div>'+
   '<div class="buttons">'+btn('CANCEL','modal-close','outline')+'<button type="button" class="btn secondary" data-action="save-add-test" id="save-add-test">DONE</button></div></div>';
 }
 if(name==='camera-settings')html=CameraSettings.html();
 if(name==='edit-session')html=`<h2>Edit session</h2><label class="field-label">ORGANISATION</label><input class="input" id="edit-org" value="${safe(data.org)}"><label class="field-label">SITE / FARM</label><input class="input" id="edit-site" value="${safe(data.site)}"><label class="field-label">HERD</label><input class="input" id="edit-herd" value="${safe(data.herd)}"><label class="field-label">SESSION ID</label><input class="input" id="edit-session-id" value="${safe(data.session)}"><div class="time-row"><label><span class="tinycap">MILKING START</span>${timeInput('edit-start',data.start)}</label><label><span class="tinycap">MILKING END</span>${timeInput('edit-end',data.end)}</label></div><label style="display:flex;align-items:center;gap:9px"><input type="checkbox" id="edit-yields" ${data.yields?'checked':''}> Yields required</label><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('SAVE','save-session','secondary')}</div>`;
 if(name==='add-animal')html=`<h2>Add cow</h2><p class="hint">Enter the line number written on the pot lid.</p><label class="field-label">ANIMAL LINE NUMBER</label><input class="input" id="new-line" maxlength="25" autocomplete="off" inputmode="numeric" placeholder="e.g. 00207"><label class="field-label">YIELD (kg) ${data.yields?'':'(optional)'}</label><input class="input" id="new-yield" type="number" min="0" step="0.1" inputmode="decimal" placeholder="e.g. 14.2"><div class="buttons">${btn('DONE','modal-close','outline')}${btn('ADD COW','save-animal','primary')}</div>`;
 if(name==='manual')html=`<h2>${page==='boxes'?'Add box number manually':'Enter Sample ID'}</h2><p class="hint">${page==='boxes'?'Enter the barcode number printed on the sample box. It will be added to the scanned-box list.':'Manual entry is a fallback; the camera should scan continuously during normal linking.'}</p><label class="field-label">${page==='boxes'?'BOX NUMBER':'SAMPLE ID'}</label><input class="input" id="manual-id" autocomplete="off" placeholder="${page==='boxes'?'Box barcode number':'Scan code value'}"><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn(page==='boxes'?'ADD BOX':'LINK','save-manual','secondary')}</div>`;
 if(name==='animal'&&animal){html=`<h2>Animal ${safe(animal.line)}</h2><div class="notice">Status: ${animal.sample?'Linked to '+safe(animal.sample):animal.noSampleReason?'No sample — '+safe(animal.noSampleReason):'Awaiting sample'}</div>${!animal.sample&&!animal.noSampleReason&&data.phase==='linking'?btn('TYPE SAMPLE ID','type-animal-sample','secondary wide'):''}<label class="field-label">LINE NUMBER</label><input class="input" id="animal-line" value="${safe(animal.line)}"><label class="field-label">YIELD (kg)</label><input class="input" id="animal-yield" type="number" step="0.1" min="0" value="${safe(animal.yield)}"><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('SAVE DETAILS','save-animal-details','secondary')}</div>${animal.sample?btn('+ ADD TEST','add-test','outline wide')+btn('REMOVE SAMPLE LINK','unlink-animal','outline wide'):!animal.noSampleReason?btn('MARK NO SAMPLE','no-sample','soft wide'):btn('UNDO NO SAMPLE','undo-no-sample','soft wide')}${btn('REMOVE ANIMAL','remove-animal','danger wide')}`;}
 if(name==='manual-animal'&&animal){
  const position=animals().indexOf(animal)+1;
  const numericKeys=['1','2','3','4','5','6','7','8','9','CLR','0','⌫'];
  html=`<div class="capture-grip"><button type="button" data-action="back-to-capture" aria-label="Back to scanning"><span></span></button></div>
    <div class="capture-top"><div><div class="capture-label">LIST POSITION ${position}</div><div class="capture-line">${safe(animal.line)}</div></div><div class="capture-top-right"><div class="capture-status-pill">Awaiting sample</div><div class="capture-camera-indicator">CAMERA OFF</div></div></div>
    <div class="manual-capture-title">SAMPLE ID</div>
    <input id="manual-id" class="manual-capture-display" type="text" inputmode="none" readonly maxlength="30" aria-label="Sample ID being entered" placeholder="Enter sample number">
    <div id="manual-feedback" class="manual-capture-feedback" role="alert" aria-live="polite" hidden></div>
    <div class="manual-capture-pad">${numericKeys.map(key=>`<button type="button" data-action="manual-digit" data-digit="${key}" class="${key==='CLR'?'manual-clear':''}">${key}</button>`).join('')}</div>
    <div class="manual-capture-actions">${btn('BACK TO SCAN','back-to-capture','outline')}${btn('LINK SAMPLE','link-animal-sample','secondary','id="manual-link"')}</div>`;
 }
 if(name==='capture'&&animal){
  const position=animals().indexOf(animal)+1;
  html=`<div class="capture-grip"><button type="button" data-action="modal-close" aria-label="Close sample capture"><span></span></button></div>
  <div class="capture-top"><div><div class="capture-label">LIST POSITION ${position}</div><div class="capture-line">${safe(animal.line)}</div></div><div class="capture-top-right"><div class="capture-status-pill">Awaiting sample</div><div class="capture-camera-indicator"><span class="capture-dot"></span><span id="capture-badge">CAMERA STARTING</span></div></div></div>
  <div class="capture-camera"><div class="capture-camera-placeholder" id="capture-placeholder">Starting camera…</div><div class="capture-reader" id="capture-reader"></div><div class="capture-camera-hud"><div class="capture-camera-title">SCAN SAMPLE POT <span class="capture-camera-pill">● CAMERA ON</span></div><div class="capture-finder"></div></div><div id="capture-status" class="capture-error" hidden></div><button id="capture-retry" class="capture-retry" type="button" data-action="retry-camera" hidden>RETRY CAMERA</button></div>
  <div class="capture-actions">
   ${btn('REMOVE FROM LIST','capture-remove','outline capture-remove')}
   ${btn('TYPE SAMPLE ID','type-animal-sample','outline')}
   <button class="btn outline" type="button" disabled>DELETE SAMPLE ID</button>
   ${btn('ANIMAL DETAILS','capture-details','outline')}
   <button class="btn outline capture-add-test" type="button" disabled>+ ADD TEST</button>
  </div>`;
 }
 if(name==='herd-picker')html=HerdDemo.picker();
 if(name==='herd-yield')html=HerdDemo.yieldMarkup(animal);
 if(name==='herd-catalog')html=HerdDemo.catalog();
 if(name==='no-sample'&&animal)html=`<h2>No sample: ${safe(animal.line)}</h2><label class="field-label">REASON (OPTIONAL)</label><select class="input" id="no-sample-reason"><option>Not sampled</option><option>Animal absent</option><option>Sample lost</option><option>Insufficient milk</option><option>Other</option></select><div class="buttons">${btn('BACK','modal-close','outline')}${btn('CONFIRM','save-no-sample','secondary')}</div>`;
 if(name==='confirm-linking')html=`<h2>All samples linked?</h2><p class="hint">${waiting().length?`${waiting().length} animals are still awaiting samples. Link them or mark them as No sample before confirming.`:'All animals have been dealt with. Confirm this stage to continue to sample boxes.'}</p>${dupLines().size?`<div class="notice warning">Duplicate animal line numbers need resolving first.</div>`:''}<div class="buttons">${btn('BACK','modal-close','outline')}${btn('CONFIRM','do-confirm-linking','secondary',canFinish()?'':'disabled')}</div>`;
 if(name==='confirm-close')html=`<h2>Close sampling session?</h2><p class="hint">Closing makes this session read-only. Data is not sent to NMR. Export the JSON if you need a copy.</p><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('CLOSE SESSION','do-close','danger')}</div>`;
 $('#modal-root').innerHTML=`<div class="modal-layer ${name==='capture'?'capture-layer':''}" data-action="backdrop"><section class="sheet ${name==='capture'?'capture-sheet':''}" role="dialog" aria-modal="true" aria-label="${name==='capture'?'Sample capture':'Post-milking'}">${name==='capture'||name==='herd-picker'||name==='herd-yield'?'':'<div class="sheet-header"><span class="tinycap">POST-MILKING</span><button type="button" class="sheet-close" data-action="modal-close" aria-label="Close">×</button></div>'}${html}</section></div>`;
 const focus=({ 'add-animal':'new-line',manual:'manual-id'})[name];if(focus){const input=$('#'+focus);if(input)input.focus({preventScroll:true});}if(name==='capture'&&!options.skipCamera)startCamera();if(name==='camera-settings')CameraSettings.start();
}
function closeModal(resume=true){clearTimeout(captureCompletionTimer);captureCompletionTimer=null;captureCompleting=false;if(modal==='capture'||modal==='camera-settings')stopCamera();modal='';selectedUid='';$('#modal-root').replaceChildren();if(resume&&((page==='linking'&&data.phase==='linking'&&waiting().length)||page==='boxes'))startCamera();}
function addDemo(){if(animals().length){toast('Demo animals can be loaded only into an empty list.');return}for(const [line,yieldKg] of demo)data.animals.push({uid:uid(),line,yield:yieldKg,sample:'',linkedSequence:0,linkedAt:'',noSampleReason:'',removed:false});store();closeModal(false);page='linking';render();toast('Five demo animals added.');}
function makeAnimal(){const line=$('#new-line')?.value.trim()||'',yieldKg=$('#new-yield')?.value.trim()||'';if(!line||!/^[-\w]{1,25}$/.test(line))return toast('Enter a valid animal line number');if(animals().some(a=>a.line===line))return toast('Animal already in this list');if(yieldKg!==''&&(!Number.isFinite(+yieldKg)||+yieldKg<0))return toast('Invalid milk yield');
 data.animals.push({uid:uid(),line,yield:yieldKg,sample:'',linkedSequence:0,linkedAt:'',noSampleReason:'',removed:false});if(data.phase==='setup')data.phase='adding';store();closeModal(false);render();openModal('add-animal');toast(`${line} added`);}
function exportJSON(){const blob=new Blob([JSON.stringify({app:'Post-milking Sampling',version:VERSION,exportedAt:timestamp(),...data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`postmilk-${data.session.replace(/[^a-z0-9-]/gi,'_')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);closeModal(false);}
async function importJSON(file){if(!file)return;try{const text=await file.text(),parsed=JSON.parse(text);if(!Array.isArray(parsed.animals)||!parsed.session)throw Error('Not a sampling session export');if(!confirm('Import this session? It will replace the data currently saved on this device.'))return;localStorage.setItem(STORAGE,JSON.stringify(parsed));data=load();await navigate('session');toast('Session imported');}catch(e){toast('Unable to import: '+e.message)}}
function doAction(action,button){
 switch(action){
 case 'menu':openModal('menu');break;
 case 'modal-close':closeModal();break;
 case 'backdrop':closeModal();break;
 case 'camera-settings':openModal('camera-settings');break;
 case 'camera-settings-done':closeModal();break;
 case 'clear-test-data':{
  // This resets only the current test sampling session. Do not delete the
  // device's camera, zoom, decoder, or barcode format preferences.
  const warning='Clear all test sampling data on this device? This removes added animals, linked sample IDs, scanned boxes and session progress. Camera and zoom settings will be kept. This cannot be undone.';
  if(!confirm(warning))break;
  data=fresh();store();navigate('session');toast('Test session cleared. Camera settings preserved.');
  break;
 }
 case 'camera-reset':CameraSettings.reset();break;
 case 'camera-zoom-preset':CameraSettings.setZoom(button.dataset.zoom);break;
 case 'edit-session':openModal('edit-session');break;
 case 'save-session':{
  const rawStart=$('#edit-start').value,rawEnd=$('#edit-end').value;if(rawStart&&!normalTime(rawStart)||rawEnd&&!normalTime(rawEnd))return toast('Enter valid HH:MM times');
  data.org=$('#edit-org').value.trim()||data.org;data.site=$('#edit-site').value.trim()||data.site;data.herd=$('#edit-herd').value.trim()||data.herd;data.session=$('#edit-session-id').value.trim()||data.session;data.start=normalTime(rawStart);data.end=normalTime(rawEnd);data.yields=$('#edit-yields').checked;store();closeModal(false);render();break;}
 case 'start-link':if(!normalTime(data.start)||!normalTime(data.end))return toast('Enter both milking times first');data.phase=animals().length?'check':'adding';store();navigate('linking');break;
 case 'goto-session':navigate('session');break;
 case 'boxes-done':if(data.phase==='closed'||(data.boxes.length>0&&data.boxesConfirmed))navigate('session');else toast('Scan at least one box and confirm all boxes are scanned.');break;
 case 'goto-linking':navigate('linking',{autoCamera:true});break;
 case 'goto-animals':filter='all';navigate('animals');break;
 case 'goto-boxes':if(data.phase!=='confirmed'&&data.phase!=='closed')return toast('Confirm sample linking before scanning boxes');navigate('boxes',{autoCamera:data.phase!=='closed'});break;
 case 'show-linked':filter='linked';navigate('animals');break;
 case 'filter':filter=button.dataset.filter;render();break;
 case 'add-animal':if(data.phase==='closed')return;HerdDemo.openPicker();break;
 case 'save-animal':makeAnimal();break;
 case 'finish-adding':if(!animals().length)return toast('Add at least one animal');if(!normalTime(data.start)||!normalTime(data.end))return toast('Enter Milking Start and End in Session Management first');data.phase=animals().length===1?'linking':'check';store();closeModal(false);render();if(data.phase==='linking')startCamera();break;
 case 'confirm-order':data.phase='linking';data.startedAt||=timestamp();store();render();startCamera();break;
 case 'load-demo':addDemo();break;
 case 'view-test-herd':HerdDemo.openCatalog(false);break;
 case 'herd-view-catalog':HerdDemo.openCatalog(true);break;
 case 'herd-catalog-back':HerdDemo.catalogBack();break;
 case 'herd-catalog-add':HerdDemo.openPicker();break;
 case 'herd-filter':HerdDemo.changeCatalogFilter(button.dataset.filter);break;
 case 'herd-key':HerdDemo.key(button.dataset.key);break;
 case 'herd-clear':HerdDemo.clear();break;
 case 'herd-pick':HerdDemo.choose(button.dataset.line);break;
 case 'herd-add-code':HerdDemo.enterTyped();break;
 case 'herd-duplicate':HerdDemo.confirmDuplicate();break;
 case 'herd-back-warning':HerdDemo.backWarning();break;
 case 'herd-done':HerdDemo.done();break;
 case 'herd-yield-digit':HerdDemo.yieldDigit(button.dataset.digit);break;
 case 'herd-save-yield':HerdDemo.saveYield(button.dataset.mode||'confirm');break;
 case 'camera-toggle':if(scanner||cameraState==='starting')stopCamera();else startCamera();break;
 case 'retry-camera':startCamera();break;
 case 'test-frame':testLiveFrame();break;
 case 'manual-sample':openModal('manual');break;
 case 'type-animal-sample':openModal('manual-animal',selectedUid);break;
 case 'manual-digit':{const el=$('#manual-id');if(!el)return;const key=button.dataset.digit;el.value=key==='CLR'?'':key==='⌫'?el.value.slice(0,-1):el.value.length>=30?el.value:el.value+key;const feedback=$('#manual-feedback');if(feedback){feedback.hidden=true;feedback.textContent='';}break;}
 case 'back-to-capture':openModal('capture',selectedUid);break;
 case 'capture-details':openModal('animal',selectedUid);break;
 case 'capture-remove':{const a=animals().find(x=>x.uid===selectedUid);if(!a)return;a.removed=true;store();closeModal(false);render();if(page==='linking'&&waiting().length)startCamera();break;}
 case 'link-animal-sample':{
  const code=$('#manual-id')?.value.trim()||'',animalUid=selectedUid;
  const feedback=$('#manual-feedback');
  const explain=message=>{if(feedback){feedback.textContent=message;feedback.hidden=false;}else toast(message);};
  if(!code){explain('Enter a Sample ID before pressing LINK SAMPLE.');break;}
  const animal=animals().find(a=>a.uid===animalUid);
  if(!animal||animal.sample||animal.noSampleReason){explain('This animal is no longer awaiting a sample. Return to the animal list.');break;}
  const existing=linked().find(a=>a.sample===code);
  if(existing){explain('Sample ID '+code+' is already linked to animal '+existing.line+'. Please enter a different Sample ID.');break;}
  button.disabled=true;button.textContent='LINKING…';
  try{
   const ok=linkSample(code,animalUid);
   if(ok){openModal('capture',animalUid,{skipCamera:true});showCaptureLinked(animalUid,code);}
   else{button.disabled=false;button.textContent='LINK SAMPLE';explain('Sample ID could not be linked. Check the number and try again.');}
  }catch(err){button.disabled=false;button.textContent='LINK SAMPLE';explain('Linking error: '+String(err?.message||err));}
  break;
 }
 case 'save-manual':{const v=$('#manual-id')?.value||'';const ok=page==='boxes'?boxScan(v):linkSample(v);if(ok){closeModal(false);if(page==='linking'&&waiting().length||page==='boxes')startCamera();}break;}
 case 'animal':{const a=animals().find(x=>x.uid===button.dataset.uid);if(!a)return;selectedUid=a.uid;openModal(data.phase==='linking'&&!a.sample&&!a.noSampleReason&&(page==='linking'||page==='animals')?'capture':'animal',a.uid);break;}
 case 'save-animal-details':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;const line=$('#animal-line').value.trim(),yieldKg=$('#animal-yield').value.trim();if(!/^[-\w]{1,25}$/.test(line)||animals().some(b=>b!==a&&b.line===line))return toast('Invalid or duplicate animal line');if(yieldKg!==''&&(!Number.isFinite(+yieldKg)||+yieldKg<0))return toast('Invalid yield');a.line=line;a.yield=yieldKg;store();closeModal(false);render();if(page==='linking'&&data.phase==='linking'&&waiting().length)startCamera();break;}
 case 'unlink-animal':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;a.sample='';a.linkedSequence=0;a.linkedAt='';if(data.phase==='confirmed'){data.phase='linking';data.boxesConfirmed=false}store();closeModal(false);render();if(page==='linking')startCamera();break;}
 case 'no-sample':openModal('no-sample',selectedUid);break;
 case 'save-no-sample':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;a.noSampleReason=$('#no-sample-reason').value;a.sample='';a.linkedSequence=0;store();closeModal(false);render();if(page==='linking'&&waiting().length)startCamera();break;}
 case 'undo-no-sample':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;a.noSampleReason='';store();closeModal(false);render();if(page==='linking')startCamera();break;}
 case 'remove-animal':{const a=animals().find(a=>a.uid===selectedUid);if(!a||!confirm('Remove '+a.line+' from this session?'))return;a.removed=true;store();closeModal(false);render();if(page==='linking'&&waiting().length)startCamera();break;}
 case 'confirm-linking':openModal('confirm-linking');break;
 case 'do-confirm-linking':if(!canFinish())return toast('Deal with awaiting or duplicate animals first');data.phase='confirmed';data.confirmedAt=timestamp();store();navigate('session');break;
 case 'reopen-linking':data.phase='linking';data.boxesConfirmed=false;store();navigate('linking',{autoCamera:true});break;
 case 'ask-close':if(data.phase!=='confirmed'||!data.boxesConfirmed||dupLines().size)return toast('Finish sampling and boxes first');openModal('confirm-close');break;
 case 'do-close':data.phase='closed';data.closedAt=timestamp();store();navigate('session');break;
 case 'export':exportJSON();break;
 case 'import':{const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.addEventListener('change',()=>importJSON(inp.files?.[0]),{once:true});inp.click();break;}
 case 'reset':if(!confirm('Clear the saved session on this device? Export it first if needed.'))return;data=fresh();store();navigate('session');break;
 }
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;if(button.dataset.action==='backdrop'&&button!==e.target)return;e.preventDefault();doAction(button.dataset.action,button)});
document.addEventListener('input',e=>{
 const el=e.target;
 if(el.id==='camera-zoom'){CameraSettings.setZoom(el.value);return;}
 if(!['milking-start','milking-end','edit-start','edit-end'].includes(el.id))return;
 const t=normalTime(el.value);if(/^\d{4}$/.test(el.value)&&t)el.value=t;
 if(el.id==='milking-start'||el.id==='milking-end'){
  data[el.id==='milking-start'?'start':'end']=t;store();const start=$('[data-action="start-link"]');if(start)start.disabled=!(normalTime(data.start)&&normalTime(data.end));
 }
 const endId=el.id==='milking-start'?'milking-end':el.id==='edit-start'?'edit-end':'';
 if(endId&&t&&el.dataset.complete!=='1'){
  el.dataset.complete='1';const end=document.getElementById(endId);if(end){end.focus();end.select?.();}
 }
 if(!t)el.dataset.complete='0';
});
document.addEventListener('change',e=>{
 if(e.target.id==='camera-device'){CameraSettings.chooseCamera(e.target.value);return;}
 if(e.target.id==='camera-code-format'){CameraSettings.chooseFormat(e.target.value);return;}
 if(e.target.id==='camera-decoder-engine'){CameraSettings.chooseEngine(e.target.value);return;}
 if(e.target.id==='confirm-boxes'){data.boxesConfirmed=data.boxes.length>0&&e.target.checked;store();const done=$('#boxes-done');if(done)done.disabled=!data.boxesConfirmed;}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal)closeModal();if(e.key==='Enter'&&e.target.id==='new-line'){e.preventDefault();$('#new-yield')?.focus()}if(e.key==='Enter'&&e.target.id==='manual-id'){e.preventDefault();doAction('save-manual',e.target)}});
window.addEventListener('pagehide',()=>{stopCamera()});
window.addEventListener('visibilitychange',()=>{if(document.hidden&&scanner)stopCamera()});
// No service worker on purpose: clean deployments must never be masked by cached older scripts.
render();
