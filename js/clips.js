// Ralentis : mémoire tampon des dernières secondes de vidéo, découpée en clip à chaque tir.
const FPS = 15, KEEP_MS = 3600, W = 400;
export function createClipRecorder(video) {
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  const buf = []; let busy = false, lastT = 0, on = false;
  function grab() {
    if (!on || busy || video.readyState < 2) return;
    const now = performance.now(); if (now - lastT < 1000 / FPS) return;
    lastT = now;
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    if (cv.width !== W) { cv.width = W; cv.height = Math.round(vh * W / vw); }
    ctx.drawImage(video, 0, 0, cv.width, cv.height);
    busy = true;
    cv.toBlob(b => { busy = false; if (b) { buf.push({ t: now, b }); while (buf.length && now - buf[0].t > KEEP_MS) buf.shift(); } }, 'image/jpeg', 0.62);
  }
  return {
    start() { on = true; buf.length = 0; },
    stop() { on = false; buf.length = 0; },
    tick: grab,
    // renvoie les images des ~3 dernières secondes (appeler ~0,4 s après la décision)
    cut(ms = 3000) { const now = performance.now(); return buf.filter(f => now - f.t <= ms).map(f => f.b); },
    get size() { return { w: cv.width, h: cv.height }; },
  };
}

// Lecteur : dessine les images une par une sur un canvas, avec la trajectoire par-dessus.
export function playClip(canvas, clip, { speed = 1, onEnd } = {}) {
  const ctx = canvas.getContext('2d'); let i = 0, stop = false, bmp = [];
  Promise.all(clip.frames.map(b => createImageBitmap(b).catch(() => null))).then(list => {
    bmp = list.filter(Boolean); if (!bmp.length) return;
    canvas.width = bmp[0].width; canvas.height = bmp[0].height;
    const step = () => {
      if (stop) return;
      ctx.drawImage(bmp[i], 0, 0);
      if (i >= bmp.length - Math.round(FPS * 0.6) && clip.path && clip.path.length > 1) {
        ctx.strokeStyle = clip.made ? '#3FB984' : '#E5605F'; ctx.lineWidth = 3; ctx.beginPath();
        clip.path.forEach(([x, y], k) => { const X = x * canvas.width, Y = y * canvas.height; k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.stroke();
      }
      i++;
      if (i < bmp.length) setTimeout(step, 1000 / FPS / speed);
      else { setTimeout(() => { if (!stop) { i = 0; onEnd && onEnd(); step(); } }, 900); }
    };
    step();
  });
  return () => { stop = true; bmp.forEach(b => b.close && b.close()); };
}
