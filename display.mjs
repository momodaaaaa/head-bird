// 全屏功能独立于游戏计分；不支持原生全屏时明确降级为网页铺满。
const button=document.getElementById('fullscreenBtn');
const column=document.querySelector('.play-column');
const help=document.getElementById('fullscreenHelp');
const standalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
button.hidden=standalone();
let expanded=false,helpShown=false;
function nativeElement(){return document.fullscreenElement||document.webkitFullscreenElement;}
function render(){
 const active=expanded||!!nativeElement();
 document.body.classList.toggle('immersive',active);
 button.textContent=active?'退出':'全屏';
 button.setAttribute('aria-label',active?'退出全屏布局':'全屏游戏');
 button.setAttribute('aria-pressed',String(active));
 button.title=active?'退出全屏布局':'全屏游戏';
}
async function toggle(){
 if(expanded||nativeElement()){
  expanded=false;
  try{if(nativeElement())await (document.exitFullscreen?.()||document.webkitExitFullscreen?.());}catch{}
  render();return;
 }
 const request=column.requestFullscreen||column.webkitRequestFullscreen;
 if(request&&(document.fullscreenEnabled||document.webkitFullscreenEnabled)){
  try{await request.call(column);if(nativeElement()){expanded=false;render();return;}}catch{}
 }
 expanded=true;render();
 if(!standalone()&&!helpShown){helpShown=true;help.showModal();}
}
button.addEventListener('click',()=>{void toggle();});
for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,()=>{if(nativeElement())expanded=false;render();});
document.getElementById('fullscreenHelpClose').addEventListener('click',()=>help.close());
document.getElementById('fullscreenGuide').addEventListener('click',()=>help.showModal());
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!help.open&&expanded){expanded=false;render();}});
render();
