import {calibrate,createGame,stepGame,W,H,BIRD_X,PIPE_W} from './game.mjs?v=20261028-gentle-challenge';
import {createRecords} from './records.mjs';
import {loadTracker,cameraError} from './camera.mjs?v=20261027-loading2';
import {eyeCenter,toPreview} from './tracking.mjs';
import {createGameAudio,transitionSounds} from './audio.mjs';
const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),ctx=canvas.getContext('2d'),video=$('camera');
let storage;try{storage=localStorage;}catch{storage=null;}
const records=createRecords(storage);
const sound=createGameAudio({storage,onChange:updateSoundButton});
let mode='camera',state='idle',game=createGame(),calibration=null,tracker=null,stream=null;
let generation=0,lastFrame=0,lastVideo=-1,lastInference=0,lastSeen=0,eyeY=null,head=.5,rawHead=.5,eyeSource=null,eyePoint=null;
let calPhase='high',samples=[],highSamples=[],collecting=false,collectStarted=0,collectLast=0,countdownEnd=0,pauseReason='',loadingTimer,loadController;
let held=0,pointer=null,demoTarget=.5,lastModeText='';
const birdSvg='<svg class="hero-bird" viewBox="0 0 96 80" aria-hidden="true"><path d="M18 26H8V48H19" fill="#e4a749"/><path d="M22 17H64V24H75V57H62V65H27V58H18V28H22Z" fill="#e8c951" stroke="#182f2b" stroke-width="4"/><path d="M22 37H45V55H22Z" fill="#f6e9ac" stroke="#182f2b" stroke-width="4"/><path d="M53 17H70V40H53Z" fill="#fffdf0" stroke="#182f2b" stroke-width="4"/><path d="M64 23H69V34H64Z" fill="#182f2b"/><path d="M70 42H90V51H70Z" fill="#ed925b" stroke="#182f2b" stroke-width="4"/></svg>';
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function panel(html){$('overlay').hidden=false;$('panel').innerHTML=html;}
function button(id,text,kind='primary'){return `<button id="${id}" class="${kind}">${text}</button>`;}
function bind(id,fn){$(id)?.addEventListener('click',fn);}
function refreshRecords(){
 $('bestIntro').innerHTML=String(records.get('camera')).padStart(2,'0')+'<span>分</span>';
 if(!records.available)$('storageTip').textContent='浏览器未允许保存：本次纪录关闭后可能丢失';
}
function updateSoundButton(){
 const status=sound.status,button=$('soundBtn');
 button.textContent=status==='muted'?'声音：关':status==='blocked'?'点此开声':status==='unavailable'?'重试声音':'声音：开';
 button.setAttribute('aria-pressed',String(status!=='muted'&&status!=='blocked'&&status!=='unavailable'));
 button.setAttribute('aria-label',status==='muted'?'开启声音':status==='blocked'||status==='unavailable'?'重试开启声音':'关闭声音');
 button.title=status==='unavailable'?'声音暂不可用，点击重试；仍可继续游戏':status==='blocked'?'点击开启声音':'音乐与音效';
}
function unlockSound(){const pending=sound.unlock();updateSoundButton();void pending.then(updateSoundButton);}
function label(text){if(lastModeText===text)return;lastModeText=text;$('modeLabel').innerHTML='<i></i>'+text;}
function showHome(){
 sound.stop();
 state='idle';game=createGame();head=.5;$('scoreboard').hidden=true;$('pauseBtn').hidden=true;$('trackingBar').hidden=true;$('demoControls').hidden=true;$('exitBtn').hidden=true;$('idleCaption').hidden=false;
 label('准备起飞');
 panel(birdSvg+'<p class="kicker">A LITTLE MOVEMENT. A LITTLE FLIGHT.</p><h2>你的身体，就是手柄。</h2><p>撑起时往上飞，下降时往下飞。<br>穿过空隙，收获你的下一分。</p>'+button('startCamera','开启相机，准备起飞 ↗')+button('demoStart','先手动试玩','secondary')+'<p class="privacy">点击后才申请相机 · 不申请麦克风</p>');
 bind('startCamera',startCamera);bind('demoStart',startDemo);refreshRecords();
}
function stopCamera(){
 generation++;clearTimeout(loadingTimer);loadController?.abort();loadController=null;collecting=false;
 const active=stream;stream=null;if(active)active.getTracks().forEach(t=>t.stop());
 video.srcObject=null;video.style.display='none';
 if(tracker){tracker.close();tracker=null;}
 eyeY=null;eyeSource=null;eyePoint=null;$('eyeTarget').hidden=true;lastSeen=0;lastVideo=-1;
}
function exit(){stopCamera();calibration=null;showHome();}
function errorPanel(title,message){
 sound.stop();
 stopCamera();state='error';$('pauseBtn').hidden=true;$('trackingBar').hidden=true;$('exitBtn').hidden=false;$('idleCaption').hidden=true;
 panel('<p class="kicker">LET’S TRY AGAIN</p><h2>'+escape(title)+'</h2><p role="alert">'+escape(message)+'</p>'+button('retryCamera','重新开启相机')+button('errorDemo','先手动试玩','secondary')+button('errorBack','返回首页','text-button'));
 bind('retryCamera',startCamera);bind('errorDemo',startDemo);bind('errorBack',exit);label('还没连接相机');
}
async function startCamera(){
 sound.stop();unlockSound();
 stopCamera();mode='camera';state='loading';game=createGame();$('demoControls').hidden=true;$('scoreboard').hidden=true;$('pauseBtn').hidden=true;$('trackingBar').hidden=true;$('exitBtn').hidden=false;$('idleCaption').hidden=true;
 const id=generation;
 loadController=new AbortController();
 const loadSignal=loadController.signal;
 label('连接前置相机');
 panel('<div class="loading-mark"></div><h2>先和镜头打个招呼</h2><p id="loadText" role="status">请在浏览器提示中允许相机。<br>只使用视频，不使用麦克风。</p>'+button('cancelLoad','取消','text-button'));
 bind('cancelLoad',exit);
 if(!isSecureContext){errorPanel('需要安全的打开方式','请用 HTTPS 链接打开本页面。手机不能通过普通的局域网 HTTP 地址启动相机。');return;}
 if(!navigator.mediaDevices?.getUserMedia){errorPanel('这个浏览器无法开启相机','请在 Safari 或 Chrome 中打开本页面，再试一次。');return;}
 loadingTimer=setTimeout(()=>{if(generation===id&&state==='loading')errorPanel('连接等待时间较长','相机或识别资源还没有准备好。请检查网络，并确认已同意相机权限，再重试。');},90000);
 let cameraReady=false;
 try {
  const incoming=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'user'},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}}});
  if(generation!==id){incoming.getTracks().forEach(t=>t.stop());return;}
  stream=incoming;video.srcObject=stream;await video.play();
  if(generation!==id)return;
  video.style.display='block';cameraReady=true;
  stream.getVideoTracks()[0].addEventListener('ended',()=>{if(generation===id)errorPanel('相机连接中断','摄像头已停止，请重新开启并校准。');});
  $('loadText').textContent='正在加载本机识别资源，首次打开可能需要一些时间…';
  const loaded=await loadTracker({signal:loadSignal,onProgress:message=>{if(generation===id&&state==='loading'&&$('loadText'))$('loadText').textContent=message;}});
  if(generation!==id){loaded.close();return;}
  tracker=loaded;clearTimeout(loadingTimer);lastVideo=-1;lastInference=0;lastSeen=0;eyeY=null;
  $('trackingBar').hidden=false;beginCalibration();
 } catch(e){if(generation!==id)return;errorPanel(cameraReady?'识别资源没有准备好':'相机没有开启',cameraReady?(e.message||'识别资源启动失败，请切换网络或浏览器后重试。'):cameraError(e));}
}
function startDemo(){
 sound.stop();unlockSound();
 stopCamera();mode='demo';calibration=null;$('exitBtn').hidden=false;$('idleCaption').hidden=true;$('trackingBar').hidden=true;$('demoControls').hidden=false;
 label('手动试玩 · 独立纪录');
 panel(birdSvg+'<h2>先练练飞行手感</h2><p>按住下方 ↑ / ↓，或在画面上拖动。<br>电脑也可用方向键控制。<br>手动试玩成绩与体感纪录分开保存。</p>'+button('demoGo','开始手动试玩')+button('demoCamera','切换到摄像头','text-button'));
 state='demo-ready';bind('demoGo',beginCountdown);bind('demoCamera',startCamera);
}
function beginCalibration(){
 sound.stop();
 state='calibrating';calibration=null;calPhase='high';samples=[];highSamples=[];collecting=false;$('pauseBtn').hidden=true;$('scoreboard').hidden=true;label('体感模式 · 高度校准');renderCalibration();
}
function renderCalibration(message=''){
 const high=calPhase==='high';
 panel('<p class="kicker">CALIBRATION / '+(high?'01':'02')+'</p><div class="cal-visual">'+(high?'↟':'↡')+'</div><h2>'+(high?'先保持撑起的高度':'再保持下降的高度')+'</h2><p>'+(high?'固定手机，让脸部完整入镜。<br>保持较高位置，准备好后采集。':'身体降到舒适的较低位置。<br>保持双眼可见，准备好后采集。')+'</p><div class="progress"><span id="calProgress"></span></div><p class="cal-status" id="calStatus" role="status">'+escape(message||'请先让镜头找到你的脸')+'</p>'+button('capture',high?'采集撑起位置':'采集下降位置')+button('calRestart','重新校准','text-button'));
 bind('capture',()=>{if(!faceReady()){ $('calStatus').textContent='还没看到脸，请调整手机角度。';return;}samples=[];collecting=true;collectStarted=performance.now();collectLast=0;$('capture').disabled=true;});bind('calRestart',beginCalibration);
}
function faceReady(){return eyeY!==null&&performance.now()-lastSeen<450;}
function updateCalibration(now){
 if(!collecting){if($('capture'))$('capture').disabled=!faceReady();return;}
 if(!faceReady()){
  collecting=false;samples=[];renderCalibration('脸部暂时离开镜头，请重新采集。');return;
 }
 if(now-lastSeen<100&&lastSeen>collectLast){samples.push(eyeY);collectLast=lastSeen;}
 const elapsed=now-collectStarted;
 $('calProgress').style.width=Math.min(100,elapsed/1500*100)+'%';$('calStatus').textContent='保持这个高度… '+Math.max(1,Math.ceil((1500-elapsed)/1000));
 if(elapsed<1500)return;
 collecting=false;
 if(samples.length<10){renderCalibration('有效画面不足，请保持脸部可见后重试。');return;}
 if(calPhase==='high'){highSamples=samples.slice();calPhase='low';renderCalibration('上方高度已记录，请降低身体。');return;}
 try{
  calibration=calibrate(highSamples,samples);
  state='ready';label('校准完成 · 准备起飞');
  panel(birdSvg+'<h2>眼睛对准，小鸟就位</h2><p>撑起往上飞，下降往下飞。<br>小鸟中心跟随双眼中间的位置。<br>识别不到脸时会自动暂停。</p>'+button('cameraGo','开始体感挑战')+button('calAgain','重新校准','text-button'));
  bind('cameraGo',()=>{if(faceReady())beginCountdown();else errorReady();});bind('calAgain',beginCalibration);
 }catch(e){calPhase='high';highSamples=[];renderCalibration(e.message+'。');}
}
function errorReady(){panel('<h2>先回到镜头前</h2><p>镜头还没有看到你的脸。<br>调整位置后再开始。</p>'+button('readyRetry','我准备好了')+button('readyCal','重新校准','text-button'));bind('readyRetry',()=>{if(faceReady())beginCountdown();});bind('readyCal',beginCalibration);}
function beginCountdown(){
 sound.stop();unlockSound();
 game=createGame(mode==='camera'?calibration:null);head=mode==='demo'?.5:(faceReady()?eyeY:.5);rawHead=head;demoTarget=.5;
 if(mode==='camera'&&eyePoint){game.birdX=eyePoint.x*W;game.birdY=eyePoint.y*H;}
 state='countdown';countdownEnd=performance.now()+3000;pauseReason='';$('scoreboard').hidden=false;$('score').textContent='0';$('pace').textContent='轻松节奏';$('pauseBtn').hidden=true;
 panel('<p class="kicker">READY TO FLY</p><h2 id="countdown" style="font-size:72px">3</h2><p>身体起伏，带小鸟穿过空隙</p>');
 label(mode==='demo'?'手动试玩 · 独立纪录':'体感模式 · 头部控制');
}
function pause(reason='manual'){
 sound.stop();
 if(!['playing','countdown','resuming'].includes(state))return;
 game.paused=true;state='paused';pauseReason=reason;$('pauseBtn').hidden=true;held=0;
 const title=reason==='lost'?'小鸟在等你回来':reason==='background'?'回来后，再出发':'休息一下也很好';
 const msg=reason==='lost'?'暂时看不到你的脸，飞行已暂停。<br>保持脸部入镜，再点击继续。':'飞行已暂停，分数和障碍保持原位。<br>准备好后点击继续。';
 panel('<p class="kicker">TAKE YOUR TIME</p><h2>'+title+'</h2><p>'+msg+'</p>'+button('resume','继续飞行')+(mode==='camera'?button('pauseCal','重新校准','secondary'):'')+button('pauseExit','结束并返回','text-button'));
 bind('resume',resume);bind('pauseCal',beginCalibration);bind('pauseExit',exit);
}
function resume(){
 sound.stop();unlockSound();
 if(mode==='camera'&&!faceReady()){pauseReason='lost';$('resume').textContent='请先让脸部回到镜头中';return;}
 game.paused=false;state='resuming';countdownEnd=performance.now()+2000;
 panel('<h2 id="countdown" style="font-size:64px">2</h2><p>回到刚才的高度，准备继续</p>');
}
function finish(){
 state='over';$('pauseBtn').hidden=true;records.save(mode,game.score);refreshRecords();
 panel('<p class="kicker">NICE FLIGHT</p><h2>每次撑起，都是进步。</h2><div class="big-score">'+game.score+'</div><p style="margin:0">本局穿越</p><div class="result-stats"><span>'+(mode==='demo'?'手动':'体感')+'最高 <b>'+records.get(mode)+'</b></span><span>挑战 '+game.challengeWins+' 次 · 奖励 +'+game.bonusPoints+'</span></div>'+button('again','再飞一局')+(mode==='camera'?button('againCal','重新校准','secondary'):button('tryCamera','用身体来挑战','secondary'))+button('resultExit','返回首页并关闭相机','text-button'));
 bind('again',()=>{if(mode==='camera'&&!faceReady()){errorReady();state='ready';}else beginCountdown();});bind('againCal',beginCalibration);bind('tryCamera',startCamera);bind('resultExit',exit);
}
function infer(now){
 if(!tracker||video.readyState<2||document.hidden||now-lastInference<65)return;
 if(video.currentTime===lastVideo){if(now-lastSeen>450)eyeY=null;return;}
 lastVideo=video.currentTime;lastInference=now;
 try{
  const result=tracker.detectForVideo(video,now),face=result.faceLandmarks?.[0];
  eyeSource=eyeCenter(face);
  updateEyePoint();
  if(eyePoint?.visible){eyeY=eyePoint.y;rawHead=eyeY;lastSeen=now;}
  else eyeY=null;
 }catch{errorPanel('识别暂时中断','设备未能继续处理摄像头画面。请重新开启相机，或先手动试玩。');}
}
function updateEyePoint(){
 eyePoint=toPreview(eyeSource,video.videoWidth,video.videoHeight,canvas.clientWidth,canvas.clientHeight);
 if(!eyePoint?.visible){eyeY=null;return;}
 eyeY=eyePoint.y;rawHead=eyeY;
}
function bird(x,y,size=1,angle=0){
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(size,size);
 ctx.fillStyle='#142e24';ctx.fillRect(-17,-13,29,27);ctx.fillRect(-13,-17,20,35);
 ctx.fillStyle='#edcd5c';ctx.fillRect(-14,-11,26,23);ctx.fillRect(-10,-14,17,28);
 ctx.fillStyle='#fff2b5';ctx.fillRect(-18,0,18,10);ctx.fillStyle='#1b3429';ctx.fillRect(-18,0,18,2);
 ctx.fillStyle='#fffef2';ctx.fillRect(3,-14,14,17);ctx.fillStyle='#19362a';ctx.fillRect(12,-10,4,10);
 ctx.fillStyle='#ed925b';ctx.fillRect(11,4,18,8);ctx.fillStyle='#19362a';ctx.fillRect(11,11,18,2);ctx.restore();
}
function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function pipe(p){
 const top=p.center-p.gap/2,bottom=p.center+p.gap/2;
 const gradient=ctx.createLinearGradient(p.x,0,p.x+PIPE_W,0);gradient.addColorStop(0,p.challenge?'#c4863e':'#a0b967');gradient.addColorStop(.28,p.challenge?'#f6d084':'#c0d98b');gradient.addColorStop(1,p.challenge?'#a76732':'#6c8c4d');ctx.fillStyle=gradient;
 for(const [y,h] of [[-10,top+10],[bottom,H-bottom+10]]){
  ctx.fillRect(p.x,y,PIPE_W,h);ctx.strokeStyle=p.challenge?'#624522':'#234330';ctx.lineWidth=3;ctx.strokeRect(p.x,y,PIPE_W,h);ctx.fillStyle='#dff0b044';ctx.fillRect(p.x+7,y,5,h);ctx.fillStyle=gradient;
 }
 for(const y of [top-20,bottom]){rounded(p.x-5,y,PIPE_W+10,20,3);ctx.fill();ctx.stroke();ctx.fillStyle='#e3f5bb55';ctx.fillRect(p.x,y+3,PIPE_W,3);ctx.fillStyle=gradient;}
}
function draw(now){
 const dpr=Math.min(devicePixelRatio||1,2);const targetW=Math.round(canvas.clientWidth*dpr),targetH=Math.round(canvas.clientHeight*dpr);
 if(canvas.width!==targetW||canvas.height!==targetH){canvas.width=targetW;canvas.height=targetH;}
 ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);
 if(!stream){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#304d3e');g.addColorStop(1,'#142f24');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#cfe2ac0b';ctx.lineWidth=1;for(let x=0;x<W;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}for(let y=0;y<H;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.fillStyle='#73956422';ctx.beginPath();ctx.ellipse(10,H+70,200,260,-.5,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(350,H+80,160,210,.4,0,7);ctx.fill();
 }
 if(['idle','loading','error','demo-ready'].includes(state)){
  ctx.globalAlpha=.32;pipe({x:294,center:265,gap:320});pipe({x:-39,center:355,gap:380});ctx.globalAlpha=1;
  ctx.fillStyle='#cde3a7';for(let i=0;i<7;i++){ctx.globalAlpha=.10;ctx.beginPath();ctx.arc((i*71+20)%W,80+(i*113)%480,2,0,7);ctx.fill();}ctx.globalAlpha=1;
 }else{
  for(const p of game.obstacles)pipe(p);
  const y=['playing','paused','resuming','over'].includes(state)?game.birdY:head*H;
  const anchored=mode==='camera'&&eyePoint?.visible&&state!=='over';
  const x=anchored?eyePoint.x*W:(mode==='camera'?game.birdX:BIRD_X);
  bird(x,anchored?eyePoint.y*H:y,1.05,Math.max(-.25,Math.min(.25,(rawHead-head)*2)));
  if(state==='playing'&&game.obstacles.length===0){ctx.font='11px "PingFang SC",sans-serif';ctx.fillStyle='#eff8d4b0';ctx.textAlign='center';ctx.fillText('找到节奏，第一组障碍就要来了',W/2,H*.72);}
 }
}
function soundSnapshot(){return {score:game.score,over:game.over,passedCount:game.passedCount,pacePoints:game.pacePoints,phase:game.phase,challengeWins:game.challengeWins};}
function updateChallengeUI(){
 const visible=state==='playing';
 $('stage').classList.toggle('challenge-active',visible&&game.phase==='challenge');
 $('stage').classList.toggle('challenge-warning',visible&&game.phase==='warning');
 const warning=visible&&game.phase==='warning',reward=visible&&game.phase==='normal'&&game.rewardUntil>game.time;
 $('stage').classList.toggle('challenge-notice',warning||reward);
 $('challengeBanner').hidden=!(warning||reward);
 if(warning){
  const seconds=Math.max(0,Math.ceil(game.warningUntil-game.time));
  $('challengeTag').textContent='⚡ 挑战即将来临';$('challengeTitle').textContent='准备迎来一波阻碍';
  $('challengeDetail').textContent=(seconds?seconds+' 秒后准备出发':'等待场上障碍通过')+' · 连续 '+game.challenge.total+' 个 · 临时提速 10%';
 }else if(reward){
  $('challengeTag').textContent='第 '+game.challengeWins+' 次挑战成功';$('challengeTitle').textContent='挑战通过！额外 +'+game.lastReward+' 分';
  $('challengeDetail').textContent='恢复原来的音乐和速度，继续飞行';
 }
 if(visible){
  if(game.phase==='challenge'){
   label('⚡ 挑战波 · 第 '+(game.challengeWins+1)+' 次');$('pace').textContent='已通过 '+game.challenge.cleared+' / '+game.challenge.total+' · 临时 +10%';
  }else if(warning){label('⚡ 准备挑战');$('pace').textContent='挑战预告 · 当前速度已锁定';}
  else {
   label(mode==='demo'?'手动试玩 · 独立纪录':'体感模式 · 眼睛控制');
   $('pace').textContent=game.pacePoints<6?'基础节奏':('速度 +'+Math.min(25,Math.floor(game.pacePoints/6)*5)+'%'+(game.pacePoints>=30?' · 已封顶':''));
  }
 }
}
function tick(now){
 document.body.classList.toggle("active",state!=="idle");
 const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):0;lastFrame=now;
 if(mode==='camera'&&stream){infer(now);if(eyeSource&&eyeY!==null)updateEyePoint();}
 const good=faceReady();
 $('eyeTarget').hidden=!(mode==='camera'&&stream&&good&&['calibrating','ready','countdown','resuming','paused'].includes(state));
 if(good&&eyePoint){$('eyeTarget').style.left=(eyePoint.x*100)+'%';$('eyeTarget').style.top=(eyePoint.y*100)+'%';}
 if(mode==='camera'&&stream){$('trackingText').textContent=good?'已锚定双眼 · 保持眼睛入镜':'请让双眼回到画面中…';$('trackingDot').classList.toggle('good',good);}
 if(state==='calibrating')updateCalibration(now);
 if(['playing','countdown','resuming'].includes(state)&&mode==='camera'&&!good)pause('lost');
 if(state==='paused'&&$('resume')){$('resume').disabled=mode==='camera'&&!good;if(good)$('resume').textContent='继续飞行';}
 if(state==='countdown'||state==='resuming'){
  const n=Math.ceil((countdownEnd-now)/1000);if($('countdown'))$('countdown').textContent=String(Math.max(1,n));
  if(now>=countdownEnd){state='playing';game.paused=false;$('overlay').hidden=true;$('pauseBtn').hidden=false;game.birdY=head*H;}
 }
 if(mode==='demo'){
  if(held)demoTarget=Math.max(.18,Math.min(.82,demoTarget+held*dt*.6));
  rawHead=demoTarget;
 }
 if(mode==='camera')head=rawHead;
 else if(['playing','countdown','resuming','ready','calibrating'].includes(state))head+=(rawHead-head)*(1-Math.exp(-dt*14));
 if(state==='playing'){
  const before=soundSnapshot();
  stepGame(game,dt,mode==='camera'?{x:eyePoint.x,y:head}:head);$('score').textContent=String(game.score);
  const events=transitionSounds(before,soundSnapshot());
  if(game.over)sound.stop();
  for(let i=0;i<events.length;i++)sound.effect(events[i],events[i]==='speed'&&events.includes('pass')?.13:i*.035);
  if(game.over)finish();
 }
 updateChallengeUI();
 sound.setTheme(game.phase==='normal'?'normal':'challenge');
 sound.setPlaying(state==='playing'&&!document.hidden);
 draw(now);requestAnimationFrame(tick);
}
$('soundBtn').addEventListener('click',()=>{
 if(sound.status==='blocked'||sound.status==='unavailable')unlockSound();
 else {sound.setMuted(!sound.muted);if(!sound.muted)unlockSound();}
 updateSoundButton();
});
updateSoundButton();
$('pauseBtn').addEventListener('click',()=>pause());$('exitBtn').addEventListener('click',exit);
function setHeld(el,direction){el.addEventListener('pointerdown',e=>{held=direction;el.setPointerCapture(e.pointerId);});for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,()=>{held=0;});}
setHeld($('upBtn'),-1);setHeld($('downBtn'),1);
const stage=$('stage');
function movePointer(e){const r=stage.getBoundingClientRect();demoTarget=Math.max(.18,Math.min(.82,(e.clientY-r.top)/r.height));}
stage.addEventListener('pointerdown',e=>{if(mode==='demo'&&state==='playing'&&!e.target.closest('button')){pointer=e.pointerId;stage.setPointerCapture(pointer);movePointer(e);}});
stage.addEventListener('pointermove',e=>{if(pointer===e.pointerId)movePointer(e);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,()=>{pointer=null;});
document.addEventListener('keydown',e=>{if(mode==='demo'&&['playing','countdown'].includes(state)&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();held=e.key==='ArrowUp'?-1:1;}if(e.code==='Space'&&state==='playing'){e.preventDefault();pause();}});
document.addEventListener('keyup',e=>{if(['ArrowUp','ArrowDown'].includes(e.key))held=0;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){sound.stop();held=0;pause('background');if(state==='calibrating'&&collecting){collecting=false;samples=[];renderCalibration('采集已暂停，请回到镜头前重新采集。');}}lastFrame=0;});
window.addEventListener('pagehide',()=>{sound.stop();stopCamera();showHome();});
window.addEventListener('blur',()=>{sound.stop();held=0;pause('background');});
showHome();requestAnimationFrame(tick);
