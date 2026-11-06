/* Post-milking Sampling — Clean v1.0
 * One top-level QR reader, copied in configuration and lifecycle from the
 * standalone camera/QR diagnostic that was successfully tested on iPhone.
 * No iframes, secondary reader pages, added scanner scripts, or service worker.
 * Prototype only — data stays on the device; nothing is sent to NMR.
 */
'use strict';
const VERSION='1.8.6';
const STORAGE='postmilk-clean-1.0';
const SESSIONS_STORAGE='postmilk-sessions-v1';
const ACTIVE_SESSION_STORAGE='postmilk-active-session-v1';
const DEMO_ACCOUNT_STORAGE='postmilk-fictional-demo-account-v1';
const DEMO_AUTH_STORAGE='postmilk-demo-auth-v1';
const APP_PREFERENCES_STORAGE='postmilk-user-preferences-v1';
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
function fresh(){return {org:'Willowmere Farm',site:'Main Parlour',herd:'900101',session:'S-2410-087',start:'',end:'',yields:true,phase:'setup',animals:[],testAssignments:{},boxes:[],boxesConfirmed:false,changeRevision:0,nmrMockSentAt:'',nmrMockSentRevision:-1,closedAt:'',labReceivedAt:'',startedAt:'',confirmedAt:''};}
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
 if(['Example Meadow Farm','Example Meadow Farm (fictional)'].includes(result.org))result.org='Willowmere Farm';
 if(result.site==='North Test Parlour')result.site='Main Parlour';
 if(result.site==='West Test Parlour')result.site='West Field Parlour';
 if(result.site==='Rotary Demo Parlour')result.site='Rotary Parlour';
 result.recordId=typeof result.recordId==='string'&&result.recordId?result.recordId:uid();
 const legacy=result.testAssignments&&typeof result.testAssignments==='object'&&!Array.isArray(result.testAssignments)?result.testAssignments:{};
 // Tests belong to sampled animals in this session, never to the whole herd.
 // Carry across any tests recorded by v1.4.0 for linked animals only. Remove
 // the old line-number-wide assignments so they cannot surface on a cow that
 // has not had a sample linked.
 result.animals=(Array.isArray(result.animals)?result.animals:[]).filter(a=>a&&typeof a==='object').map(a=>{
  const linkedSample=!!a.sample&&!a.removed;
  const existing=Array.isArray(a.tests)?a.tests:[];
  const prior=Array.isArray(legacy[a.line])?legacy[a.line]:[];
  return {...a,tests:linkedSample?[...new Set([...existing,...prior])].filter(t=>['JOHNES','BVD','PAG','NEO'].includes(t)):[]};
 });
 result.testAssignments={};
 result.labReceivedAt=typeof result.labReceivedAt==='string'?result.labReceivedAt:'';
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
// All built-in account/contact/site details are deliberately fictitious.
// ".test" domains and 01632 960xxx telephone numbers are reserved for testing.
// These records are local-only; there is no live customer, NMR or login service.
function defaultDemoAccount(){
 return {
  farm:'Willowmere Farm',accountId:'DEMO-00421',
  user:'Alex Carter',role:'Farmer',email:'alex@willowmere-farm.test',
  contact:'Jamie Porter',phone:'01632 960321',invoiceEmail:'accounts@willowmere-farm.test',
  invoiceAddress:'14 Willow Lane, Willmere, ZZ1 1ZZ',
  herds:['900101','900102','900103'],
  sites:[
   {id:'demo-site-1',name:'Main Parlour',address:'14 Willow Lane, Willmere, ZZ1 1ZZ',type:'Herringbone',rows:2,stalls:10,herds:['900101'],yields:true},
   {id:'demo-site-2',name:'West Field Parlour',address:'3 Brook Road, Willmere, ZZ1 1ZY',type:'Herringbone',rows:2,stalls:8,herds:['900102'],yields:true},
   {id:'demo-site-3',name:'Rotary Parlour',address:'8 Meadow Way, Willmere, ZZ1 2ZZ',type:'Rotary',rows:1,stalls:40,herds:['900103'],yields:false}
  ]
 };
}
function readDemoAccount(){
 try{
  const stored=JSON.parse(localStorage.getItem(DEMO_ACCOUNT_STORAGE)||'null');
  if(stored&&Array.isArray(stored.sites)&&Array.isArray(stored.herds)){
   // Refresh unchanged legacy sample details, without touching the user's edits.
   const seed=defaultDemoAccount();
   const legacyFields={
    farm:['Example Meadow Farm','Example Meadow Farm (fictional)'],
    user:['Alex Example'],
    email:['alex@example.test'],
    contact:['Jamie Sample'],
    invoiceEmail:['accounts@example.test'],
    invoiceAddress:['14 Fiction Lane, Exampleton, ZZ1 1ZZ']
   };
   for(const [field,oldValues] of Object.entries(legacyFields)){
    if(oldValues.includes(stored[field]))stored[field]=seed[field];
   }
   const legacySites={
    'demo-site-1':{name:'North Test Parlour',address:'14 Fiction Lane, Exampleton, ZZ1 1ZZ'},
    'demo-site-2':{name:'West Test Parlour',address:'3 Sample Road, Exampleton, ZZ1 1ZY'},
    'demo-site-3':{name:'Rotary Demo Parlour',address:'8 Imaginary Way, Exampleton, ZZ1 2ZZ'}
   };
   for(const site of stored.sites){
    const old=legacySites[site.id],current=seed.sites.find(s=>s.id===site.id);
    if(!old||!current)continue;
    if(site.name===old.name)site.name=current.name;
    if(site.address===old.address)site.address=current.address;
   }
   if(stored.role==='Farmer · DIY')stored.role='Farmer';
   if(stored.herds.length===5&&['900101','900102','900103','900104','900105'].every(h=>stored.herds.includes(h))){
    stored.herds=['900101','900102','900103'];
    for(const site of stored.sites)if(Array.isArray(site.herds))site.herds=site.herds.filter(h=>stored.herds.includes(h));
   }
   try{localStorage.setItem(DEMO_ACCOUNT_STORAGE,JSON.stringify(stored));}catch{}
   return stored;
  }
 }catch{}
 return defaultDemoAccount();
}
function saveDemoAccount(){
 try{localStorage.setItem(DEMO_ACCOUNT_STORAGE,JSON.stringify(demoAccount));}catch{toast('Unable to save the demo account on this device.');}
}
function readDemoPrefs(){
 try{return {...{addMode:'add',scanMode:'camera',quickScan:false,autoNext:true,showLinked:false,downloadAuto:true},...JSON.parse(localStorage.getItem(APP_PREFERENCES_STORAGE)||'null')}}catch{return {addMode:'add',scanMode:'camera',quickScan:false,autoNext:true,showLinked:false,downloadAuto:true}}
}
function saveDemoPrefs(){
 try{localStorage.setItem(APP_PREFERENCES_STORAGE,JSON.stringify(demoPrefs))}catch{toast('Settings could not be saved on this device.')}
}
let demoAccount=readDemoAccount(),demoPrefs=readDemoPrefs(),demoAuth=false;
try{demoAuth=localStorage.getItem(DEMO_AUTH_STORAGE)==='signed-in'}catch{}
let demoSiteId='demo-site-1',wizardStep=1,wizardDraft=null,sessionListStatus='all',sessionListSite='all',sessionListSort='newest',animalRecordsFrom='sessions',issueReturn='issues',swapQuery='',detailUid='',animalListQuery='';
function demoSite(){return demoAccount.sites.find(x=>x.id===demoSiteId)||demoAccount.sites[0]||null}
function recordYields(rec=data){const site=demoAccount.sites.find(x=>x.id===rec.siteId)||demoAccount.sites.find(x=>x.name===rec.site);return site?!!site.yields:!!rec.yields;}
function demoSiteDesc(s){return s.type==='Rotary'?'Rotary · '+s.stalls+' bails':'Herringbone · '+s.rows+' × '+s.stalls;}
function sessionStatusLabel(rec){
 if(rec.phase==='closed')return rec.labReceivedAt?'Closed · lab receipt simulated':'Closed · local';
 if(rec.phase==='confirmed')return rec.boxesConfirmed?'Ready to close':'Boxes to scan';
 return 'To sample';
}
function shortDate(date){if(!date)return 'Date not set';const d=new Date(date+'T12:00:00');return isNaN(d.getTime())?'Date not set':d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
function accountScreen(){
 const sites=demoAccount.sites.map(site=>'<button class="journey-list-row" data-action="open-demo-site" data-site-id="'+safe(site.id)+'"><strong>'+safe(site.name)+'</strong><span>'+safe(demoSiteDesc(site))+' · Herd '+safe(site.herds.join(', '))+'</span><b>›</b></button>').join('');
 return ['<div class="journey-page"><div class="tinycap">ACCOUNT</div><h2>'+safe(demoAccount.farm)+'</h2><section class="journey-card"><div class="tinycap">SIGNED IN USER</div><strong>'+safe(demoAccount.user)+'</strong><span>'+safe(demoAccount.role)+'</span><span>'+safe(demoAccount.email)+'</span></section><section class="journey-card"><div class="journey-card-head"><strong>INVOICING CONTACT</strong>'+btn('EDIT','edit-demo-contact','outline')+'</div><p>'+safe(demoAccount.contact)+'</p><p>'+safe(demoAccount.phone)+'</p><p>'+safe(demoAccount.invoiceEmail)+'</p><p>'+safe(demoAccount.invoiceAddress)+'</p></section><section class="journey-card"><div class="journey-card-head"><strong>PARLOUR SITES · '+demoAccount.sites.length+'</strong>'+btn('+ ADD SITE','add-demo-site','outline')+'</div>'+sites+'</section><section class="journey-card"><div class="tinycap">HERDS · '+demoAccount.herds.length+'</div>'+demoAccount.herds.map(h=>'<div class="journey-plain-row">'+safe(h)+'</div>').join('')+'</section></div>',btn('SAMPLING SESSIONS','goto-sessions','secondary wide')];
}
function siteScreen(){
 const site=demoSite();
 if(!site)return ['<div class="notice">No site found.</div>',btn('ACCOUNT','goto-account','outline')];
 return ['<div class="journey-page"><div class="tinycap">SITE</div><h2>'+safe(site.name)+'</h2><section class="journey-card"><div class="tinycap">SITE</div><strong>'+safe(site.name)+'</strong><p>'+safe(site.address)+'</p></section><section class="journey-card"><div class="tinycap">PARLOUR</div><p>'+safe(demoSiteDesc(site))+'</p><div class="tinycap">LINKED HERDS</div><p>'+safe(site.herds.join(', ')||'None')+'</p><div class="tinycap">YIELDS</div><p>'+ (site.yields?'Record yields':'Not required')+'</p></section></div>',btn('EDIT SITE','edit-demo-site','secondary wide')+btn('ACCOUNT','goto-account','outline wide')];
}
function signInScreen(){
 // Sign-in is a UI demonstration only: no actual credentials are entered, validated or stored.
 const nmrMark='<div class="signin-nmr-mark" role="img" aria-label="NMR logo">'+
  '<svg viewBox="0 0 142 88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
   '<rect width="106" height="13" fill="#ff0055"/><rect x="106" width="17" height="13" fill="#77a82d"/><rect x="123" width="18" height="13" fill="#ffe400"/>'+
   '<rect y="13" width="70" height="13" fill="#00d99b"/><rect x="35" y="13" width="85" height="13" fill="#e8f8f3"/><rect x="70" y="13" width="36" height="13" fill="#397c3f"/>'+
   '<rect y="27" width="140" height="28" fill="#0e162b"/><text x="70" y="48" font-family="Arial,sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="#ffffff">NMR</text>'+
   '<circle cx="130" cy="41" r="6.5" fill="none" stroke="#ffffff" stroke-width="1.5"/><circle cx="130" cy="41" r="2.4" fill="#ffffff"/>'+
   '<rect y="56" width="123" height="12" fill="#00d99b"/><rect x="18" y="56" width="36" height="12" fill="#ff0055"/><rect x="36" y="56" width="18" height="6" fill="#ffe400"/>'+
   '<rect y="68" width="72" height="11" fill="#a3e1e8"/><rect x="18" y="65" width="36" height="9" fill="#0e162b"/>'+
  '</svg></div>';
 const content='<div class="signin-screen">'+
  nmrMark+
  '<h1 class="signin-page-title"><strong>Sample</strong> submission</h1>'+
  '<div class="signin-title-accent" aria-hidden="true"></div>'+
  '<p class="signin-intro">Sign in with your NMR account.</p>'+
  '<div class="signin-form-row"><label>Email or username</label><div class="signin-text-field">'+safe(demoAccount.email)+'</div></div>'+
  '<div class="signin-form-row"><label>Password</label><div class="signin-text-field signin-password-field"><span id="demo-signin-password">••••••••••</span><button type="button" data-action="demo-password-toggle" id="demo-password-toggle" aria-label="Show password" aria-pressed="false">SHOW</button></div></div>'+
  '<button type="button" class="signin-help" data-action="demo-signin-help">Help with sign-in or access</button>'+
 '</div>';
 const footer='<div class="signin-device-status"><span>Device HH-0142</span><span>Not authorised yet</span></div>'+
  '<button class="btn primary signin-submit" type="button" data-action="demo-sign-in">SIGN IN</button>';
 return [content,footer];
}

function startDemoWizard(){
 const site=demoAccount.sites[0];
 wizardDraft={siteId:site?.id||'',herd:site?.herds?.[0]||'',date:new Date().toISOString().slice(0,10),milking:'AM',
  type:'Milk quality testing'};
 wizardStep=1;
 navigate('new-session-flow');
}
function wizardSite(){return demoAccount.sites.find(s=>s.id===wizardDraft?.siteId)||null}
function wizardSaveDetails(){
 const date=$('#wizard-date')?.value||'',milking=$('#wizard-milking')?.value||'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!['AM','PM','AM + PM'].includes(milking))return false;
 wizardDraft.date=date;wizardDraft.milking=milking;
 return true;
}
function wizardScreen(){
 if(!wizardDraft)return ['<div class="notice">Start a new session from Sampling Sessions.</div>',btn('SAMPLING SESSIONS','goto-sessions','outline wide')];
 const site=wizardSite();
 const top='<div class="journey-stepper">'+['1 · Location','2 · Details','3 · Review'].map((label,i)=>'<span class="'+(wizardStep===i+1?'active':'')+'">'+label+'</span>').join('')+'</div>';
 let html='',foot='';
 if(wizardStep===1){
  const siteOptions='<div class="journey-site-select">'+demoAccount.sites.map(t=>'<label><input type="radio" data-wizard-site="'+safe(t.id)+'" name="wizard-site" '+(t.id===wizardDraft.siteId?'checked':'')+'><span><strong>'+safe(t.name)+'</strong><small>'+safe(t.address)+'</small><small>'+safe(demoSiteDesc(t))+' · Herds '+safe(t.herds.join(', '))+'</small></span></label>').join('')+'</div>';
  const herdOptions=site&&site.herds.length>1?site.herds.map(h=>'<label class="journey-check"><input type="radio" name="wizard-herd" data-wizard-herd="'+safe(h)+'" '+(h===wizardDraft.herd?'checked':'')+'> Herd '+safe(h)+'</label>').join(''):'<strong>Herd '+safe(site?.herds?.[0]||'—')+' · selected automatically</strong>';
  html='<div class="journey-card"><div class="tinycap">FARM · FIXED FOR THIS DEMO DEVICE</div><strong>'+safe(demoAccount.farm)+'</strong></div><section class="journey-card"><div class="tinycap">PARLOUR SITE</div>'+siteOptions+'</section><section class="journey-card"><div class="tinycap">HERD AT THIS SITE</div>'+herdOptions+'</section>';
  foot=btn('CANCEL','wizard-cancel','outline')+btn('NEXT · DETAILS','wizard-next','primary',site&&wizardDraft.herd?'':'disabled');
 }else if(wizardStep===2){
  html='<section class="journey-card"><div class="tinycap">WHEN</div><label class="field-label">SAMPLING DATE</label><div class="wizard-date-frame"><input id="wizard-date" type="date" class="input wizard-date" value="'+safe(wizardDraft.date)+'"></div>'+
   '<label class="field-label">MILKING</label><select id="wizard-milking" class="input">'+['AM','PM','AM + PM'].map(x=>'<option '+(wizardDraft.milking===x?'selected':'')+'>'+x+'</option>').join('')+'</select>'+
   '<div class="tinycap">SESSION TYPE</div><strong>Milk quality testing</strong><p class="hint">Disease-test and BVD ear-tag session creation are not connected in this prototype.</p>'+
   '</section>';
  foot=btn('BACK','wizard-back','outline')+btn('NEXT · REVIEW','wizard-next','primary');
 }else if(wizardStep===3){
  html='<section class="journey-card"><div class="journey-card-head"><strong>LOCATION</strong>'+btn('EDIT','wizard-edit-location','outline')+'</div><div class="journey-plain-row">Farm <strong>'+safe(demoAccount.farm)+'</strong></div><div class="journey-plain-row">Parlour <strong>'+safe(site?.name||'—')+'</strong></div><div class="journey-plain-row">Herd <strong>'+safe(wizardDraft.herd)+'</strong></div></section>'+
   '<section class="journey-card"><div class="journey-card-head"><strong>SESSION</strong>'+btn('EDIT','wizard-edit-details','outline')+'</div><div class="journey-plain-row">Date <strong>'+safe(shortDate(wizardDraft.date))+'</strong></div><div class="journey-plain-row">Milking <strong>'+safe(wizardDraft.milking)+'</strong></div><div class="journey-plain-row">Type <strong>Milk quality testing</strong></div></section><p class="hint">CREATE makes a local demo session. No ID is requested from NMR.</p>';
  foot=btn('BACK','wizard-back','outline')+btn('CREATE SESSION','wizard-create','primary');
 }
 return ['<div class="journey-page wizard-page"><div class="tinycap">AD HOC SESSION · '+safe(demoAccount.farm)+'</div><h2>Create sampling session</h2>'+top+html+'</div>','<div class="journey-actions">'+foot+'</div>'];
}
function sessionCreatedScreen(){
 return ['<div class="journey-page"><div class="journey-done-label">✓ DEMO SESSION CREATED</div><h2>'+safe(data.session)+'</h2><section class="journey-card"><div class="tinycap">SAMPLING DATA ON THIS DEVICE</div><div class="journey-plain-row">Session information <strong>Prepared locally</strong></div><div class="journey-plain-row">Parlour configuration <strong>Demo</strong></div><div class="journey-plain-row">Animal data <strong>'+ (demoPrefs.downloadAuto?'Demo catalogue ready':'Update optional') +'</strong></div><div class="journey-plain-row">Tests <strong>Available after pot linking</strong></div></section><p class="hint">This session is stored on this browser only. NMR has not registered or accepted it.</p></div>',btn('VIEW SESSION','view-created-session','primary wide')+btn('SAMPLING SESSIONS','goto-sessions','outline wide')];
}
function animalRecordsScreen(){
 const ready=!!data.animalDataUpdatedAt;
 const label=ready?formatExportTime(data.animalDataUpdatedAt):'Not yet refreshed on this device';
 return ['<div class="journey-page"><div class="tinycap">SESSION '+safe(data.session)+'</div><h2>Animal records on this device</h2><section class="journey-card"><div class="journey-plain-row">Site <strong>'+safe(data.site)+'</strong></div><div class="journey-plain-row">Herd <strong>'+safe(data.herd)+'</strong></div><div class="journey-plain-row">Sample date <strong>'+safe(shortDate(data.sampleDate))+'</strong></div><div class="journey-plain-row">Last demo update <strong>'+safe(label)+'</strong></div><div class="journey-plain-row">Test catalogue <strong>'+HerdDemo.HERD.length+' fictional animals</strong></div></section><p class="hint">Optional. Continue with the records on this device, or refresh the local demo catalogue timestamp. This does not download data from NMR.</p></div>',btn('CONTINUE','animal-records-continue','primary wide')+btn('REFRESH DEMO RECORDS','animal-records-refresh','outline wide')];
}
function sessionDetailsScreen(){
 const editable=data.phase!=='closed';
 return ['<div class="journey-page"><h2>Session details</h2><section class="journey-card"><div class="tinycap">SESSION ID · FIXED</div><strong>'+safe(data.session)+'</strong><div class="tinycap">SITE / FARM</div><strong>'+safe(data.site)+'</strong><div class="tinycap">HERD</div><strong>'+safe(data.herd)+'</strong><div class="tinycap">ORGANISATION</div><strong>'+safe(data.org)+'</strong><div class="tinycap">METHOD</div><strong>Post-milking</strong><div class="tinycap">DATE</div><p>'+safe(shortDate(data.sampleDate))+'</p><div class="tinycap">MILKING</div><p>'+safe(data.milking||'Not specified')+'</p></section>'+
  (editable?'<section class="journey-card"><label class="field-label">MILKING START (HH:MM)</label>'+timeInput('edit-start',data.start)+'<label class="field-label">MILKING END (HH:MM)</label>'+timeInput('edit-end',data.end)+'<div class="journey-plain-row">Record yields <strong>'+(recordYields()?'Yes':'No')+' · Parlour Setup</strong></div></section>':'<p class="hint">This sampling session is closed. Details can no longer be edited.</p>')+
  '<p class="hint">Session ID, farm and herd cannot be changed after the session is created.</p></div>',editable?'<div class="journey-actions">'+btn('CANCEL','goto-session','outline')+btn('SAVE DETAILS','save-session-details','secondary')+'</div>':btn('SESSION MANAGEMENT','goto-session','outline wide')];
}
function settingsOverviewScreen(){
 return ['<div class="journey-page"><div class="tinycap">DEVICE · PM-DEMO-0142</div><h2>Settings</h2><section class="journey-card">'+[
 ['sampling-settings','Sampling','Add '+demoPrefs.addMode+' · scan '+demoPrefs.scanMode],
 ['camera-settings','Camera','Camera selection and zoom'],
 ['data-settings','Data','Automatic demo animal-data preparation '+(demoPrefs.downloadAuto?'on':'off')],
 ['about','About','PM-DEMO-0142 · version '+VERSION]
 ].map(([id,label,description])=>'<button class="journey-list-row" data-action="settings-go" data-page="'+id+'"><strong>'+label+'</strong><span>'+safe(description)+'</span><b>›</b></button>').join('')+'</section></div>',''];
}
function samplingSettingsScreen(){
 const pref=(id,label,options,value)=>'<label class="journey-setting"><span>'+label+'</span><select class="input" data-pref="'+id+'">'+options.map(([k,v])=>'<option value="'+k+'" '+(value===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>';
 return ['<div class="journey-page"><h2>Sampling settings</h2><section class="journey-card">'+pref('addMode','Add animals mode',[['add','Add to list'],['add-and-scan','Add and scan']],demoPrefs.addMode)+pref('scanMode','Sample scanning',[['camera','Camera'],['scanner','External barcode scanner']],demoPrefs.scanMode)+pref('quickScan','Quick scan',[['false','Off'],['true','On']],String(demoPrefs.quickScan))+pref('autoNext','Automatically select next',[['true','On'],['false','Off']],String(demoPrefs.autoNext))+pref('showLinked','Show linked cows',[['false','Last linked only'],['true','Keep linked visible (other methods)']],String(demoPrefs.showLinked))+'</section><p class="hint">These preferences are stored locally. Some shared parlour behaviours are not implemented in this post-milking prototype.</p></div>',btn('DONE','goto-settings','secondary wide')];
}
function dataSettingsScreen(){
 return ['<div class="journey-page"><h2>Data settings</h2><section class="journey-card"><label class="journey-setting"><span>Download animal data automatically (demo)</span><select class="input" data-pref="downloadAuto"><option value="true" '+(demoPrefs.downloadAuto?'selected':'')+'>On</option><option value="false" '+(!demoPrefs.downloadAuto?'selected':'')+'>Off</option></select></label><p class="hint">No network download is available. The local 70-animal test catalogue is always retained; the setting records the intended future behaviour.</p></section></div>',btn('DONE','goto-settings','secondary wide')];
}
function aboutScreen(){
 return ['<div class="journey-page"><h2>About</h2><section class="journey-card"><div class="journey-plain-row">Device <strong>PM-DEMO-0142</strong></div><div class="journey-plain-row">Authorisation <strong>Local demo</strong></div><div class="journey-plain-row">NMR connection <strong>Not connected</strong></div><div class="journey-plain-row">App version <strong>'+safe(VERSION)+'</strong></div></section><p class="hint">No real sync is available; camera scanning and local JSON files remain usable.</p></div>',btn('DONE','goto-settings','secondary wide')];
}
let data=load(),sessions=readSessionRegistry(data),activeRecordId='',page=demoAuth?'sessions':'signin',modal='',selectedUid='',filter='all';
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
 const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
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
const duplicateSampleIds=()=>{
 const seen=new Map();
 for(const a of linked())seen.set(a.sample,(seen.get(a.sample)||0)+1);
 return new Set([...seen].filter(([,count])=>count>1).map(([sample])=>sample));
};
const blockingIssues=()=>dupLines().size+duplicateSampleIds().size;
const needsIssueReview=()=>noSample().filter(a=>!a.noSampleReason||a.noSampleReason==='Not sampled').length;
const canFinish=()=>!waiting().length&&!blockingIssues();
function store(){if(activeRecordId)data.changeRevision=(Number(data.changeRevision)||0)+1;syncActiveSession();persistRegistry();}
function toast(t){if(!$('#toast-root'))return;$('#toast-root').innerHTML=`<div class="toast">${safe(t)}</div>`;clearTimeout(toaster);toaster=setTimeout(()=>$('#toast-root').replaceChildren(),3000);}
function sound(){try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;soundCtx||=new Audio();const o=soundCtx.createOscillator(),g=soundCtx.createGain();o.frequency.value=840;g.gain.setValueAtTime(.075,soundCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,soundCtx.currentTime+.14);o.connect(g).connect(soundCtx.destination);o.start();o.stop(soundCtx.currentTime+.15);navigator.vibrate?.(40);}catch{}}
const btn=(label,act,cls='',attrs='')=>`<button class="btn ${cls}" type="button" data-action="${act}" ${attrs}>${label}</button>`;
function normalTime(value){let s=String(value||'').trim();if(!s)return '';if(/^\d{4}$/.test(s))s=s.slice(0,2)+':'+s.slice(2);const match=s.match(/^(\d{1,2}):(\d{2})$/);if(!match)return '';const h=+match[1],m=+match[2];return h<=23&&m<=59?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`:'';}
function timeInput(id,value){return `<input class="time-input" id="${id}" value="${safe(value)}" type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="${id.includes('start')?'Milking start':'Milking end'} time" data-complete="${normalTime(value)?'1':'0'}">`;}
function header(){
 if(page==='signin')return '<div class="top signin-top"><div class="top-inner"><div class="signin-header-title">Sign in</div><span class="signin-not-authorised"><i aria-hidden="true"></i>NOT SIGNED IN</span></div></div>';
 const names={signin:'Sign in',account:'Account',site:'Site','new-session-flow':'Create session',
 'session-created':'Session created','animal-records':'Animal records','session-details':'Session details',
 settings:'Settings','sampling-settings':'Sampling settings','data-settings':'Data settings',about:'About',
 sessions:'Sampling sessions',session:'Session management',linking:'Milk Sampling',animals:'Animals',
 issues:'Issues','animal-detail':'Animal details',boxes:'Scan sample boxes',tests:'Test management',data:'Data management'};
 const backs={account:'goto-sessions',site:'goto-account',settings:'goto-sessions',
 'sampling-settings':'goto-settings','data-settings':'goto-settings',about:'goto-settings',
 'new-session-flow':'goto-sessions','session-created':'goto-sessions','animal-records':'goto-sessions',
 'session-details':'goto-session',session:'goto-sessions',issues:'goto-session','animal-detail':'goto-issues',
 boxes:'goto-session',tests:'goto-session',data:'goto-session'};
 const back=backs[page];
 const arrow=back?'<button type="button" class="box-back" data-action="'+back+'" aria-label="Back">‹</button>':'';
 const actions=page==='signin'?'':'<span class="top-save" id="save-state">'+(pendingSave?'NOT SAVED':'SAVED')+'</span><button class="menu-button" type="button" data-action="menu" aria-label="Main menu">☰</button>';
 const farmLabel=['signin','account','site','settings','sampling-settings','data-settings','about','sessions','new-session-flow'].includes(page)
  ?safe(demoAccount.farm)+' · DEMO':safe(data.site)+' · SESSION '+safe(data.session);
 return '<div class="top"><div class="top-inner"><div class="top-name">'+arrow+safe(names[page]||'Milk Sampling')+'</div><div class="top-actions">'+actions+'</div></div></div><div class="farm-strip">'+farmLabel+'</div>';
}
function stage(number,title,state,content='',current=false){return `<section class="stage ${current?'current':state==='Complete'?'complete':''}">${current?'<span class="tinycap">CURRENT · NEXT STEP</span>':''}<div class="stage-row"><span class="stage-num">${state==='Complete'?'✓':number}</span><span class="stage-title">${safe(title)}</span><span class="stage-state ${state==='Complete'?'done':''}">${safe(state)}</span></div>${content}</section>`;}
function detail(k,v){return `<div><span class="tinycap">${safe(k)}</span><div class="detail-value">${safe(v)}</div></div>`;}
const TEST_TYPES=['JOHNES','BVD','PAG','NEO'];
const testsLocked=()=>!!data.labReceivedAt;
let currentTest='JOHNES',testFilter='all',testQuery='',testDraft=null,testManagerDraft=new Set();
function sampledAnimals(){return linked();}
function animalTests(animal){
 if(!animal?.sample||animal.removed)return [];
 return [...new Set(Array.isArray(animal.tests)?animal.tests:[])].filter(t=>TEST_TYPES.includes(t));
}
function resetTestDraft(){
 testManagerDraft=new Set(sampledAnimals().filter(a=>animalTests(a).includes(currentTest)).map(a=>a.uid));
}
function assignSampledTest(animalUid,test,enabled){
 if(testsLocked()||!TEST_TYPES.includes(test))return false;
 const animal=sampledAnimals().find(a=>a.uid===animalUid);
 if(!animal)return false;
 const chosen=new Set(animalTests(animal));
 if(enabled)chosen.add(test);else chosen.delete(test);
 animal.tests=[...chosen];
 return true;
}
function commitTestSelection(){
 if(testsLocked())return false;
 let changed=false;
 for(const animal of sampledAnimals()){
  const selected=testManagerDraft.has(animal.uid);
  if(animalTests(animal).includes(currentTest)===selected)continue;
  assignSampledTest(animal.uid,currentTest,selected);
  changed=true;
 }
 if(changed)store();
 return changed;
}
function sessionsScreen(){
 const filtered=sessions.filter(rec=>(sessionListStatus==='all'||(sessionListStatus==='closed'?rec.phase==='closed':rec.phase!=='closed'))&&
  (sessionListSite==='all'||rec.site===sessionListSite));
 filtered.sort((a,b)=>{const date=String(a.sampleDate||a.session||'').localeCompare(String(b.sampleDate||b.session||''));return sessionListSort==='oldest'?date:-date});
 const sites=[...new Set(sessions.map(rec=>rec.site).filter(Boolean))];
 const controls='<div class="journey-grid-2"><select class="input" id="session-filter-status" aria-label="Filter sessions by status">'+[['all','All statuses'],['open','To sample'],['closed','Closed']].map(([k,v])=>'<option value="'+k+'" '+(sessionListStatus===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+
 '<select class="input" id="session-filter-site" aria-label="Filter sessions by parlour">'+[['all','All sites'],...sites.map(site=>[site,site])].map(([k,v])=>'<option value="'+safe(k)+'" '+(sessionListSite===k?'selected':'')+'>'+safe(v)+'</option>').join('')+'</select></div>'+
 '<select class="input" id="session-sort" aria-label="Sort sessions"><option value="newest" '+(sessionListSort==='newest'?'selected':'')+'>Newest first</option><option value="oldest" '+(sessionListSort==='oldest'?'selected':'')+'>Oldest first</option></select>';
 const list=filtered.map(rec=>{
  const added=(rec.animals||[]).filter(a=>!a.removed);
  const linkedCount=added.filter(a=>!!a.sample).length;
  return '<button type="button" class="sampling-session-row" data-action="open-session" data-record-id="'+safe(rec.recordId)+'">'+
   '<div class="sampling-session-main"><strong>'+safe(rec.site||'Farm')+'</strong><span>'+safe(rec.session||'No ID')+'</span></div>'+
   '<div class="sampling-session-sub"><span>'+safe(rec.herd||'')+' · '+added.length+' animals · '+linkedCount+' linked</span>'+
   '<span class="session-phase-label '+(rec.phase==='closed'?'is-closed':'')+'">'+safe(sessionStatusLabel(rec))+'</span></div>'+
   '</button>';
 }).join('');
 return ['<div class="sessions-index"><div class="tinycap">SAMPLING SESSIONS · '+sessions.length+'</div>'+
  '<p class="hint">Select a session, review animal records if available, or create an ad hoc session. Sessions are saved on this device.</p>'+controls+
  (list||'<div class="notice">No sampling sessions yet.</div>')+
  '<button type="button" class="btn primary wide" data-action="new-session">+ NEW SESSION</button></div>',''];
}
function testManagementScreen(){
 const sampled=sampledAnimals(),locked=testsLocked();
 const view=sampled.filter(a=>(testFilter==='with'?testManagerDraft.has(a.uid):testFilter==='without'?!testManagerDraft.has(a.uid):true)&&(!testQuery||a.line.includes(testQuery)||a.sample.includes(testQuery)));
 const rows=view.map(a=>{const existing=animalTests(a);return '<label class="test-manager-row"><input type="checkbox" data-test-uid="'+safe(a.uid)+'" '+(testManagerDraft.has(a.uid)?'checked':'')+' '+(locked?'disabled':'')+'><span class="test-manager-animal"><span class="test-manager-main"><strong>'+safe(a.line)+'</strong><span class="test-manager-sample" aria-label="Sample ID '+safe(a.sample)+'">'+safe(a.sample)+'</span></span>'+(existing.length?'<span class="test-manager-assignments">Tests: '+existing.map(t=>safe(t)).join(', ')+'</span>':'')+'</span></label>';}).join('');
 const selected=testManagerDraft.size;
 return ['<div class="test-management"><div class="tinycap">TEST MANAGEMENT · '+sampled.length+' SAMPLED ANIMALS</div>'+
  '<p class="hint">Only sampled animals in this session are shown. Each sample can be used for multiple tests.</p>'+(locked?'<div class="notice ok">LAB RECEIPT SIMULATED · Tests are now read-only.</div>':'')+
  '<div class="test-tabs">'+TEST_TYPES.map(t=>'<button type="button" data-action="test-select" data-test="'+t+'" class="'+(t===currentTest?'active':'')+'">'+t+'</button>').join('')+'</div>'+
  '<div class="test-filter-row">'+[['with','WITH TEST'],['without','WITHOUT TEST'],['all','ALL']].map(([k,v])=>'<button type="button" data-action="test-filter" data-filter="'+k+'" class="'+(k===testFilter?'active':'')+'">'+v+'</button>').join('')+'</div>'+
  '<input class="input" id="test-search" type="search" placeholder="Search line or sample ID" value="'+safe(testQuery)+'">'+
  '<button type="button" class="btn outline wide" data-action="test-select-all" '+(view.length&&!locked?'':'disabled')+'>SELECT ALL SHOWN</button>'+
  '<div class="test-management-rows">'+(rows||'<p class="hint">'+(sampled.length?'No sampled animals match this filter.':'No sampled animals yet. Link sample pots to animals first.')+'</p>')+'</div></div>',
  '<div class="test-management-actions">'+
  '<button type="button" class="btn outline" data-action="test-save" '+(sampled.length&&!locked?'':'disabled')+'>SAVE '+currentTest+' · '+selected+' ANIMALS</button>'+
  '<button type="button" class="btn secondary" data-action="test-done">DONE</button></div>'];
}
// Data Management is a local-only testing hub. A simulated NMR delivery is
// explicitly distinct from actual network transmission (not implemented).
function outboundSnapshot(){
 const rec=data.nmrOutbound;
 return rec&&typeof rec==='object'&&typeof rec.json==='string'&&!!rec.compiledAt?rec:null;
}
function formatExportTime(value){
 if(!value)return '—';
 const time=new Date(value);
 return Number.isNaN(time.getTime())?'—':time.toLocaleString('en-GB',{dateStyle:'short',timeStyle:'short'});
}
function mockNmrStatus(){
 const rec=outboundSnapshot();
 if(!rec)return {label:'NOT COMPILED',compiled:'—',sent:'—',file:'—',
  detail:'No compiled JSON has been recorded for this session. Nothing has been transmitted to NMR.',stale:false};
 const stale=rec.revision!==data.changeRevision;
 return {label:stale?'CHANGED SINCE COMPILATION':'COMPILED · TEST SIMULATION',
  compiled:formatExportTime(rec.compiledAt),
  sent:formatExportTime(rec.sentAt),
  file:rec.fileName||'session.json',
  detail:stale?'The current session has changed since this JSON was compiled. The archived file remains unchanged. No actual NMR transmission has occurred.':'Times are recorded for the test simulation only; no file has been transmitted to NMR.',
  stale};
}
function remainingTestHerd(){
 const occupied=new Set(animals().map(a=>a.line));
 return HerdDemo.HERD.filter(a=>!occupied.has(a.line));
}
function readTestCount(id,maximum){
 const input=document.getElementById(id);
 const amount=Number(input?.value);
 return Number.isSafeInteger(amount)&&amount>0&&amount<=maximum?amount:null;
}
function bulkAddTestAnimals(count){
 if(!activeRecordId||data.phase==='closed')return false;
 const available=remainingTestHerd();
 if(!Number.isSafeInteger(count)||count<1||count>available.length)return false;
 for(const a of available.slice(0,count)){
  data.animals.push({uid:uid(),line:a.line,yield:'',sample:'',linkedSequence:0,linkedAt:'',noSampleReason:'',removed:false,tests:[]});
 }
 if(data.phase==='setup')data.phase='adding';
 // If the user adds animals after confirming a session, its sample linking
 // needs review before the session can be completed again.
 if(data.phase==='confirmed'){data.phase='linking';data.boxesConfirmed=false;}
 store();
 return true;
}
function bulkGenerateSampleLinks(count){
 if(!activeRecordId||data.phase==='closed')return false;
 const available=waiting();
 if(!Number.isSafeInteger(count)||count<1||count>available.length)return false;
 const used=new Set(animals().map(a=>a.sample).filter(Boolean));
 let candidate=900000001;
 let sequence=Math.max(0,...linked().map(a=>Number(a.linkedSequence)||0));
 const selected=available.slice(0,count);
 // Allocate all IDs before mutating records, so invalid requests never
 // partially link samples.
 const ids=[];
 for(let i=0;i<selected.length;i++){
  while(used.has(String(candidate))&&candidate<=999999999)candidate++;
  if(candidate>999999999)return false;
  ids.push(String(candidate));used.add(String(candidate));candidate++;
 }
 const now=timestamp();
 for(let i=0;i<selected.length;i++){
  const a=selected[i];
  a.sample=ids[i];a.linkedSequence=++sequence;a.linkedAt=now;
  if(recordYields()&&!a.yield)a.yield=(11+(Number(ids[i])%170)/10).toFixed(1);
  a.noSampleReason='';
 }
 if(['setup','adding','check','confirmed'].includes(data.phase))data.phase='linking';
 data.startedAt||=now;data.boxesConfirmed=false;
 store();return true;
}
function dataManagementScreen(){
 if(!activeRecordId)return ['<div class="notice">Select or create a sampling session first.</div>',btn('SAMPLING SESSIONS','goto-sessions','secondary wide')];
 const all=animals(),unlinked=waiting(),available=remainingTestHerd(),status=mockNmrStatus(),readOnly=data.phase==='closed';
 const tested=linked().filter(a=>animalTests(a).length>0).length;
 const summary='<div class="data-summary-grid">'+
  '<div><strong>'+all.length+'</strong><span>In sampling list</span></div>'+
  '<div><strong>'+linked().length+'</strong><span>Linked samples</span></div>'+
  '<div><strong>'+tested+'</strong><span>With tests</span></div>'+
  '<div><strong>'+data.boxes.length+'</strong><span>Sample boxes</span></div>'+
  '</div>';
 const out='<section class="data-hub-card"><div class="tinycap">OUTBOUND · NMR</div>'+
  '<div class="data-hub-status">'+safe(status.label)+'</div>'+
  '<div class="data-hub-row"><strong>Data compiled</strong><span>'+safe(status.compiled)+'</span></div>'+
  '<div class="data-hub-row"><strong>Data sent (simulated)</strong><span>'+safe(status.sent)+'</span></div>'+
  '<div class="data-hub-row"><strong>What data was sent (simulated)</strong><span>'+safe(status.file)+'</span></div>'+
  (outboundSnapshot()?btn('DOWNLOAD COMPILED JSON','download-compiled-json','outline wide'):'')+
  '<p class="hint">'+safe(status.detail)+'</p>'+
  '<p class="hint">Exporting the session JSON records both timestamps together in this prototype. NMR is not connected.</p></section>';
 const lab='<section class="data-hub-card"><div class="tinycap">LABORATORY · SIMULATED</div><p class="hint">'+(data.labReceivedAt?'Received '+safe(formatExportTime(data.labReceivedAt))+'. Tests are locked.':data.phase==='closed'?'Awaiting simulated laboratory receipt.':'Session must be closed before laboratory receipt.')+'</p>'+(data.phase==='closed'&&!testsLocked()?btn('SIMULATE LAB RECEIPT','ask-lab-receipt','outline wide'):'')+'</section>';
 const inbound='<section class="data-hub-card"><div class="tinycap">INBOUND · LOCAL DATA</div>'+
  '<div class="data-hub-row"><strong>'+HerdDemo.HERD.length+' demo herd animals</strong><span>Test catalogue loaded locally · not received from NMR</span></div>'+
  '<div class="data-hub-row"><strong>Session JSON</strong><span>Import a previously exported sampling session as a separate record</span></div>'+
  btn('IMPORT SESSION JSON','import','outline wide')+'</section>';
 const files='<section class="data-hub-card"><div class="tinycap">OUTBOUND · FILES</div>'+
  '<p class="hint">Exporting the selected session compiles a JSON snapshot and records matching simulated compile/send timestamps. This does not send anything to NMR.</p>'+
  btn('EXPORT CURRENT SESSION JSON','export','outline wide')+'</section>';
 const test='<section class="data-hub-card"><div class="tinycap">TEST DATA TOOLS</div>'+
  '<p class="hint">Generate local test records. These are not live animal or NMR records.</p>'+
  '<label class="field-label" for="data-add-count">ADD ANIMALS FROM TEST HERD</label>'+
  '<p class="hint">'+available.length+' of '+HerdDemo.HERD.length+' herd animals not yet on this session list. Adds them in line-number order, ready to link with sample pots.</p>'+
  '<div class="data-hub-controls"><input class="input" id="data-add-count" type="number" min="1" max="'+available.length+'" step="1" inputmode="numeric" value="'+Math.min(5,available.length)+'" '+(available.length&&!readOnly?'':'disabled')+' aria-label="Number of herd animals to add">'+
  btn('ADD ANIMALS','data-add-animals','secondary',available.length&&!readOnly?'':'disabled')+'</div>'+
  '<label class="field-label" for="data-link-count">GENERATE LINKED SAMPLE IDS'+(recordYields()?' &amp; YIELDS':'')+'</label>'+
  '<p class="hint">'+unlinked.length+' awaiting animals. Gives the next animals unique nine-digit test Sample IDs'+(recordYields()?' and fills in missing yields':'')+'. This makes them available for Add Tests.</p>'+
  '<div class="data-hub-controls"><input class="input" id="data-link-count" type="number" min="1" max="'+unlinked.length+'" step="1" inputmode="numeric" value="'+Math.min(5,unlinked.length)+'" '+(unlinked.length&&!readOnly?'':'disabled')+' aria-label="Number of awaiting animals to link">'+
  btn(recordYields()?'GENERATE LINKS & YIELDS':'GENERATE LINKS','data-auto-link','secondary',unlinked.length&&!readOnly?'':'disabled')+'</div></section>';
 return ['<div class="data-hub"><div class="tinycap">ACTIVE SESSION · '+safe(data.session)+'</div>'+
  '<p class="hint">Track data coming into and leaving this device, and prepare realistic test sessions.</p>'+
  summary+out+lab+inbound+files+test+'</div>',btn('BACK TO SESSION','goto-session','outline wide')];
}
function sessionScreen(){
 const status=data.phase==='closed'?'Closed':data.phase==='confirmed'?'Completing session':data.phase==='setup'?'Not started':'In progress';
 const valid=normalTime(data.start)&&normalTime(data.end);
 const stage1=data.phase==='setup'?'Not started':data.phase==='confirmed'||data.phase==='closed'?'Complete':'In progress';
 let body='';
 if(data.phase==='setup')body=`<div class="time-row"><label><span class="tinycap">MILKING START</span>${timeInput('milking-start',data.start)}</label><label><span class="tinycap">MILKING END</span>${timeInput('milking-end',data.end)}</label></div>${btn('START LINKING','start-link','primary wide',valid?'':'disabled')}`;
 else if(data.phase==='closed')body='<div class="notice ok">Sampling is closed. Sample linking is read-only; test assignments remain editable until laboratory receipt.</div>';
 else if(data.phase==='confirmed')body=`<div class="notice ok">${linked().length} linked · ${noSample().length} no sample</div>${btn('REOPEN LINKING','reopen-linking','outline wide')}`;
 else body=`${btn('OPEN SAMPLE LINKING','goto-linking','secondary wide')}<div style="height:7px"></div>${btn('ALL SAMPLES LINKED','confirm-linking','outline wide')}`;
 const sampledCount=sampledAnimals().length;
 const testedCount=sampledAnimals().filter(a=>animalTests(a).length>0).length;
 const addTestsState=testsLocked()?'Locked · lab receipt':!sampledCount?'Locked':testedCount?testedCount+' with tests':'Optional';
 const addTestsContent=sampledCount
  ?'<div class="hint">'+testedCount+' of '+sampledCount+' sampled animals have tests. Changes are allowed until laboratory receipt.</div>'+
   btn(testsLocked()?'VIEW TESTS':testedCount?'MANAGE TESTS':'ADD TESTS','goto-tests','secondary wide')
  :'';
 const boxesReady=data.phase==='confirmed'&&!blockingIssues();
 const stages=stage(1,'Sample linking',stage1,body,data.phase!=='confirmed'&&data.phase!=='closed')+
 stage(2,'Sync & consolidation',data.phase==='confirmed'||data.phase==='closed'?'Complete':'Locked',data.phase==='confirmed'||data.phase==='closed'?'<div class="hint">Single-device prototype: no synchronisation service connected.</div>':'')+
 stage(3,'Issues',blockingIssues()?'Outstanding':needsIssueReview()?'Review':data.phase==='confirmed'||data.phase==='closed'?'Complete':'Locked',
 (blockingIssues()||needsIssueReview()||data.phase==='confirmed'||data.phase==='closed')?
 btn(blockingIssues()?'RESOLVE ISSUES':'REVIEW ISSUES','goto-issues','outline wide'):'')+
 stage(4,'Add tests',addTestsState,addTestsContent,!!sampledCount&&data.phase!=='closed')+
 stage(5,'Sample boxes',data.boxesConfirmed?'Complete':boxesReady?'Outstanding':'Locked',boxesReady?btn('SCAN SAMPLE BOXES','goto-boxes','secondary wide'):'');
 const labStage=data.phase==='closed'?stage(6,'Laboratory receipt',testsLocked()?'Received · simulated':'Not recorded',testsLocked()?'<div class="notice ok">Received '+safe(formatExportTime(data.labReceivedAt))+' (simulation only). Test assignments are locked.</div>':'<p class="hint">Demo-only laboratory arrival. No actual external connection.</p>'+btn('SIMULATE LAB RECEIPT','ask-lab-receipt','outline wide')):'';
 const html=`<div class="tinycap">SESSION STATUS</div><div class="heading">${status}</div><section class="card"><div class="details-head"><span class="tinycap">SESSION DETAILS</span>${data.phase!=='closed'?btn('EDIT','edit-session','secondary smallbtn'):'<span>READ ONLY</span>'}</div><div class="details-grid">${detail('ORGANISATION',data.org)}${detail('SITE · ST-120455',data.site)}${detail('HERD',data.herd)}${detail('METHOD','Post-milking')}${detail('MILKING',`${data.start||'—'} – ${data.end||'—'}`)}${detail('SESSION ID',data.session)}${detail('YIELDS',recordYields()?'Required':'Not required')}${detail('DEVICES','1 device')}</div></section>${stages}${labStage}`;
 const foot=data.phase==='closed'?'':btn('CLOSE SAMPLING SESSION','ask-close','primary wide',data.phase==='confirmed'&&data.boxesConfirmed&&!blockingIssues()?'':'disabled');
 return [html,foot];
}
function animalCard(a,options={}){
 if(!a)return '';
 const idx=animals().indexOf(a)+1;
 const green=!!a.sample,not=!!a.noSampleReason;
 const duplicate=dupLines().has(a.line);
 const state=green?'LINKED ✓':not?'NO SAMPLE':(options.isNext?'NEXT':'AWAITING')+(duplicate?' · DUPLICATE':'');
 const number=green&&options.latest?'':String(idx);
 return `<button class="animal-card ${green?'green':not?'no-sample':''} ${options.isNext?'next':''} ${options.latest?'just-linked':''}" type="button" data-action="animal" data-uid="${safe(a.uid)}"><span class="pos">${number}</span><span class="line">${safe(a.line)}</span>${green?`<span class="sample-id">${safe(a.sample)}</span>`:''}${recordYields()&&a.yield?`<span class="yield">${safe(a.yield)} kg</span>`:''}<span class="right-tag">${state}</span></button>`;
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
function issuesScreen(){
 const repeated=dupLines(),duplicateSamples=duplicateSampleIds();
 const invalid=animals().filter(a=>repeated.has(a.line)||a.sample&&duplicateSamples.has(a.sample));
 const missing=noSample().filter(a=>!a.noSampleReason||a.noSampleReason==='Not sampled');
 const items=invalid.map(a=>'<button class="journey-issue-row warning" data-action="issue-animal" data-uid="'+safe(a.uid)+'"><div><b>'+safe(a.line)+'</b><div><span>'+safe(a.sample?'Sample '+a.sample:'No linked sample')+'</span></div><span>'+safe(repeated.has(a.line)?'Duplicate animal line':'Duplicate Sample ID')+' · position '+(animals().indexOf(a)+1)+'</span></div><strong>REVIEW ›</strong></button>').join('');
 const misses=missing.map(a=>'<button class="journey-issue-row" data-action="issue-no-sample" data-uid="'+safe(a.uid)+'"><div><b>'+safe(a.line)+'</b><div><span>No sample · reason optional</span></div></div><strong>REVIEW ›</strong></button>').join('');
 return ['<div class="journey-page"><h2>Issues</h2><p class="hint">Resolve blocking duplicates before closing the session. No Sample reasons are optional. Corrections may create new issues, which stay on this list.</p>'+
  '<section class="journey-card"><div class="tinycap">BLOCKING · '+invalid.length+' RECORDS</div><div class="journey-issues">'+(items||'<p class="hint">No blocking duplicates.</p>')+'</div></section>'+
  '<section class="journey-card"><div class="tinycap">NON-BLOCKING · '+missing.length+' NO SAMPLE</div><div class="journey-issues">'+(misses||'<p class="hint">No outstanding No Sample reasons.</p>')+'</div></section></div>',btn('SESSION MANAGEMENT','goto-session','secondary wide')];
}
function animalDetailScreen(){
 const a=animals().find(x=>x.uid===detailUid);
 if(!a)return ['<div class="notice">This record is no longer on the sampling list.</div>',btn('ISSUES','goto-issues','outline wide')];
 const repeated=dupLines().has(a.line),duplicateCode=!!a.sample&&duplicateSampleIds().has(a.sample);
 const position=animals().indexOf(a)+1,closed=data.phase==='closed';
 const issueNote=repeated?'<div class="journey-warning">DUPLICATE ANIMAL. Another sampling record has line '+safe(a.line)+'. Use Swap Animal to correct this record; it may reveal another duplicate.</div>':duplicateCode?'<div class="journey-warning">DUPLICATE SAMPLE ID. This Sample ID is linked to another animal. Correct one of the sample links before closing.</div>':'';
 return ['<div class="journey-page"><div class="tinycap">POST-MILKING · LIST POSITION '+position+'</div><h2>Animal details</h2>'+issueNote+
  '<section class="journey-card"><div class="tinycap">ANIMAL</div><strong>'+safe(a.line)+'</strong>'+(a.previousLine?'<span>Changed from '+safe(a.previousLine)+'</span>':'')+'<div class="tinycap">SAMPLING</div><div class="journey-plain-row">Method <strong>Post-milking</strong></div><div class="journey-plain-row">Device <strong>PM-DEMO-0142</strong></div><div class="journey-plain-row">List position <strong>'+position+'</strong></div>'+
  (closed?'':btn('SWAP ANIMAL','open-swap','outline wide'))+'</section>'+
  '<section class="journey-card"><div class="tinycap">SAMPLE</div><div class="journey-plain-row">Status <strong>'+(a.sample?'Linked':a.noSampleReason?'No sample':'Awaiting')+'</strong></div><div class="journey-plain-row">Sample ID <strong>'+safe(a.sample||'—')+'</strong></div><div class="journey-plain-row">Yield <strong>'+safe(recordYields()&&a.yield?a.yield+' kg':'—')+'</strong></div><div class="journey-plain-row">Tests <strong>'+safe(animalTests(a).join(', ')||'—')+'</strong></div>'+
  (closed?'':(recordYields()?btn('AMEND YIELD','open-detail-yield','outline wide'):'')+(a.sample?btn('UNLINK SAMPLE','unlink-detail-sample','outline wide'):btn('LINK SAMPLE','detail-link-sample','secondary wide')))+
  (a.sample?btn('ADD / CHANGE TESTS','detail-add-test','secondary wide'):'')+'</section></div>',btn('BACK TO ISSUES','goto-issues','outline wide')];
}
function swapPickerMarkup(){
 const a=animals().find(x=>x.uid===selectedUid);
 const matches=HerdDemo.HERD.filter(h=>!swapQuery||h.line.includes(swapQuery)).slice(0,20);
 const rows=matches.map(h=>{
  const already=animals().some(x=>x!==a&&x.line===h.line);
  return '<button type="button" class="journey-issue-row" data-action="swap-pick" data-line="'+safe(h.line)+'"><strong>'+safe(h.line)+'</strong><span>'+(already?'Already in sampling list · may create duplicate':'Available herd animal')+'</span><b>SELECT</b></button>';
 }).join('');
 return '<h2>Swap animal</h2><p class="hint">Change only the animal on this sampling record. Existing Sample ID, yield and tests stay with this record. You can select an animal already sampled; if this creates another duplicate, it will appear in Issues.</p><label class="field-label">SEARCH HERD BY LINE NUMBER</label><input id="swap-search" class="input" type="search" value="'+safe(swapQuery)+'" placeholder="Search line number"><div class="journey-issues" id="swap-results">'+(rows||'<p class="hint">No matching herd animals.</p>')+'</div>'+btn('CANCEL','modal-close','outline wide');
}
function applyAnimalSwap(animalUid,line){
 const a=animals().find(x=>x.uid===animalUid);
 if(!a||data.phase==='closed')return false;
 if(!HerdDemo.HERD.some(h=>h.line===line))return false;
 if(a.line===line)return true;
 a.previousLine=a.line;a.line=line;a.changedAt=timestamp();
 // The sample relation, yield and tests belong to the sampling record and
 // are deliberately not touched by changing its animal.
 store();return true;
}
function animalsScreen(){
 const chosen=animals().filter(a=>(filter==='all'||filter==='linked'&&a.sample||filter==='awaiting'&&!a.sample&&!a.noSampleReason||filter==='no-sample'&&a.noSampleReason||filter==='issues'&&(dupLines().has(a.line)||a.sample&&duplicateSampleIds().has(a.sample)))&&
  (!animalListQuery||a.line.includes(animalListQuery)||String(a.sample||'').includes(animalListQuery)));
 const buttons=['all','awaiting','linked','no-sample','issues'].map(key=>'<button type="button" class="pill '+(filter===key?'active':'')+'" data-action="filter" data-filter="'+key+'">'+safe(key.toUpperCase())+'</button>').join('');
 const cards=chosen.map(a=>filter==='issues'?'<button class="journey-issue-row warning" data-action="issue-animal" data-uid="'+safe(a.uid)+'"><b>'+safe(a.line)+'</b><span>'+safe(a.sample||'No sample')+'</span><strong>DETAILS ›</strong></button>':animalCard(a)).join('');
 return ['<div class="pillrow">'+buttons+'</div><input class="input" type="search" id="animals-search" placeholder="Search line or sample ID" value="'+safe(animalListQuery)+'"><div class="section-head"><strong>ANIMALS · '+chosen.length+'</strong></div><div>'+ (cards||'<div class="empty">No animals in this view.</div>')+'</div><p class="hint">Tap an animal to review its sampling record. Issues can be resolved from the Issues screen.</p>',btn('SESSION MANAGEMENT','goto-session','secondary wide')];
}
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
function render(){const [html,foot]=({issues:issuesScreen,'animal-detail':animalDetailScreen,'new-session-flow':wizardScreen,'session-created':sessionCreatedScreen,'animal-records':animalRecordsScreen,'session-details':sessionDetailsScreen,signin:signInScreen,account:accountScreen,site:siteScreen,settings:settingsOverviewScreen,'sampling-settings':samplingSettingsScreen,'data-settings':dataSettingsScreen,about:aboutScreen,sessions:sessionsScreen,session:sessionScreen,linking:linkingScreen,animals:animalsScreen,boxes:boxesScreen,tests:testManagementScreen,data:dataManagementScreen}[page]||sessionsScreen)();$('#app').innerHTML=`<div class="app ${page==='signin'?'app-signin':''}">${header()}<main class="body ${page==='signin'?'signin-body':''}" id="main-scroll">${html}</main>${foot?`<footer class="bottom ${page==='signin'?'signin-footer':''}">${foot}</footer>`:''}</div>`;if(page==='new-session-flow'){$('#main-scroll').scrollTop=0;}updateDebug();}
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
 if(data.phase!=='linking'){toast('Reopen linking to edit samples.');return false;}
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
 if(data.phase!=='confirmed'||blockingIssues()){toast('Finish linking and resolve blocking issues before adding boxes.');return false;}
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
 if(name==='herd-yield'&&!recordYields())name='herd-picker';
 clearTimeout(captureCompletionTimer);captureCompletionTimer=null;captureCompleting=false;
 stopCamera();modal=name;selectedUid=which||'';
 const animal=animals().find(a=>a.uid===selectedUid);
 let html='';
 if(name==='menu'){
  // UI-33: right-hand menu drawer with navy header, plain rows and blue section labels.
  const sections=[
   ['SESSIONS',[
    ['goto-sessions','Sampling sessions','All sampling sessions'],
    ['new-session','Create session','Create a new sampling session'],
    ['goto-session','Session management','Active sampling session']]],
   ['SAMPLE CAPTURE',[
    ['goto-linking','Post-milking linking','Link animals and sample pots'],
    ['goto-animals','Animals','All, linked, awaiting, issues'],
    ['goto-issues','Issues','Review sampling exceptions'],
    ['goto-tests','Test management','Add tests to sampled animals'],
    ['goto-boxes','Sample boxes','Scan and confirm boxes']]],
   ['ACCOUNT',[
    ['goto-account','Account','Contacts, sites and herds']]],
   ['DATA',[
    ['goto-data','Data management','Imports, exports and session data'],
    ['view-test-herd','Herd catalogue','View animal records']]],
   ['SETTINGS',[
    ['goto-settings','Settings','Sampling, camera, data and about']]]
  ];
  html='<div class="menu-panel-header"><strong>Menu</strong><button type="button" class="menu-panel-close" data-action="modal-close" aria-label="Close menu">×</button></div>'+
   '<div class="menu-panel-scroll">'+sections.map(([heading,items])=>
    '<div class="menu-section-title">'+heading+'</div>'+
    items.map(([action,title,subtitle])=>'<button type="button" class="menu-nav-item" data-action="'+action+'"><span><strong>'+title+'</strong><small>'+subtitle+'</small></span><span class="menu-chevron" aria-hidden="true">›</span></button>').join('')
   ).join('')+
   '<div class="menu-section-title">DEMO TOOLS</div>'+
   '<button class="menu-nav-item" data-action="load-demo"><span><strong>Load demo animals</strong></span><span class="menu-chevron">›</span></button>'+
   '<button class="menu-nav-item" data-action="reset"><span><strong>Reset current session</strong></span><span class="menu-chevron">›</span></button>'+
   '</div><div class="menu-panel-footer"><button type="button" data-action="demo-sign-out">Sign out</button></div>';
 }

 if(name==='new-session')html='<h2>New sampling session</h2><p class="hint">Create a separate sampling session; existing sessions will be preserved.</p>'+
  '<label class="field-label">FARM / SITE</label><input class="input" id="new-session-site" value="'+safe(data.site)+'">'+
  '<label class="field-label">HERD NUMBER</label><input class="input" id="new-session-herd" value="'+safe(data.herd)+'">'+
  '<label class="field-label">SESSION ID</label><input class="input" id="new-session-id" value="'+safe(newSessionId())+'">'+
  '<label class="field-label">ORGANISATION</label><input class="input" id="new-session-org" value="'+safe(data.org)+'">'+
  '<div class="buttons">'+btn('CANCEL','modal-close','outline')+btn('CREATE SESSION','create-session','secondary')+'</div>';
 if(name==='add-test'&&animal&&animal.sample){
  const position=animals().indexOf(animal)+1;
  testDraft=new Set(animalTests(animal));
  html='<div class="test-add-sheet"><div class="tinycap">ADD TEST · LIST POSITION '+position+'</div>'+
   '<h2>'+safe(animal.line)+'</h2><p class="hint">Sample ID '+safe(animal.sample)+'</p><div class="tinycap">SELECT TESTS</div>'+
   '<div class="add-test-options">'+TEST_TYPES.map(t=>'<button type="button" class="add-test-option '+(testDraft.has(t)?'selected':'')+'" data-action="toggle-add-test" data-test="'+t+'"><span class="test-check">'+(testDraft.has(t)?'✓':'')+'</span>'+t+'</button>').join('')+'</div>'+
   '<div class="buttons">'+btn('CANCEL','modal-close','outline')+'<button type="button" class="btn secondary" data-action="save-add-test" id="save-add-test">DONE</button></div></div>';
 }
 if(name==='add-test'&&animal?.sample&&testsLocked())html='<h2>Tests · read-only</h2><p class="hint">Simulated laboratory receipt recorded. Test assignments can no longer be changed.</p><div class="journey-plain-row">Animal <strong>'+safe(animal.line)+'</strong></div><div class="journey-plain-row">Sample ID <strong>'+safe(animal.sample)+'</strong></div><div class="journey-plain-row">Tests <strong>'+safe(animalTests(animal).join(', ')||'None')+'</strong></div>'+btn('DONE','modal-close','secondary wide');
 if(name==='swap-animal')html=swapPickerMarkup();
 if(name==='amend-yield'&&animal)html='<h2>Amend milk yield</h2><div class="tinycap">ANIMAL '+safe(animal.line)+'</div><div class="tinycap">SAMPLE '+safe(animal.sample||'—')+'</div>'+
  '<label class="field-label">YIELD (KG)</label><input id="amend-yield-value" class="input" inputmode="decimal" type="number" min="0" step="0.1" value="'+safe(animal.yield||'')+'">'+
  '<div class="buttons">'+btn('CANCEL','modal-close','outline')+btn('SAVE','save-detail-yield','secondary')+'</div>';
 if(name==='edit-demo-contact')html='<h2>Invoicing contact</h2>'+
  '<label class="field-label">NAME</label><input class="input" id="demo-contact-name" value="'+safe(demoAccount.contact)+'">'+
  '<label class="field-label">PHONE</label><input class="input" id="demo-contact-phone" value="'+safe(demoAccount.phone)+'">'+
  '<label class="field-label">EMAIL</label><input class="input" id="demo-contact-email" value="'+safe(demoAccount.invoiceEmail)+'">'+
  '<label class="field-label">ADDRESS</label><input class="input" id="demo-contact-address" value="'+safe(demoAccount.invoiceAddress)+'">'+
  '<p class="hint">Changes are saved on this device.</p>'+
  '<div class="buttons">'+btn('CANCEL','modal-close','outline')+btn('SAVE','save-demo-contact','secondary')+'</div>';
 if(name==='demo-site-form'){
  const editing=!!which,site=editing?demoSite():{name:'',address:'',type:'Herringbone',rows:2,stalls:10,herds:[],yields:true};
  const free=demoAccount.herds.filter(h=>!demoAccount.sites.some(q=>q.id!==(editing?site.id:null)&&q.herds.includes(h)));
  html='<h2>'+(editing?'Edit site':'Add site')+'</h2>'+
   '<label class="field-label">SITE NAME</label><input class="input" id="demo-site-name" value="'+safe(site.name)+'">'+
   '<label class="field-label">ADDRESS</label><input class="input" id="demo-site-address" value="'+safe(site.address)+'">'+
   '<label class="field-label">PARLOUR TYPE</label><select class="input" id="demo-site-type">'+['Herringbone','Rotary','Other'].map(t=>'<option '+(site.type===t?'selected':'')+'>'+t+'</option>').join('')+'</select>'+
   '<label class="field-label">ROWS / ROTARY SETS</label><input class="input" id="demo-site-rows" type="number" min="1" max="8" value="'+site.rows+'">'+
   '<label class="field-label">STALLS PER ROW / BAILS</label><input class="input" id="demo-site-stalls" type="number" min="1" max="100" value="'+site.stalls+'">'+
   '<label class="field-label">AVAILABLE HERDS</label><div class="journey-checklist">'+free.map(h=>'<label><input type="checkbox" data-site-herd="'+safe(h)+'" '+(site.herds.includes(h)?'checked':'')+'> Herd '+safe(h)+'</label>').join('')+'</div>'+
   '<label class="journey-check"><input type="checkbox" id="demo-site-yields" '+(site.yields?'checked':'')+'> Record yields</label>'+
   '<div class="buttons">'+btn('CANCEL','modal-close','outline')+btn(editing?'SAVE CHANGES':'ADD SITE','save-demo-site','secondary')+'</div>';
 }
 if(name==='camera-settings')html=CameraSettings.html();
 if(name==='edit-session')html=`<h2>Edit session</h2><label class="field-label">ORGANISATION</label><input class="input" id="edit-org" value="${safe(data.org)}"><label class="field-label">SITE / FARM</label><input class="input" id="edit-site" value="${safe(data.site)}"><label class="field-label">HERD</label><input class="input" id="edit-herd" value="${safe(data.herd)}"><label class="field-label">SESSION ID</label><input class="input" id="edit-session-id" value="${safe(data.session)}"><div class="time-row"><label><span class="tinycap">MILKING START</span>${timeInput('edit-start',data.start)}</label><label><span class="tinycap">MILKING END</span>${timeInput('edit-end',data.end)}</label></div><p class="hint">Record yields: ${recordYields()?'Yes':'No'} · Parlour Setup</p><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('SAVE','save-session','secondary')}</div>`;
 if(name==='add-animal')html=`<h2>Add cow</h2><p class="hint">Enter the line number written on the pot lid.</p><label class="field-label">ANIMAL LINE NUMBER</label><input class="input" id="new-line" maxlength="25" autocomplete="off" inputmode="numeric" placeholder="e.g. 00207">${recordYields()?'<label class="field-label">YIELD (kg)</label><input class="input" id="new-yield" type="number" min="0" step="0.1" inputmode="decimal" placeholder="e.g. 14.2">':''}<div class="buttons">${btn('DONE','modal-close','outline')}${btn('ADD COW','save-animal','primary')}</div>`;
 if(name==='manual')html=`<h2>${page==='boxes'?'Add box number manually':'Enter Sample ID'}</h2><p class="hint">${page==='boxes'?'Enter the barcode number printed on the sample box. It will be added to the scanned-box list.':'Manual entry is a fallback; the camera should scan continuously during normal linking.'}</p><label class="field-label">${page==='boxes'?'BOX NUMBER':'SAMPLE ID'}</label><input class="input" id="manual-id" autocomplete="off" placeholder="${page==='boxes'?'Box barcode number':'Scan code value'}"><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn(page==='boxes'?'ADD BOX':'LINK','save-manual','secondary')}</div>`;
 if(name==='animal'&&animal){html=`<h2>Animal ${safe(animal.line)}</h2><div class="notice">Status: ${animal.sample?'Linked to '+safe(animal.sample):animal.noSampleReason?'No sample — '+safe(animal.noSampleReason):'Awaiting sample'}</div>${!animal.sample&&!animal.noSampleReason&&data.phase==='linking'?btn('TYPE SAMPLE ID','type-animal-sample','secondary wide'):''}<label class="field-label">LINE NUMBER</label><input class="input" id="animal-line" value="${safe(animal.line)}">${recordYields()?'<label class="field-label">YIELD (kg)</label><input class="input" id="animal-yield" type="number" step="0.1" min="0" value="'+safe(animal.yield)+'">':''}<div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('SAVE DETAILS','save-animal-details','secondary')}</div>${animal.sample?btn('+ ADD TEST','add-test','outline wide')+btn('REMOVE SAMPLE LINK','unlink-animal','outline wide'):!animal.noSampleReason?btn('MARK NO SAMPLE','no-sample','soft wide'):btn('UNDO NO SAMPLE','undo-no-sample','soft wide')}${btn('REMOVE ANIMAL','remove-animal','danger wide')}`;}
 if(name==='animal'&&animal&&data.phase==='closed')html='<h2>Animal '+safe(animal.line)+'</h2><div class="notice ok">Session closed · sampling record read-only</div><div class="journey-plain-row">Sample ID <strong>'+safe(animal.sample||'—')+'</strong></div><div class="journey-plain-row">Yield <strong>'+safe(recordYields()?animal.yield||'—':'Not recorded')+'</strong></div><div class="journey-plain-row">Tests <strong>'+safe(animalTests(animal).join(', ')||'None')+'</strong></div>'+(animal.sample?btn(testsLocked()?'VIEW TESTS':'ADD / CHANGE TESTS','add-test','outline wide'):'')+btn('DONE','modal-close','secondary wide');
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
 if(name==='no-sample'&&animal)html=`<h2>No sample: ${safe(animal.line)}</h2><label class="field-label">REASON (OPTIONAL)</label><select class="input" id="no-sample-reason"><option>Not sampled</option><option>Dry</option><option>Sold</option><option>Antibiotics</option><option>Animal absent</option><option>Sample lost</option><option>Insufficient milk</option><option>Other</option></select><div class="buttons">${btn('BACK','modal-close','outline')}${btn('CONFIRM','save-no-sample','secondary')}</div>`;
 if(name==='confirm-linking')html=`<h2>All samples linked?</h2><p class="hint">${waiting().length?`${waiting().length} animals are still awaiting samples. Link them or mark them as No sample before confirming.`:'All animals have been dealt with. Confirm this stage to continue to sample boxes.'}</p>${blockingIssues()?`<div class="notice warning">Duplicate animal records or Sample IDs must be resolved first.</div>`:''}<div class="buttons">${btn('BACK','modal-close','outline')}${btn('CONFIRM','do-confirm-linking','secondary',canFinish()?'':'disabled')}</div>`;
 if(name==='confirm-lab-receipt')html='<h2>Simulate laboratory receipt?</h2><p class="hint">This marks samples received at the laboratory for this local demo. Test assignments become permanently read-only. No actual NMR or laboratory service is connected.</p><div class="buttons">'+btn('CANCEL','modal-close','outline')+btn('CONFIRM DEMO RECEIPT','confirm-lab-receipt','danger')+'</div>';
 if(name==='confirm-close')html=`<h2>Close sampling session?</h2><p class="hint">Closing makes sample linking and boxes read-only. Tests remain editable until laboratory receipt. This prototype does not send data to NMR; use Data Management to export JSON.</p><div class="buttons">${btn('CANCEL','modal-close','outline')}${btn('CLOSE SESSION','do-close','danger')}</div>`;
 $('#modal-root').innerHTML=`<div class="modal-layer ${name==='capture'?'capture-layer':name==='menu'?'menu-layer':''}" data-action="backdrop"><section class="sheet ${name==='capture'?'capture-sheet':name==='menu'?'menu-sheet':''}" role="dialog" aria-modal="true" aria-label="${name==='capture'?'Sample capture':name==='menu'?'Main menu':'Post-milking'}">${name==='menu'||name==='capture'||name==='herd-picker'||name==='herd-yield'?'':'<div class="sheet-header"><span class="tinycap">POST-MILKING</span><button type="button" class="sheet-close" data-action="modal-close" aria-label="Close">×</button></div>'}${html}</section></div>`;
 const focus=({ 'add-animal':'new-line',manual:'manual-id'})[name];if(focus){const input=$('#'+focus);if(input)input.focus({preventScroll:true});}if(name==='capture'&&!options.skipCamera)startCamera();if(name==='camera-settings')CameraSettings.start();
}
function closeModal(resume=true){clearTimeout(captureCompletionTimer);captureCompletionTimer=null;captureCompleting=false;if(modal==='capture'||modal==='camera-settings')stopCamera();modal='';selectedUid='';$('#modal-root').replaceChildren();if(resume&&((page==='linking'&&data.phase==='linking'&&waiting().length)||page==='boxes'))startCamera();}
function addDemo(){if(animals().length){toast('Demo animals can be loaded only into an empty list.');return}for(const [line,yieldKg] of demo)data.animals.push({uid:uid(),line,yield:recordYields()?yieldKg:'',sample:'',linkedSequence:0,linkedAt:'',noSampleReason:'',removed:false});store();closeModal(false);page='linking';render();toast('Five demo animals added.');}
function makeAnimal(){const line=$('#new-line')?.value.trim()||'',yieldKg=recordYields()?$('#new-yield')?.value.trim()||'':'';if(!line||!/^[-\w]{1,25}$/.test(line))return toast('Enter a valid animal line number');if(animals().some(a=>a.line===line))return toast('Animal already in this list');if(yieldKg!==''&&(!Number.isFinite(+yieldKg)||+yieldKg<0))return toast('Invalid milk yield');
 data.animals.push({uid:uid(),line,yield:yieldKg,sample:'',linkedSequence:0,linkedAt:'',noSampleReason:'',removed:false});if(data.phase==='setup')data.phase='adding';store();closeModal(false);render();openModal('add-animal');toast(`${line} added`);}
function downloadJson(text,fileName){
 const blob=new Blob([text],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=fileName;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function exportJSON(){
 if(!activeRecordId)return toast('Select a session before exporting.');
 const when=timestamp(),fileName=`postmilk-${String(data.session).replace(/[^a-z0-9-]/gi,'_')}.json`;
 const nextRevision=(Number(data.changeRevision)||0)+1;
 // Export an immutable snapshot of the session. Do not recursively embed an
 // earlier outbound JSON copy inside the new file.
 const snapshot={...data,changeRevision:nextRevision};
 delete snapshot.nmrOutbound;
 delete snapshot.nmrMockSentAt;
 delete snapshot.nmrMockSentRevision;
 const json=JSON.stringify({app:'Post-milking Sampling',version:VERSION,exportedAt:when,...snapshot},null,2);
 data.nmrOutbound={compiledAt:when,sentAt:when,fileName,revision:nextRevision,json};
 store();
 downloadJson(json,fileName);
 if(page==='data')render();
 closeModal(false);
}
function downloadCompiledJSON(){
 const saved=outboundSnapshot();
 if(!saved)return toast('No compiled JSON has been recorded for this session.');
 downloadJson(saved.json,saved.fileName||'session.json');
}
async function importJSON(file){if(!file)return;try{const text=await file.text(),parsed=JSON.parse(text);if(!Array.isArray(parsed.animals)||!parsed.session)throw Error('Not a sampling session export');if(!confirm('Import this session? It will add this session without deleting existing sessions.'))return;data=normaliseRecord(parsed);if(sessions.some(x=>x.session===data.session))data.session+='-IMPORTED';activeRecordId=data.recordId;while(sessions.some(x=>x.recordId===activeRecordId)){data.recordId=uid();activeRecordId=data.recordId;}sessions.push(data);store();await navigate('session');toast('Session imported');}catch(e){toast('Unable to import: '+e.message)}}
function doAction(action,button){
 // Enforce the session lifecycle at the action boundary, not just by hiding buttons.
 const physicalEdits=['save-session','save-session-details','save-animal-details','unlink-animal','remove-animal','save-no-sample','undo-no-sample','capture-remove','link-animal-sample','save-manual','save-animal','add-animal','load-demo','save-detail-yield','swap-pick','herd-pick','herd-add-code','herd-duplicate','herd-save-yield','reopen-linking','start-link','data-add-animals','data-auto-link'];
 if(data.phase==='closed'&&physicalEdits.includes(action)){toast('This sampling session is closed and read-only.');return;}
 if(testsLocked()&&['toggle-add-test','save-add-test','test-save','test-select-all'].includes(action)){toast('Tests locked: laboratory receipt was simulated.');return;}
 switch(action){
 case 'menu':if(!demoAuth)return;openModal('menu');break;
 case 'demo-password-toggle':{
  const value=$('#demo-signin-password'),toggle=$('#demo-password-toggle');
  if(!value||!toggle)return;
  const visible=toggle.getAttribute('aria-pressed')!=='true';
  value.textContent=visible?'demo-access':'••••••••••';
  toggle.textContent=visible?'HIDE':'SHOW';
  toggle.setAttribute('aria-pressed',String(visible));
  toggle.setAttribute('aria-label',visible?'Hide password':'Show password');
  break;
 }
 case 'demo-signin-help':toast('Sign-in help is not connected in this demonstration.');break;
 case 'demo-sign-in':{
  // Sign-in is only a screen transition in this demo; no credentials are captured.
  demoAuth=true;
  try{localStorage.setItem(DEMO_AUTH_STORAGE,'signed-in')}catch{}
  navigate('sessions');break;
 }
 case 'demo-sign-out':demoAuth=false;try{localStorage.removeItem(DEMO_AUTH_STORAGE)}catch{}navigate('signin');break;
 case 'goto-account':navigate('account');break;
 case 'goto-settings':navigate('settings');break;
 case 'settings-go':if(button.dataset.page==='camera-settings')openModal('camera-settings');else navigate(button.dataset.page);break;
 case 'edit-demo-contact':openModal('edit-demo-contact');break;
 case 'save-demo-contact':{
  demoAccount.contact=$('#demo-contact-name')?.value.trim()||demoAccount.contact;
  demoAccount.phone=$('#demo-contact-phone')?.value.trim()||demoAccount.phone;
  demoAccount.invoiceEmail=$('#demo-contact-email')?.value.trim()||demoAccount.invoiceEmail;
  demoAccount.invoiceAddress=$('#demo-contact-address')?.value.trim()||demoAccount.invoiceAddress;
  saveDemoAccount();closeModal(false);render();break;
 }
 case 'open-demo-site':demoSiteId=button.dataset.siteId;navigate('site');break;
 case 'add-demo-site':openModal('demo-site-form');break;
 case 'edit-demo-site':openModal('demo-site-form',demoSiteId);break;
 case 'save-demo-site':{
  const name=$('#demo-site-name')?.value.trim(),address=$('#demo-site-address')?.value.trim();
  const rows=Number($('#demo-site-rows')?.value),stalls=Number($('#demo-site-stalls')?.value);
  if(!name||!address||!Number.isSafeInteger(rows)||rows<1||rows>8||!Number.isSafeInteger(stalls)||stalls<1||stalls>100)return toast('Complete the site details and choose valid parlour dimensions.');
  const herds=$$('[data-site-herd]:checked').map(el=>el.dataset.siteHerd);
  if(!herds.length)return toast('Link at least one available herd.');
  const existing=modal==='demo-site-form'&&selectedUid?demoSite():null;
  const previousName=existing?.name;
  const site={id:existing?.id||uid(),name,address,type:$('#demo-site-type')?.value||'Other',rows,stalls,herds,yields:!!$('#demo-site-yields')?.checked};
  if(existing)Object.assign(existing,site);else demoAccount.sites.push(site);
  for(const rec of sessions){
   if(rec.phase==='closed'||!(rec.siteId===site.id||(previousName&&rec.site===previousName)))continue;
   rec.siteId=site.id;rec.site=site.name;rec.yields=site.yields;
   if(!site.yields)for(const a of rec.animals||[])a.yield='';
   rec.changeRevision=(Number(rec.changeRevision)||0)+1;
  }
  demoSiteId=site.id;saveDemoAccount();
  if(activeRecordId)data=sessions.find(x=>x.recordId===activeRecordId)||data;
  persistRegistry();closeModal(false);navigate('site');break;
 }
 case 'goto-sessions':navigate('sessions');break;
 case 'goto-data':if(!activeRecordId)return toast('Create or select a session first.');navigate('data');break;
 case 'goto-issues':navigate('issues');break;
 case 'issue-animal':detailUid=button.dataset.uid;selectedUid=detailUid;navigate('animal-detail');break;
 case 'issue-no-sample':{
  const a=animals().find(x=>x.uid===button.dataset.uid);
  if(!a)return;selectedUid=a.uid;openModal('no-sample',a.uid);break;
 }
 case 'open-swap':if(data.phase==='closed')return toast('Sampling record is closed.');swapQuery='';openModal('swap-animal',detailUid);break;
 case 'swap-pick':{
  const chosen=button.dataset.line,aId=detailUid;
  if(!applyAnimalSwap(aId,chosen))return toast('Unable to swap this animal.');
  closeModal(false);navigate('animal-detail');break;
 }
 case 'open-detail-yield':{
  const a=animals().find(x=>x.uid===detailUid);
  if(!a||data.phase==='closed'||!recordYields())return;
  openModal('amend-yield',a.uid);break;
 }
 case 'save-detail-yield':{
  const a=animals().find(x=>x.uid===selectedUid),value=$('#amend-yield-value')?.value.trim()||'';
  if(!a||data.phase==='closed'||!recordYields())return;
  if(value!==''&&(!Number.isFinite(+value)||Number(value)<0))return toast('Enter a non-negative yield.');
  a.yield=value;store();closeModal(false);navigate('animal-detail');break;
 }
 case 'unlink-detail-sample':{
  const a=animals().find(x=>x.uid===detailUid);
  if(!a||!a.sample||data.phase==='closed')return;
  if(!confirm('Remove this sample link and its assigned tests?'))return;
  a.sample='';a.linkedAt='';a.linkedSequence=0;a.tests=[];
  if(data.phase==='confirmed'){data.phase='linking';data.boxesConfirmed=false;}
  store();navigate('animal-detail');break;
 }
 case 'detail-link-sample':{
  const a=animals().find(x=>x.uid===detailUid);
  if(!a||a.sample||data.phase==='closed')return toast('This record cannot be linked now.');
  if(data.phase==='confirmed'){data.phase='linking';data.boxesConfirmed=false;store();}
  openModal('manual-animal',a.uid);break;
 }
 case 'detail-add-test':{
  const a=animals().find(x=>x.uid===detailUid);
  if(a?.sample)openModal('add-test',a.uid);break;
 }

 case 'download-compiled-json':downloadCompiledJSON();break;
 case 'data-add-animals':{
  const count=readTestCount('data-add-count',remainingTestHerd().length);
  if(count===null)return toast('Enter a whole number within the available herd count.');
  if(!bulkAddTestAnimals(count))return toast('Cannot add those animals to this session.');
  render();toast('Added '+count+' demo herd animals, ready for pot linking.');break;
 }
 case 'data-auto-link':{
  const count=readTestCount('data-link-count',waiting().length);
  if(count===null)return toast('Enter a whole number no greater than the awaiting count.');
  if(!bulkGenerateSampleLinks(count))return toast('Could not generate sample links.');
  render();toast('Linked '+count+' test samples'+(recordYields()?' and added missing yields':'')+'.');break;
 }
 case 'goto-tests':if(!activeRecordId)return toast('Create or select a session first');currentTest='JOHNES';testFilter='all';testQuery='';resetTestDraft();navigate('tests');break;
 case 'new-session':startDemoWizard();break;
 case 'wizard-cancel':wizardDraft=null;navigate('sessions');break;
 case 'wizard-back':wizardStep=Math.max(1,wizardStep-1);render();break;
 case 'wizard-edit-location':wizardStep=1;render();break;
 case 'wizard-edit-details':wizardStep=2;render();break;
 case 'wizard-next':
  if(wizardStep===1){
   const site=wizardSite();
   if(!site||!site.herds.includes(wizardDraft.herd))return toast('Choose a site and a herd linked to it.');
   wizardStep=2;render();break;
  }
  if(wizardStep===2){
   if(!wizardSaveDetails())return toast('Enter a valid date and milking.');
   wizardStep=3;render();break;
  }
  break;
 case 'wizard-create':{
  if(!wizardDraft||wizardStep!==3)return;
  const site=wizardSite();
  if(!site||!site.herds.includes(wizardDraft.herd))return toast('A valid site and herd are required.');
  const id=newSessionId();
  data=normaliseRecord({...fresh(),org:demoAccount.farm,site:site.name,herd:wizardDraft.herd,session:id,
   sampleDate:wizardDraft.date,milking:wizardDraft.milking,sessionType:wizardDraft.type,
   siteId:site.id,animalsHeld:true,
   animalDataUpdatedAt:demoPrefs.downloadAuto?timestamp():'',yields:site.yields});
  activeRecordId=data.recordId;sessions.push(data);store();wizardDraft=null;
  navigate('session-created');break;
 }
 case 'view-created-session':navigate('animal-records');break;
 case 'animal-records-continue':navigate('session');break;
 case 'animal-records-refresh':if(!activeRecordId)return toast('Open a session first.');data.animalDataUpdatedAt=timestamp();store();render();toast('Local demo record timestamp refreshed.');break;
 case 'save-session-details':{
  if(data.phase==='closed')return toast('Closed session details are read-only.');
  const start=normalTime($('#edit-start')?.value),end=normalTime($('#edit-end')?.value);
  if(($('#edit-start')?.value&&!start)||($('#edit-end')?.value&&!end))return toast('Use HH:MM for milking times.');
  data.start=start;data.end=end;data.yields=recordYields();
  store();navigate('session');break;
 }

 case 'create-session':{
  const site=$('#new-session-site')?.value.trim()||'',herd=$('#new-session-herd')?.value.trim()||'';
  const id=$('#new-session-id')?.value.trim()||'';
  if(!site||!herd||!id)return toast('Enter a farm, herd and session ID.');
  if(sessions.some(x=>x.session===id))return toast('That Session ID is already in use.');
  data=normaliseRecord({...fresh(),site,herd,session:id,org:$('#new-session-org')?.value.trim()||data.org});
  activeRecordId=data.recordId;sessions.push(data);store();navigate('session');break;
 }
 case 'open-session':{
  const found=sessions.find(x=>x.recordId===button.dataset.recordId);
  if(!found)return toast('Session not found.');
  data=found;activeRecordId=data.recordId;persistRegistry();navigate(data.animalsHeld?'animal-records':'session');break;
 }
 case 'add-test':{
  const animal=animals().find(x=>x.uid===selectedUid);
  if(!animal?.sample)return toast('Link a sample before adding tests.');
  openModal('add-test',animal.uid);break;
 }
 case 'toggle-add-test':{
  const test=button.dataset.test;if(!TEST_TYPES.includes(test)||!testDraft)return;
  if(testDraft.has(test))testDraft.delete(test);else testDraft.add(test);
  button.classList.toggle('selected',testDraft.has(test));
  const mark=button.querySelector('.test-check');if(mark)mark.textContent=testDraft.has(test)?'✓':'';
  const label=$('#save-add-test');if(label){
   const previous=animals().find(a=>a.uid===selectedUid);
   const added=previous?[...testDraft].filter(t=>!animalTests(previous).includes(t)).length:0;
   label.textContent=added?'ADD '+added+' TEST'+(added===1?'':'S'):'DONE';
  }
  break;
 }
 case 'save-add-test':{
  const animal=animals().find(a=>a.uid===selectedUid);
  if(!animal?.sample||!testDraft)return toast('Sample link is not available.');
  for(const t of TEST_TYPES)assignSampledTest(animal.uid,t,testDraft.has(t));
  store();testDraft=null;closeModal(false);
  if(page==='linking'||page==='animals'||page==='animal-detail')render();
  if(page==='linking'&&data.phase==='linking'&&waiting().length)startCamera();
  toast('Tests saved for '+animal.line);break;
 }
 case 'test-select':{
  if(!TEST_TYPES.includes(button.dataset.test))break;
  currentTest=button.dataset.test;testFilter='all';testQuery='';resetTestDraft();render();break;
 }
 case 'test-filter':if(['all','with','without'].includes(button.dataset.filter)){testFilter=button.dataset.filter;render();}break;
 case 'test-select-all':{
  const shown=sampledAnimals().filter(a=>(testFilter==='with'?testManagerDraft.has(a.uid):testFilter==='without'?!testManagerDraft.has(a.uid):true)&&(!testQuery||a.line.includes(testQuery)||a.sample.includes(testQuery)));
  for(const a of shown)testManagerDraft.add(a.uid);
  render();break;
 }
 case 'test-save':
  commitTestSelection();testFilter='all';render();toast(currentTest+' tests saved. Samples remain available for other tests.');break;
 case 'test-done':
  // Save pending choices (if changed) and return; no test completion flag.
  // A no-op DONE must not mark the compiled outbound JSON as stale.
  commitTestSelection();navigate('session');break;
 
 case 'modal-close':closeModal();break;
 case 'backdrop':closeModal();break;
 case 'camera-settings':openModal('camera-settings');break;
 case 'camera-settings-done':closeModal();break;
 case 'clear-test-data':{
  // This resets only the current test sampling session. Do not delete the
  // device's camera, zoom, decoder, or barcode format preferences.
  const warning='Clear all test sampling data on this device? This removes added animals, linked sample IDs, scanned boxes and session progress. Camera and zoom settings will be kept. This cannot be undone.';
  if(!confirm(warning))break;
  sessions=[];activeRecordId='';data=normaliseRecord(fresh());persistRegistry();navigate('sessions');toast('All test sessions cleared. Camera settings preserved.');
  break;
 }
 case 'camera-reset':CameraSettings.reset();break;
 case 'camera-zoom-preset':CameraSettings.setZoom(button.dataset.zoom);break;
 case 'edit-session':navigate('session-details');break;
 case 'save-session':{
  const rawStart=$('#edit-start').value,rawEnd=$('#edit-end').value;if(rawStart&&!normalTime(rawStart)||rawEnd&&!normalTime(rawEnd))return toast('Enter valid HH:MM times');
  data.org=$('#edit-org').value.trim()||data.org;data.site=$('#edit-site').value.trim()||data.site;data.herd=$('#edit-herd').value.trim()||data.herd;data.session=$('#edit-session-id').value.trim()||data.session;data.start=normalTime(rawStart);data.end=normalTime(rawEnd);data.yields=recordYields();store();closeModal(false);render();break;}
 case 'start-link':if(!normalTime(data.start)||!normalTime(data.end))return toast('Enter both milking times first');data.phase=animals().length?'check':'adding';store();navigate('linking');break;
 case 'goto-session':navigate('session');break;
 case 'boxes-done':if(data.phase==='closed'||(data.boxes.length>0&&data.boxesConfirmed))navigate('session');else toast('Scan at least one box and confirm all boxes are scanned.');break;
 case 'goto-linking':navigate('linking',{autoCamera:true});break;
 case 'goto-animals':filter='all';animalListQuery='';navigate('animals');break;
 case 'goto-boxes':if(data.phase!=='confirmed'&&data.phase!=='closed')return toast('Confirm sample linking before scanning boxes');if(blockingIssues())return toast('Resolve blocking duplicate issues before scanning boxes.');navigate('boxes',{autoCamera:data.phase!=='closed'});break;
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
 case 'save-animal-details':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;const line=$('#animal-line').value.trim(),yieldKg=recordYields()?$('#animal-yield')?.value.trim()||'':'';if(!/^[-\w]{1,25}$/.test(line)||animals().some(b=>b!==a&&b.line===line))return toast('Invalid or duplicate animal line');if(yieldKg!==''&&(!Number.isFinite(+yieldKg)||+yieldKg<0))return toast('Invalid yield');a.line=line;a.yield=yieldKg;store();closeModal(false);render();if(page==='linking'&&data.phase==='linking'&&waiting().length)startCamera();break;}
 case 'unlink-animal':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;a.sample='';a.linkedSequence=0;a.linkedAt='';a.tests=[];if(data.phase==='confirmed'){data.phase='linking';data.boxesConfirmed=false}store();closeModal(false);render();if(page==='linking')startCamera();break;}
 case 'no-sample':openModal('no-sample',selectedUid);break;
 case 'save-no-sample':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;a.noSampleReason=$('#no-sample-reason').value;a.sample='';a.linkedSequence=0;a.tests=[];store();closeModal(false);render();if(page==='linking'&&waiting().length)startCamera();break;}
 case 'undo-no-sample':{const a=animals().find(a=>a.uid===selectedUid);if(!a)return;a.noSampleReason='';store();closeModal(false);render();if(page==='linking')startCamera();break;}
 case 'remove-animal':{const a=animals().find(a=>a.uid===selectedUid);if(!a||!confirm('Remove '+a.line+' from this session?'))return;a.removed=true;a.tests=[];store();closeModal(false);render();if(page==='linking'&&waiting().length)startCamera();break;}
 case 'confirm-linking':openModal('confirm-linking');break;
 case 'do-confirm-linking':if(!canFinish())return toast('Deal with awaiting and blocking duplicate records first');data.phase='confirmed';data.confirmedAt=timestamp();store();navigate('session');break;
 case 'reopen-linking':data.phase='linking';data.boxesConfirmed=false;store();navigate('linking',{autoCamera:true});break;
 case 'ask-lab-receipt':if(data.phase!=='closed'||testsLocked())return toast('Close the session before laboratory receipt.');openModal('confirm-lab-receipt');break;
 case 'confirm-lab-receipt':if(data.phase!=='closed'||testsLocked())return toast('Demo lab receipt cannot be recorded now.');data.labReceivedAt=timestamp();store();closeModal(false);navigate('session');toast('Laboratory receipt simulated. Tests locked.');break;
 case 'ask-close':if(data.phase!=='confirmed'||!data.boxesConfirmed||blockingIssues())return toast('Finish sampling, resolve duplicate issues and scan boxes first');openModal('confirm-close');break;
 case 'do-close':if(data.phase!=='confirmed'||!data.boxesConfirmed||blockingIssues())return toast('Resolve outstanding session requirements first.');data.phase='closed';data.closedAt=timestamp();store();navigate('session');break;
 case 'export':exportJSON();break;
 case 'import':{const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';inp.addEventListener('change',()=>importJSON(inp.files?.[0]),{once:true});inp.click();break;}
 case 'reset':if(!confirm('Delete the current session? Export it first if needed.'))return;sessions=sessions.filter(x=>x.recordId!==activeRecordId);activeRecordId='';data=normaliseRecord(fresh());persistRegistry();navigate('sessions');break;
 }
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(!button||button.disabled)return;if(button.dataset.action==='backdrop'&&button!==e.target)return;e.preventDefault();doAction(button.dataset.action,button)});
document.addEventListener('input',e=>{
 const el=e.target;
 if(el.id==='animals-search'&&page==='animals'){
  animalListQuery=el.value;
  const box=$('#main-scroll'),top=box?.scrollTop||0;
  render();const next=$('#animals-search');if(next){next.focus();next.setSelectionRange?.(animalListQuery.length,animalListQuery.length);}
  if(box)box.scrollTop=top;return;
 }
 if(el.id==='swap-search'&&modal==='swap-animal'){
  swapQuery=el.value;
  const next=swapPickerMarkup();
  const start=next.indexOf('<div class="journey-issues" id="swap-results">'),end=next.indexOf('</div>',start);
  const list=$('#swap-results');
  if(list&&start>=0&&end>=0){const contents=next.slice(start+'<div class="journey-issues" id="swap-results">'.length,end);list.innerHTML=contents;}
  return;
 }

 if(el.id==='camera-zoom'){CameraSettings.setZoom(el.value);return;}
 if(el.id==='test-search'&&page==='tests'){testQuery=el.value;const p=$('#main-scroll');const top=p?.scrollTop||0;render();const next=$('#test-search');if(next){next.focus();next.setSelectionRange?.(testQuery.length,testQuery.length);}if(p)p.scrollTop=top;return;}
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
 if(e.target.dataset?.wizardSite&&wizardDraft){
  wizardDraft.siteId=e.target.dataset.wizardSite;
  wizardDraft.herd=wizardSite()?.herds?.[0]||'';
  render();return;
 }
 if(e.target.dataset?.wizardHerd&&wizardDraft){
  wizardDraft.herd=e.target.dataset.wizardHerd;
  render();return;
 }
 if(['session-filter-status','session-filter-site','session-sort'].includes(e.target.id)){
  if(e.target.id==='session-filter-status')sessionListStatus=e.target.value;
  if(e.target.id==='session-filter-site')sessionListSite=e.target.value;
  if(e.target.id==='session-sort')sessionListSort=e.target.value;
  render();return;
 }
 if(e.target.dataset?.pref){
  const key=e.target.dataset.pref,value=e.target.value;
  if(!Object.hasOwn(demoPrefs,key))return;
  demoPrefs[key]=['quickScan','autoNext','showLinked','downloadAuto'].includes(key)?value==='true':value;
  saveDemoPrefs();render();return;
 }
 if(e.target.matches?.('[data-test-uid]')&&page==='tests'){
  if(testsLocked()){e.target.checked=!e.target.checked;return;}
  const sampleUid=e.target.dataset.testUid;
  if(!sampledAnimals().some(a=>a.uid===sampleUid))return;
  if(e.target.checked)testManagerDraft.add(sampleUid);
  else testManagerDraft.delete(sampleUid);
  const save=$('[data-action="test-save"]');
  if(save)save.textContent='SAVE '+currentTest+' · '+testManagerDraft.size+' ANIMALS';
  return;
 }
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
