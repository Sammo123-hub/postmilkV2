/* Post-milking demo herd and UI-12 Add Animals.
 * Static 250-animal TEST catalogue, separate from the saved sampling session.
 * The catalogue contains no real customer or NMR animal records.
 */
'use strict';
const HerdDemo=(()=>{
 const HERD=Object.freeze(Array.from({length:250},(_,i)=>Object.freeze({
  id:'TEST-'+String(i+1).padStart(5,'0'),
  line:String(i+1).padStart(5,'0')
 })));
 let query='',warning='',catalogQuery='',catalogFilter='all',catalogFromPicker=false;
 const byLine=line=>animals().filter(a=>a.line===line);
 const kind=line=>{
  const matches=byLine(line);
  if(!matches.length)return 'available';
  if(matches.some(a=>!!a.sample))return 'sampled';
  if(matches.some(a=>!a.sample&&!a.noSampleReason))return 'awaiting';
  return 'no-sample';
 };
 const words={available:'AVAILABLE',sampled:'SAMPLED',awaiting:'AWAITING', 'no-sample':'NO SAMPLE'};
 const labelFor=line=>words[kind(line)];
 const find=()=>HERD.filter(a=>!query||a.line.includes(query));
 function padHtml(){
  const keys=['1','2','3','4','5','6','7','8','9','⌫','0','ADD'];
  return '<div class="herd-number-pad">'+keys.map(k=>
   '<button type="button" class="'+(k==='ADD'?'herd-add-key':'')+'" data-action="'+(k==='ADD'?'herd-add-code':'herd-key')+'" data-key="'+k+'">'+k+'</button>'
  ).join('')+'</div>';
 }
 function resultSection(title,rows){
  if(!rows.length)return '';
  const list=rows.slice(0,25).map(a=>{
   const k=kind(a.line),linked=byLine(a.line).find(x=>x.sample);
   const detail=k==='sampled'&&linked?'Sample '+safe(linked.sample):k==='awaiting'?'Already in list':k==='no-sample'?'No sample recorded':'Not yet added';
   return '<button type="button" class="herd-match '+k+'" data-action="herd-pick" data-line="'+a.line+'"><span class="herd-match-line">'+a.line+'</span><span class="herd-match-meta">'+safe(detail)+'</span><span class="herd-match-add">'+(k==='available'?'+ ADD':'SELECT')+'</span></button>';
  }).join('');
  return '<div class="herd-section-label">'+title+' · '+rows.length+'</div>'+list+(rows.length>25?'<p class="herd-overflow-note">Showing 25 matches. Enter more digits to narrow the list.</p>':'');
 }
 function searchResults(){
  if(warning){
   const records=byLine(warning),linked=records.find(a=>!!a.sample);
   const description=linked?'This animal already has a sample linked.':'This animal is already in the sampling list.';
   return '<div class="herd-warning"><strong>ALREADY IN SAMPLING LIST</strong><p>'+warning+' — '+description+'</p>'+
    (linked?'<p>Sample ID: '+safe(linked.sample)+'</p>':'')+
    '<p>ADD ANYWAY adds a new record at the end, marked DUPLICATE. The existing record is unchanged.</p>'+
    '<div class="buttons"><button type="button" class="btn outline" data-action="herd-back-warning">BACK</button><button type="button" class="btn primary" data-action="herd-duplicate">ADD ANYWAY</button></div></div>';
  }
  const records=find(),groups=['available','awaiting','sampled','no-sample'];
  const result=groups.map(k=>resultSection(words[k],records.filter(a=>kind(a.line)===k))).join('');
  if(result)return result;
  return query?'<div class="herd-empty-result">No matching herd animal for <strong>'+safe(query)+'</strong>.<br>Use ADD to enter this line number exactly as typed.</div>':'<div class="herd-empty-result">Enter a line number to search the test herd.</div>';
 }
 function picker(){
  return '<div class="herd-picker">'+
   '<h2>ADD ANIMALS</h2>'+
   '<p class="herd-subtitle">UI-12 · Enter the line number written on each sample pot. Matching herd animals appear below.</p>'+
   '<div class="herd-pick-top"><label class="herd-section-label" for="herd-search">LINE NUMBER · ADD TO LIST</label><button type="button" data-action="herd-done" class="herd-done">DONE</button></div>'+
   '<div class="herd-current-code"><input id="herd-search" type="text" readonly inputmode="none" value="'+safe(query)+'" placeholder="Line number" aria-label="Animal line number">'+
   '<button type="button" data-action="herd-clear" aria-label="Clear line number">CLR</button></div>'+
   '<div class="herd-result-scroll" id="herd-results">'+searchResults()+'</div>'+
   padHtml()+
   '<button class="herd-view-full" type="button" data-action="herd-view-catalog">VIEW ALL 250 TEST HERD ANIMALS</button>'+
   '<p class="herd-overflow-note">Herd catalogue and sampling list are separate. Selecting a herd animal adds a sampling-list record.</p>'+
   '</div>';
 }
 function refreshPicker(){
  const a=$('#herd-search'),b=$('#herd-results');
  if(a)a.value=query;
  if(b)b.innerHTML=searchResults();
 }
 function key(k){
  if(modal!=='herd-picker'||warning)return;
  if(k==='⌫')query=query.slice(0,-1);
  else if(k==='CLR')query='';
  else if(/^\d$/.test(k)&&query.length<25)query+=k;
  refreshPicker();
 }
 function clear(){query='';warning='';refreshPicker()}
 function choose(line){
  if(data.phase==='closed')return toast('This session is closed.');
  line=String(line||'').trim();
  if(!line||!/^[0-9A-Za-z_-]{1,25}$/.test(line))return toast('Enter a valid line number');
  if(byLine(line).length){warning=line;refreshPicker();return}
  add(line);
 }
 function enterTyped(){if(query)choose(query);else toast('Enter a line number first.')}
 function add(line){
  const a={uid:uid(),line:String(line),yield:'',sample:'',linkedSequence:0,linkedAt:'',noSampleReason:'',removed:false};
  data.animals.push(a);
  if(data.phase==='setup')data.phase='adding';
  store(); query='';warning='';
  // Requirement 4.2.1: when yields are required, yield capture follows selection.
  if(data.yields)openModal('herd-yield',a.uid);
  else{openModal('herd-picker');toast('Added '+a.line+' to the sampling list.');}
 }
 function confirmDuplicate(){
  if(warning){const line=warning;warning='';add(line)}
 }
 function backWarning(){warning='';refreshPicker()}
 function done(){
  if(data.phase==='closed'){closeModal(false);return}
  if(data.phase==='setup'||data.phase==='adding'){
   if(animals().length===0){closeModal(false);return}
   data.phase=animals().length===1?'linking':'check';
   store();
  }
  closeModal(false);render();
  if(page==='linking'&&data.phase==='linking'&&waiting().length)startCamera();
 }
 function yieldMarkup(animal){
  if(!animal)return '<div class="notice">Animal not found.</div>';
  return '<div class="herd-yield"><h2>YIELD CAPTURE</h2><p>Line number <strong>'+safe(animal.line)+'</strong> was added to the sampling list.</p>'+
   '<label class="field-label" for="herd-yield">MILK YIELD (kg)</label>'+
   '<input id="herd-yield" class="input" type="number" inputmode="decimal" min="0" step="0.1" placeholder="e.g. 12.4" value="'+safe(animal.yield)+'">'+
   '<div class="buttons"><button type="button" class="btn outline" data-action="herd-save-yield">SKIP</button><button type="button" class="btn secondary" data-action="herd-save-yield">SAVE &amp; ADD NEXT</button></div></div>';
 }
 function saveYield(){
  const a=animals().find(x=>x.uid===selectedUid),input=$('#herd-yield');
  if(!a)return;
  const v=String(input?.value||'').trim();
  if(v!==''&&(!Number.isFinite(Number(v))||Number(v)<0))return toast('Enter a valid milk yield.');
  a.yield=v;store();
  openModal('herd-picker');toast('Added '+a.line+' to the sampling list.');
 }
 function resetSearch(){query='';warning=''}
 const counts=()=>HERD.reduce((o,a)=>(o[kind(a.line)]++,o),{available:0,awaiting:0,sampled:0,'no-sample':0});
 function catalogResults(){
  const matching=HERD.filter(a=>(catalogFilter==='all'||kind(a.line)===catalogFilter)&&(!catalogQuery||a.line.includes(catalogQuery)));
  return '<p class="herd-overflow-note">Showing '+matching.length+' of 250 herd animals. These are test records, not sampling-list entries.</p>'+
  '<div class="herd-catalog-scroll">'+matching.map(a=>{
   const k=kind(a.line),linked=byLine(a.line).find(x=>x.sample);
   return '<div class="herd-catalog-row"><strong>'+a.line+'</strong><span>'+safe(a.id)+'</span><em class="'+k+'">'+words[k]+(linked?' · '+safe(linked.sample):'')+'</em></div>';
  }).join('')+'</div>';
 }
 function catalog(){
  const n=counts();
  const tabs=[['all','ALL · 250'],['available','AVAILABLE · '+n.available],['awaiting','AWAITING · '+n.awaiting],['sampled','SAMPLED · '+n.sampled],['no-sample','NO SAMPLE · '+n['no-sample']]];
  return '<div class="herd-catalog"><h2>TEST HERD · 250 ANIMALS</h2>'+
    '<p class="herd-subtitle">Separate from the animals entered into this sampling session. Test-only line numbers 00001–00250.</p>'+
    '<label class="field-label" for="herd-catalog-search">SEARCH LINE NUMBER</label>'+
    '<input id="herd-catalog-search" type="text" class="input" inputmode="numeric" autocomplete="off" placeholder="e.g. 0016" value="'+safe(catalogQuery)+'">'+
    '<div class="herd-filter-row">'+tabs.map(([k,label])=>'<button type="button" data-action="herd-filter" data-filter="'+k+'" class="'+(k===catalogFilter?'active':'')+'">'+label+'</button>').join('')+'</div>'+
    '<div id="herd-catalog-results">'+catalogResults()+'</div>'+
    '<div class="buttons"><button type="button" class="btn outline" data-action="herd-catalog-back">BACK</button><button type="button" class="btn secondary" data-action="herd-catalog-add">ADD ANIMALS</button></div></div>';
 }
 function openCatalog(fromPicker=false){catalogFromPicker=fromPicker;catalogFilter='all';catalogQuery='';openModal('herd-catalog')}
 function catalogBack(){if(catalogFromPicker)openModal('herd-picker');else closeModal();}
 function changeCatalogFilter(v){if(['all','available','awaiting','sampled','no-sample'].includes(v)){catalogFilter=v;const root=$('#herd-catalog-results');if(root)root.innerHTML=catalogResults();const nav=$('.herd-filter-row');if(nav)for(const e of nav.querySelectorAll('button'))e.classList.toggle('active',e.dataset.filter===v)}}
 function changeCatalogSearch(v){catalogQuery=String(v||'').trim();const root=$('#herd-catalog-results');if(root)root.innerHTML=catalogResults();}
 function openPicker(){resetSearch();openModal('herd-picker')}
 // The handler exists independently of app.js's time-field input listener.
 document.addEventListener('input',e=>{if(e.target.id==='herd-catalog-search')changeCatalogSearch(e.target.value)});
 return {HERD,kind,counts,picker,key,clear,choose,enterTyped,confirmDuplicate,backWarning,done,yieldMarkup,saveYield,resetSearch,catalog,openCatalog,catalogBack,changeCatalogFilter,openPicker};
})();
