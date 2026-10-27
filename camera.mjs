import {downloadResource,withDeadline} from './resources.mjs';
// 固定版本与哈希：备用下载线路只接收公开资源请求，画面仍留在本机。
const hashes={
 'vision_wasm_internal.js':'6f6b86509cf9e163ea1cfec7edc8cf53732699c04781e4c21c557c1ba402310e',
 'vision_wasm_internal.wasm':'cb3ec20026a9aecc2a81a93c25630ceb5389297ddb7a5f0bd61dd09cde606b9b',
 'vision_wasm_nosimd_internal.js':'9f8fc960e363f0fb2f42f7937b97ae9cf9a5630490f71031fa90caa9bb121938',
 'vision_wasm_nosimd_internal.wasm':'924274fcd5ac8985f6570a8573e7971b7bd2d580ba1b8f3beb0ba8f95db6347c',
 'face_landmarker.task':'64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
};
const modelCommit='a30fcac270833995d3f9443a2f194e50d807bb37';
let initializing=null;
export async function loadTracker({signal,onProgress=()=>{}}={}) {
 if(initializing)throw new Error('上一次识别器还在退出，请稍候重试；仍无响应可刷新页面。');
 const controller=new AbortController();
 const abort=()=>controller.abort(signal.reason);
 if(signal?.aborted)throw signal.reason;
 signal?.addEventListener('abort',abort,{once:true});
 const active=controller.signal;
 try {
  onProgress('正在加载识别程序…');
  const {FilesetResolver,FaceLandmarker}=await withDeadline(import('./vendor/vision_bundle.mjs'),{signal:active});
  const files=await withDeadline(FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href),{signal:active});
  const names=[files.wasmLoaderPath.split('/').pop(),files.wasmBinaryPath.split('/').pop(),'face_landmarker.task'];
  const progress=[0,0,0];
  const sizes=[210000,names[1].includes('nosimd')?10647962:11453626,3758596];
  const downloads=names.map((name,index)=>{
   const local=new URL(index===2?'./vendor/'+name:'./vendor/wasm/'+name,import.meta.url).href;
   const urls=index===2?[
    `https://fastly.jsdelivr.net/gh/momodaaaaa/head-bird@${modelCommit}/vendor/${name}`,local,
    `https://cdn.jsdelivr.net/gh/momodaaaaa/head-bird@${modelCommit}/vendor/${name}`
   ]:[
    `https://registry.npmmirror.com/@mediapipe/tasks-vision/0.10.32/files/wasm/${name}`,local,
    `https://fastly.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm/${name}`
   ];
   return downloadResource({urls,sha256:hashes[name],size:sizes[index]},{signal:active,onProgress:({loaded})=>{
    progress[index]=Math.max(progress[index],Math.min(loaded,sizes[index]));
    const mb=progress.reduce((a,b)=>a+b,0)/1048576;
    onProgress(`正在下载眼睛识别资源：${mb.toFixed(1)} / ${(sizes.reduce((a,b)=>a+b,0)/1048576).toFixed(1)} MB，慢速时自动切换线路…`);
   }});
  });
  const [loader,wasm,model]=await Promise.all(downloads);
  active.throwIfAborted();onProgress('下载完成，正在启动眼睛识别（最长约20秒）…');
  const scriptUrl=URL.createObjectURL(new Blob([loader],{type:'text/javascript'}));
  const wasmUrl=URL.createObjectURL(new Blob([wasm],{type:'application/wasm'}));
  const options={baseOptions:{modelAssetBuffer:model,delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false};
  const create=async()=>{
   try{return await FaceLandmarker.createFromOptions({wasmLoaderPath:scriptUrl,wasmBinaryPath:wasmUrl},options);}
   catch(error){
    active.throwIfAborted();
    onProgress('正在切换兼容识别方式…');options.baseOptions.delegate='CPU';
    return await FaceLandmarker.createFromOptions({wasmLoaderPath:scriptUrl,wasmBinaryPath:wasmUrl},options);
   }
  };
  initializing=create().finally(()=>{URL.revokeObjectURL(scriptUrl);URL.revokeObjectURL(wasmUrl);initializing=null;});
  return await withDeadline(initializing,{signal:active,onLate:tracker=>tracker.close()});
 } finally {
  signal?.removeEventListener('abort',abort);controller.abort();
 }
}
export function cameraError(error) {
 const text={NotAllowedError:'相机权限没有开启。请在浏览器的网站设置里允许相机，再点击重试。',NotFoundError:'没有找到可用摄像头。请换到带前置相机的手机浏览器。',NotReadableError:'摄像头暂时无法使用，可能被其他应用占用。关闭占用相机的应用后重试。',OverconstrainedError:'这台设备暂时无法满足相机要求，请换用 Safari 或 Chrome 重试。',SecurityError:'浏览器禁止了相机访问。请用 Safari 或 Chrome 打开安全链接。'};
 return text[error?.name]||'相机启动失败。请确认设备有摄像头，并用 Safari 或 Chrome 重新打开。';
}
