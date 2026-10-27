// 浏览器禁止存储时，仍保留本次打开期间的纪录。
export function createRecords(storage) {
 const values={camera:0,demo:0};let available=true;
 for(const mode of ['camera','demo']) {
  try {const n=Number(storage.getItem('head-bird-v1-'+mode));values[mode]=Number.isSafeInteger(n)&&n>=0?n:0;}
  catch {available=false;}
 }
 return {
  get available(){return available;},
  get(mode){return values[mode]??0;},
  save(mode,score){
   if(!Number.isSafeInteger(score)||score<0||!(mode in values))return;
   values[mode]=Math.max(values[mode],score);
   try {storage.setItem('head-bird-v1-'+mode,String(values[mode]));}catch{available=false;}
  }
 };
}
