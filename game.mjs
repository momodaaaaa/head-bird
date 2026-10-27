// 游戏规则使用固定的 360×640 逻辑坐标，与手机像素密度无关。
export function median(values) {
 const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
 if (!sorted.length) throw new Error('没有足够的人脸数据，请重新采集');
 const i=Math.floor(sorted.length/2);
 return sorted.length%2 ? sorted[i] : (sorted[i-1]+sorted[i])/2;
}
export function calibrate(highSamples,lowSamples) {
 if (highSamples.filter(Number.isFinite).length<10 || lowSamples.filter(Number.isFinite).length<10) throw new Error("采集时间不足，请保持脸部入镜重试");
 const high=median(highSamples), low=median(lowSamples);
 if (low-high < .08-Number.EPSILON) throw new Error("上下高度差不足，请调整手机角度后重新校准");
 return {high,low};
}
export const W=360,H=640,BIRD_X=88,RADIUS=14,PIPE_W=62;
export function createGame(calibration=null) {
 const flight=calibration?{high:calibration.high,low:calibration.low}:null;
 return {score:0,passedCount:0,normalPassed:0,pacePoints:0,bonusPoints:0,phase:'normal',nextChallengeAt:7,challengeWins:0,challenge:null,warningUntil:0,lockedSpeed:null,lastReward:0,rewardUntil:0,over:false,time:0,nextSpawn:2.7,spawnCount:0,lastTarget:.5,lastPattern:null,patternRun:0,flight,obstacles:[],birdX:BIRD_X,birdY:320};
}
function hitsPipe(x,y,r,p) {
 const nearX=Math.max(p.x,Math.min(x,p.x+PIPE_W));
 const top=p.center-p.gap/2,bottom=p.center+p.gap/2;
 for(const [a,b] of [[0,top],[bottom,H]]) {
  const nearY=Math.max(a,Math.min(y,b));
  if((x-nearX)**2+(y-nearY)**2<=r*r) return true;
 }
 return false;
}
export function stepGame(g,dt,birdPosition,random=Math.random) {
 if(g.over||g.paused)return g;
 dt=Math.max(0,Math.min(.05,dt));
 g.time+=dt;
 const position=typeof birdPosition==="number"?{x:BIRD_X/W,y:birdPosition}:birdPosition;
 g.birdX=position?.x*W;g.birdY=position?.y*H;
 if(!Number.isFinite(g.birdX)||g.birdX<=RADIUS||g.birdX>=W-RADIUS||!Number.isFinite(g.birdY)||g.birdY<=RADIUS||g.birdY>=H-RADIUS){g.over=true;return g;}
 if(g.phase==='warning'&&g.time>=g.warningUntil&&!g.obstacles.some(p=>!p.passed)){
  g.phase='challenge';g.nextSpawn=g.time+.35;
 }
 if(g.phase==='normal'&&g.time>=g.nextSpawn) {
  g.spawnCount++;
  const flight=g.flight??{high:.18,low:.82};
  const range=(flight.low-flight.high)*H;
  let pattern=random()<.5?'small':'large';
  // 保留随机性，但避免连续多个障碍都只需小幅动作或一直大起伏。
  if(g.patternRun>=2)pattern=g.lastPattern==='small'?'large':'small';
  let target;
  if(pattern==='large')target=g.lastTarget<.5?.90+random()*.08:.02+random()*.08;
  else {
   const direction=g.lastTarget<=.24?1:g.lastTarget>=.76?-1:(random()<.5?-1:1);
   target=g.lastTarget+direction*(.08+random()*.14);
  }
  target=Math.max(.02,Math.min(.98,target));
  g.patternRun=pattern===g.lastPattern?g.patternRun+1:1;
  g.lastPattern=pattern;g.lastTarget=target;
  const center=flight.high*H+range*target;
  const gap=Math.max(56,Math.min(220,range*.4+RADIUS*2));
  g.obstacles.push({x:W+20,center,gap,passed:false});
  g.nextSpawn+=2.8;
 }
 if(g.phase==='challenge'&&g.challenge.spawned<g.challenge.total&&g.time>=g.nextSpawn){
  const flight=g.flight??{high:.18,low:.82},range=(flight.low-flight.high)*H;
  const c=g.challenge;
  c.target=c.spawned===0?.35+random()*.30:(c.target<.5?.74+random()*.08:.18+random()*.08);
  g.obstacles.push({x:W+20,center:flight.high*H+range*c.target,gap:Math.max(48,Math.min(220,range*.4+RADIUS*2)),passed:false,challenge:true});
  c.spawned++;g.spawnCount++;g.nextSpawn+=1.15;
 }
 const speed=currentSpeed(g);
 for(const p of g.obstacles) p.x-=speed*dt;
 if(g.obstacles.some(p=>hitsPipe(g.birdX,g.birdY,RADIUS,p))) {g.over=true;return g;}
 let normalPassedNow=0;
 for(const p of g.obstacles) {
  if(!p.passed&&p.x+PIPE_W < g.birdX-RADIUS){
   p.passed=true;g.score++;g.passedCount++;
   if(p.challenge)g.challenge.cleared++;
   else {g.normalPassed++;normalPassedNow++;if(g.phase==='normal')g.pacePoints++;}
  }
 }
 if(normalPassedNow&&g.phase==='normal'){
  while(g.normalPassed>=g.nextChallengeAt&&g.phase==='normal'){
   g.nextChallengeAt+=7;
   if(random()<.6){
    g.phase='warning';g.warningUntil=g.time+3;g.lockedSpeed=speedForScore(g.pacePoints);
    g.challenge={total:Math.min(5,3+Math.floor(random()*3)),spawned:0,cleared:0,target:.5};g.nextSpawn=Infinity;
   }
  }
 }
 if(g.phase==='challenge'&&g.challenge.spawned===g.challenge.total&&g.challenge.cleared===g.challenge.total){
  g.challengeWins++;g.lastReward=challengeReward(g.challengeWins);g.bonusPoints+=g.lastReward;g.score+=g.lastReward;
  g.rewardUntil=g.time+2.6;g.phase='normal';g.nextSpawn=g.time+2.8;
  g.lastTarget=g.challenge.target;g.lastPattern=null;g.patternRun=0;
 }
 g.obstacles=g.obstacles.filter(p=>p.x+PIPE_W>-10);
 return g;
}

// 每六分温和提速，三十分后保持上限。
export function speedForScore(score){return 163.28125*(1+Math.min(5,Math.max(0,Math.floor(score/6)))*.05);}

// 挑战期间锁定原档位，只临时增加20%；奖励和挑战障碍不会推进普通加速。
export function currentSpeed(g){return g.phase==='challenge'?g.lockedSpeed*1.2:g.phase==='warning'?g.lockedSpeed:speedForScore(g.pacePoints);}

export function challengeReward(successNumber){return [3,5,8,10][Math.min(3,Math.max(0,successNumber-1))];}
