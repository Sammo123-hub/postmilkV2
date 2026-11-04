/* Camera settings for Post-Milking Sampling.
 * Zoom is applied to the ACTUAL running video track via html5-qrcode, not CSS.
 * Device/lens choices are the cameras the mobile browser exposes. No optical
 * lens or focus capability is invented when the browser doesn't provide it.
 */
'use strict';
const CameraSettings=(()=>{
 const KEY='postmilk-camera-preferences-v1';
 const defaults={deviceId:'auto',zoom:1,codeFormat:'qr'};
 let saved={...defaults};
 try{
  const value=JSON.parse(localStorage.getItem(KEY)||'null');
  if(value&&typeof value==='object'){
   saved.deviceId=typeof value.deviceId==='string'?value.deviceId:'auto';
   saved.codeFormat=['qr','qr-dm','dm'].includes(value.codeFormat)?value.codeFormat:'qr';
   const z=Number(value.zoom);saved.zoom=Number.isFinite(z)&&z>=.5&&z<=10?z:1;
  }
 }catch{}
 let zoomRange=null,zoomRequested=null,zoomBusy=false,devices=[],zoomWatchBusy=false,zoomWatchTimers=[],lastZoomRepair=0;
 const round=n=>Math.round(Number(n)*100)/100;
 const fmt=n=>round(n).toFixed(round(n)%1===0?0:2)+'×';
 function save(){try{localStorage.setItem(KEY,JSON.stringify(saved))}catch{}}
 function html(){
  return '<div class="camera-settings">'+
   '<h2>CAMERA SETTINGS</h2>'+
   '<p class="camera-settings-tip">Choose the rear camera and adjust the real camera zoom to keep one milk pot in frame. The scan uses the same image as the preview.</p>'+
   '<div class="camera-settings-preview"><div id="settings-reader"></div><div class="camera-settings-overlay"><span>CAMERA PREVIEW</span><div class="camera-settings-target"></div></div><div class="camera-settings-loading" id="camera-settings-loading">Starting rear camera…</div></div>'+
   '<label class="field-label" for="camera-device">REAR CAMERA / LENS</label>'+
   '<select id="camera-device" class="input"><option value="auto">Rear camera — automatic</option></select>'+
   '<p id="camera-device-note" class="camera-settings-note">Available lenses will appear after camera permission is granted.</p>'+
   '<div class="camera-zoom-heading"><label class="field-label" for="camera-zoom">CAMERA ZOOM</label><strong id="camera-zoom-value">1×</strong></div>'+
   '<input type="range" id="camera-zoom" min="1" max="2" step="0.1" value="1" disabled aria-label="Camera zoom">'+
   '<div class="camera-zoom-buttons"><button type="button" data-action="camera-zoom-preset" data-zoom="1" disabled>1×</button><button type="button" data-action="camera-zoom-preset" data-zoom="2" disabled>2×</button></div>'+
   '<p id="camera-zoom-note" class="camera-settings-note">Checking whether Safari exposes hardware zoom…</p>'+
   '<p id="camera-focus-note" class="camera-settings-note">Autofocus is controlled by the camera unless the browser exposes focus controls.</p>'+
   '<label class="field-label" for="camera-code-format">BARCODE TYPE</label>'+
   '<select id="camera-code-format" class="input"><option value="qr">QR codes only</option><option value="dm">Data Matrix only — faster for existing pots</option><option value="qr-dm">QR + Data Matrix — compatible with both</option></select>'+
   '<p class="camera-settings-note">Data Matrix only checks one format and scans the central area for one pot. Keep the code near the centre. Use QR + Data Matrix if your samples have both types.</p>'+
   '<div class="camera-settings-status" id="camera-settings-status" role="status" aria-live="polite">Preparing camera…</div>'+
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
  return {
   fps:12,
   disableFlip:true,
   qrbox:(width,height)=>{
    const side=Math.floor(Math.min(width,height)*0.76);
    const w=Math.max(1,Math.min(side,Math.floor(width-1)));
    const h=Math.max(1,Math.min(side,Math.floor(height-1)));
    return {width:w,height:h};
   }
  };
 }
 function chooseFormat(next){
  saved.codeFormat=['qr','qr-dm','dm'].includes(next)?next:'qr';save();
  const message=saved.codeFormat==='dm'
   ?'Data Matrix only: 12 scan attempts/second, centred scan area, no mirrored-code pass. Keep one pot centred.'
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
  try{return instance?.getRunningTrackCapabilities?.()||getTrack()?.getCapabilities?.()||{}}catch{return getTrack()?.getCapabilities?.()||{}}
 }
 function trackSettings(instance=scanner){
  try{return instance?.getRunningTrackSettings?.()||getTrack()?.getSettings?.()||{}}catch{return getTrack()?.getSettings?.()||{}}
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
  const select=$('#camera-device');if(!select)return;
  try{
   const cams=typeof Html5Qrcode?.getCameras==='function'
    ?await Html5Qrcode.getCameras()
    :(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='videoinput').map(x=>({id:x.deviceId,label:x.label}));
   devices=capDevices((cams||[]).filter(x=>x.id));
   if(modal!=='camera-settings')return;
   const valid=devices.some(x=>x.id===saved.deviceId);
   if(saved.deviceId!=='auto'&&!valid)status('Previously selected lens is not currently exposed. Choose Rear camera — automatic.');
   const options=['<option value="auto">Rear camera — automatic</option>',...devices.map((x,i)=>
    '<option value="'+safe(x.id)+'">'+safe(x.label||'Camera '+(i+1))+'</option>'
   )];
   select.innerHTML=options.join('');
   select.value=valid?saved.deviceId:'auto';
   const note=$('#camera-device-note');
   if(note)note.textContent=devices.length>1
    ?devices.length+' selectable cameras reported by this browser. A second physical lens may appear separately.'
    :devices.length===1?'Safari reports one selectable camera. Additional physical lenses may not be individually exposed.'
     :'Safari has not exposed separate camera/lens choices.';
  }catch(e){const note=$('#camera-device-note');if(note)note.textContent='Cannot list additional cameras: '+String(e?.message||e);}
 }
 function updateZoomUI(instance=scanner){
  const range=supportedZoom(instance),slider=$('#camera-zoom'),valueEl=$('#camera-zoom-value'),note=$('#camera-zoom-note');
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
  const shown=Number.isFinite(actual)&&actual>0?actual:Math.max(range.min,Math.min(range.max,saved.zoom));
  slider.value=String(shown);
  if(valueEl)valueEl.textContent=fmt(shown);
  for(const button of $$('[data-action="camera-zoom-preset"]')){
   const z=Number(button.dataset.zoom);
   button.disabled=z<range.min||z>range.max;
  }
  note.textContent='Hardware zoom range: '+fmt(range.min)+'–'+fmt(range.max)+'. Actual scan frames use this camera setting.';
 }
 async function setContinuousFocus(instance=scanner){
  if(!instance||!cameraState||cameraState!=='live')return;
  const cap=capabilities(instance),note=$('#camera-focus-note');
  if(Array.isArray(cap.focusMode)&&cap.focusMode.includes('continuous')){
   try{
    await instance.applyVideoConstraints({advanced:[{focusMode:'continuous'}]});
    if(note&&modal==='camera-settings')note.textContent='Continuous autofocus requested. Keep the QR code steady within the centre guide.';
   }catch(e){if(note&&modal==='camera-settings')note.textContent='Automatic focus is managed by the browser (manual focus control was rejected).';}
  }else if(note&&modal==='camera-settings')note.textContent='Autofocus is managed by iOS; Safari has not exposed a manual focus control.';
 }
 async function applyActualZoom(target,instance=scanner,{persist=true}={}){
  if(!instance||cameraState!=='live')return false;
  const range=supportedZoom(instance);
  if(!range)return false;
  const value=Math.min(range.max,Math.max(range.min,Number(target)));
  if(!Number.isFinite(value))return false;
  // Apply constraints directly to the camera used by html5-qrcode.
  await instance.applyVideoConstraints({advanced:[{zoom:value}]});
  const actual=Number(trackSettings(instance).zoom);
  const displayed=Number.isFinite(actual)&&actual>0?actual:value;
  if(persist){saved.zoom=value;save();}
  if(modal==='camera-settings'){
   const slider=$('#camera-zoom'),label=$('#camera-zoom-value');
   if(slider)slider.value=String(displayed);
   if(label)label.textContent=fmt(displayed);
   status('Requested '+fmt(value)+' zoom; camera reports '+(Number.isFinite(actual)&&actual>0?fmt(actual):'no readable zoom setting')+'.');
  }
  return true;
 }
 async function processZoomChanges(){
  if(zoomBusy)return;
  zoomBusy=true;
  try{
   while(zoomRequested!==null){
    const target=zoomRequested;zoomRequested=null;
    const instance=scanner;
    if(!instance||cameraState!=='live')break;
    try{await applyActualZoom(target,instance)}catch(e){if(modal==='camera-settings')status('Camera rejected zoom change: '+String(e?.message||e));}
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
  if(instance!==scanner||cameraState!=='live'||saved.zoom<=1.05||zoomBusy||zoomWatchBusy)return;
  const range=supportedZoom(instance);
  if(!range)return;
  const target=Math.min(range.max,Math.max(range.min,saved.zoom));
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
  if(saved.zoom>1.05&&Number.isFinite(actual)&&actual>0)badge.textContent='CAMERA ON · '+fmt(actual);
 }
 function watchZoom(instance){
  clearZoomWatch();
  if(saved.zoom<=1.05)return;
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
 function onStopped(){clearZoomWatch();}
 function setZoom(value){
  const requested=Number(value);
  if(!Number.isFinite(requested)||!zoomRange)return;
  const z=Math.max(zoomRange.min,Math.min(zoomRange.max,requested));
  const label=$('#camera-zoom-value'),slider=$('#camera-zoom');
  if(label)label.textContent=fmt(z);
  if(slider)slider.value=String(z);
  // Save before awaiting applyVideoConstraints: navigating away immediately
  // after tapping 2× previously left the saved preference at 1×.
  saved.zoom=z;
  if(z>1.05)rememberPreviewCamera();
  save();
  zoomRequested=z;
  void processZoomChanges();
  // Also guard the live Settings preview against Safari resetting magnification.
  if(scanner&&cameraState==='live')watchZoom(scanner);
 }
 async function chooseCamera(cameraId){
  if(modal!=='camera-settings')return;
  saved.deviceId=cameraId==='auto'||devices.some(x=>x.id===cameraId)?cameraId:'auto';
  saved.zoom=1;save();zoomRange=null;
  status('Switching camera…');const z=$('#camera-zoom');if(z)z.disabled=true;
  await stopCamera();
  if(modal==='camera-settings')startCamera();
 }
 async function onStarted(instance){
  if(!instance||cameraState!=='live')return;
  if(modal==='camera-settings'){
   const select=$('#camera-code-format');if(select)select.value=saved.codeFormat;
   status('Camera live. Checking lens and zoom controls…');
   const loading=$('#camera-settings-loading');if(loading)loading.hidden=true;
   await listCameras();
  }
  if(scanner!==instance||cameraState!=='live')return;
  await setContinuousFocus(instance);
  if(scanner!==instance||cameraState!=='live')return;
  const range=supportedZoom(instance);
  if(range){
   const requested=Math.max(range.min,Math.min(range.max,saved.zoom));
   const setting=Number(trackSettings(instance).zoom);
   if(Math.abs(requested-(Number.isFinite(setting)?setting:1))>0.03){
    try{await applyActualZoom(requested,instance,{persist:false})}
    catch(e){if(modal==='camera-settings')status('Zoom could not be restored: '+String(e?.message||e))}
   }
  }
  watchZoom(instance);
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
  status('Restoring default rear camera and 1× zoom…');
  stopCamera().then(()=>{if(modal==='camera-settings')startCamera()});
 }
 function noteError(err){
  if(modal==='camera-settings')status('Camera could not start: '+String(err?.message||err)+'. Try Defaults or allow camera access.');
 }
 return {html,cameraConstraint,formats,scanConfig,chooseFormat,onStarted,onStopped,monitor,start,chooseCamera,setZoom,reset,noteError,capabilities,trackSettings};
})();
