// 只下载固定版本的公开资源；不包含摄像头画面或坐标。
export async function downloadResource(resource,{signal,onProgress=()=>{},fetcher=fetch,hedgeMs=1800,timeoutMs=35000}={}) {
 const controller=new AbortController();
 const abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)throw signal.reason;
 signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(()=>controller.abort(new Error('资源下载超时，请切换网络后重试。')),timeoutMs);
 const active=controller.signal;
 const attempts=resource.urls.map(async(url,index)=>{
  if(index)await new Promise((resolve,reject)=>{
   const onAbort=()=>{clearTimeout(timer);reject(active.reason);};
   const timer=setTimeout(()=>{active.removeEventListener('abort',onAbort);resolve();},index*hedgeMs);
   active.addEventListener('abort',onAbort,{once:true});
  });
  active.throwIfAborted();
  const response=await fetcher(url,{signal:active});
  if(!response.ok)throw new Error(`资源请求失败（${response.status}）`);
  const total=Number(response.headers.get('content-length'))||resource.size||0;
  const reader=response.body.getReader();
  const chunks=[];let loaded=0;
  try {
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    active.throwIfAborted();
    chunks.push(value);loaded+=value.length;onProgress({loaded,total,source:index});
   }
  } finally {reader.releaseLock();}
  const data=new Uint8Array(loaded);let offset=0;
  for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
  const digest=await crypto.subtle.digest('SHA-256',data);
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hex!==resource.sha256)throw new Error('资源完整性检查失败，请重试。');
  active.throwIfAborted();
  return data;
 });
 try {return await Promise.any(attempts);}
 catch(error){throw active.aborted?active.reason:new Error('所有下载线路暂时不可用，请切换网络后重试。',{cause:error});}
 finally {clearTimeout(timeout);signal?.removeEventListener('abort',abort);controller.abort();}
}

// 迟到结果仍需释放，避免取消后遗留识别器。
export function withDeadline(promise,{signal,timeoutMs=20000,onLate=()=>{}}={}) {
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
  const abort=()=>finish(reject,signal.reason);
  const timer=setTimeout(()=>finish(reject,new Error('识别器初始化超时，请重试或切换浏览器。')),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  Promise.resolve(promise).then(value=>{if(settled){onLate(value);return;}finish(resolve,value);},error=>finish(reject,error));
 });
}
