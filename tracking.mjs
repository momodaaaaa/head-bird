// 依据 MediaPipe 官方眼部连接点，使用两眼内外眼角的中心，不使用鼻尖。
export function eyeCenter(face){
 const points=[33,133,263,362].map(i=>face?.[i]);
 if(points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 return {x:points.reduce((v,p)=>v+p.x,0)/4,y:points.reduce((v,p)=>v+p.y,0)/4};
}
// 与 video 的 object-fit:cover、居中和 scaleX(-1) 使用同一坐标变换。
export function toPreview(point,sourceW,sourceH,viewW,viewH){
 if(!point||![sourceW,sourceH,viewW,viewH].every(n=>Number.isFinite(n)&&n>0))return null;
 const scale=Math.max(viewW/sourceW,viewH/sourceH);
 const x=1-(point.x*sourceW*scale-(sourceW*scale-viewW)/2)/viewW;
 const y=(point.y*sourceH*scale-(sourceH*scale-viewH)/2)/viewH;
 return {x,y,visible:Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1};
}
