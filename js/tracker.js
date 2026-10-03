// ShotPro Live — moteur de détection des tirs (module pur, sans DOM).
// Entrée : images RGBA réduites (≈320 px de large) + horodatage en ms.
// Sortie : position du ballon et événements « tir » (rentré / raté + mesures).
//
// Principe : vue de côté, caméra fixe. Le ballon est repéré par sa couleur
// (calibrable) ET par le mouvement (fond appris en continu), puis suivi image
// par image. Un tir commence quand le ballon passe au-dessus du cercle en se
// dirigeant vers lui ; il est jugé quand le ballon traverse le plan du cercle.

export const RIM_CM = 45.7;   // diamètre intérieur du cercle
export const BALL_CM = 24.0;  // diamètre d'un ballon taille 7
export const G_CM = 981;      // gravité, cm/s²

export const DEFAULTS = {
  ball: { h: 20, s: 0.62, v: 0.55 }, // orange « ballon de salle » moyen
  hueTol: 17,          // tolérance de teinte (degrés)
  satMinRatio: 0.65,    // saturation mini = max(0.28, s_ballon * ratio)
  valMin: 0.12,
  motionThr: 16,       // seuil de mouvement sur la luminance (0-255)
  makeTol: 0.62,       // |écart| / demi-cercle accepté pour un panier
  confirmMs: 420,      // fenêtre de confirmation après traversée
  lostMs: 260,         // perte de suivi
  cooldownMs: 850,
};

