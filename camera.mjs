// 识别资源随站点提供；摄像头视频不上传。
export async function loadTracker() {
 const {FilesetResolver,FaceLandmarker}=await import('./vendor/vision_bundle.mjs');
 const files=await FilesetResolver.forVisionTasks(new URL('./vendor/wasm',import.meta.url).href);
 const options={baseOptions:{modelAssetPath:new URL('./vendor/face_landmarker.task',import.meta.url).href,delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false};
 try {return await FaceLandmarker.createFromOptions(files,options);}
 catch {options.baseOptions.delegate='CPU';return await FaceLandmarker.createFromOptions(files,options);}
}
export function cameraError(error) {
 const text={NotAllowedError:'相机权限没有开启。请在浏览器的网站设置里允许相机，再点击重试。',NotFoundError:'没有找到可用摄像头。请换到带前置相机的手机浏览器。',NotReadableError:'摄像头暂时无法使用，可能被其他应用占用。关闭占用相机的应用后重试。',OverconstrainedError:'这台设备暂时无法满足相机要求，请换用 Safari 或 Chrome 重试。',SecurityError:'浏览器禁止了相机访问。请用 Safari 或 Chrome 打开安全链接。'};
 return text[error?.name]||'相机启动失败。请确认设备有摄像头，并用 Safari 或 Chrome 重新打开。';
}
