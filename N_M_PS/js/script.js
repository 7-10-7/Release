(()=>{'use strict';
// jQuery는 HTML에서 CDN으로 먼저 불러옵니다.

const W=1600,H=960,PICW=640,ASPECT=PICW/H,byId=id=>document.getElementById(id),canvas=byId('result'),ctx=canvas.getContext('2d');
let photo=null,photoURL=null,crop=null,appliedCrop=null,drag=null;
const defs={textPad:45,top:0,lineHeight:160,paragraphSpacing:10};
const DEFAULT_COLORS={ink:'#333333',bg:'#ffffff',bgEnd:'#f2e7ff'};
const DEFAULT_BACKGROUND={mode:'solid',angle:45};
const fontStacks={
 bookk:'"BookkMyungjo",serif',
 serif:'"Nanum Myeongjo","Noto Serif KR","Batang",serif',
 pretendard:'"Pretendard","Malgun Gothic",sans-serif',
 gowunba:'"GounBatang", serif',
 notoserif:'"Noto Serif KR","Batang",serif',
 sans:'"Noto Sans KR","Noto Sans CJK KR",sans-serif',
 bookkgo: '"BookkGothic", sans-serif',
 nanumgo: '"Nanum Gothic", sans-serif',
 JoseonGulim: '"JoseonGulim",sans-serif',
 JoseonGa: '"JoseonGaneGothic", sans-serif',
 ChosunIlbo: '"ChosunIlboMyungjo", serif',
 JoseonShin: '"JoseonShinmyeongjo", serif',
 GowoonDo: '"GowoonDodum", sans-serif',
 mona:'"Mona12", sans-serif',
 mona10:'"Mona10", sans-serif',
 Soon:'"Soonbatang", serif',
 Jaemin60:'"HangulJaemin60", serif',
 kyuri:'"KyuriSDiary", serif',
 wood:'"WoodGarden", serif',
 BujangNim:'"GangBujangNim", serif',
};
let alignMode='justify';
let baseFontFamily='sans'; // 선택 영역의 글꼴 변경과 본문 전체 기본 글꼴을 분리합니다.
const globalFormat={bold:false,italic:false,underline:false};
let stored={};try{stored=JSON.parse(localStorage.getItem('log-maker-settings')||'{}')}catch{}
// 슬라이더와 숫자 직접 입력을 동기화합니다.
// 음수 입력 중 '-' 또는 빈 값일 때는 잠시 기다렸다가 입력 완료 시 보정합니다.
for (const id in defs) {
  const slider = byId(id);
  const number = byId(id + 'Num');
  const clamp = value => Math.min(Number(slider.max), Math.max(Number(slider.min), value));
  const oldTop = id === 'top' && !stored.centerVersion;
  const oldPadding = id === 'textPad' && stored.spacingDefaultsVersion !== 2;
  const initial = oldTop || oldPadding ? defs[id] : (stored[id] ?? defs[id]);
  const value = Number(initial);
  slider.value = number.value = clamp(Number.isFinite(value) ? value : defs[id]);

  slider.addEventListener('input', () => {
    number.value = slider.value;
    syncEditorStyles();
    draw();
    persist();
  });
  number.addEventListener('input', () => {
    if (number.value.trim() === '' || number.value === '-') return;
    const n = Number(number.value);
    if (!Number.isFinite(n)) return;
    slider.value = clamp(n);
    syncEditorStyles();
    // 숫자 상자는 입력 중 값을 강제로 바꾸지 않아 음수도 편하게 입력할 수 있습니다.
    draw();
  });
  const commitNumber = () => {
    const n = Number(number.value);
    const finalValue = clamp(number.value.trim() && Number.isFinite(n) ? n : Number(slider.value));
    slider.value = number.value = finalValue;
    syncEditorStyles();
    draw();
    persist();
  };
  number.addEventListener('change', commitNumber);
  number.addEventListener('blur', commitNumber);
  number.addEventListener('keydown', event => {
    if (event.key === 'Enter') { commitNumber(); number.blur(); }
  });
}
// 새 색상 기본값은 첫 실행에 적용하고, 이후 사용자가 고른 색상은 유지합니다.
const colorsMigrated=stored.colorDefaultsVersion===1;
byId('bg').value=colorsMigrated && /^#[0-9a-f]{6}$/i.test(stored.bg||'')?stored.bg:DEFAULT_COLORS.bg;
byId('bg').addEventListener('input',()=>{draw();persist()});
byId('bgEnd').value=/^#[0-9a-f]{6}$/i.test(stored.bgEnd||'')?stored.bgEnd:DEFAULT_COLORS.bgEnd;
byId('bgEnd').addEventListener('input',()=>{draw();persist()});
byId('backgroundMode').value=stored.backgroundMode==='gradient'?'gradient':DEFAULT_BACKGROUND.mode;
byId('gradientAngle').value=['0','45','90','135','180','225','270','315'].includes(String(stored.gradientAngle))?String(stored.gradientAngle):String(DEFAULT_BACKGROUND.angle);
function syncBackgroundControls(){
 const gradient=byId('backgroundMode').value==='gradient';
 byId('gradientEndField').hidden=!gradient;
 byId('gradientDirectionField').hidden=!gradient;
 byId('bgStartLabel').textContent=gradient?'시작 색상':'배경색';
}
byId('backgroundMode').addEventListener('change',()=>{syncBackgroundControls();draw();persist()});
byId('gradientAngle').addEventListener('change',()=>{draw();persist()});
syncBackgroundControls();
byId('ink').value=colorsMigrated && /^#[0-9a-f]{6}$/i.test(stored.ink||'')?stored.ink:DEFAULT_COLORS.ink;
const fontSizeControl=byId('fontSize');
fontSizeControl.value=Number.isFinite(Number(stored.fontSize)) && stored.fontSize != null ? Math.max(14,Math.min(48,Number(stored.fontSize))):22;
// 글자를 드래그한 상태로 크기를 입력하면 그 부분만 변경합니다.
let selectedSizeRange=null;
fontSizeControl.addEventListener('pointerdown',()=>{selectedSizeRange=activeTextSelection()||(savedRange&&!savedRange.collapsed?savedRange.cloneRange():null)});
fontSizeControl.addEventListener('focus',()=>{if(!selectedSizeRange)selectedSizeRange=activeTextSelection()||(savedRange&&!savedRange.collapsed?savedRange.cloneRange():null)});
function changeFontSize(){
 const size=Math.max(14,Math.min(48,Number(fontSizeControl.value)||22));
 const range=selectedSizeRange&&editor.contains(selectedSizeRange.commonAncestorContainer)?selectedSizeRange:null;
 if(range&&!range.collapsed){
  const model=readStyledSelection(range);
  if(model&&model.start!==model.end){
   for(const para of model.paras)for(const r of para.runs){
    r._pieces=[...r.text].map((ch,i)=>({...r,text:ch,position:r.start+i,size:(r.start+i>=model.start&&r.start+i<model.end)?size:r.size}));
   }
   renderStyledModel(model,{start:model.start,end:model.end});
   selectedSizeRange=activeTextSelection();
   // 입력창은 선택 크기를 보여주지만 전체 기본값은 바꾸지 않습니다.
   fontSizeControl.value=size;
   byId('status').textContent='선택한 글자의 크기를 '+size+'px로 변경했습니다.';
   return;
  }
 }
 baseFontSize=size;
 syncEditorStyles();draw();persist();
}
let baseFontSize=Number(fontSizeControl.value);
fontSizeControl.addEventListener('change',()=>{changeFontSize();selectedSizeRange=null});
fontSizeControl.addEventListener('keydown',e=>{if(e.key==='Enter'){changeFontSize();selectedSizeRange=null;fontSizeControl.blur()}});
// 터치 환경에서도 키보드 없이 글자 크기를 조절할 수 있도록 합니다.
for(const [id,delta] of [['fontSizeMinus',-1],['fontSizePlus',1]]){
 byId(id).addEventListener('click',()=>{
  selectedSizeRange=activeTextSelection()||(savedRange&&!savedRange.collapsed?savedRange.cloneRange():null);
  fontSizeControl.value=Math.max(14,Math.min(48,(Number(fontSizeControl.value)||baseFontSize)+delta));
  changeFontSize();selectedSizeRange=null;
 });
}


alignMode=['left','center','right','justify'].includes(stored.alignMode)?stored.alignMode:'justify';
for(const key of Object.keys(globalFormat))globalFormat[key]=!!(stored.globalFormat && stored.globalFormat[key]);
function syncEditorStyles(){
 const st=fontStacks[baseFontFamily]||fontStacks.sans;
 editor.style.fontFamily=st;
 editor.style.fontSize=Math.max(14,Math.min(48,Number(baseFontSize)||22))*.66+'px';
 editor.style.lineHeight=Number(byId('lineHeight').value)/100;
 editor.style.setProperty('--editor-paragraph-gap',Number(byId('paragraphSpacing').value)*.66+'px');
 editor.style.textAlign=alignMode;
 editor.style.color=byId('ink').value;
 editor.style.fontWeight = globalFormat.bold ? '600' : '400';
 editor.style.fontStyle=globalFormat.italic?'italic':'normal';
 editor.style.textDecoration=globalFormat.underline?'underline':'none';
 for(const btn of document.querySelectorAll('[data-align]'))btn.setAttribute('aria-pressed',String(btn.dataset.align===alignMode));
}
for(const btn of document.querySelectorAll('[data-align]'))btn.addEventListener('click',()=>{
 alignMode=btn.dataset.align;syncEditorStyles();draw();persist();
});

const editor=byId('story');
// 예전 일반 텍스트 저장본도 그대로 불러와요.
if(stored.storyHTML){editor.innerHTML=sanitizeHTML(stored.storyHTML)}else if(stored.story){editor.textContent=stored.story}
editor.addEventListener('input',()=>{selectedSizeRange=null;draw();persist()});
let savedRange=null;
function captureSelection(){const sel=window.getSelection();if(sel&&sel.rangeCount&&editor.contains(sel.anchorNode)&&editor.contains(sel.focusNode))savedRange=sel.isCollapsed?null:sel.getRangeAt(0).cloneRange()}
function restoreSelection(){if(!savedRange)return;try{const sel=window.getSelection();sel.removeAllRanges();sel.addRange(savedRange)}catch{}}
editor.addEventListener('keyup',captureSelection);
editor.addEventListener('mouseup',captureSelection);
editor.addEventListener('touchend',()=>setTimeout(captureSelection,100));
// 선택한 글자의 크기를 크기(px) 입력칸에 실시간으로 표시합니다.
// CSS 렌더링 크기(.66배)가 아닌 최종 PNG 기준 크기를 표시합니다.
function updateSelectedFontSize(){
 if(document.activeElement===fontSizeControl)return; // 크기 직접 입력 중 덮어쓰기 방지
 const range=activeTextSelection();
 if(!range){fontSizeControl.value=baseFontSize;return}
 const model=readStyledSelection(range);
 if(!model || model.start==null || model.end==null || model.start===model.end)return;
 // 선택 위치와 겹치는 첫 글자의 크기 (별도 크기가 없으면 본문 기본 크기)
 for(const para of model.paras){
  for(const run of para.runs){
   if(run.end>model.start && run.start<model.end){
    fontSizeControl.value=run.size ?? baseFontSize;
    return;
   }
  }
 }
 fontSizeControl.value=baseFontSize;
}
document.addEventListener('selectionchange',()=>{
 const sel=window.getSelection();
 if(sel && editor.contains(sel.anchorNode)){
  captureSelection();updateToolbar();updateSelectedFontSize();
 }else if(document.activeElement!==fontSizeControl){
  fontSizeControl.value=baseFontSize;
 }
});
// 브라우저에 따라 selectionchange 알림이 늦거나 누락되는 경우 대응
editor.addEventListener('mouseup',updateSelectedFontSize);
editor.addEventListener('keyup',updateSelectedFontSize);
function activeTextSelection(){
 const sel=window.getSelection();
 if(sel && sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode) && editor.contains(sel.focusNode))return sel.getRangeAt(0).cloneRange();
 return null;
}
function applyFormat(command){
 const range=activeTextSelection() || (savedRange && !savedRange.collapsed ? savedRange.cloneRange() : null);
 const selection=range && editor.contains(range.commonAncestorContainer) ? range : null;
 const model=readStyledSelection(selection);
 if(!model) return;
 const chars=model.paras.flatMap(p=>p.runs.flatMap(r=>[...r.text].map((text,i)=>({...r,text,position:r.start+i}))));
 const start=selection ? model.start : 0, end=selection ? model.end : model.total;
 if(selection && start===end)return;
 const field=command==='strikeThrough'?'strike':command;
 const selected=chars.filter(ch=>ch.position>=start&&ch.position<end);
 const turnOn=!selected.length || !selected.every(ch=>ch[field]);
 for(const p of model.paras)for(const r of p.runs){
   const pieces=[];
   for(const ch of r.text){
     const position=r.start+pieces.length;
     const flags={...r,text:ch,position};
     if(position>=start&&position<end)flags[field]=turnOn;
     pieces.push(flags);
   }
   r._pieces=pieces;
 }
 renderStyledModel(model, selection ? {start,end}:null);
 byId('status').textContent=(selection?'선택 영역':'본문 전체')+'의 '+({bold:'굵게',italic:'기울임',underline:'밑줄',strikeThrough:'취소선'}[command]||command)+(turnOn?'를 적용했습니다.':'를 해제했습니다.');
}
for(const btn of document.querySelectorAll('[data-format]')){
 btn.addEventListener('mousedown',e=>e.preventDefault());
 btn.addEventListener('touchstart',captureSelection,{passive:true});
 btn.addEventListener('click',()=>applyFormat(btn.dataset.format));
}
// 하나의 글자색 선택기: 선택된 글자만 변경, 선택 없으면 본문 기본색 변경.
const textColor = byId('ink');
let colorRange = null;
function saveColorSelection(){
 const sel=window.getSelection();
 if(sel && sel.rangeCount && !sel.isCollapsed && editor.contains(sel.anchorNode) && editor.contains(sel.focusNode)) {
   colorRange=sel.getRangeAt(0).cloneRange();
 } else {
   colorRange=null;
 }
}
textColor.addEventListener('pointerdown',saveColorSelection);
textColor.addEventListener('touchstart',saveColorSelection,{passive:true});
textColor.addEventListener('focus',()=>{if(!colorRange)saveColorSelection()});
function applyTextColor(color){
 if(!/^#[0-9a-fA-F]{6}$/.test(color))return;
 if(colorRange && !colorRange.collapsed && editor.contains(colorRange.commonAncestorContainer)) {
   try {
     const range=colorRange.cloneRange();
     const span=document.createElement('span');
     span.style.color=color;
     span.appendChild(range.extractContents());
     range.insertNode(span);
     const next=document.createRange();next.selectNodeContents(span);
     const selection=window.getSelection();selection.removeAllRanges();selection.addRange(next);
     savedRange=next.cloneRange();colorRange=next.cloneRange();
     byId('status').textContent='선택한 글자의 색상이 변경되었습니다.';
   } catch(error) {
     byId('status').textContent='선택 영역의 색상을 변경하지 못했습니다. 다시 선택해 주세요.';
     return;
   }
 } else {
   // 선택된 부분이 없으면 기존 기본색을 갱신합니다.
   colorRange=null;
   syncEditorStyles();
   byId('status').textContent='본문 기본 글자색을 변경했습니다.';
 }
 draw();persist();
}
textColor.addEventListener('input',()=>applyTextColor(textColor.value));
textColor.addEventListener('change',()=>applyTextColor(textColor.value));
// 선택 영역은 브라우저의 removeFormat으로 경계 노드를 먼저 분리한 뒤 인라인 스타일도 지웁니다.
// 전체 해제는 문단과 줄바꿈을 유지한 채 본문 내 서식을 모두 제거합니다.
// 이벤트는 폰트/형광펜의 선택 영역 기억 함수가 선언된 이후에 등록합니다.
function updateToolbar(){
 const selected=activeTextSelection();
 for(const b of document.querySelectorAll('[data-format]')){
   let active=globalFormat[b.dataset.format]||false;
   if(selected){try{active=document.queryCommandState(b.dataset.format)}catch{}}
   b.setAttribute('aria-pressed',String(active));
 }
}
editor.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text/plain');if(text==null)return;e.preventDefault();try{document.execCommand('insertText',false,text)}catch{}});
// 허용된 글꼴만 HTML 저장/복원에 보존합니다.
function fontKeyFromCSS(value){
 const first=String(value||'').split(',')[0].trim().replace(/^['"]|['"]$/g,'').toLowerCase();
 return Object.keys(fontStacks).find(k=>fontStacks[k].split(',')[0].trim().replace(/^['"]|['"]$/g,'').toLowerCase()===first)||null;
}
function sanitizeHTML(html){
 const temp=document.createElement('div');temp.innerHTML=html;
 for(const node of [...temp.querySelectorAll('*')]){
  if(!['B','STRONG','I','EM','U','S','STRIKE','DEL','BR','DIV','P','SPAN'].includes(node.tagName)){node.replaceWith(...node.childNodes);continue}
  const ss=node.style;
  const weight=ss.fontWeight,style=ss.fontStyle,dec=ss.textDecoration,color=ss.color,bg=ss.backgroundColor,key=fontKeyFromCSS(ss.fontFamily);
  for(const a of [...node.attributes])node.removeAttribute(a.name);
  if(node.tagName==='SPAN'){
   const rules=[];
   if(weight==='bold'||Number(weight)>=600)rules.push('font-weight:600');else if(weight==='normal'||weight==='400')rules.push('font-weight:400');
   if(style==='italic')rules.push('font-style:italic');else if(style==='normal')rules.push('font-style:normal');
   if(dec.includes('underline')||dec.includes('line-through'))rules.push('text-decoration:'+[dec.includes('underline')?'underline':'',dec.includes('line-through')?'line-through':''].filter(Boolean).join(' '));else if(dec==='none')rules.push('text-decoration:none');
   if(/^#[0-9a-f]{3,8}$/i.test(color)||/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(color))rules.push('color:'+color);
   if(bg==='transparent'||/^#[0-9a-f]{3,8}$/i.test(bg)||/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(bg))rules.push('background-color:'+bg);
   if(key)rules.push('font-family:'+fontStacks[key]);
   const sizePx=parseFloat(ss.fontSize);if(Number.isFinite(sizePx)&&sizePx>=9&&sizePx<=32)rules.push('font-size:'+sizePx+'px');
   if(rules.length)node.setAttribute('style',rules.join(';'));
  }
 }
 return temp.innerHTML;
}
// 기존 'batang'은 fontStacks에 존재하지 않으므로 실제 메뉴 값으로 초기화합니다.
baseFontFamily=fontStacks[stored.baseFontFamily]?stored.baseFontFamily:(fontStacks[stored.fontFamily]?stored.fontFamily:'sans');
byId('fontFamily').value=baseFontFamily;
// 색상 입력/글꼴 메뉴를 클릭하면 편집 영역에서 선택한 텍스트가 사라질 수 있어 미리 보관합니다.
let formattingRange=null;
function rememberFormattingRange(){formattingRange=activeTextSelection()||(savedRange&&!savedRange.collapsed?savedRange.cloneRange():null)}
function validFormattingRange(){const r=formattingRange;return r&&!r.collapsed&&editor.contains(r.commonAncestorContainer)?r.cloneRange():null}
function styleSelectedRange(properties, remove=false){
 const range=validFormattingRange();if(!range)return false;
 try{
  const span=document.createElement('span');
  for(const [property,value] of Object.entries(properties))span.style[property]=value;
  span.appendChild(range.extractContents());range.insertNode(span);
  const next=document.createRange();next.selectNodeContents(span);
  const sel=window.getSelection();sel.removeAllRanges();sel.addRange(next);
  savedRange=next.cloneRange();formattingRange=next.cloneRange();
  if(remove){ // 배경색 초기화는 투명으로 덮어쓴 뒤 출력에서도 처리합니다.
   span.style.backgroundColor='transparent';
  }
  return true;
 }catch{return false}
}
byId('fontFamily').addEventListener('pointerdown',rememberFormattingRange);
byId('fontFamily').addEventListener('focus',rememberFormattingRange);
byId('fontFamily').addEventListener('change',async()=>{
 const family=byId('fontFamily').value;
 const selected=validFormattingRange();
 if(selected)styleSelectedRange({fontFamily:fontStacks[family]});
 else baseFontFamily=family;
 syncEditorStyles();persist();draw();
 try{
  await document.fonts.load(`${fontSizeControl.value}px ${fontStacks[family]}`);
  byId('fontStatus').textContent=selected?'선택한 글자의 글꼴을 변경했습니다.':'본문 전체 글꼴을 변경했습니다.';
 }catch{byId('fontStatus').textContent='글꼴을 불러오지 못했습니다. CDN 주소와 인터넷 연결을 확인하세요.'}
 draw();
 formattingRange=null;
});
const highlightColor=byId('highlightColor');
highlightColor.addEventListener('pointerdown',rememberFormattingRange);
highlightColor.addEventListener('focus',rememberFormattingRange);
highlightColor.addEventListener('input',()=>{
 if(!validFormattingRange()){byId('status').textContent='형광펜을 적용할 글자를 먼저 드래그해 주세요.';return}
 if(styleSelectedRange({backgroundColor:highlightColor.value})){
  byId('status').textContent='선택 영역에 형광펜을 적용했습니다.';draw();persist();
 }
});
// 인라인 서식만 삭제하고 문단/줄바꿈은 보존합니다.
function stripInlineFormats(root){
 const nodes=[...root.querySelectorAll('*')].reverse();
 for(const el of nodes){
   if(['SPAN','B','STRONG','I','EM','U','FONT','MARK','S','STRIKE','DEL','SUB','SUP'].includes(el.tagName)){
     el.replaceWith(...el.childNodes);
   }else if(['DIV','P','BR'].includes(el.tagName)){
     el.removeAttribute('style');
   }
 }
}
function refreshAfterFormatClear(message){
 savedRange=null;formattingRange=null;colorRange=null;
 syncEditorStyles();updateToolbar();draw();persist();
 byId('status').textContent=message;
}
// 드래그 선택 부분의 서식만 해제: 기본 글꼴/색상/굵기와 형광펜 모두 초기화
const selectedClear=byId('clearFormat');
selectedClear.addEventListener('mousedown',e=>{e.preventDefault();rememberFormattingRange()});
selectedClear.addEventListener('click',()=>{
 const range=activeTextSelection()||validFormattingRange();
 if(!range){byId('status').textContent='서식을 해제할 글자를 먼저 드래그해 주세요.';return}
 const model=readStyledSelection(range);
 if(!model||model.start===model.end)return;
 for(const p of model.paras)for(const r of p.runs){
   r._pieces=[...r.text].map((ch,i)=>{
     const inside=r.start+i>=model.start && r.start+i<model.end;
     return inside?{...r,text:ch,position:r.start+i,bold:false,italic:false,underline:false,strike:false,color:null,highlight:null,fontFamily:baseFontFamily,size:null}:{...r,text:ch,position:r.start+i};
   });
 }
 renderStyledModel(model,{start:model.start,end:model.end});
 byId('status').textContent='선택한 글자의 서식을 해제했습니다.';
});
// 본문 전체 선택 서식 해제. 내용/엔터는 보존하며 기본 텍스트 서식으로 되돌립니다.
byId('clearAllFormat').addEventListener('click',()=>{
 stripInlineFormats(editor);
 for(const key of Object.keys(globalFormat))globalFormat[key]=false;
 baseFontFamily='sans';byId('fontFamily').value=baseFontFamily;
 byId('ink').value=DEFAULT_COLORS.ink;
 refreshAfterFormatClear('본문 전체의 글자 서식을 해제했습니다.');
});
// 형광펜 지우기는 선택 영역 여부와 무관하게 본문 전체의 형광펜만 지웁니다.
byId('clearHighlight').addEventListener('click',()=>{
 for(const el of editor.querySelectorAll('*')){
   if(el.style && el.style.backgroundColor){
     el.style.removeProperty('background-color');
     if(el.tagName==='SPAN'&&!el.getAttribute('style'))el.replaceWith(...el.childNodes);
   }
   if(el.tagName==='MARK'){
     const span=document.createElement('span');
     span.append(...el.childNodes);
     if(el.getAttribute('style'))span.setAttribute('style',el.getAttribute('style'));
     el.replaceWith(span);
   }
 }
 // 중첩된 투명 형광펜 래퍼도 더 이상 필요하지 않습니다.
 refreshAfterFormatClear('본문 전체의 형광펜을 지웠습니다.');
});
function persist(){try{const s={centerVersion:1,fontMenuVersion:2,colorDefaultsVersion:1,storyHTML:sanitizeHTML(editor.innerHTML),fontFamily:baseFontFamily,baseFontFamily,fontSize:baseFontSize,alignMode,globalFormat:{...globalFormat},spacingDefaultsVersion:2,backgroundMode:byId('backgroundMode').value,gradientAngle:Number(byId('gradientAngle').value),bgEnd:byId('bgEnd').value};for(const id in defs)s[id]=Number(byId(id).value);for(const id of ['bg','ink'])s[id]=byId(id).value;localStorage.setItem('log-maker-settings',JSON.stringify(s))}catch{}}
function initialCrop(){if(!photo)return;const w=photo.naturalWidth,h=photo.naturalHeight;let cw=w,ch=w/ASPECT;if(ch>h){ch=h;cw=h*ASPECT}crop={x:(w-cw)/2,y:(h-ch)/2,w:cw,h:ch};positionCrop()}
function positionCrop(){if(!photo||!crop)return;const w=photo.naturalWidth,h=photo.naturalHeight;Object.assign(byId('cropView').style,{left:100*crop.x/w+'%',top:100*crop.y/h+'%',width:100*crop.w/w+'%',height:100*crop.h/h+'%'})}
function showCrop(){if(!photo)return;byId('cropModal').classList.add('open');byId('editCrop').disabled=false;requestAnimationFrame(positionCrop)}
function hideCrop(){byId('cropModal').classList.remove('open');drag=null}
function showCropLoading(message){byId('cropLoading').textContent=message;byId('cropModal').classList.add('open');}
byId('photo').addEventListener('change',e=>{
 const file=e.target.files?.[0];if(!file)return;
 // Show the editor before decoding; otherwise iOS can appear completely unresponsive.
 showCropLoading('사진을 불러오는 중이에요…');
 byId('cropSource').removeAttribute('src');
 byId('cropView').style.display='none';
 byId('cropApply').disabled=true;
 byId('status').textContent='선택한 사진을 읽고 있어요…';
 const reader=new FileReader();
 reader.onerror=()=>{showCropLoading('사진을 읽지 못했어요. JPG 또는 PNG로 변환한 뒤 다시 선택해 주세요.');byId('status').textContent='사진 파일 읽기에 실패했어요.'};
 reader.onload=()=>{
  const im=new Image();
  im.onload=()=>{
   photo=im;photoURL=reader.result;
   byId('cropSource').src=reader.result;
   byId('cropView').style.display='block';
   byId('cropApply').disabled=false;
   byId('editCrop').disabled=false;
   initialCrop();appliedCrop={...crop};
   draw();showCrop();
   showCropLoading('사진이 준비됐어요! 선택 테두리를 손가락으로 움직이거나 모서리를 끌어 조절하세요.');
   byId('status').textContent='사진을 불러왔어요. 원하는 부분을 선택하고 적용해 주세요.';
  };
  im.onerror=()=>{showCropLoading('이 사진 형식을 브라우저에서 열지 못했어요. 사진 앱에서 JPG/PNG로 저장해 다시 시도해 주세요.');byId('status').textContent='사진 형식을 읽지 못했어요.'};
  im.src=reader.result;
 };
 try{reader.readAsDataURL(file)}catch{showCropLoading('파일을 열 수 없어요. Safari에서 다시 선택해 주세요.')}
});
byId('editCrop').addEventListener('click',showCrop);byId('cropClose').addEventListener('click',hideCrop);byId('cropReset').addEventListener('click',()=>{initialCrop();positionCrop()});
byId('cropApply').addEventListener('click',()=>{if(!photo||!crop)return;appliedCrop={...crop};draw();hideCrop();byId('status').textContent='선택한 사진 영역을 완성본에 적용했어요.'});
byId('cropModal').addEventListener('pointerdown',e=>{if(e.target===byId('cropModal'))hideCrop()});
byId('cropView').addEventListener('pointerdown',e=>{if(!photo||!crop)return;e.preventDefault();drag={type:e.target.id==='cropHandle'?'resize':'move',x:e.clientX,y:e.clientY,rect:{...crop}};try{byId('cropView').setPointerCapture(e.pointerId)}catch{}});
byId('cropView').addEventListener('pointermove',e=>{if(!drag||!photo)return;e.preventDefault();const b=byId('cropSource').getBoundingClientRect();if(!b.width||!b.height)return;const dx=(e.clientX-drag.x)*photo.naturalWidth/b.width,dy=(e.clientY-drag.y)*photo.naturalHeight/b.height,c=drag.rect,pw=photo.naturalWidth,ph=photo.naturalHeight;if(drag.type==='move'){crop={...c,x:Math.max(0,Math.min(pw-c.w,c.x+dx)),y:Math.max(0,Math.min(ph-c.h,c.y+dy))}}else{const delta=(dx+dy*ASPECT)/2;let width=Math.max(pw*.08,c.w+delta);width=Math.min(width,pw-c.x,(ph-c.y)*ASPECT);crop={x:c.x,y:c.y,w:width,h:width/ASPECT}}positionCrop()});
for(const type of ['pointerup','pointercancel','lostpointercapture'])byId('cropView').addEventListener(type,()=>drag=null);
// Parse formatted text and selection markers into character-addressable paragraphs.
// This lets each formatting button toggle only the exact selected characters.
function getParagraphs(){
 return parseStyledText().paras;
}
function parseStyledText(){
 const paras=[{runs:[]}];
 let count=0, startMarker=null,endMarker=null;
 const current=()=>paras[paras.length-1];
 function newline(){paras.push({runs:[]});count++}
 function pushChar(ch,f){
  const runs=current().runs,last=runs[runs.length-1];
  const style={bold:!!f.bold,italic:!!f.italic,underline:!!f.underline,strike:!!f.strike,color:f.color||null,highlight:f.highlight||null,fontFamily:f.fontFamily||baseFontFamily,size:f.size||null};
  if(last&&['bold','italic','underline','strike','color','highlight','fontFamily','size'].every(k=>last[k]===style[k])){last.text+=ch;last.end=count+1}
  else runs.push({...style,text:ch,start:count,end:count+1});
  count++;
 }
 function visit(node,style){
  if(node.nodeType===Node.TEXT_NODE){for(const ch of node.nodeValue.replace(/\r/g,'')){if(ch==='\n')newline();else pushChar(ch,style)}return}
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  if(node.dataset?.selectionMarker==='start'){startMarker=count;return}
  if(node.dataset?.selectionMarker==='end'){endMarker=count;return}
  const tag=node.tagName,block=tag==='DIV'||tag==='P';
  // A lone <br> inside an empty contenteditable block is a caret placeholder,
  // not an additional authored Enter. The enclosing block owns that line.
  if(tag==='BR'){
   const parent=node.parentElement;
   const placeholder=parent && (parent.tagName==='DIV'||parent.tagName==='P')
     && parent.childNodes.length===1;
   if(!placeholder)newline();
   return;
  }
  if(block&&current().runs.length)newline();
  const st={...style};
  if(tag==='B'||tag==='STRONG')st.bold=true;
  if(tag==='I'||tag==='EM')st.italic=true;
  if(tag==='U')st.underline=true;
  if(tag==='S'||tag==='STRIKE'||tag==='DEL')st.strike=true;
  if(tag==='SPAN'||tag==='FONT'||tag==='MARK'){
   const ss=node.style;
   if(ss.fontWeight)st.bold=ss.fontWeight==='bold'||Number(ss.fontWeight)>=600;
   if(ss.fontStyle)st.italic=ss.fontStyle==='italic';
   if(ss.textDecorationLine||ss.textDecoration){
    const dec=ss.textDecorationLine||ss.textDecoration;
    if(dec==='none'){st.underline=false;st.strike=false}
    else {if(dec.includes('underline'))st.underline=true;if(dec.includes('line-through'))st.strike=true}
   }
   if(ss.fontSize){const px=parseFloat(ss.fontSize);if(Number.isFinite(px)&&px>=14&&px<=48)st.size=px/.66;}
   if(ss.color)st.color=ss.color;
   if(ss.backgroundColor)st.highlight=ss.backgroundColor==='transparent'?null:ss.backgroundColor;
   const font=fontKeyFromCSS(ss.fontFamily);if(font)st.fontFamily=font;
  }
  for(const n of [...node.childNodes])visit(n,st);
  if(block&&node.nextSibling)newline();
 }
 const flags={...globalFormat,strike:false,color:null,highlight:null,fontFamily:baseFontFamily};
 for(const n of [...editor.childNodes])visit(n,flags);
 // contenteditable often leaves a trailing <br> in otherwise empty blocks.
 // Keep the original authored newline structure whenever possible.
 return {paras,total:count,start:startMarker,end:endMarker};
}
function readStyledSelection(range){
 if(!range)return parseStyledText();
 try{
  const r=range.cloneRange();
  const end=document.createElement('span'),start=document.createElement('span');
  end.dataset.selectionMarker='end';start.dataset.selectionMarker='start';
  const endRange=r.cloneRange();endRange.collapse(false);endRange.insertNode(end);
  const startRange=r.cloneRange();startRange.collapse(true);startRange.insertNode(start);
  const model=parseStyledText();
  start.remove();end.remove();
  // Text node splitting during marker insertion is expected; no text is lost.
  return model;
 }catch(error){
  editor.querySelectorAll('[data-selection-marker]').forEach(n=>n.remove());
  return null;
 }
}
function renderStyledModel(model,restore){
 const frag=document.createDocumentFragment();
 let newStart=null,newEnd=null;
 for(let pi=0;pi<model.paras.length;pi++){
  const para=model.paras[pi],block=document.createElement('div');
  const pieces=para.runs.flatMap(r=>r._pieces||[...r.text].map((text,i)=>({...r,text,position:r.start+i})));
  for(let i=0;i<pieces.length;){
   const a=pieces[i],index=(a.position??(a.start+i));
   let j=i+1;
   while(j<pieces.length&&['bold','italic','underline','strike','color','highlight','fontFamily','size'].every(k=>pieces[j][k]===a[k]))j++;
   const span=document.createElement('span');
   span.style.fontWeight=a.bold?'600':'400';span.style.fontStyle=a.italic?'italic':'normal';
   span.style.textDecoration=[a.underline?'underline':'',a.strike?'line-through':''].filter(Boolean).join(' ')||'none';
   if(a.color)span.style.color=a.color;
   if(a.highlight)span.style.backgroundColor=a.highlight;
   if(a.fontFamily&&a.fontFamily!==baseFontFamily)span.style.fontFamily=fontStacks[a.fontFamily];
   if(a.size)span.style.fontSize=(a.size*.66)+'px';
   const txt=pieces.slice(i,j).map(c=>c.text).join('');
   const text=document.createTextNode(txt);span.appendChild(text);block.appendChild(span);
   const begin=pieces[i].position??pieces[i].start;
   const finish=(pieces[j-1].position??pieces[j-1].start)+1;
   if(restore){
    if(newStart===null&&restore.start>=begin&&restore.start<=finish)newStart={node:text,offset:restore.start-begin};
    if(newEnd===null&&restore.end>=begin&&restore.end<=finish)newEnd={node:text,offset:restore.end-begin};
   }
   i=j;
  }
  if(!pieces.length)block.appendChild(document.createElement('br'));
  frag.appendChild(block);
 }
 editor.replaceChildren(frag);
 for(const key of Object.keys(globalFormat))globalFormat[key]=false;
 savedRange=null;formattingRange=null;colorRange=null;
 syncEditorStyles();
 if(restore&&newStart&&newEnd){
  const range=document.createRange();range.setStart(newStart.node,newStart.offset);range.setEnd(newEnd.node,newEnd.offset);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);savedRange=range.cloneRange();
 }
 updateToolbar();updateSelectedFontSize();draw();persist();
}
function setupFont(ch,size){size=ch.size||size;ctx.font=`${ch.italic?'italic ':''}${ch.bold?'600 ':''}${size}px ${fontStacks[ch.fontFamily]||fontStacks[baseFontFamily]||fontStacks.sans}`}
function lineWidth(line,size){let w=0;for(const c of line){setupFont(c,size);w+=ctx.measureText(c.text).width}return w}
function layoutParagraph(para,maxW,size){
 const chars=[];for(const r of para.runs)for(const text of r.text)chars.push({...r,text});
 const lines=[];let line=[],w=0;
 for(const ch of chars){setupFont(ch,size);const cw=ctx.measureText(ch.text).width;if(line.length&&w+cw>maxW){lines.push(line);line=[];w=0}line.push(ch);w+=cw}
 lines.push(line);return {lines,blank:chars.length===0};
}
function draw(){
 ctx.clearRect(0,0,W,H);
 // 배경색은 우측 본문 영역에만 적용합니다.
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,PICW,H);
 if(byId('backgroundMode').value==='gradient'){
   const theta=Number(byId('gradientAngle').value)*Math.PI/180;
   const centerX=PICW+(W-PICW)/2,centerY=H/2;
   const radius=(Math.abs(Math.cos(theta))*(W-PICW)+Math.abs(Math.sin(theta))*H)/2;
   const xx=Math.cos(theta)*radius, yy=Math.sin(theta)*radius;
   const grad=ctx.createLinearGradient(centerX-xx,centerY-yy,centerX+xx,centerY+yy);
   grad.addColorStop(0,byId('bg').value);grad.addColorStop(1,byId('bgEnd').value);
   ctx.fillStyle=grad;
 } else {ctx.fillStyle=byId('bg').value;}
 ctx.fillRect(PICW,0,W-PICW,H);
 if(photo&&appliedCrop&&appliedCrop.w>0){const c=appliedCrop;ctx.save();ctx.beginPath();ctx.rect(0,0,PICW,H);ctx.clip();ctx.drawImage(photo,c.x,c.y,c.w,c.h,0,0,PICW,H);ctx.restore()}
 else{ctx.fillStyle='#ebe5ee';ctx.fillRect(0,0,PICW,H);ctx.fillStyle='#9c90a4';ctx.font='22px sans-serif';ctx.textAlign='center';ctx.fillText('사진 영역',PICW/2,H/2)}
 const padding=Number(byId('textPad').value);
 const x=PICW+padding,width=Math.max(1,W-PICW-padding*2),size=baseFontSize,lh=size*Number(byId('lineHeight').value)/100;
 const paragraphs=getParagraphs().map(p=>layoutParagraph(p,width,size));
 // 줄 간격과 문단 간격은 독립적으로 계산합니다.
 // 각 Enter 문단 경계마다 paragraphSpacing(px)을 추가합니다. 빈 문단도 한 줄 높이를 차지합니다.
 const paragraphSpacing=Number(byId('paragraphSpacing').value);
 const lineHeightFactor=Number(byId('lineHeight').value)/100;
 const lineSizes=paragraphs.map(p=>p.lines.map(line=>Math.max(size,...line.map(ch=>ch.size||size))*lineHeightFactor));
 let total=Math.max(0,paragraphs.length-1)*paragraphSpacing;
 for(const heights of lineSizes)total+=heights.reduce((a,b)=>a+b,0);
 let y=(H-total)/2+Number(byId('top').value);const overflow=y<0||y+total>H;
 ctx.save();ctx.beginPath();ctx.rect(PICW,0,W-PICW,H);ctx.clip();ctx.textAlign='left';ctx.textBaseline='top';
 for(let pi=0;pi<paragraphs.length;pi++){
  const p=paragraphs[pi];
  if(pi>0)y+=paragraphSpacing;
  if(p.blank){y+=lineSizes[pi][0];continue;}
  for(let li=0;li<p.lines.length;li++){
    const line=p.lines[li],last=li===p.lines.length-1,lineHeightPx=lineSizes[pi][li];
    const natural=lineWidth(line,size),extra=Math.max(0,width-natural);
    // Justify non-last lines, distributing spacing between words when possible,
    // otherwise between characters (especially important for Korean text).
    let gaps=[];
    if(alignMode==='justify'&&!last&&line.length>1){for(let i=0;i<line.length-1;i++)if(/\s/.test(line[i].text)&&!(/\s/.test(line[i+1].text)))gaps.push(i);
      if(!gaps.length)gaps=Array.from({length:line.length-1},(_,i)=>i)}
    const gapSet=new Set(gaps),perGap=gaps.length?extra/gaps.length:0;
    let pen=x+(alignMode==='center'?Math.max(0,(width-natural)/2):alignMode==='right'?Math.max(0,width-natural):0);
    for(let i=0;i<line.length;i++){
      const ch=line[i];setupFont(ch,size);const m=ctx.measureText(ch.text),cw=m.width;
      if(ch.highlight){ctx.fillStyle=ch.highlight;ctx.fillRect(pen,y,cw+(gapSet.has(i)?perGap:0),lineHeightPx)}
      ctx.fillStyle=ch.color||byId('ink').value;ctx.fillText(ch.text,pen,y);
      if(ch.underline){ctx.fillRect(pen,y+size*1.03,cw,Math.max(1,size*.045))}
      if(ch.strike){ctx.fillRect(pen,y+size*.52,cw,Math.max(1,size*.045))}
      pen+=cw+(gapSet.has(i)?perGap:0)
    }
    y+=lineHeightPx;
  }
 }
 ctx.restore();
 if(overflow)byId('status').textContent='글이 영역을 넘쳤어요. 글자 크기·줄 간격·문단 간격을 조절해 주세요.';
 else if(byId('status').textContent.startsWith('글이 영역을 넘쳤어요'))byId('status').textContent='';
}
// 모바일 Safari는 download 속성이 무시될 수 있어 공유/이미지 보기를 함께 제공합니다.
function showMobileSavePreview(data){
 const old=document.querySelector('.mobile-save-preview');if(old)old.remove();
 const layer=document.createElement('div');layer.className='mobile-save-preview';
 layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','PNG 이미지 저장');
 const msg=document.createElement('p');msg.textContent='아이폰에서는 이미지를 길게 눌러 “사진 앱에 저장”을 선택하세요.';
 const img=document.createElement('img');img.src=data;img.alt='완성된 로그 이미지';
 const open=document.createElement('a');open.href=data;open.target='_blank';open.rel='noopener';open.textContent='이미지 새 탭에서 열기';
 const close=document.createElement('button');close.type='button';close.textContent='닫기';close.addEventListener('click',()=>layer.remove());
 layer.append(msg,img,open,close);document.body.appendChild(layer);
}
function pngBlobFromDataURL(data){
 const binary=atob(data.substring(data.indexOf(',')+1));
 const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new Blob([bytes],{type:'image/png'});
}
function downloadPNG(blob){
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');
 a.href=url;a.download='No_More_PS_로그.png';a.style.display='none';
 document.body.appendChild(a);a.click();
 setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},60000);
}
byId('save').addEventListener('click',async()=>{
 const status=byId('status');
 status.textContent='PNG 이미지를 생성하고 있습니다…';
 try{
  draw();
  const data=canvas.toDataURL('image/png');
  if(!data.startsWith('data:image/png'))throw new Error('PNG 변환에 실패했습니다.');
  const isIOS=/iPad|iPhone|iPod/i.test(navigator.userAgent)||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isIOS){
   // 먼저 이미지 화면을 보여 줍니다. 공유가 실패하더라도 저장할 수 있도록 합니다.
   showMobileSavePreview(data);
   status.textContent='저장 화면을 열었습니다. 이미지를 길게 눌러 저장할 수 있어요.';
   if(navigator.share && navigator.canShare){
    const file=new File([pngBlobFromDataURL(data)],'No_More_PS_로그.png',{type:'image/png'});
    if(navigator.canShare({files:[file]})){
     try{await navigator.share({files:[file],title:'로그 PNG 이미지'});document.querySelector('.mobile-save-preview')?.remove();status.textContent='공유 메뉴가 열렸습니다.';}
     catch(err){if(err.name!=='AbortError')status.textContent='공유 메뉴를 열지 못했습니다. 표시된 이미지를 길게 눌러 저장하세요.';}
    }
   }
   return;
  }
  downloadPNG(pngBlobFromDataURL(data));
  status.textContent='PNG 다운로드를 요청했습니다. 브라우저 다운로드 목록을 확인하세요.';
 }catch(error){status.textContent='PNG 저장 오류: '+(error.message||String(error));}
});
byId('reset').addEventListener('click',()=>{
 for(const id in defs)byId(id).value=byId(id+'Num').value=defs[id];
 for(const id of ['ink','bg','bgEnd'])byId(id).value=DEFAULT_COLORS[id];
 byId('backgroundMode').value=DEFAULT_BACKGROUND.mode;
 byId('gradientAngle').value=String(DEFAULT_BACKGROUND.angle);
 for(const key of Object.keys(globalFormat))globalFormat[key]=false;
 syncBackgroundControls();updateToolbar();
 colorRange=null;syncEditorStyles();draw();persist();
});
syncEditorStyles();updateToolbar();
if(document.fonts?.ready)document.fonts.ready.then(draw);draw();
})();