function rgb2hsv(r, g, b) {
  const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

function fitShot(pts) {
  // x(t) = x0 + vx t ; y(t) = y0 + vy t + a t²  (moindres carrés)
  const n = pts.length; if (n < 4) return null;
  const t0 = pts[0].t;
  let St = 0, St2 = 0, St3 = 0, St4 = 0, Sx = 0, Sxt = 0, Sy = 0, Syt = 0, Syt2 = 0;
  for (const p of pts) {
    const t = (p.t - t0) / 1000, t2 = t * t;
    St += t; St2 += t2; St3 += t2 * t; St4 += t2 * t2;
    Sx += p.x; Sxt += p.x * t; Sy += p.y; Syt += p.y * t; Syt2 += p.y * t2;
  }
  const den = n * St2 - St * St; if (Math.abs(den) < 1e-9) return null;
  const vx = (n * Sxt - St * Sx) / den, x0 = (Sx - vx * St) / n;
  // système 3x3 pour y
  const M = [[n, St, St2], [St, St2, St3], [St2, St3, St4]], R = [Sy, Syt, Syt2];
  const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(M); if (Math.abs(D) < 1e-12) return null;
  const col = (i) => M.map((row, r) => row.map((v, c) => (c === i ? R[r] : v)));
  const y0 = det3(col(0)) / D, vy = det3(col(1)) / D, a = det3(col(2)) / D;
  return { t0, x0, vx, y0, vy, a };
}

export function createTracker(options = {}) {
  const cfg = { ...DEFAULTS, ...options, ball: { ...DEFAULTS.ball, ...(options.ball || {}) } };
  let W = 0, H = 0, lum = null, bg = null, prev = null, mask = null, lab = null, stack = null, stat = null;
  let rim = null;            // en pixels d'analyse : {xl, xr, y, cx, half, w}
  let rimNorm = null;
  let frames = 0;
  let track = null;          // {pts:[{t,x,y}], lastT}
  let shot = null;
  let armed = true, cooldownUntil = 0, lastHighSeen = -1e9;
  const recent = [];         // derniers points (pour inclure la montée)

  function alloc(w, h) {
    W = w; H = h; const n = w * h;
    lum = new Float32Array(n); bg = new Float32Array(n); prev = new Float32Array(n);
    mask = new Uint8Array(n); lab = new Int32Array(n); stack = new Int32Array(n); stat = new Float32Array(n);
    frames = 0; if (rimNorm) setRim(rimNorm);
  }

  function setRim(r) { // r : {xl, xr, y} normalisés (0-1)
    rimNorm = r;
    if (!r) { rim = null; return; }
    if (!W) return;
    const xl = Math.min(r.xl, r.xr) * W, xr = Math.max(r.xl, r.xr) * W, y = r.y * H;
    rim = { xl, xr, y, cx: (xl + xr) / 2, half: (xr - xl) / 2, w: xr - xl };
  }
  function scale() { return rim ? RIM_CM / rim.w : 1; }       // cm par pixel d'analyse
  function ballR() { return cfg.ballPx || (rim ? rim.w * (BALL_CM / 2) / RIM_CM : 4); }

  function isBallColor(h, s, v) {
    let dh = Math.abs(h - cfg.ball.h); if (dh > 180) dh = 360 - dh;
    return dh <= cfg.hueTol && s >= Math.max(0.28, cfg.ball.s * cfg.satMinRatio) && v >= cfg.valMin;
  }

  function sampleColor(frame, xn, yn) {
    const w = frame.width, h = frame.height, d = frame.data;
    const cx = Math.round(xn * w), cy = Math.round(yn * h);
    const rad = Math.max(2, Math.round(rim ? ballR() * (w / W) * 0.6 : 4));
    const hs = [], ss = [], vs = [];
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || (x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
      const i = (y * w + x) * 4; const [hh, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
      if (s > 0.2 && v > 0.1) { hs.push(hh > 300 ? hh - 360 : hh); ss.push(s); vs.push(v); }
    }
    if (hs.length < 3) return null;
    // on garde la moitié la plus saturée (le cuir), pas les bords mélangés au fond
    const idx = ss.map((v, i) => i).sort((a, b) => ss[b] - ss[a]).slice(0, Math.max(3, ss.length >> 1));
    const med = a => a.sort((p, q) => p - q)[a.length >> 1];
    let hm = med(idx.map(i => hs[i])); if (hm < 0) hm += 360;
    return { h: Math.round(hm), s: Math.max(0.4, med(idx.map(i => ss[i]))), v: med(idx.map(i => vs[i])) };
  }

  function detect(frame) {
    const d = frame.data, n = W * H;
    const roiBottom = rim ? Math.min(H, Math.ceil(rim.y + 2.2 * rim.w)) : H;
    const thr = cfg.motionThr, warm = frames < 20;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const L = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      lum[i] = L;
    }
    if (frames === 0) { bg.set(lum); prev.set(lum); stat.fill(0); }
    mask.fill(0);
    const rowEnd = roiBottom * W;
    // stat[] : part du temps récent où le pixel a la couleur du ballon. Un objet orange fixe
    // (cercle, affiche, parquet, maillot immobile) y reste élevé et est ignoré, même si la caméra tremble.
    for (let i = 0, p = 0; i < rowEnd; i++, p += 4) {
      const [h, s, v] = rgb2hsv(d[p], d[p + 1], d[p + 2]);
      const col = isBallColor(h, s, v);
      stat[i] = stat[i] * 0.97 + (col ? 0.03 : 0);
      if (warm || !col || stat[i] > 0.35) continue;
      const L = lum[i];
      if (Math.abs(L - bg[i]) > thr || Math.abs(L - prev[i]) > thr) mask[i] = 1;
    }
    // mise à jour du fond (lente là où le ballon est détecté)
    for (let i = 0; i < n; i++) {
      bg[i] += (lum[i] - bg[i]) * 0.05;
    }
    prev.set(lum);
    frames++;
    if (warm) return [];

    // composantes connexes (4-voisinage)
    lab.fill(0);
    const comps = []; let id = 0;
    for (let i = 0; i < rowEnd; i++) {
      if (!mask[i] || lab[i]) continue;
      id++; let sp = 0; stack[sp++] = i; lab[i] = id;
      let area = 0, sx = 0, sy = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      while (sp) {
        const j = stack[--sp]; const x = j % W, y = (j / W) | 0;
        area++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && mask[j - 1] && !lab[j - 1]) { lab[j - 1] = id; stack[sp++] = j - 1; }
        if (x < W - 1 && mask[j + 1] && !lab[j + 1]) { lab[j + 1] = id; stack[sp++] = j + 1; }
        if (y > 0 && mask[j - W] && !lab[j - W]) { lab[j - W] = id; stack[sp++] = j - W; }
        if (y < H - 1 && mask[j + W] && !lab[j + W]) { lab[j + W] = id; stack[sp++] = j + W; }
      }
      if (area >= 2) comps.push({ area, sx, sy, x0, y0, x1, y1 });
    }
    // regroupement des morceaux d'un même ballon (coutures, ombres)
    const R = ballR(), join = Math.max(3, 1.3 * R);
    comps.sort((a, b) => b.area - a.area);
    const clusters = [];
    for (const c of comps) {
      const cx = c.sx / c.area, cy = c.sy / c.area;
      let host = null;
      for (const k of clusters) {
        const kx = k.sx / k.area, ky = k.sy / k.area;
        if (Math.hypot(kx - cx, ky - cy) < join) { host = k; break; }
      }
      if (host) {
        host.area += c.area; host.sx += c.sx; host.sy += c.sy;
        host.x0 = Math.min(host.x0, c.x0); host.y0 = Math.min(host.y0, c.y0);
        host.x1 = Math.max(host.x1, c.x1); host.y1 = Math.max(host.y1, c.y1);
      } else clusters.push({ ...c });
    }
    const disk = Math.PI * R * R;
    const free = cfg.sizeFree;
    const minA = free ? 8 : R < 2.5 ? 2 : 0.1 * disk, maxA = free ? W * H * 0.08 : Math.max(12, 2.4 * disk);
    const out = [];
    for (const k of clusters) {
      const w = k.x1 - k.x0 + 1, h = k.y1 - k.y0 + 1;
      if (k.area < minA || k.area > maxA) continue;
      if (!free && (w > 3.6 * R + 3 || h > 3.6 * R + 3)) continue;
      const asp = w / h; if (asp < 0.3 || asp > 3.3) continue;
      out.push({ x: k.sx / k.area, y: k.sy / k.area, area: k.area, w, h });
    }
    return out;
  }

  function choose(cands, t) {
    cands = cands.slice();
    if (!cands.length) return null;
    const R = ballR(), disk = Math.PI * R * R;
    if (track && track.pts.length) {
      const L = track.pts[track.pts.length - 1];
      const dt = (t - L.t) / 1000;
      let vx = 0, vy = 0;
      if (track.pts.length >= 2) {
        const P = track.pts[track.pts.length - 2], dd = (L.t - P.t) / 1000 || 0.033;
        vx = (L.x - P.x) / dd; vy = (L.y - P.y) / dd;
      }
      const g = G_CM / scale();
      const px = L.x + vx * dt, py = L.y + vy * dt + 0.5 * g * dt * dt;
      const gate = Math.max(4 * R, 6) + Math.hypot(vx, vy) * dt * 0.6;
      let best = null, bd = 1e9;
      for (const c of cands) {
        const dist = Math.hypot(c.x - px, c.y - py);
        if (dist < gate && dist < bd) { bd = dist; best = c; }
      }
      // un « suivi » immobile (tête, objet posé) cède la place à un candidat en mouvement
      const P = track.pts, k = Math.max(0, P.length - 10);
      const span = Math.hypot(P[P.length - 1].x - P[k].x, P[P.length - 1].y - P[k].y);
      const stuck = P.length >= 8 && span < 1.5 * R;
      if (best && !(stuck && cands.length > 1)) return best;
      if (stuck) cands = cands.filter(c => c !== best);
      if (best && !cands.length) return best;
    }
    // sans suivi : taille la plus plausible, préférence pour le haut de l'image
    let best = null, bs = -1e9;
    for (const c of cands) {
      const sz = -Math.abs(Math.log(c.area / (0.55 * disk)));
      const hi = rim ? (c.y < rim.y + rim.w ? 0.6 : 0) : 0;
      const s = sz + hi;
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  function flightPoints(pts) {
    // vol libre : on prolonge la parabole tant que les points la suivent (s'arrête au contact cercle/panneau)
    const out = [];
    const tol = Math.max(1.6, 0.35 * ballR());
    for (const p of pts) {
      if (!out.length && p.y > rim.y + 0.25 * rim.w) continue;
      if (out.length >= 6) {
        const f = fitShot(out);
        if (f) {
          const tt = (p.t - f.t0) / 1000;
          const px = f.x0 + f.vx * tt, py = f.y0 + f.vy * tt + f.a * tt * tt;
          if (Math.hypot(px - p.x, py - p.y) > tol) break;
        }
      }
      out.push(p);
      if (p.y > rim.y + 0.25 * rim.w) break;
    }
    return out;
  }

  function metrics(pts, cross) {
    const s = scale();
    const fp = flightPoints(pts);
    const fit = fp.length >= 5 ? fitShot(fp) : null;
    const m = { angle: null, apex: null, depth: null };
    if (fit && fit.a > 0) {
      const dir = Math.sign(fit.vx) || 1;
      const A = fit.a, B = fit.vy, C = fit.y0 - rim.y, disc = B * B - 4 * A * C;
      const ta = -B / (2 * A);
      const ya = fit.y0 + B * ta + A * ta * ta;
      m.apex = Math.round((rim.y - ya) * s);
      if (disc >= 0) {
        const tc = (-B + Math.sqrt(disc)) / (2 * A);
        const vyc = B + 2 * A * tc;
        if (Math.abs(fit.vx) > 1e-3) m.angle = Math.round(Math.atan2(vyc, Math.abs(fit.vx)) * 1800 / Math.PI) / 10;
        m.depth = Math.round((fit.x0 + fit.vx * tc - rim.cx) * dir * s);
      }
      m.gRatio = Math.round((2 * A * s / G_CM) * 100) / 100; // cohérence échelle/temps (≈1 si bien calibré)
      // point de lâcher estimé : la parabole est prolongée jusqu'à ~60 cm sous le cercle (≈ 2,45 m du sol)
      const yr = rim.y + 60 / s, Cr = fit.y0 - yr, dr = B * B - 4 * A * Cr;
      if (dr >= 0) {
        const tr = (-B - Math.sqrt(dr)) / (2 * A);
        const xr = fit.x0 + fit.vx * tr, vyr = B + 2 * A * tr;
        m.distance = Math.round(Math.abs(rim.cx - xr) * s);            // cm, horizontale lâcher → centre du cercle
        m.launch = Math.round(Math.atan2(-vyr, Math.abs(fit.vx)) * 1800 / Math.PI) / 10; // angle de sortie
        m.speed = Math.round(Math.hypot(fit.vx, vyr) * s) / 100;         // m/s au lâcher
        m.tRelease = fit.t0 + tr * 1000;
      }
    } else if (cross) {
      const dir = Math.sign(cross.x - pts[0].x) || 1;
      m.depth = Math.round((cross.x - rim.cx) * dir * s);
    }
    m.points = fp.length;
    return m;
  }

  function decide(t, made, flags) {
    const pts = shot.pts;
    const m = metrics(pts, shot.firstCross);
    const ev = { type: 'shot', t, made, flags, ...m, path: pts.map(p => [p.x / W, p.y / H]) };
    shot = null; armed = false; cooldownUntil = t + cfg.cooldownMs;
    return ev;
  }

  function stepShot(p, t, events) {
    const R = ballR();
    if (!shot) {
      if (!armed || !p) return;
      // départ : ballon au-dessus du cercle, en direction du cercle
      if (p.y < rim.y - 0.45 * rim.w && track && track.pts.length >= 2) {
        const P = track.pts[track.pts.length - 2];
        const towards = Math.sign(p.x - P.x) === Math.sign(rim.cx - p.x) || Math.abs(rim.cx - p.x) < rim.w;
        if (towards) {
          shot = { t0: t, pts: track.pts.filter(q => t - q.t < 1200), firstCross: null, cand: null, lastSeen: t, apexY: p.y, below: false };
        }
      }
      return;
    }
    if (p) {
      const last = shot.pts[shot.pts.length - 1];
      shot.pts.push(p); shot.lastSeen = t;
      if (p.y < shot.apexY) shot.apexY = p.y;
      const dx = p.x - rim.cx;
      if (last && shot.descending && p.y < last.y - 1 && Math.abs(p.y - rim.y) < 0.8 * rim.w && Math.abs(dx) < 1.5 * rim.w) shot.bounced = true;
      if (last && p.y > last.y + 0.5) shot.descending = true;
      if (last && last.y < rim.y && p.y >= rim.y) {
        const f = (rim.y - last.y) / ((p.y - last.y) || 1e-6);
        const xc = last.x + (p.x - last.x) * f, tc = last.t + (t - last.t) * f;
        const cdx = xc - rim.cx;
        const cross = { x: xc, t: tc };
        if (Math.abs(cdx) > 2.5 * rim.w && !shot.firstCross) { shot = null; return; } // loin du cercle : pas un tir
        if (!shot.firstCross) shot.firstCross = cross;
        if (Math.abs(cdx) <= 1.05 * rim.half) {
          if (shot.firstCross !== cross || shot.bounced) shot.contact = true;
          const strong = Math.abs(cdx) <= cfg.makeTol * rim.half;
          if (!strong) shot.contact = true;
          shot.cand = { ...cross, strong, until: t + cfg.confirmMs };
        }
        else if (Math.abs(cdx) > rim.half + 1.4 * R && !shot.bounced && shot.firstCross === cross) shot.airball = true;
      }
      if (shot.cand) {
        if (p.y < rim.y - 0.3 * rim.w) shot.cand = null;                       // rebond vers le haut
        else if (Math.abs(dx) > 1.25 * rim.half && p.y < rim.y + 0.5 * rim.w) shot.cand = null; // ressort au niveau du cercle
        else if (p.y > rim.y + 0.6 * rim.w && Math.abs(dx) < 1.6 * rim.half) { events.push(decide(t, true, shot.contact ? ['contact'] : [])); return; } // traversé le filet
        else if (shot.cand.strong && t >= shot.cand.until) { events.push(decide(t, true, shot.contact ? ['contact'] : [])); return; }
      }
      // tombé à l'extérieur
      if (!shot.cand && p.y > rim.y + 0.5 * rim.w && Math.abs(dx) > 1.1 * rim.half && shot.apexY < rim.y) {
        const nearRim = shot.firstCross || Math.abs(dx) < 3 * rim.w;
        if (!nearRim) { shot = null; return; } // pas un tir (passe, lancer en l'air)
        events.push(decide(t, false, shot.airball ? ['airball'] : [])); return;
      }
      if (t - shot.t0 > 4000) { events.push(decide(t, false, ['incertain'])); return; }
    } else {
      // ballon invisible
      if (shot.cand && t - shot.lastSeen > 120) {
        if (t >= shot.cand.until || t - shot.lastSeen > 300) {
          events.push(decide(t, true, shot.cand.strong ? (shot.contact ? ['contact'] : []) : ['contact', 'incertain'])); return;
        }
      }
      if (!shot.cand && t - shot.lastSeen > 900) {
        const L = shot.pts[shot.pts.length - 1];
        if (!shot.firstCross && L && Math.abs(L.x - rim.cx) > 3 * rim.w) { shot = null; return; }
        events.push(decide(t, false, ['incertain'])); return;
      }
    }
  }

  function process(frame, t) {
    if (frame.width !== W || frame.height !== H) alloc(frame.width, frame.height);
    const events = [];
    const cands = detect(frame);
    if (!rim) return { ball: null, events, cands };
    const c = choose(cands, t);
    let p = null;
    if (c) {
      p = { t, x: c.x, y: c.y };
      if (!track || t - track.lastT > cfg.lostMs) track = { pts: [] };
      track.pts.push(p); track.lastT = t;
      if (track.pts.length > 90) track.pts.shift();
      recent.push(p); while (recent.length && t - recent[0].t > 1500) recent.shift();
      if (p.y < rim.y - 0.2 * rim.w) lastHighSeen = t;
    } else if (track && t - track.lastT > cfg.lostMs) track = null;

    if (!armed && !shot && t > cooldownUntil && t - lastHighSeen > 350) armed = true;
    stepShot(p, t, events);
    return { ball: p ? { x: p.x / W, y: p.y / H, r: ballR() / W } : null, events, cands, inShot: !!shot, armed };
  }

  function softReset() { track = null; shot = null; armed = true; cooldownUntil = 0; recent.length = 0; }
  function reset() { track = null; shot = null; armed = true; cooldownUntil = 0; recent.length = 0; frames = 0; }

  return {
    process, setRim, sampleColor, reset, softReset,
    setBallColor(c) { if (c) cfg.ball = { ...cfg.ball, ...c }; },
    setOption(k, v) { cfg[k] = v; },
    get config() { return cfg; },
    get mask() { return mask; },
    get size() { return { W, H }; },
  };
}
