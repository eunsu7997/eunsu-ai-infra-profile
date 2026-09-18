(()=>{'use strict';
const $=id=>document.getElementById(id);
const U={
  input:$('imageInput'),fileMsg:$('fileMessage'),fit:$('fitMode'),imageScale:$('imageScale'),imageScaleOut:$('imageScaleOut'),imageX:$('imageX'),imageXOut:$('imageXOut'),imageY:$('imageY'),imageYOut:$('imageYOut'),
  caption:$('captionInput'),textX:$('textX'),textXOut:$('textXOut'),textY:$('textY'),textYOut:$('textYOut'),fontSize:$('fontSize'),color:$('textColor'),align:$('textAlign'),lineHeight:$('lineHeight'),shadow:$('textShadow'),
  canvas:$('previewCanvas'),stage:$('canvasStage'),ratioTitle:$('ratioTitle'),canvasSize:$('canvasSizeText'),download:$('downloadBtn'),status:$('statusText'),qaFile:$('qaFile'),
  templateName:$('templateName'),templateSelect:$('templateSelect'),templateCreate:$('templateCreateBtn'),templateUpdate:$('templateUpdateBtn'),templateLoad:$('templateLoadBtn'),templateDelete:$('templateDeleteBtn'),templateMsg:$('templateMessage'),qaTemplate:$('qaTemplate'),
  jsonExport:$('jsonExportBtn'),jsonInput:$('jsonInput'),jsonMsg:$('jsonMessage')
};
const ctx=U.canvas.getContext('2d',{alpha:true});
const RATIOS={
  '1:1':{w:1080,h:1080,label:'1:1 SQUARE'},
  '4:5':{w:1080,h:1350,label:'4:5 FEED'},
  '9:16':{w:1080,h:1920,label:'9:16 STORY'}
};
const MAX_FILE_BYTES=15*1024*1024;
const DB_NAME='pixel-card-studio-db';
const DB_VERSION=1;
const STORE='templates';
const JSON_SCHEMA='pixel-card-studio-template';
const JSON_VERSION=1;
const REQUIRED_EDITOR_KEYS=['ratio','fit','imageScale','imageX','imageY','caption','textX','textY','fontSize','color','align','lineHeight','shadow','imageDataUrl','imageInfo'];
const state={ratio:'1:1',image:null,imageDataUrl:null,imageInfo:null,fit:'cover',imageScale:1,imageX:0,imageY:0,caption:'오늘의 한 장\nMAKE IT YOURS.',textX:.5,textY:.78,fontSize:64,color:'#ffffff',align:'center',lineHeight:1.18,shadow:true,lastError:''};
let currentObjectUrl=null;
let selectedTemplateId='';
let dbPromise=null;
let storageMode='indexeddb';
const memoryTemplates=window.__pixelCardMemoryTemplates||(window.__pixelCardMemoryTemplates=new Map());

function setMessage(text,type='neutral'){
  U.fileMsg.textContent=text;U.fileMsg.className=`message ${type}`;
  U.status.textContent=type==='error'?'CHECK INPUT':type==='success'?'READY':'READY';
}
function setTemplateMessage(text,type='neutral'){
  U.templateMsg.textContent=text;U.templateMsg.className=`message ${type}`;
  U.qaTemplate.textContent=type==='error'?'CHECK':'READY';
}
function setJsonMessage(text,type='neutral'){
  U.jsonMsg.textContent=text;U.jsonMsg.className=`message ${type}`;
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function isPng(bytes){return bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a}
function isJpeg(bytes){return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('이미지 데이터를 읽지 못했습니다.'));r.readAsDataURL(file)})}
async function validateFile(file){
  if(!file)throw new Error('파일을 선택하지 않았습니다.');
  if(file.size>MAX_FILE_BYTES)throw new Error('15MB 이하의 PNG 또는 JPEG만 사용할 수 있습니다.');
  const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const png=isPng(head),jpg=isJpeg(head);
  if(!png&&!jpg)throw new Error('지원하지 않거나 손상된 파일입니다. PNG 또는 JPEG 파일을 선택해 주세요.');
  return png?'image/png':'image/jpeg';
}
async function decodeFile(file){
  const detected=await validateFile(file);
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.decoding='async';img.src=url;await img.decode();
    if(!img.naturalWidth||!img.naturalHeight)throw new Error('이미지 크기를 확인할 수 없습니다.');
    const dataUrl=await fileToDataUrl(file);
    return{img,url,dataUrl,detected};
  }catch(e){URL.revokeObjectURL(url);throw new Error('이미지를 해석하지 못했습니다. 손상되지 않은 PNG 또는 JPEG를 사용해 주세요.');}
}
function decodeDataUrl(dataUrl){
  return new Promise((resolve,reject)=>{
    if(dataUrl===null){resolve(null);return}
    if(typeof dataUrl!=='string'||!/^data:image\/(png|jpeg);base64,/i.test(dataUrl)){reject(new Error('템플릿 이미지 데이터 형식이 올바르지 않습니다.'));return}
    const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('템플릿 이미지 데이터를 해석하지 못했습니다.'));img.src=dataUrl;
  });
}
async function loadImageFile(file){
  const before={image:state.image,imageDataUrl:state.imageDataUrl,imageInfo:state.imageInfo,objectUrl:currentObjectUrl};
  try{
    const {img,url,dataUrl,detected}=await decodeFile(file);
    if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl=url;state.image=img;state.imageDataUrl=dataUrl;state.imageInfo={name:file.name,type:detected,width:img.naturalWidth,height:img.naturalHeight,size:file.size};state.lastError='';
    setMessage(`${file.name} · ${img.naturalWidth}×${img.naturalHeight} 불러오기 완료`,'success');U.qaFile.textContent='PASS';render();
  }catch(err){
    state.image=before.image;state.imageDataUrl=before.imageDataUrl;state.imageInfo=before.imageInfo;currentObjectUrl=before.objectUrl;state.lastError=String(err.message||err);setMessage(`${state.lastError} 기존 편집 내용은 유지했습니다.`,'error');U.input.value='';render();
  }
}
function syncState(){
  state.fit=U.fit.value;state.imageScale=Number(U.imageScale.value)/100;state.imageX=Number(U.imageX.value)/100;state.imageY=Number(U.imageY.value)/100;
  state.caption=U.caption.value;state.textX=Number(U.textX.value)/100;state.textY=Number(U.textY.value)/100;state.fontSize=clamp(Number(U.fontSize.value)||64,18,180);state.color=U.color.value;state.align=U.align.value;state.lineHeight=clamp(Number(U.lineHeight.value)||1.18,.9,2);state.shadow=U.shadow.checked;
  U.imageScaleOut.value=`${Math.round(state.imageScale*100)}%`;U.imageXOut.value=String(Math.round(state.imageX*100));U.imageYOut.value=String(Math.round(state.imageY*100));U.textXOut.value=`${Math.round(state.textX*100)}%`;U.textYOut.value=`${Math.round(state.textY*100)}%`;
  render();
}
function syncControlsFromState(){
  U.fit.value=state.fit;U.imageScale.value=Math.round(state.imageScale*100);U.imageX.value=Math.round(state.imageX*100);U.imageY.value=Math.round(state.imageY*100);
  U.caption.value=state.caption;U.textX.value=Math.round(state.textX*100);U.textY.value=Math.round(state.textY*100);U.fontSize.value=state.fontSize;U.color.value=state.color;U.align.value=state.align;U.lineHeight.value=state.lineHeight;U.shadow.checked=state.shadow;
  document.querySelectorAll('.ratio-btn').forEach(b=>b.classList.toggle('active',b.dataset.ratio===state.ratio));
  U.imageScaleOut.value=`${Math.round(state.imageScale*100)}%`;U.imageXOut.value=String(Math.round(state.imageX*100));U.imageYOut.value=String(Math.round(state.imageY*100));U.textXOut.value=`${Math.round(state.textX*100)}%`;U.textYOut.value=`${Math.round(state.textY*100)}%`;
  render();
}
function configureCanvas(){
  const r=RATIOS[state.ratio];if(U.canvas.width!==r.w)U.canvas.width=r.w;if(U.canvas.height!==r.h)U.canvas.height=r.h;U.ratioTitle.textContent=r.label;U.canvasSize.textContent=`${r.w} × ${r.h}`;
}
function drawDefaultBackground(w,h){
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#0d2934');g.addColorStop(.45,'#135160');g.addColorStop(1,'#7f3659');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.globalAlpha=.2;ctx.fillStyle='#7df5f2';ctx.beginPath();ctx.arc(w*.82,h*.22,Math.min(w,h)*.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffb8d1';ctx.beginPath();ctx.arc(w*.15,h*.8,Math.min(w,h)*.28,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawImage(w,h){
  if(!state.image){drawDefaultBackground(w,h);return;}
  ctx.fillStyle='#0a1116';ctx.fillRect(0,0,w,h);
  const iw=state.image.naturalWidth,ih=state.image.naturalHeight;
  const base=state.fit==='contain'?Math.min(w/iw,h/ih):Math.max(w/iw,h/ih);
  const scale=base*state.imageScale,dw=iw*scale,dh=ih*scale;
  const maxShiftX=(w+dw)*.34,maxShiftY=(h+dh)*.34;
  // 슬라이더 값은 '보이는 영역(초점)' 기준: +가 오른쪽/아래쪽을 더 보여준다.\n  const dx=(w-dw)/2-state.imageX*maxShiftX,dy=(h-dh)/2-state.imageY*maxShiftY;
  ctx.drawImage(state.image,dx,dy,dw,dh);
}
function segmentGraphemes(text){
  if(typeof Intl!=='undefined'&&Intl.Segmenter){const seg=new Intl.Segmenter(undefined,{granularity:'grapheme'});return Array.from(seg.segment(text),x=>x.segment)}
  return Array.from(text);
}
function breakToken(token,maxWidth){
  const chars=segmentGraphemes(token),out=[];let line='';
  for(const ch of chars){const t=line+ch;if(line&&ctx.measureText(t).width>maxWidth){out.push(line);line=ch}else line=t}
  if(line||!out.length)out.push(line);return out;
}
function wrapParagraph(text,maxWidth){
  if(text==='')return [''];
  const words=text.split(/(\s+)/).filter(Boolean),lines=[];let line='';
  for(const word of words){
    if(/^\s+$/.test(word)){if(line&&!line.endsWith(' '))line+=' ';continue}
    const candidate=line+word;
    if(!line||ctx.measureText(candidate).width<=maxWidth){
      if(ctx.measureText(candidate).width<=maxWidth)line=candidate;
      else{const chunks=breakToken(word,maxWidth);if(line.trim())lines.push(line.trimEnd());lines.push(...chunks.slice(0,-1));line=chunks.at(-1)||''}
    }else{
      lines.push(line.trimEnd());
      if(ctx.measureText(word).width<=maxWidth)line=word;
      else{const chunks=breakToken(word,maxWidth);lines.push(...chunks.slice(0,-1));line=chunks.at(-1)||''}
    }
  }
  if(line||!lines.length)lines.push(line.trimEnd());return lines;
}
function wrappedLines(text,maxWidth){
  const paragraphs=String(text).replace(/\r\n?/g,'\n').split('\n');const lines=[];
  paragraphs.forEach((p,i)=>{lines.push(...wrapParagraph(p,maxWidth));if(i<paragraphs.length-1&&p===''&&paragraphs[i+1]==='')lines.push('')});return lines;
}
function drawCaption(w,h){
  const fontPx=state.fontSize*(w/1080);ctx.save();ctx.font=`800 ${fontPx}px Inter, Pretendard, "Noto Sans KR", sans-serif`;ctx.textAlign=state.align;ctx.textBaseline='middle';ctx.fillStyle=state.color;ctx.lineJoin='round';
  if(state.shadow){ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=fontPx*.18;ctx.shadowOffsetY=fontPx*.07}
  const maxWidth=w*.84,lines=wrappedLines(state.caption,maxWidth),lineGap=fontPx*state.lineHeight,total=Math.max(lineGap,lines.length*lineGap),cx=state.textX*w,cy=state.textY*h,start=cy-(total-lineGap)/2;
  for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],cx,start+i*lineGap,maxWidth);
  ctx.restore();return{lines,maxWidth,fontPx};
}
function render(){configureCanvas();const w=U.canvas.width,h=U.canvas.height;ctx.clearRect(0,0,w,h);drawImage(w,h);const metrics=drawCaption(w,h);window.__pixelCardLastRender={ratio:state.ratio,width:w,height:h,lines:metrics.lines.slice(),caption:state.caption,textX:state.textX,textY:state.textY,fontSize:state.fontSize,color:state.color};}
function setRatio(ratio){if(!RATIOS[ratio])return;state.ratio=ratio;document.querySelectorAll('.ratio-btn').forEach(b=>b.classList.toggle('active',b.dataset.ratio===ratio));render()}
function safeName(){const r=state.ratio.replace(':','x');return `pixel-card-${r}.png`}
function downloadBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function downloadPng(){render();U.canvas.toBlob(blob=>{if(!blob){setMessage('PNG 파일을 만들지 못했습니다. 다시 시도해 주세요.','error');return}downloadBlob(blob,safeName())},'image/png')}

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve)=>{
    if(!('indexedDB' in window)){storageMode='memory';resolve(null);return}
    let req;
    try{req=indexedDB.open(DB_NAME,DB_VERSION)}catch{storageMode='memory';resolve(null);return}
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const st=db.createObjectStore(STORE,{keyPath:'id'});st.createIndex('updatedAt','updatedAt')}};
    req.onsuccess=()=>{storageMode='indexeddb';resolve(req.result)};
    req.onerror=()=>{storageMode='memory';resolve(null)};
  });
  return dbPromise;
}
function cloneItem(v){return v==null?v:JSON.parse(JSON.stringify(v))}
async function dbAll(){const db=await openDb();if(!db)return Array.from(memoryTemplates.values()).map(cloneItem).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))));req.onerror=()=>reject(req.error)})}
async function dbGet(id){const db=await openDb();if(!db)return cloneItem(memoryTemplates.get(id)||null);return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}
async function dbPut(item){const db=await openDb();if(!db){memoryTemplates.set(item.id,cloneItem(item));return item}return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=()=>resolve(item);tx.onerror=()=>reject(tx.error)})}
async function dbDelete(id){const db=await openDb();if(!db){memoryTemplates.delete(id);return}return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function dbClear(){const db=await openDb();if(!db){memoryTemplates.clear();return}return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
function captureEditor(){
  return{ratio:state.ratio,fit:state.fit,imageScale:state.imageScale,imageX:state.imageX,imageY:state.imageY,caption:state.caption,textX:state.textX,textY:state.textY,fontSize:state.fontSize,color:state.color,align:state.align,lineHeight:state.lineHeight,shadow:state.shadow,imageDataUrl:state.imageDataUrl,imageInfo:state.imageInfo?{...state.imageInfo}:null};
}
function assertFinite(name,v,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${name} 값이 올바르지 않습니다.`);return v}
function validateEditor(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('편집 데이터가 없습니다.');
  for(const key of REQUIRED_EDITOR_KEYS)if(!Object.prototype.hasOwnProperty.call(raw,key))throw new Error(`필수 항목이 없습니다: ${key}`);
  if(!RATIOS[raw.ratio])throw new Error('지원하지 않는 화면 비율입니다.');
  if(!['cover','contain'].includes(raw.fit))throw new Error('이미지 맞춤 방식이 올바르지 않습니다.');
  const imageScale=assertFinite('imageScale',raw.imageScale,.6,1.8),imageX=assertFinite('imageX',raw.imageX,-.5,.5),imageY=assertFinite('imageY',raw.imageY,-.5,.5);
  if(typeof raw.caption!=='string'||raw.caption.length>500)throw new Error('문구가 올바르지 않습니다.');
  const textX=assertFinite('textX',raw.textX,.05,.95),textY=assertFinite('textY',raw.textY,.05,.95),fontSize=assertFinite('fontSize',raw.fontSize,18,180),lineHeight=assertFinite('lineHeight',raw.lineHeight,.9,2);
  if(typeof raw.color!=='string'||!/^#[0-9a-f]{6}$/i.test(raw.color))throw new Error('문구 색상 값이 올바르지 않습니다.');
  if(!['left','center','right'].includes(raw.align))throw new Error('문구 정렬 값이 올바르지 않습니다.');
  if(typeof raw.shadow!=='boolean')throw new Error('문구 그림자 값이 올바르지 않습니다.');
  if(raw.imageDataUrl!==null&&(typeof raw.imageDataUrl!=='string'||!/^data:image\/(png|jpeg);base64,/i.test(raw.imageDataUrl)))throw new Error('이미지 데이터는 PNG/JPEG Data URL이어야 합니다.');
  if(raw.imageInfo!==null){
    if(!raw.imageInfo||typeof raw.imageInfo!=='object')throw new Error('이미지 정보가 올바르지 않습니다.');
    if(typeof raw.imageInfo.name!=='string'||typeof raw.imageInfo.type!=='string')throw new Error('이미지 정보의 이름/형식이 올바르지 않습니다.');
    if(!Number.isFinite(Number(raw.imageInfo.width))||!Number.isFinite(Number(raw.imageInfo.height)))throw new Error('이미지 크기 정보가 올바르지 않습니다.');
  }
  return{ratio:raw.ratio,fit:raw.fit,imageScale,imageX,imageY,caption:raw.caption,textX,textY,fontSize,color:raw.color.toLowerCase(),align:raw.align,lineHeight,shadow:raw.shadow,imageDataUrl:raw.imageDataUrl,imageInfo:raw.imageInfo?{...raw.imageInfo}:null};
}
async function materializeEditor(editor){const clean=validateEditor(editor);const img=await decodeDataUrl(clean.imageDataUrl);if(img&&clean.imageInfo){clean.imageInfo.width=img.naturalWidth;clean.imageInfo.height=img.naturalHeight}return{clean,img}}
function applyMaterialized(clean,img){
  if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
  state.ratio=clean.ratio;state.fit=clean.fit;state.imageScale=clean.imageScale;state.imageX=clean.imageX;state.imageY=clean.imageY;state.caption=clean.caption;state.textX=clean.textX;state.textY=clean.textY;state.fontSize=clean.fontSize;state.color=clean.color;state.align=clean.align;state.lineHeight=clean.lineHeight;state.shadow=clean.shadow;state.imageDataUrl=clean.imageDataUrl;state.imageInfo=clean.imageInfo?{...clean.imageInfo}:null;state.image=img;state.lastError='';syncControlsFromState();
}
function makeId(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():`tpl-${Date.now()}-${Math.random().toString(16).slice(2)}`}
async function refreshTemplateList(preferredId=''){
  const items=await dbAll();const wanted=preferredId||selectedTemplateId;U.templateSelect.innerHTML='';
  if(!items.length){const o=document.createElement('option');o.value='';o.textContent='저장된 템플릿 없음';U.templateSelect.appendChild(o);selectedTemplateId='';return items}
  for(const item of items){const o=document.createElement('option');o.value=item.id;o.textContent=`${item.name} · ${new Date(item.updatedAt).toLocaleString()}`;U.templateSelect.appendChild(o)}
  const exists=items.some(i=>i.id===wanted);selectedTemplateId=exists?wanted:items[0].id;U.templateSelect.value=selectedTemplateId;const selected=items.find(i=>i.id===selectedTemplateId);if(selected)U.templateName.value=selected.name;return items;
}
function templateNameValue(){const name=U.templateName.value.trim();if(!name)throw new Error('템플릿 이름을 입력해 주세요.');return name.slice(0,40)}
async function createTemplate(name=templateNameValue()){
  const now=new Date().toISOString(),item={id:makeId(),name:String(name).trim().slice(0,40),createdAt:now,updatedAt:now,editor:captureEditor()};if(!item.name)throw new Error('템플릿 이름을 입력해 주세요.');validateEditor(item.editor);await dbPut(item);selectedTemplateId=item.id;await refreshTemplateList(item.id);setTemplateMessage(`'${item.name}' 템플릿을 저장했습니다.`,'success');return item;
}
async function updateTemplate(id=selectedTemplateId,name=null){
  if(!id)throw new Error('수정할 템플릿을 선택해 주세요.');const old=await dbGet(id);if(!old)throw new Error('선택한 템플릿을 찾지 못했습니다.');const next={...old,name:(name===null?templateNameValue():String(name).trim().slice(0,40)),updatedAt:new Date().toISOString(),editor:captureEditor()};if(!next.name)throw new Error('템플릿 이름을 입력해 주세요.');validateEditor(next.editor);await dbPut(next);selectedTemplateId=id;await refreshTemplateList(id);setTemplateMessage(`'${next.name}' 템플릿을 현재 편집 상태로 수정했습니다.`,'success');return next;
}
async function loadTemplate(id=selectedTemplateId){
  if(!id)throw new Error('불러올 템플릿을 선택해 주세요.');const item=await dbGet(id);if(!item)throw new Error('선택한 템플릿을 찾지 못했습니다.');const {clean,img}=await materializeEditor(item.editor);applyMaterialized(clean,img);selectedTemplateId=item.id;U.templateSelect.value=item.id;U.templateName.value=item.name;setTemplateMessage(`'${item.name}' 템플릿을 불러왔습니다.`,'success');return item;
}
async function deleteTemplate(id=selectedTemplateId){
  if(!id)throw new Error('삭제할 템플릿을 선택해 주세요.');const item=await dbGet(id);if(!item)throw new Error('선택한 템플릿을 찾지 못했습니다.');await dbDelete(id);selectedTemplateId='';await refreshTemplateList();setTemplateMessage(`'${item.name}' 템플릿을 삭제했습니다.`,'success');return item;
}
function validatePackage(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('JSON 최상위 구조가 올바르지 않습니다.');
  if(raw.schema!==JSON_SCHEMA)throw new Error('지원하지 않는 JSON 형식입니다.');
  if(raw.version!==JSON_VERSION)throw new Error('지원하지 않는 JSON 버전입니다.');
  if(!raw.template||typeof raw.template!=='object')throw new Error('필수 항목이 없습니다: template');
  if(typeof raw.template.name!=='string'||!raw.template.name.trim())throw new Error('필수 항목이 없습니다: template.name');
  if(!Object.prototype.hasOwnProperty.call(raw.template,'editor'))throw new Error('필수 항목이 없습니다: template.editor');
  return{name:raw.template.name.trim().slice(0,40),editor:validateEditor(raw.template.editor)};
}
function makePackage(name){return{schema:JSON_SCHEMA,version:JSON_VERSION,exportedAt:new Date().toISOString(),template:{name:String(name||U.templateName.value.trim()||'PIXEL CARD').slice(0,40),editor:captureEditor()}}}
function exportJson(){try{const pkg=makePackage();validatePackage(pkg);downloadBlob(new Blob([JSON.stringify(pkg,null,2)],{type:'application/json'}),'pixel-card-template.json');setJsonMessage('현재 편집 상태를 JSON으로 내보냈습니다.','success');return pkg}catch(e){setJsonMessage(String(e.message||e),'error');throw e}}
async function importJsonText(text){
  let raw;try{raw=JSON.parse(text)}catch{throw new Error('JSON 문법이 손상되어 있습니다. 현재 작업은 유지했습니다.')}
  const parsed=validatePackage(raw);const {clean,img}=await materializeEditor(parsed.editor);
  const now=new Date().toISOString(),item={id:makeId(),name:parsed.name,createdAt:now,updatedAt:now,editor:clean};
  await dbPut(item);applyMaterialized(clean,img);selectedTemplateId=item.id;U.templateName.value=item.name;await refreshTemplateList(item.id);setJsonMessage(`'${item.name}' JSON을 검증하고 템플릿으로 복원했습니다.`,'success');setTemplateMessage(`JSON에서 '${item.name}' 템플릿을 복원했습니다.`,'success');return item;
}
async function importJsonFile(file){
  if(!file){setJsonMessage('JSON 파일을 선택하지 않았습니다.','error');return}
  if(file.size>25*1024*1024){setJsonMessage('JSON 파일은 25MB 이하만 가져올 수 있습니다. 현재 작업은 유지했습니다.','error');U.jsonInput.value='';return}
  try{const text=await file.text();await importJsonText(text)}catch(e){setJsonMessage(`${String(e.message||e)} 현재 편집 내용과 저장된 템플릿은 바꾸지 않았습니다.`,'error')}finally{U.jsonInput.value=''}
}

U.input.addEventListener('change',e=>{const file=e.target.files&&e.target.files[0];if(file)loadImageFile(file)});
[U.fit,U.imageScale,U.imageX,U.imageY,U.caption,U.textX,U.textY,U.fontSize,U.color,U.align,U.lineHeight,U.shadow].forEach(el=>{el.addEventListener('input',syncState);el.addEventListener('change',syncState)});
document.querySelectorAll('.ratio-btn').forEach(b=>b.addEventListener('click',()=>setRatio(b.dataset.ratio)));U.download.addEventListener('click',downloadPng);
U.templateSelect.addEventListener('change',()=>{selectedTemplateId=U.templateSelect.value;const opt=U.templateSelect.selectedOptions[0];if(opt&&selectedTemplateId){const dot=opt.textContent.indexOf(' · ');U.templateName.value=dot>=0?opt.textContent.slice(0,dot):opt.textContent}});
U.templateCreate.addEventListener('click',()=>createTemplate().catch(e=>setTemplateMessage(String(e.message||e),'error')));
U.templateUpdate.addEventListener('click',()=>updateTemplate().catch(e=>setTemplateMessage(String(e.message||e),'error')));
U.templateLoad.addEventListener('click',()=>loadTemplate().catch(e=>setTemplateMessage(String(e.message||e),'error')));
U.templateDelete.addEventListener('click',()=>deleteTemplate().catch(e=>setTemplateMessage(String(e.message||e),'error')));
U.jsonExport.addEventListener('click',()=>{try{exportJson()}catch{}});
U.jsonInput.addEventListener('change',e=>{const f=e.target.files&&e.target.files[0];if(f)importJsonFile(f)});
window.addEventListener('beforeunload',()=>{if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl)});
window.__pixelCardDebug={
  getState:()=>JSON.parse(JSON.stringify({...state,image:state.image?{width:state.image.naturalWidth,height:state.image.naturalHeight}:null})),getRender:()=>JSON.parse(JSON.stringify(window.__pixelCardLastRender||{})),setRatio,
  setCaption:v=>{U.caption.value=String(v);syncState()},setFontSize:v=>{U.fontSize.value=v;syncState()},setTextPosition:(x,y)=>{U.textX.value=x;U.textY.value=y;syncState()},setColor:v=>{U.color.value=v;syncState()},validateFile,
  wrapForTest:(text,maxWidth=900)=>{ctx.save();ctx.font='800 64px sans-serif';const out=wrappedLines(text,maxWidth);ctx.restore();return out},captureEditor,
  listTemplates:dbAll,getTemplate:dbGet,createTemplate,updateTemplate,loadTemplate,deleteTemplate,clearTemplates:async()=>{await dbClear();selectedTemplateId='';await refreshTemplateList()},refreshTemplates:refreshTemplateList,
  makePackage,validatePackage,importJsonText,getStorageMode:()=>storageMode,config:{DB_NAME,STORE,JSON_SCHEMA,JSON_VERSION}
};
syncState();
openDb().then(()=>refreshTemplateList()).catch(e=>{setTemplateMessage(`템플릿 저장소 오류: ${String(e.message||e)}`,'error')});
})();
