// Caméra + boucle d'analyse image par image.
export const ANALYSIS_W = 320;

let stream = null;

export async function listCameras() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'videoinput');
  } catch (e) { return []; }
}

export async function startCamera(video, deviceId, facing = 'environment') {
  stopCamera(video);
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Ce navigateur ne donne pas accès à la caméra. Ouvre l'appli dans Safari (adresse en https).");
  }
  const base = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } };
  const video_c = deviceId ? { ...base, deviceId: { exact: deviceId } } : { ...base, facingMode: { ideal: facing } };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: video_c });
  } catch (e) {
    if (deviceId) stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, facingMode: { ideal: facing } } });
    else throw e;
  }
  video.setAttribute('playsinline', ''); video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });
  const track = stream.getVideoTracks()[0];
  const st = track && track.getSettings ? track.getSettings() : {};
  return { width: video.videoWidth, height: video.videoHeight, fps: st.frameRate || null, deviceId: st.deviceId || deviceId || '', label: track ? track.label : '' };
}

export function stopCamera(video) {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (video) video.srcObject = null;
}

// Boucle : appelle onFrame(imageData, tMs) à chaque nouvelle image vidéo.
export function frameLoop(video, onFrame) {
  const cv = document.createElement('canvas');
  let ctx = null, running = true, handle = null, lastT = -1;
  const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  function size() {
    const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
    const w = ANALYSIS_W, h = Math.round(vh * w / vw);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; ctx = cv.getContext('2d', { willReadFrequently: true }); }
  }
  function step(now, meta) {
    if (!running) return;
    if (video.readyState >= 2) {
      size();
      const t = meta && meta.mediaTime != null ? meta.mediaTime * 1000 : now;
      if (t !== lastT) {
        lastT = t;
        ctx.drawImage(video, 0, 0, cv.width, cv.height);
        try { onFrame(ctx.getImageData(0, 0, cv.width, cv.height), t); } catch (e) { console.error(e); }
      }
    }
    handle = useRVFC ? video.requestVideoFrameCallback(step) : requestAnimationFrame(step);
  }
  handle = useRVFC ? video.requestVideoFrameCallback(step) : requestAnimationFrame(step);
  return () => { running = false; try { useRVFC ? video.cancelVideoFrameCallback(handle) : cancelAnimationFrame(handle); } catch (e) {} };
}

// Correspondance entre coordonnées normalisées de l'image et l'élément affiché (object-fit: contain).
export function videoRect(video) {
  const r = video.getBoundingClientRect();
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const s = Math.min(r.width / vw, r.height / vh);
  const w = vw * s, h = vh * s;
  return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, el: r };
}

let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock) keepAwake(true);
});
