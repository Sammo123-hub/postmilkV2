/* Optional fast Data Matrix decoder: ZXing-C++ WebAssembly, not a second camera.
 * Existing Html5Qrcode owns the camera/zoom. We pause its JS decoder only
 * after the WASM decoder is ready and automatically resume it on failure.
 * Library: zxing-wasm 3.1.6 (pinned), MIT license.
 */
'use strict';
const FastMatrix=(()=>{
 const CDN='https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.6/dist/iife/reader/index.js';
 let loader=null, session=null, token=0, cycle=null;
 let firstLoadStatus='';
 function enabled(){return CameraSettings.fastMatrixSelected();}
 function active(){return !!session;}
 function stop(){
  token++;
  if(cycle!==null)clearTimeout(cycle);
  cycle=null;session=null;
 }
 function ensureLoaded(){
  if(typeof window.ZXingWASM?.readBarcodes==='function')return Promise.resolve(window.ZXingWASM);
  if(loader)return loader;
  loader=new Promise((resolve,reject)=>{
   const el=document.createElement('script');el.src=CDN;el.async=true;
   el.onload=()=>window.ZXingWASM?.readBarcodes?resolve(window.ZXingWASM):reject(Error('Fast decoder missing after load'));
   el.onerror=()=>reject(Error('Fast decoder could not be downloaded'));
   document.head.appendChild(el);
  }).then(async api=>{
   if(typeof api.prepareZXingModule==='function'){
    await api.prepareZXingModule({fireImmediately:true});
   }
   return api;
  }).catch(err=>{loader=null;throw err});
  return loader;
 }
 function hideLibraryPausedLabel(reader){
  // Html5Qrcode.pause(false) keeps the video running but displays its own
  // "Scanning Paused" label. Hide only that exact overlay; retain all camera UI.
  const kids=Array.from(reader?.children||[]);
  for(const node of kids){
   if((node.innerText||'').trim().toLowerCase().includes('scanning paused')||
      (node.tagName==='DIV'&&String(node.style.background||'').includes('9, 9, 9, 0.46'))){
    node.style.setProperty('display','none','important');
   }
  }
 }
 function report(message){
  firstLoadStatus=message;
  const s=$('#camera-fast-status');
  if(s)s.textContent=message;
 }
 function fallback(instance,message,reader,current){
  if(!current())return;
  stop();
  try{instance.resume();}catch{}
  report('Fast decoder unavailable; using the existing Data Matrix decoder. '+String(message||''));
  if(typeof toast==='function')toast('Fast decoder unavailable — original Data Matrix scanner restored.');
  if(reader)reader.classList.remove('fast-matrix-active');
 }
 async function attach(instance,reader,current,onDecoded){
  if(!enabled()||!instance||!reader||!current())return false;
  stop(); // cancel any earlier attempts from another camera
  const thisToken=token;
  try{
   const engine=await ensureLoaded();
   if(thisToken!==token||!current())return false;
   const video=reader.querySelector('video');
   if(!video)throw Error('Camera video not ready');
   const canvas=document.createElement('canvas');
   const context=canvas.getContext('2d',{willReadFrequently:true});
   if(!context)throw Error('Camera frame cannot be read');
   // The active Html5Qrcode decoder is paused, not the live camera feed.
   instance.pause(false);
   reader.classList.add('fast-matrix-active');
   hideLibraryPausedLabel(reader);
   session={instance,reader,video,canvas,context,engine,onDecoded,current,attempts:0};
   report('Fast Data Matrix decoder active.');
   cycle=setTimeout(()=>scanFrame(thisToken),0);
   return true;
  }catch(error){
   if(thisToken===token)fallback(instance,error?.message||error,reader,current);
   return false;
  }
 }
 async function scanFrame(thisToken){
  if(thisToken!==token||!session)return;
  const sess=session;
  if(!sess.current()||!sess.video.isConnected||sess.video.readyState<2){
   if(sess.current()){cycle=setTimeout(()=>scanFrame(thisToken),160);}
   return;
  }
  const {video,context,canvas,engine}=sess;
  try{
   const width=video.videoWidth,height=video.videoHeight;
   if(width>0&&height>0){
    const side=Math.floor(Math.min(width,height)*CameraSettings.cropFraction());
    const sx=Math.floor((width-side)/2),sy=Math.floor((height-side)/2);
    if(canvas.width!==side)canvas.width=side;
    if(canvas.height!==side)canvas.height=side;
    context.drawImage(video,sx,sy,side,side,0,0,side,side);
    const data=context.getImageData(0,0,side,side);
    const n=++sess.attempts;
    // Most frames are fast; every fourth frame tries harder for difficult pots.
    const detailed=n%4===0;
    const output=await engine.readBarcodes(data,{
     formats:['DataMatrix'],maxNumberOfSymbols:1,tryHarder:detailed,
     tryDenoise:detailed,tryRotate:true,tryInvert:false,tryDownscale:false
    });
    if(thisToken!==token||!sess.current())return;
    const code=output?.find(x=>typeof x.text==='string'&&x.text.trim());
    if(code)sess.onDecoded(code.text);
   }
  }catch(err){
   if(thisToken===token)fallback(sess.instance,err?.message||err,sess.reader,sess.current);
   return;
  }
  if(thisToken===token&&session===sess&&sess.current()){
   cycle=setTimeout(()=>scanFrame(thisToken),110);
  }
 }
 return {attach,stop,active,enabled,firstLoadStatus:()=>firstLoadStatus};
})();
