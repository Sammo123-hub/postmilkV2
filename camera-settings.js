/* Camera settings for Post-Milking Sampling.
 * Zoom is applied to the ACTUAL running video track via html5-qrcode, not CSS.
 * Device/lens choices are the cameras the mobile browser exposes. No optical
 * lens or focus capability is invented when the browser doesn't provide it.
 */
'use strict';
const CameraSettings=(()=>{
 const KEY='postmilk-camera-preferences-v1';
 const defaults={deviceId:'auto',zoom:1,boxZoom:1,codeFormat:'dm',engine:'wasm',mode:'auto'};
 let saved={...defaults};
 try{
  const value=JSON.parse(localStorage.getItem(KEY)||'null');
  if(value&&typeof value==='object'){
   const oldFactoryDefaults=!('mode' in value)&&value.deviceId==='auto'&&Number(value.zoom)===1&&value.codeFormat==='qr'&&value.engine==='js';
   saved.deviceId=typeof value.deviceId==='string'?value.deviceId:'auto';
   saved.codeFormat=['qr','qr-dm','dm'].includes(value.codeFormat)?value.codeFormat:defaults.codeFormat;
   saved.engine=value.engine==='wasm'?'wasm':'js';
   saved.mode=['auto','small','manual'].includes(value.mode)?value.mode:defaults.mode;
   const z=Number(value.zoom);saved.zoom=Number.isFinite(z)&&z>=.5&&z<=10?z:1;
   const bz=Number(value.boxZoom);saved.boxZoom=value.boxZoom!==undefined&&Number.isFinite(bz)&&bz>=.5&&bz<=10?bz:1;
   // Move only the previous untouched factory preset. Preserve customised choices.
   if(oldFactoryDefaults){saved.codeFormat='dm';saved.engine='wasm';}
  }
 }catch{}
 let zoomRange=null,zoomRequested=null,zoomBusy=false,devices=[],zoomWatchBusy=false,zoomWatchTimers=[],lastZoomRepair=0;
 let zoomPreviewTarget='pots';
 const activeZoomTarget=()=>modal==='camera-settings'?zoomPreviewTarget:page==='boxes'?'boxes':'pots';
 const storedZoom=target=>target==='boxes'?saved.boxZoom:saved.zoom;
 const setStoredZoom=(target,value)=>{if(target==='boxes')saved.boxZoom=value;else saved.zoom=value;save();};
 const round=n=>Math.round(Number(n)*100)/100;
 const fmt=n=>round(n).toFixed(round(n)%1===0?0:2)+'×';
 function save(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}}
 const modeOptions=[
  ['auto','Automatic — recommended'],
  ['small','Small-code optimisation (7–8 mm)'],
  ['manual','Manual camera configuration']
 ];
 function modeExplanation(){
  if(saved.mode==='small')return 'Requests a higher-resolution video feed where supported, with a tighter central scanning area. Centre the code; camera focus still depends on the phone.';
  if(saved.mode==='manual')return 'Select a camera and hardware zoom below. The app only applies controls that the browser supports.';
  return 'Uses the selected rear camera, normal scanning area and continuous focus when the browser supports it.';
 }
 function updateModeNote(){
  const label=$('#camera-mode-note');
  if(label)label.textContent=modeExplanation();
 }
 function html(){
  return '<div class="camera-settings">'+
   '<h2>CAMERA SETTINGS</h2>'+
   '<p class="camera-settings-tip">Scanning settings adapt to the cameras and controls available in your browser.</p>'+
   '<label class="field-label" for="camera-scan-mode">SCANNING CONFIGURATION</label>'+
   '<select id="camera-scan-mode" class="input">'+modeOptions.map(([id,label])=>'<option value="'+id+'" '+(saved.mode===id?'selected':'')+'>'+label+'</option>').join('')+'</select>'+
   '<p id="camera-mode-note" class="camera-settings-note">'+modeExplanation()+'</p>'+
   '<label class="field-label" for="camera-device">REAR CAMERA / LENS</label>'+
   '<select id="camera-device" class="input"><option value="auto" '+(saved.deviceId==='auto'?'selected':'')+'>Rear camera — automatic</option>'+
    (saved.deviceId!=='auto'?'<option selected value="'+safe(saved.deviceId)+'">Saved rear camera (checking availability)</option>':'')+'</select>'+
   '<p id="camera-device-note" class="camera-settings-note">Checking available rear cameras without restarting the preview…</p>'+
   '<label class="field-label" for="camera-zoom-target">ZOOM SETTINGS FOR</label>'+
   '<select id="camera-zoom-target" class="input"><option value="pots" '+(zoomPreviewTarget==='pots'?'selected':'')+'>Sample pots — small Data Matrix codes</option><option value="boxes" '+(zoomPreviewTarget==='boxes'?'selected':'')+'>Sample boxes — box barcodes</option></select>'+
   '<div class="camera-zoom-heading"><label class="field-label" for="camera-zoom">HARDWARE ZOOM</label><strong id="camera-zoom-value">'+fmt(storedZoom(zoomPreviewTarget))+'</strong></div>'+
   '<input type="range" id="camera-zoom" min="1" max="'+Math.max(2,storedZoom(zoomPreviewTarget))+'" step="0.1" value="'+storedZoom(zoomPreviewTarget)+'" disabled aria-label="Zoom for selected barcode type">'+
   '<div class="camera-zoom-buttons"><button type="button" data-action="camera-zoom-preset" data-zoom="1" disabled>1×</button><button type="button" data-action="camera-zoom-preset" data-zoom="2" disabled>2×</button></div>'+
   '<p id="camera-zoom-note" class="camera-settings-note">Sample pots and boxes each remember their own zoom. Saved: '+fmt(storedZoom(zoomPreviewTarget))+'. Checking actual camera zoom capability…</p>'+
   '<div class="camera-settings-preview"><div id="settings-reader"></div><div class="camera-settings-overlay"><span>CAMERA PREVIEW</span><div class="camera-settings-target"></div></div><div class="camera-settings-loading" id="camera-settings-loading">Starting rear camera…</div></div>'+
   '<p id="camera-focus-note" class="camera-settings-note">Autofocus is controlled by the camera unless the browser exposes focus controls.</p>'+
   '<p id="camera-resolution-note" class="camera-settings-note">Checking camera resolution…</p>'+
   '<label class="field-label" for="camera-code-format">BARCODE TYPE</label>'+
   '<select id="camera-code-format" class="input"><option value="qr" '+(saved.codeFormat==='qr'?'selected':'')+'>QR codes only</option><option value="dm" '+(saved.codeFormat==='dm'?'selected':'')+'>Data Matrix only — faster for existing pots</option><option value="qr-dm" '+(saved.codeFormat==='qr-dm'?'selected':'')+'>QR + Data Matrix — compatible with both</option></select>'+
   '<p class="camera-settings-note">Data Matrix only checks one barcode format in the central area. Centre the code to scan; use QR + Data Matrix for mixed labels.</p>'+
   '<label class="field-label" for="camera-decoder-engine">DATA MATRIX DECODER</label>'+
   '<select id="camera-decoder-engine" class="input">'+
    '<option value="js" '+(saved.engine==='js'?'selected':'')+'>Original ZXing (current)</option>'+
    '<option value="wasm" '+(saved.engine==='wasm'?'selected':'')+'>ZXing-C++ Fast (experimental)</option></select>'+
   '<p class="camera-settings-note">Fast Data Matrix decoding is the default. If unavailable, the original decoder resumes automatically. It only applies to Data Matrix-only mode; first use may download approximately 1 MB.</p>'+
   '<p id="camera-fast-status" class="camera-settings-note"></p>'+
   '<div class="camera-settings-status" id="camera-settings-status" role="status" aria-live="polite">Preparing camera…</div>'+
   '<div class="camera-settings-cleanup"><div class="field-label">TESTING DATA</div>'+
    '<p class="camera-settings-note">Clear this device’s test sampling session, including linked sample IDs and scanned box numbers. Camera, zoom and barcode settings will be kept.</p>'+
    '<button type="button" class="btn outline danger wide" data-action="clear-test-data">CLEAR TEST DATA</button></div>'+
   '<div class="buttons"><button type="button" class="btn outline" data-action="camera-reset">DEFAULTS</button><button type="button" class="btn secondary" data-action="camera-settings-done">DONE</button></div>'+
   '</div>';
 }
 function status(msg){const e=$('#camera-settings-status');if(e)e.textContent=msg;}
 function cameraConstraint(){return saved.deviceId==='auto'?{facingMode:'environment'}:saved.deviceId;}
 function formats(){
  const qr=Html5QrcodeSupportedFormats.QR_CODE;
  const matrix=Html5QrcodeSupportedFormats.DATA_MATRIX;
  if(saved.codeFormat==='dm'){
   if(matrix===undefined)throw Error('Data Matrix decoding is not available in this QR library.');
   return [matrix];
  }
  return saved.codeFormat==='qr-dm'&&matrix!==undefined?[qr,matrix]:[qr];
 }
 // Only the Data Matrix-only mode uses a centred crop and single-format
 // decoder. Keep the exact known-working QR and mixed-mode scan settings.
 function scanConfig(){
  if(saved.codeFormat!=='dm')return {fps:10};
  const small=saved.mode==='small';
  return {
   fps:small?10:12,
   disableFlip:true,
   qrbox:(width,height)=>{
    const side=Math.floor(Math.min(width,height)*(small?0.60:0.76));
    const w=Math.max(1,Math.min(side,Math.floor(width-1)));
    const h=Math.max(1,Math.min(side,Math.floor(height-1)));
    return {width:w,height:h};
   }
  };
 }
 function fastMatrixSelected(){return saved.codeFormat==='dm'&&saved.engine==='wasm';}
 function cropFraction(){return saved.mode==='small'?0.60:0.74;}
 async function chooseMode(next){
  if(!['auto','small','manual'].includes(next))return;
  if(saved.mode===next)return;
  saved.mode=next;save();updateModeNote();
  status('Scanning mode saved. Restarting the camera preview with the selected settings…');
  if(modal==='camera-settings'){
   zoomRange=null;
   await stopCamera();
   if(modal==='camera-settings')startCamera();
  }
 }
 function chooseEngine(next){
  saved.engine=next==='wasm'?'wasm':'js';
  save();
  status(saved.engine==='wasm'
   ?'Fast Data Matrix decoder selected. Press DONE, then reopen scanning to try it.'
   :'Original decoder selected. Press DONE, then reopen scanning.');
 }
 function chooseFormat(next){
  saved.codeFormat=['qr','qr-dm','dm'].includes(next)?next:defaults.codeFormat;save();
  const message=saved.codeFormat==='dm'
   ?'Data Matrix only: '+(saved.mode==='small'?'small-code':'standard')+' central scan area. Centre the code and hold steady.'
   :saved.codeFormat==='qr-dm'
   ?'QR and Data Matrix enabled. Combined scanning can be slower than Data Matrix only.'
   :'QR-only scanning selected.';
  status(message);
 }
 function getTrack(){
  const vid=modal==='camera-settings'?$('#settings-reader video'):getScannerVideo();
  return vid?.srcObject?.getVideoTracks?.()[0]||null;
 }
 function capabilities(instance=scanner){
  // Some iPhones expose an empty scanner capability object; use live track too.
  let scannerCaps={},trackCaps={};
  try{scannerCaps=instance?.getRunningTrackCapabilities?.()||{}}catch{}
  try{trackCaps=getTrack()?.getCapabilities?.()||{}}catch{}
  return {...scannerCaps,...trackCaps};
 }
 function trackSettings(instance=scanner){
  let scannerSettings={},videoSettings={};
  try{scannerSettings=instance?.getRunningTrackSettings?.()||{}}catch{}
  try{videoSettings=getTrack()?.getSettings?.()||{}}catch{}
  return {...scannerSettings,...videoSettings};
 }
 function supportedZoom(instance=scanner){
  const cap=capabilities(instance).zoom;
  return cap&&Number.isFinite(Number(cap.min))&&Number.isFinite(Number(cap.max))&&Number(cap.max)>Number(cap.min)?{min:Number(cap.min),max:Number(cap.max),step:Number(cap.step)>0?Number(cap.step):0.1}:null;
 }
 function capDevices(cams){
  // Keep only obvious rear devices when labels exist; don't falsely present a
  // front-facing camera as a telephoto. Unknown labels are retained when no
  // explicit rear list is available.
  const back=cams.filter(x=>/back|rear|environment|wide|ultra|telephoto|dual|triple/i.test(x.label||'')&&!/front|user|facetime/i.test(x.label||''));
  return back.length?back:cams.filter(x=>!/front|user|facetime/i.test(x.label||'')); 
 }
 async function listCameras(){
  if(modal!=='camera-settings')return;
  const select=$('#camera-device');
  if(!select)return;
  try{
   // Reading the already granted camera list does NOT acquire another
   // MediaStream, unlike the Html5Qrcode.getCameras() helper.
   const all=await navigator.mediaDevices.enumerateDevices();
   if(modal!=='camera-settings'||!select.isConnected)return;
   const cameras=(all||[]).filter(x=>x.kind==='videoinput'&&x.deviceId)
    .map(x=>({id:x.deviceId,label:x.label||''}));
   devices=capDevices(cameras);
   const activeId=trackSettings(scanner).deviceId||'';
   if(activeId&&!devices.some(x=>x.id===activeId)){
    devices.unshift({id:activeId,label:cameras.find(x=>x.id===activeId)?.label||'Currently active rear camera'});
   }
   const known=new Set();
   devices=devices.filter(x=>x.id&&!known.has(x.id)&&!!known.add(x.id));
   const available=devices.some(x=>x.id===saved.deviceId);
   const list=['<option value="auto">Rear camera — automatic</option>',
    ...devices.map((x,i)=>'<option value="'+safe(x.id)+'">'+safe(x.label||'Camera '+(i+1))+'</option>')];
   // Do not pretend a remembered camera wasn't chosen if Safari has
   // temporarily hidden its ID. Preserve the selection and explain.
   if(saved.deviceId!=='auto'&&!available){
    list.push('<option value="'+safe(saved.deviceId)+'">Previously selected camera (not currently listed)</option>');
   }
   select.innerHTML=list.join('');
   select.value=saved.deviceId;
   const note=$('#camera-device-note');
   if(note)note.textContent=devices.length>1
    ?'Your browser lists '+devices.length+' selectable cameras. The names come from your device.'
    :devices.length===1
    ?'Your browser exposes one rear camera; it may combine several physical lenses.'
    :'Your browser does not expose separate rear-camera choices.';
   if(saved.deviceId!=='auto'&&!available&&note)note.textContent+=' Saved camera is not in the current list; select Auto or another camera if it cannot start.';
  }catch(error){
   const note=$('#camera-device-note');
   if(note)note.textContent='Camera list unavailable: '+String(error?.message||error)+'. The saved camera and automatic selection remain available.';
  }
 }
 function reportResolution(instance=scanner){
  if(modal!=='camera-settings')return;
  const note=$('#camera-resolution-note');if(!note)return;
  const setting=trackSettings(instance);
  const w=Number(setting.width)||getTrack()?.getSettings?.().width||0;
  const h=Number(setting.height)||getTrack()?.getSettings?.().height||0;
  note.textContent=(w&&h?'Camera feed: '+w+' × '+h+'. ':'Camera feed resolution unavailable. ')+
   (saved.mode==='small'?'Higher resolution requested where supported.':'Resolution selected by the browser.');
 }
 async function applySmallCodeResolution(instance=scanner){
  if(saved.mode!=='small'||instance!==scanner||cameraState!=='live')return;
  const track=getTrack();
  if(!track?.applyConstraints)return;
  try{
   const supported=navigator.mediaDevices?.getSupportedConstraints?.()||{};
   if(supported.width===false&&supported.height===false)return;
   const current=track.getConstraints?.()||{};
   const preference={...current};
   if(supported.width!==false)preference.width={ideal:1920};
   if(supported.height!==false)preference.height={ideal:1080};
   await track.applyConstraints(preference);
  }catch(error){
   if(modal==='camera-settings')status('Using the available camera resolution; higher-resolution preference was rejected.');
  }
 }
 function updateBoxZoomUI(instance=scanner){
  const slider=$('#box-zoom'),label=$('#box-zoom-value'),note=$('#box-zoom-note');
  if(!slider||!note)return;
  const range=instance&&cameraState==='live'?supportedZoom(instance):null;
  if(!range){
   slider.disabled=true;
   for(const button of $('[data-action="box-zoom-preset"]'))button.disabled=true;
   if(label)label.textContent=fmt(saved.boxZoom);
   note.textContent=instance?'Hardware zoom is not available on this camera/browser.':'Zoom becomes available when the camera starts.';
   return;
  }
  slider.disabled=false;slider.min=String(range.min);slider.max=String(range.max);slider.step=String(range.step);
  const setting=Number(trackSettings(instance).zoom);
  const value=Number.isFinite(setting)&&setting>0?setting:Math.max(range.min,Math.min(range.max,saved.boxZoom));
  slider.value=String(value);
  if(label)label.textContent=fmt(value);
  for(const button of $('[data-action="box-zoom-preset"]')){
   const z=Number(button.dataset.zoom);
   button.disabled=z<range.min||z>range.max;
  }
  note.textContent='Box zoom is saved separately from pot zoom. Available: '+fmt(range.min)+'–'+fmt(range.max)+'.';
 }
 function updateZoomUI(instance=scanner){
  const range=supportedZoom(instance),slider=$('#camera-zoom'),valueEl=$('#camera-zoom-value'),note=$('#camera-zoom-note');
  const chosenZoom=storedZoom(zoomPreviewTarget);
  zoomRange=range;
  if(!slider||!note)return;
  if(!range){
   slider.disabled=true;
   for(const b of $$('[data-action="camera-zoom-preset"]'))b.disabled=true;
   if(valueEl)valueEl.textContent='Unavailable';
   note.textContent='This browser/camera does not expose hardware zoom to websites. Select another rear camera above if available. No visual-only zoom is substituted.';
   return;
  }
  slider.disabled=false;slider.min=String(range.min);slider.max=String(range.max);slider.step=String(range.step);
  const actual=Number(trackSettings(instance).zoom);
  const shown=Number.isFinite(actual)&&actual>0?actual:Math.max(range.min,Math.min(range.max,chosenZoom));
  slider.value=String(shown);
  if(valueEl)valueEl.textContent=fmt(shown);
  for(const button of $$('[data-action="camera-zoom-preset"]')){
   const z=Number(button.dataset.zoom);
   button.disabled=z<range.min||z>range.max;
  }
  note.textContent=(zoomPreviewTarget==='boxes'?'Sample boxes':'Sample pots')+' zoom range: '+fmt(range.min)+'–'+fmt(range.max)+'. Saved: '+fmt(chosenZoom)+'. Camera reports: '+(Number.isFinite(actual)&&actual>0?fmt(actual):'unavailable')+'.';
 }
 async function setContinuousFocus(instance=scanner){
  if(!instance||!cameraState||cameraState!=='live')return;
  const cap=capabilities(instance),note=$('#camera-focus-note');
  if(Array.isArray(cap.focusMode)&&cap.focusMode.includes('continuous')){
   try{
    await instance.applyVideoConstraints({advanced:[{focusMode:'continuous'}]});
    if(note&&modal==='camera-settings')note.textContent='Continuous autofocus requested. Keep the QR code steady within the centre guide.';
   }catch(e){if(note&&modal==='camera-settings')note.textContent='Automatic focus is managed by the browser (manual focus control was rejected).';}
  }else if(note&&modal==='camera-settings')note.textContent='Autofocus is managed by the device; this browser has not exposed a manual focus control.';
 }
 async function applyActualZoom(target,instance=scanner,{persist=true,kind=activeZoomTarget()}={}){
  if(!instance||cameraState!=='live')return false;
  const range=supportedZoom(instance);
  if(!range)return false;
  const value=Math.min(range.max,Math.max(range.min,Number(target)));
  if(!Number.isFinite(value))return false;
  // Use the existing camera track, not a second getUserMedia stream.
  const constraint={advanced:[{zoom:value}]};
  const track=getTrack();
  let firstError=null;
  try{await instance.applyVideoConstraints(constraint)}
  catch(error){firstError=error;}
  let actual=Number(trackSettings(instance).zoom);
  if((firstError||!Number.isFinite(actual)||actual<=0||Math.abs(actual-value)>0.12)&&track?.applyConstraints){
   try{await track.applyConstraints(constraint);firstError=null;}
   catch(error){if(firstError)throw firstError;throw error;}
   actual=Number(trackSettings(instance).zoom);
  }else if(firstError)throw firstError;
  const displayed=Number.isFinite(actual)&&actual>0?actual:value;
  if(persist)setStoredZoom(kind,value);
  if(modal==='camera-settings'&&zoomPreviewTarget===kind){
   const slider=$('#camera-zoom'),label=$('#camera-zoom-value');
   if(slider)slider.value=String(displayed);
   if(label)label.textContent=fmt(displayed);
   status('Requested '+fmt(value)+' zoom; camera reports '+(Number.isFinite(actual)&&actual>0?fmt(actual):'no readable zoom setting')+'.');
  }else if(page==='boxes'&&modal!== 'camera-settings'&&kind==='boxes'){
   const slider=$('#box-zoom'),label=$('#box-zoom-value');
   if(slider)slider.value=String(displayed);
   if(label)label.textContent=fmt(displayed);
  }
  return true;
 }
 async function processZoomChanges(){
  if(zoomBusy)return;
  zoomBusy=true;
  try{
   while(zoomRequested!==null){
    const request=zoomRequested;zoomRequested=null;
    const instance=scanner;
    if(!instance||cameraState!=='live')break;
    if(request.kind!==activeZoomTarget())continue;
    try{await applyActualZoom(request.value,instance,{kind:request.kind})}catch(e){if(modal==='camera-settings')status('Camera rejected zoom change: '+String(e?.message||e));}
   }
  }finally{zoomBusy=false}
 }
 // Make the settings preview and subsequent scans use the same browser-exposed
 // rear camera when possible. Auto-facingMode can pick a different lens each time.
 function rememberPreviewCamera(){
  if(saved.deviceId!=='auto'||modal!=='camera-settings')return;
  const id=trackSettings(scanner).deviceId;
  if(!id||!devices.some(d=>d.id===id))return;
  saved.deviceId=id;
  const selector=$('#camera-device');if(selector)selector.value=id;
  const note=$('#camera-device-note');
  if(note)note.textContent='This rear camera is selected for subsequent scans, so the saved zoom is applied to the same camera.';
 }
 function clearZoomWatch(){
  for(const timer of zoomWatchTimers)clearTimeout(timer);
  zoomWatchTimers=[];
  lastZoomRepair=0;
 }
 // iPhone Safari may readjust its camera after the scanner has become live.
 // Recheck actual MediaStreamTrack zoom; apply the preference again if it drifts.
 async function maintainZoom(instance,{force=false}={}){
  if(instance!==scanner||cameraState!=='live'||storedZoom(activeZoomTarget())<=1.05||zoomBusy||zoomWatchBusy)return;
  const range=supportedZoom(instance);
  if(!range)return;
  const target=Math.min(range.max,Math.max(range.min,storedZoom(activeZoomTarget())));
  const observed=Number(trackSettings(instance).zoom);
  const readable=Number.isFinite(observed)&&observed>0;
  const drift=readable&&Math.abs(observed-target)>0.09;
  if(!force&&!drift)return;
  if(Date.now()-lastZoomRepair<550)return;
  lastZoomRepair=Date.now();
  zoomWatchBusy=true;
  try{
   await applyActualZoom(target,instance,{persist:false});
  }catch(err){
   if(modal==='camera-settings')status('Camera zoom could not be held: '+String(err?.message||err));
  }finally{zoomWatchBusy=false}
  updateZoomBadge(instance);
 }
 function updateZoomBadge(instance){
  if(instance!==scanner||cameraState!=='live')return;
  const badge=$('#camera-badge');
  if(!badge)return;
  const actual=Number(trackSettings(instance).zoom);
  if(storedZoom(activeZoomTarget())>1.05&&Number.isFinite(actual)&&actual>0)badge.textContent='CAMERA ON · '+fmt(actual);
 }
 function watchZoom(instance){
  clearZoomWatch();
  if(storedZoom(activeZoomTarget())<=1.05)return;
  // Apply after Safari's initial autofocus/lens handoff, not only at start().
  for(const delay of [800,1850,3250]){
   zoomWatchTimers.push(setTimeout(()=>maintainZoom(instance,{force:true}),delay));
  }
 }
 function monitor(instance){
  if(instance!==scanner||cameraState!=='live')return;
  updateZoomBadge(instance);
  void maintainZoom(instance);
 }
 function onStopped(){clearZoomWatch();zoomRange=null;zoomRequested=null;}
 function setZoom(value,kind=activeZoomTarget()){
  const requested=Number(value);
  const range=zoomRange||supportedZoom(scanner);
  if(!Number.isFinite(requested)||!range||kind!==activeZoomTarget())return;
  const z=Math.max(range.min,Math.min(range.max,requested));
  const slider=kind==='boxes'&&modal!=='camera-settings'?'#box-zoom':'#camera-zoom';
  const label=kind==='boxes'&&modal!=='camera-settings'?'#box-zoom-value':'#camera-zoom-value';
  const valueEl=$(label),control=$(slider);
  if(valueEl)valueEl.textContent=fmt(z);
  if(control)control.value=String(z);
  // Save immediately, even if the user navigates away before the hardware changes.
  setStoredZoom(kind,z);
  if(z>1.05&&modal==='camera-settings')rememberPreviewCamera();
  zoomRequested={value:z,kind};
  void processZoomChanges();
  if(scanner&&cameraState==='live')watchZoom(scanner);
 }
 async function selectZoomTarget(target){
  if(modal!=='camera-settings'||!['pots','boxes'].includes(target))return;
  zoomPreviewTarget=target;
  zoomRequested=null;
  const selected=$('#camera-zoom-target');if(selected)selected.value=target;
  const label=$('#camera-zoom-value');if(label)label.textContent=fmt(storedZoom(target));
  if(scanner&&cameraState==='live'){
   const range=supportedZoom(scanner);
   if(range){
    try{await applyActualZoom(storedZoom(target),scanner,{persist:false,kind:target})}
    catch(err){status('Unable to apply '+target+' zoom: '+String(err?.message||err));}
   }
   updateZoomUI(scanner);
   watchZoom(scanner);
  }
 }
 async function chooseCamera(cameraId){
  if(modal!=='camera-settings')return;
  saved.deviceId=cameraId==='auto'||devices.some(x=>x.id===cameraId)?cameraId:'auto';
  // Changing lens must not wipe the user's zoom preference. The next
  // camera session clamps the requested zoom to that lens's capabilities.
  save();zoomRange=null;
  status('Switching camera…');const z=$('#camera-zoom');if(z)z.disabled=true;
  await stopCamera();
  if(modal==='camera-settings')startCamera();
 }
 async function onStarted(instance){
  if(!instance||cameraState!=='live')return;
  if(modal==='camera-settings'){
   const select=$('#camera-code-format');if(select)select.value=saved.codeFormat;
   const decoderSelect=$('#camera-decoder-engine');if(decoderSelect)decoderSelect.value=saved.engine;
   const modeSelect=$('#camera-scan-mode');if(modeSelect)modeSelect.value=saved.mode;
   updateModeNote();
   status('Camera live. Checking lens and zoom controls…');
   const loading=$('#camera-settings-loading');if(loading)loading.hidden=true;
   await listCameras();
  }
  if(scanner!==instance||cameraState!=='live')return;
  await applySmallCodeResolution(instance);
  if(scanner!==instance||cameraState!=='live')return;
  reportResolution(instance);
  await setContinuousFocus(instance);
  if(scanner!==instance||cameraState!=='live')return;
  const range=supportedZoom(instance);
  zoomRange=range;
  if(range){
   const requested=Math.max(range.min,Math.min(range.max,storedZoom(activeZoomTarget())));
   const setting=Number(trackSettings(instance).zoom);
   if(Math.abs(requested-(Number.isFinite(setting)?setting:1))>0.03){
    try{await applyActualZoom(requested,instance,{persist:false})}
    catch(e){if(modal==='camera-settings')status('Zoom could not be restored: '+String(e?.message||e))}
   }
  }
  watchZoom(instance);
  if(page==='boxes'&&modal!=='camera-settings')updateBoxZoomUI(instance);
  if(modal==='camera-settings'){
   updateZoomUI(instance);
   if(!range)status('Camera live. Zoom is not exposed on this camera/browser; try selecting another rear camera.');
   else status('Camera live. Zoom range '+fmt(range.min)+'–'+fmt(range.max)+'.');
  }
 }
 function start(){
  if(modal!=='camera-settings')return;
  zoomRange=null;
  startCamera();
 }
 function reset(){
  if(modal!=='camera-settings')return;
  saved={...defaults};save();zoomRange=null;clearZoomWatch();
  status('Restoring automatic Data Matrix scanning with the fast decoder and 1× zoom…');
  stopCamera().then(()=>{if(modal==='camera-settings')startCamera()});
 }
 function noteError(err){
  if(modal==='camera-settings')status('Camera could not start: '+String(err?.message||err)+'. Try Defaults or allow camera access.');
 }
 return {html,cameraConstraint,formats,scanConfig,chooseFormat,fastMatrixSelected,cropFraction,chooseEngine,chooseMode,onStarted,onStopped,monitor,start,chooseCamera,setZoom,selectZoomTarget,boxZoom:()=>saved.boxZoom,reset,noteError,capabilities,trackSettings};
})();
