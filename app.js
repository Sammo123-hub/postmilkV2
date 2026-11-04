/* Post-milking Sampling — Clean v1.0
 * One top-level QR reader, copied in configuration and lifecycle from the
 * standalone camera/QR diagnostic that was successfully tested on iPhone.
 * No iframes, secondary reader pages, added scanner scripts, or service worker.
 * Prototype only — data stays on the device; nothing is sent to NMR.
 */
'use strict';
const VERSION='1.0.1';
const STORAGE='postmilk-clean-1.0';
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+Math.random().toString(36).slice(2);
const timeNow=()=>new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const timestamp=()=>new Date().toISOString();
const demo=[['88657','2'],['23688','4'],['00207','14.2'],['00042','11.8'],['00163','12.6']];
function fresh(){return {org:'Brook Farm Partnership',site:'Brook Farm',herd:'123450',session:'S-2410-087',start:'',end:'',yields:true,phase:'setup',animals:[],boxes:[],boxesConfirmed:false,closedAt:'',startedAt:'',confirmedAt:''};}
function load(){
 let stored=null;try{stored=JSON.parse(localStorage.getItem(STORAGE)||'null')}catch{}
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
 d.animals=(Array.isArray(d.animals)?d.animals:[]).map((a,i)=>({uid:a.uid||uid(),line:String(a.line||''),yield:String(a.yield||''),sample:String(a.sample||''),linkedSequence:Number(a.linkedSequence)||0,linkedAt:a.linkedAt||'',noSampleReason:String(a.noSampleReason||''),removed:!!a.removed}));
 d.animals.forEach((a,i)=>{if(a.sample&&!a.linkedSequence)a.linkedSequence=i+1});
 d.boxes=Array.isArray(d.boxes)?d.boxes.filter(b=>b&&b.id).map(b=>({id:String(b.id),time:String(b.time||'')})):[];
 return d;
}
let data=load(),page='session',modal='',selectedUid='',filter='all';
let pendingSave=false,toaster=0,soundCtx=null;
const animals=()=>data.animals.filter(a=>!a.removed);
const linked=()=>animals().filter(a=>!!a.sample);
const waiting=()=>animals().filter(a=>!a.sample&&!a.noSampleReason);
const noSample=()=>animals().filter(a=>!!a.noSampleReason);
const next=()=>waiting()[0]||null;
const latest=()=>linked().slice().sort((a,b)=>b.linkedSequence-a.linkedSequence)[0]||null;
const dupLines=()=>{const map=new Map();for(const a of animals())map.set(a.line,(map.get(a.line)||0)+1);return new Set([...map].filter(([,n])=>n>1).map(([line])=>line));};
const canFinish=()=>!waiting().length&&!dupLines().size;
function store(){try{localStorage.setItem(STORAGE,JSON.stringify(data));pendingSave=false;}catch(e){pendingSave=true;toast('Browser storage unavailable. Export the session.');}const e=$('#save-state');if(e)e.textContent=pendingSave?'NOT SAVED':'SAVED';}
function toast(t){if(!$('#toast-root'))return;$('#toast-root').innerHTML=`<div class="toast">${safe(t)}</div>`;clearTimeout(toaster);toaster=setTimeout(()=>$('#toast-root').replaceChildren(),3000);}
function sound(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;soundCtx||=new Audio();const o=soundCtx.createOscillator(),g=soundCtx.createGain();o.frequency.value=840;g.gain.setValueAtTime(.075,soundCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,soundCtx.currentTime+.14);o.connect(g).connect(soundCtx.destination);o.start();o.stop(soundCtx.currentTime+.15);navigator.vibrate?.(40);}catch{}}
const btn=(label,act,cls='',attrs='')=>`<button class="btn ${cls}" type="button" data-action="${act}" ${attrs}>${label}</button>`;
function normalTime(value){let s=String(value||'').trim();if(!s)return '';if(/^\d{4}$/.test(s))s=s.slice(0,2)+':'+s.slice(2);const match=s.match(/^(\d{1,2}):(\d{2})$/);if(!match)return '';const h=+match[1],m=+match[2];return h<=23&&m<=59?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`:'';}
function timeInput(id,value){return `<input class="time-input" id="${id}" value="${safe(value)}" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="${id.includes('start')?'Milking start':'Milking end'} time" data-complete="${normalTime(value)?'1':'0'}">`;}
function header(){let name={session:'Session management',linking:'Milk Sampling',animals:'Animals',boxes:'Sample boxes'}[page];return `<div class="top"><div class="top-inner"><div class="top-name">${name}</div><div class="top-actions"><span class="top-save" id="save-state">${pendingSave?'NOT SAVED':'SAVED'}</span><button class="menu-button" type="button" data-action="menu" aria-label="Main menu">☰</button></div></div></div><div class="farm-strip">${safe(data.site)} · ${page==='session'?'SESSION '+safe(data.session):'POST-MILKING · HERD '+safe(data.herd)}</div>`;}
function stage(number,title,state,content='',current=false){return `<section class="stage ${current?'current':state==='Complete'?'complete':''}">${current?'<span class="tinycap">CURRENT · NEXT STEP</span>':''}<div class="stage-row"><span class="stage-num">${state==='Complete'?'✓':number}</span><span class="stage-title">${safe(title)}</span><span class="stage-state ${state==='Complete'?'done':''}">${safe(state)}</span></div>${content}</section>`;}
function detail(k,v){return `<div><span class="tinycap">${safe(k)}</span><div class="detail-value">${safe(v)}</div></div>`;}
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
 const state=green?'LINKED ✓':not?'NO SAMPLE':options.isNext?'NEXT':'AWAITING';
 const number=green&&options.latest?'':String(idx);
 return `<button class="animal-card ${green?'green':not?'no-sample':''} ${options.isNext?'next':''} ${options.latest?'just-linked':''}" type="button" data-action="animal" data-uid="${safe(a.uid)}"><span class="pos">${number}</span><span class="line">${safe(a.line)}</span>${green?`<span class="sample-id">${safe(a.sample)}</span>`:''}${a.yield?`<span class="yield">${safe(a.yield)} kg</span>`:''}<span class="right-tag">${state}</span></button>`;
}
function cameraMarkup(){return `<div class="camera-panel" id="camera-panel"><div class="camera-placeholder" id="camera-placeholder">Camera starting…<br>Point at the next sample pot</div><div class="camera-video" id="qr-reader"></div><div class="camera-hud"><div class="camera-title"><span>SCAN NEXT ${page==='boxes'?'BOX':'POT'}</span><span class="camera-badge" id="camera-badge">CAMERA OFF</span></div><div class="finder"></div></div><div class="scan-affirm" id="scan-affirm" hidden>✓ LINKED</div></div><div class="scan-status" id="scan-status" role="status">Camera ready to start</div><div class="buttons camera-controls">${btn('START CAMERA','camera-toggle','secondary smallbtn')}${btn(page==='boxes'?'TYPE BOX ID':'TYPE SAMPLE ID','manual-sample','outline smallbtn')}</div><details class="diag"><summary>Camera diagnostics</summary><pre id="scan-debug">Waiting for camera</pre></details>`;}
function linkingScreen(){
 const n=waiting().length,l=linked().length,ns=noSample().length;
 const chips=`<div class="pillrow"><span class="pill red">${n} awaiting</span><button class="pill green" data-action="show-linked">${l} linked</button><span class="pill">${ns} no sample</span></div>`;
 let html=chips,footer='';
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
  if(data.phase==='linking'&&n){
   html+=cameraMarkup()+`<p class="hint">Keep pointing at each pot in turn. Each successful QR read links the next awaiting animal; the camera stays open.</p><div class="section-head"><strong>AWAITING · <span id="await-count">${n}</span></strong></div><div id="await-rows">${waiting().map((a,i)=>animalCard(a,{isNext:i===0})).join('')}</div>`;
   if(ns)html+=`<div class="section-head"><strong>NO SAMPLE · ${ns}</strong></div><div id="no-sample-rows">${noSample().map(a=>animalCard(a)).join('')}</div>`;
  }else if(data.phase==='linking')html+=`<div id="all-processed" class="notice ok">All animals processed. You can now confirm the sample-linking stage.</div>`;
  else html+=`<div class="notice ok">Sample linking confirmed. Return to Session Management to continue.</div>`;
  footer=`${btn('+ ADD COWS','add-animal','primary')}${btn('SESSION MANAGEMENT','goto-session','outline')}`;
 }
 return [html,footer];
}
function animalsScreen(){const chosen=animals().filter(a=>filter==='all'||filter==='linked'&&a.sample||filter==='awaiting'&&!a.sample&&!a.noSampleReason||filter==='no-sample'&&a.noSampleReason);
 const buttons=['all','awaiting','linked','no-sample'].map(key=>`<button type="button" class="pill ${filter===key?'active':''}" data-action="filter" data-filter="${key}">${safe(key.toUpperCase())}</button>`).join('');
 const html=`<div class="pillrow">${buttons}</div><div class="section-head"><strong>ANIMAL LIST · ${chosen.length}</strong></div><div>${chosen.map(a=>animalCard(a)).join('')||'<div class="empty">No animals in this view.</div>'}</div><p class="hint">Tap an animal to edit, remove a link or mark No sample.</p>`;
 return [html,btn('BACK TO LINKING','goto-linking','secondary wide')];}
function boxesScreen(){const html=`<div class="heading">Sample boxes</div><p class="hint">Scan each box once. Only box IDs are recorded on this prototype.</p>${data.phase==='closed'?'':cameraMarkup()}<div class="section-head"><strong>SCANNED BOXES · <span id="box-count">${data.boxes.length}</span></strong></div><div id="box-list">${data.boxes.map(b=>`<div class="menu-row"><strong>${safe(b.id)}</strong><span>${safe(b.time)}</span></div>`).join('')||'<div class="empty">No boxes scanned yet.</div>'}</div><label class="notice" style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="confirm-boxes" ${data.boxesConfirmed?'checked':''} ${data.phase==='closed'?'disabled':''} style="width:23px;height:23px;accent-color:var(--green)"><span>I have scanned all sample boxes for this session.</span></label>`;
 return [html,btn('BACK TO SESSION','goto-session','secondary wide')];}
function render(){const [html,foot]=({session:sessionScreen,linking:linkingScreen,animals:animalsScreen,boxes:boxesScreen}[page]||sessionScreen)();$('#app').innerHTML=`<div class="app">${header()}<main class="body" id="main-scroll">${html}</main>${foot?`<footer class="bottom">${foot}</footer>`:''}</div>`;updateDebug();}
function refreshLinkingAfterScan(){
 // Intentionally never render() or replace #qr-reader during a successful QR read.
 const last=$('#last-linked');if(last)last.innerHTML=latest()?animalCard(latest(),{latest:true}):'<div class="no-last">The last linked animal will appear here in green</div>';
 const remain=$('#await-rows');if(remain)remain.innerHTML=waiting().map((a,i)=>animalCard(a,{isNext:i===0})).join('');
 const count=$('#await-count');if(count)count.textContent=String(waiting().length);
 const pills=$$('.pillrow .pill');if(pills[0])pills[0].textContent=`${waiting().length} awaiting`;if(pills[1])pills[1].textContent=`${linked().length} linked`;if(pills[2])pills[2].textContent=`${noSample().length} no sample`;
 if(!waiting().length){const e=$('#await-rows');if(e)e.innerHTML='<div class="notice ok">All animals processed. Return to Session Management to confirm.</div>'}
}
function scanStatus(message,isError=false){const el=$('#scan-status');if(el){el.textContent=message;el.classList.toggle('error',isError)}updateDebug();}
function flash(){const e=$('#scan-affirm');if(!e)return;e.textContent=page==='boxes'?'✓ BOX RECORDED':'✓ LINKED';e.hidden=false;setTimeout(()=>{if(e.isConnected)e.hidden=true},520);}
function linkSample(raw,specificUid=''){
 const code=String(raw??'').trim();if(!code){toast('Enter a Sample ID');return false}
 if(linked().some(a=>a.sample===code)){scanStatus(`Already linked: ${code} — ignored`);return false}
 const target=specificUid?animals().find(a=>a.uid===specificUid):next();
 if(!target||target.sample||target.noSampleReason){toast('No awaiting animal available');return false}
 target.sample=code;target.linkedSequence=Math.max(0,...linked().map(a=>a.linkedSequence||0))+1;
 target.linkedAt=timestamp();store();sound();refreshLinkingAfterScan();flash();
 scanStatus(`✓ Linked ${target.line} to ${code}. ${waiting().length?`Ready for ${next().line}`:'All animals processed.'}`);
 if(!waiting().length&&page==='linking')setTimeout(()=>{stopCamera();},350);
 return true;
}
function boxScan(raw){const code=String(raw||'').trim();if(!code)return false;if(data.boxes.some(b=>b.id===code)){scanStatus('Already scanned box '+code);return false}
 data.boxes.push({id:code,time:timeNow()});data.boxesConfirmed=false;store();sound();
 const el=$('#box-list');if(el)el.innerHTML=data.boxes.map(b=>`<div class="menu-row"><strong>${safe(b.id)}</strong><span>${safe(b.time)}</span></div>`).join('');const num=$('#box-count');if(num)num.textContent=data.boxes.length;
 const cb=$('#confirm-boxes');if(cb)cb.checked=false;scanStatus('✓ Box '+code+' recorded. Ready for next box.');flash();return true;}

// ── The ONLY camera/decoder implementation in this app. ──
// Matches the actual iPhone-tested standalone QR diagnostic's Html5Qrcode options.
let scanner=null,scannerMode='',cameraState='off',cameraGeneration=0,stopping=Promise.resolve(),loadingLibrary=null;
let lastScanId='',lastScanTime=0,lastError='',lastDetected='';
let scanAttempts=0,scanError='',decoderSource='',scanSuccessCount=0,videoTrackState='—',frameDebugTimer=0;
function getScannerVideo(){return $('#qr-reader video')}
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
function updateCameraButton(){const e=$('[data-action="camera-toggle"]');if(e)e.textContent=cameraState==='live'?'STOP CAMERA':cameraState==='starting'?'STARTING…':'START CAMERA';const label=$('#camera-badge');if(label)label.textContent=cameraState==='live'?'CAMERA ON':cameraState==='starting'?'STARTING':'CAMERA OFF';updateDebug();}
function onQrDecoded(value){
 if(page!=='linking'&&page!=='boxes'||modal||!scanner)return;
 const code=String(value??'').trim();if(!code)return;
 const now=Date.now();lastDetected=code;scanSuccessCount++;scanError='';updateDebug();
 if(code===lastScanId&&now-lastScanTime<1100)return;
 lastScanId=code;lastScanTime=now;
 if(page==='boxes')boxScan(code);else linkSample(code);
}
async function stopCamera(){
 const prev=scanner;const generation=++cameraGeneration;scanner=null;scannerMode='';cameraState='off';clearInterval(frameDebugTimer);frameDebugTimer=0;updateCameraButton();
 if(!prev)return stopping;
 stopping=stopping.catch(()=>{}).then(async()=>{try{await prev.stop()}catch{}try{await prev.clear()}catch{}});
 await stopping;
 if(generation===cameraGeneration){scanStatus('Camera stopped.');updateCameraButton();}
}
async function startCamera(){
 if(scanner||cameraState==='starting')return;
 if(page==='linking'&&(data.phase!=='linking'||!waiting().length))return;
 if(page!=='linking'&&page!=='boxes')return;
 if(!$('#qr-reader'))return;
 const generation=++cameraGeneration;cameraState='starting';lastError='';scanError='';scanAttempts=0;scanSuccessCount=0;updateCameraButton();scanStatus('Loading QR decoder…');
 let opened=null;
 try{
  await stopping.catch(()=>{});
  await loadLibrary();
  if(generation!==cameraGeneration||!$('#qr-reader'))return;
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Camera requires HTTPS and permission in Safari.');
  // Same exact tested options: QR_CODE = numeric zero, NEVER truthiness-filter it.
  const format=Html5QrcodeSupportedFormats.QR_CODE;
  $('#qr-reader').replaceChildren();
  opened=new Html5Qrcode('qr-reader',{formatsToSupport:[format],useBarCodeDetectorIfSupported:false,verbose:false});
  scanner=opened;scannerMode=page;
  scanStatus('Asking iPhone for rear camera…');
  await opened.start({facingMode:'environment'},{fps:10},text=>{
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
  $('#camera-placeholder')?.setAttribute('hidden','');
  const video=$('#qr-reader video');if(video){video.setAttribute('playsinline','');video.muted=true}
  updateCameraButton();scanStatus('CAMERA LIVE — point at the next QR code');
  // Only update the diagnostics, never re-render the camera or animal list.
  clearInterval(frameDebugTimer);
  frameDebugTimer=setInterval(()=>{if(scanner===opened&&generation===cameraGeneration)updateDebug();else{clearInterval(frameDebugTimer);frameDebugTimer=0}},1800);
 }catch(err){
  if(generation!==cameraGeneration)return;
  lastError=String(err?.message||err);cameraState='off';scanner=null;scannerMode='';
  if(opened){try{await opened.stop()}catch{}try{await opened.clear()}catch{}}
  updateCameraButton();scanStatus('CAMERA ERROR — '+lastError,true);
 }
}
async function navigate(to,{autoCamera=false}={}){
 await stopCamera();page=to;modal='';$('#modal-root').replaceChildren();render();
 if(autoCamera&&((to==='linking'&&data.phase==='linking'&&waiting().length)||to==='boxes'))startCamera();
}
function openModal(name,which=''){
 stopCamera();modal=name;selectedUid=which||'';
 const animal=animals().find(a=>a.uid===selectedUid);
 let html='';
 if(name==='menu')html=`<h2>Main menu</h2><span class="tinycap">CLEAN BUILD · VERSION ${VERSION}</span>${[['goto-session','Session management'],['goto-linking','Post-milking linking'],['goto-animals','All animals'],['goto-boxes','Sample boxes'],['export','Export JSON session']].map(([k,v])=>`<button class="menu-row" data-action="${k}">${v}<span>›</span></button>`).join('')}<div class="notice">All data stays on this device. There is no NMR connection in this prototype.</div>${btn('LOAD DEMO ANIMALS','load-demo','outline wide')}${btn('IMPORT JSON SESSION','import','outline wide')}${btn('RESET DEMO SESSION','reset','danger wide')}`;
 if(name==='edit-session')html=`<h2>Edit session</h2><label class="field-label">ORGANISATION</label><input class="input" id="edit-org" value="${safe(data.org)}"><label class="field-label">SITE / FARM</label><input class="input" id="edit-site" value="${safe(data.site)}"><label class="field-label">HERD</label><input class="input" id="edit-herd" value="${safe(data.herd)}"><label class="field-label">SESSION ID</label><input class="input" id="edit-session-id" value="${safe(data.session)}"><div class="time-row"><label><span class="tinycap">MILKING START</span>${timeInput('edit-start',data.start)}</label><label><span class="tinycap">MILKING END</span>${timeInput('edit-end',data.end)}</label></div><label style="display:flex;align-items:center;gap:9px"><input type="checkbox" id="edit-yields" ${data.yields?'checked':''}> Yields required</label><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('SAVE','save-session','secondary')}</div>`;
 if(name==='add-animal')html=`<h2>Add cow</h2><p class="hint">Enter the line number written on the pot lid.</p><label class="field-label">ANIMAL LINE NUMBER</label><input class="input" id="new-line" maxlength="25" autocomplete="off" inputmode="numeric" placeholder="e.g. 00207"><label class="field-label">YIELD (kg) ${data.yields?'':'(optional)'}</label><input class="input" id="new-yield" type="number" min="0" step="0.1" inputmode="decimal" placeholder="e.g. 14.2"><div class="buttons">${btn('DONE','modal-close','outline')}${btn('ADD COW','save-animal','primary')}</div>`;
 if(name==='manual')html=`<h2>${page==='boxes'?'Enter Box ID':'Enter Sample ID'}</h2><p class="hint">Manual entry is a fallback; the camera should scan continuously during normal linking.</p><label class="field-label">${page==='boxes'?'BOX ID':'SAMPLE ID'}</label><input class="input" id="manual-id" autocomplete="off" placeholder="Scan code value"><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('LINK','save-manual','secondary')}</div>`;
 if(name==='animal'&&animal){html=`<h2>Animal ${safe(animal.line)}</h2><div class="notice">Status: ${animal.sample?'Linked to '+safe(animal.sample):animal.noSampleReason?'No sample — '+safe(animal.noSampleReason):'Awaiting sample'}</div><label class="field-label">LINE NUMBER</label><input class="input" id="animal-line" value="${safe(animal.line)}"><label class="field-label">YIELD (kg)</label><input class="input" id="animal-yield" type="number" step="0.1" min="0" value="${safe(animal.yield)}"><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('SAVE DETAILS','save-animal-details','secondary')}</div>${animal.sample?btn('REMOVE SAMPLE LINK','unlink-animal','outline wide'):!animal.noSampleReason?btn('MARK NO SAMPLE','no-sample','soft wide'):btn('UNDO NO SAMPLE','undo-no-sample','soft wide')}${btn('REMOVE ANIMAL','remove-animal','danger wide')}`;}
 if(name==='no-sample'&&animal)html=`<h2>No sample: ${safe(animal.line)}</h2><label class="field-label">REASON (OPTIONAL)</label><select class="input" id="no-sample-reason"><option>Not sampled</option><option>Animal absent</option><option>Sample lost</option><option>Insufficient milk</option><option>Other</option></select><div class="buttons">${btn('BACK','modal-close','outline')}${btn('CONFIRM','save-no-sample','secondary')}</div>`;
 if(name==='confirm-linking')html=`<h2>All samples linked?</h2><p class="hint">${waiting().length?`${waiting().length} animals are still awaiting samples. Link them or mark them as No sample before confirming.`:'All animals have been dealt with. Confirm this stage to continue to sample boxes.'}</p>${dupLines().size?`<div class="notice warning">Duplicate animal line numbers need resolving first.</div>`:''}<div class="buttons">${btn('BACK','modal-close','outline')}${btn('CONFIRM','do-confirm-linking','secondary',canFinish()?'':'disabled')}</div>`;
 if(name==='confirm-close')html=`<h2>Close sampling session?</h2><p class="hint">Closing makes this session read-only. Data is not sent to NMR. Export the JSON if you need a copy.</p><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('CLOSE SESSION','do-close','danger')}</div>`;
 $('#modal-root').innerHTML=`<div class="modal-layer" data-action="backdrop"><section class="sheet" role="dialog" aria-modal="true"><div class="sheet-header"><span class="tinycap">POST-MILKING</span><button type="button" class="sheet-close" data-action="modal-close" aria-label="Close">×</button></div>${html}</section></div>`;
 const focus=({ 'add-animal':'new-line',manual:'manual-id'})[name];if(focus)$('#'+focus)?.focus();
}
function closeModal(resume=true){modal='';selectedUid='';$('#modal-root').replaceChildren();if(resume&&((page==='linking'&&data.phase==='linking'&&waiting().length)||page==='boxes'))startCamera();}
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
 case 'edit-session':openModal('edit-session');break;
 case 'save-session':{
  const rawStart=$('#edit-start').value,rawEnd=$('#edit-end').value;if(rawStart&&!normalTime(rawStart)||rawEnd&&!normalTime(rawEnd))return toast('Enter valid HH:MM times');
  data.org=$('#edit-org').value.trim()||data.org;data.site=$('#edit-site').value.trim()||data.site;data.herd=$('#edit-herd').value.trim()||data.herd;data.session=$('#edit-session-id').value.trim()||data.session;data.start=normalTime(rawStart);data.end=normalTime(rawEnd);data.yields=$('#edit-yields').checked;store();closeModal(false);render();break;}
 case 'start-link':if(!normalTime(data.start)||!normalTime(data.end))return toast('Enter both milking times first');data.phase=animals().length?'check':'adding';store();navigate('linking');break;
 case 'goto-session':navigate('session');break;
 case 'goto-linking':navigate('linking',{autoCamera:true});break;
 case 'goto-animals':filter='all';navigate('animals');break;
 case 'goto-boxes':if(data.phase!=='confirmed'&&data.phase!=='closed')return toast('Confirm sample linking before scanning boxes');navigate('boxes',{autoCamera:data.phase!=='closed'});break;
 case 'show-linked':filter='linked';navigate('animals');break;
 case 'filter':filter=button.dataset.filter;render();break;
 case 'add-animal':if(data.phase==='closed')return;openModal('add-animal');break;
 case 'save-animal':makeAnimal();break;
 case 'finish-adding':if(!animals().length)return toast('Add at least one animal');if(!normalTime(data.start)||!normalTime(data.end))return toast('Enter Milking Start and End in Session Management first');data.phase=animals().length===1?'linking':'check';store();closeModal(false);render();if(data.phase==='linking')startCamera();break;
 case 'confirm-order':data.phase='linking';data.startedAt||=timestamp();store();render();startCamera();break;
 case 'load-demo':addDemo();break;
 case 'camera-toggle':if(scanner||cameraState==='starting')stopCamera();else startCamera();break;
 case 'manual-sample':openModal('manual');break;
 case 'save-manual':{const v=$('#manual-id')?.value||'';const ok=page==='boxes'?boxScan(v):linkSample(v);if(ok){closeModal(false);if(page==='linking'&&waiting().length||page==='boxes')startCamera();}break;}
 case 'animal':selectedUid=button.dataset.uid;openModal('animal',selectedUid);break;
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
 const el=e.target;if(!['milking-start','milking-end','edit-start','edit-end'].includes(el.id))return;
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
document.addEventListener('change',e=>{if(e.target.id==='confirm-boxes'){data.boxesConfirmed=e.target.checked;store();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal)closeModal();if(e.key==='Enter'&&e.target.id==='new-line'){e.preventDefault();$('#new-yield')?.focus()}if(e.key==='Enter'&&e.target.id==='manual-id'){e.preventDefault();doAction('save-manual',e.target)}});
window.addEventListener('pagehide',()=>{stopCamera()});
window.addEventListener('visibilitychange',()=>{if(document.hidden&&scanner)stopCamera()});
// No service worker on purpose: clean deployments must never be masked by cached older scripts.
render();
