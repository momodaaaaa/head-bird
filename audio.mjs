// 通过数、普通进度与奖励各自独立；兼容只提供分数的旧调用。
export function transitionSounds(before,after){
 if(!before.over&&after.over)return ['fail'];
 if(before.over||after.over)return [];
 const passedBefore=before.passedCount??before.score,passedAfter=after.passedCount??after.score;
 const events=Array(Math.min(20,Math.max(0,passedAfter-passedBefore))).fill('pass');
 const paceBefore=before.pacePoints??before.score,paceAfter=after.pacePoints??after.score;
 const enteringChallenge=after.phase==='challenge'&&before.phase!=='challenge';
 if(enteringChallenge||Math.min(5,Math.floor(paceAfter/6))>Math.min(5,Math.floor(paceBefore/6)))events.push('speed');
 if(after.phase==='warning'&&before.phase!=='warning')events.push('warning');
 if((after.challengeWins??0)>(before.challengeWins??0))events.push('win');
 return events;
}
const TAU=Math.PI*2;
const hz=midi=>440*Math.pow(2,(midi-69)/12);
function tone(samples,rate,start,duration,midi,gain,endMidi=midi){
 const first=Math.round(start*rate),length=Math.floor(duration*rate),f0=hz(midi),f1=hz(endMidi);
 for(let i=0;i<length&&first+i<samples.length;i++){
  const t=i/rate,phase=TAU*(f0*t+(f1-f0)*t*t/(2*duration));
  const envelope=Math.min(1,t/.006)*Math.pow(1-t/duration,2);
  samples[first+i]+=gain*envelope*(Math.sin(phase)+.12*Math.sin(phase*2)+.04*Math.sin(phase*3));
 }
}
// 轻快的八小节原创旋律。直接合成波形，不下载音乐文件。
export function renderSound(kind,sampleRate=22050){
 if(kind==='challenge'){
  // 144 拍的八小节小调：短促琶音、切分低音和更密的鼓点构成挑战感。
  const beat=60/144,bar=beat*4,samples=new Float32Array(Math.round(bar*8*sampleRate));
  const chords=[[45,48,52],[41,45,48],[50,53,57],[40,44,47]];
  const lead=[76,72,71,72,79,76,74,71];let seed=127;
  for(let b=0;b<8;b++){
   const chord=chords[b%4];
   for(let n=0;n<16;n++){
    const start=b*bar+n*beat/4;
    tone(samples,sampleRate,start,beat*.19,chord[(n+(b%2))%3]+24,.046);
    if(n%2===0){
     tone(samples,sampleRate,start,beat*.33,chord[0]+(n%4?12:0),.082);
     for(let j=0;j<Math.floor(.035*sampleRate);j++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const i=Math.round(start*sampleRate)+j;
      if(i<samples.length)samples[i]+=(seed/4294967296*2-1)*.018*Math.exp(-j/sampleRate*110);
     }
    }
    if([0,6,8,14].includes(n))tone(samples,sampleRate,start,.11,38,.075,24);
    if(n===4||n===12){
     tone(samples,sampleRate,start,.09,50,.03,39);
     for(let j=0;j<Math.floor(.075*sampleRate);j++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const i=Math.round(start*sampleRate)+j;
      if(i<samples.length)samples[i]+=(seed/4294967296*2-1)*.035*Math.exp(-j/sampleRate*65);
     }
    }
   }
   for(let n=0;n<8;n++)tone(samples,sampleRate,b*bar+n*beat/2,beat*.38,lead[(n+b)%8]+(b%4===3?-1:0),.067);
  }
  const fade=Math.ceil(sampleRate*.005);
  for(let i=0;i<fade;i++){samples[i]*=i/fade;samples[samples.length-1-i]*=i/fade;}
  return {samples,sampleRate};
 }
 if(kind==='music'){
  const beat=60/112,bar=beat*4,samples=new Float32Array(Math.round(bar*8*sampleRate));
  const chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]];
  const melody=[
   [76,79,81,79,76,74,72,74],[72,76,77,76,72,69,72,74],
   [76,79,84,79,76,74,72,76],[74,79,83,79,74,71,74,79],
   [81,79,76,79,81,84,83,79],[77,76,72,76,77,81,79,76],
   [76,79,84,83,79,76,74,72],[74,76,79,74,71,74,76,79]
  ];
  let noiseSeed=73;
  for(let b=0;b<8;b++){
   const chord=chords[b%4];
   for(let n=0;n<8;n++)tone(samples,sampleRate,b*bar+n*beat/2,beat*.43,melody[b][n],.078);
   for(let n=0;n<4;n++){
    tone(samples,sampleRate,b*bar+n*beat,beat*.75,chord[0]-12+(n%2?7:0),.075);
    if(n%2===0)tone(samples,sampleRate,b*bar+n*beat,.15,36,.055,25);
    for(let j=0;j<Math.floor(.045*sampleRate);j++){
     noiseSeed=(Math.imul(noiseSeed,1664525)+1013904223)>>>0;
     const i=Math.round((b*bar+n*beat+beat/2)*sampleRate)+j;
     if(i<samples.length)samples[i]+=(noiseSeed/4294967296*2-1)*.009*Math.exp(-j/sampleRate*90);
    }
   }
   for(const n of [0,2])for(let c=0;c<3;c++)tone(samples,sampleRate,b*bar+n*beat+c*.035,beat*1.6,chord[c]+12,.015);
  }
  return {samples,sampleRate};
 }
 const lengths={pass:.23,fail:.62,speed:.48,warning:.55,win:.73};
 if(!(kind in lengths))throw new Error('未知声音');
 const samples=new Float32Array(Math.round(lengths[kind]*sampleRate));
 if(kind==='pass'){
  tone(samples,sampleRate,0,.10,83,.20);tone(samples,sampleRate,.085,.14,88,.17);
 }else if(kind==='fail'){
  tone(samples,sampleRate,0,.20,64,.18,57);tone(samples,sampleRate,.12,.22,57,.16,50);tone(samples,sampleRate,.28,.32,48,.19,36);
 }else if(kind==='warning'){
  [0,.18,.36].forEach(t=>tone(samples,sampleRate,t,.15,81,.14,78));
 }else if(kind==='win'){
  [76,79,84,88].forEach((n,i)=>tone(samples,sampleRate,i*.12,.30,n,.16));
 }else {
  [72,76,79,84].forEach((n,i)=>tone(samples,sampleRate,i*.085,.20,n,.16));
 }
 return {samples,sampleRate};
}
export function createGameAudio({storage=null,createContext=()=>{
 const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Context)throw new Error('当前浏览器不支持声音');
 return new Context();
},onChange=()=>{}}={}){
 let muted=false;try{muted=storage?.getItem('head-bird-sound-muted')==='1';}catch{}
 let context=null,musicGain=null,effectGain=null,music=null,playing=false,failed=false,theme='normal';
 const buffers=new Map(),effects=new Set();
 function stopSource(source){try{source.stop();}catch{}try{source.disconnect();}catch{}}
 function stopMusic(){if(music){stopSource(music);music=null;}}
 function stopEffects(){for(const source of effects)stopSource(source);effects.clear();}
 function buffer(kind){
  if(!buffers.has(kind)){
   const rendered=renderSound(kind),b=context.createBuffer(1,rendered.samples.length,rendered.sampleRate);
   b.copyToChannel(rendered.samples,0);buffers.set(kind,b);
  }
  return buffers.get(kind);
 }
 function sync(){
  if(muted||failed||!playing||!context||context.state!=='running'){stopMusic();return;}
  if(music)return;
  try{
   music=context.createBufferSource();music.buffer=buffer(theme==='challenge'?'challenge':'music');music.loop=true;music.connect(musicGain);music.start();
  }catch{stopMusic();failed=true;onChange();}
 }
 const api={
  get muted(){return muted;},
  get status(){return muted?'muted':failed?'unavailable':!context?'ready':context.state==='running'?'on':'blocked';},
  async unlock(){
   if(muted)return false;
   try{
    if(!context){
     context=createContext();musicGain=context.createGain();effectGain=context.createGain();
     musicGain.gain.value=.60;effectGain.gain.value=.85;
     musicGain.connect(context.destination);effectGain.connect(context.destination);
     context.onstatechange=()=>{if(context.state!=='running'){stopMusic();stopEffects();}sync();onChange();};
    }
    // 在点击开始/继续/声音开关的事件里调用，兼容手机浏览器的播放限制。
    const resumed=Promise.resolve(context.resume());
    // 缓冲创建可能同步失败并提前退出；立即接住恢复拒绝，后面的 await 仍负责报告失败。
    resumed.catch(()=>{});
    for(const name of ['music','challenge','pass','fail','speed','warning','win'])buffer(name);
    await resumed;failed=false;sync();onChange();return context.state==='running';
   }catch{failed=true;stopMusic();stopEffects();onChange();return false;}
  },
  setTheme(value){
   if(value!=='normal'&&value!=='challenge')return;
   if(theme===value)return;
   theme=value;stopMusic();sync();
  },
  setPlaying(value){
   if(playing===Boolean(value))return;
   playing=Boolean(value);if(!playing){stopMusic();stopEffects();}else sync();
  },
  setMuted(value){
   muted=Boolean(value);try{storage?.setItem('head-bird-sound-muted',muted?'1':'0');}catch{}
   if(muted){stopMusic();stopEffects();}else sync();onChange();
  },
  effect(kind,delay=0){
   if(muted||failed||!context||context.state!=='running')return;
   try{
    const source=context.createBufferSource();source.buffer=buffer(kind);source.connect(effectGain);
    source.onended=()=>{effects.delete(source);try{source.disconnect();}catch{}};
    effects.add(source);source.start(context.currentTime+delay);
   }catch{failed=true;onChange();}
  },
  stop(){playing=false;stopMusic();stopEffects();}
 };
 return api;
}
