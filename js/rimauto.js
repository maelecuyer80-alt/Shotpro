// Calage automatique du panier : image + premiers tirs.
//
// 1) L'image : findRims() propose des cercles candidats (couleur, forme, filet, panneau).
//    Si le même candidat ressort à deux analyses de suite avec une bonne confiance, il est retenu.
// 2) Les tirs : on suit le ballon sans rien savoir du panier. Chaque tir dessine une parabole ;
//    elle s'interrompt quand le ballon touche le cercle ou entre dans le filet. Ces points
//    d'interruption se regroupent au niveau du cercle : ils confirment le bon candidat,
//    départagent deux paniers, ou suffisent à placer le cercle si l'image n'a rien donné.
import { createRimAccumulator, findRims } from './rimfinder.js';
import { createTracker } from './tracker.js';

const SCAN_FRAMES = 8;

export function createRimAuto() {
  let acc = null, accW = 0, accH = 0;
  const scans = [];                 // derniers résultats d'analyse d'image
  let imageLock = null;             // {xl,xr,y,conf}
  let rim = null, source = null, changed = false, confirmed = null;
  const arcs = [];                  // points d'interruption des tirs {x,y,r} (normalisés)
  const tr = createTracker({ sizeFree: true, ballPx: 6 });
  let track = null, trW = 0, trH = 0;
  let lastCands = [];
  let moveVotes = 0;                // le téléphone a-t-il bougé ? (le cercle n'est plus là où on l'avait)

  const same = (a, b) => a && b && Math.abs((a.xl + a.xr) / 2 - (b.xl + b.xr) / 2) < 0.3 * (a.xr - a.xl) && Math.abs(a.y - b.y) < 0.03;

  function addScanFrame(img) {
    if (!acc || img.width !== accW || img.height !== accH) { acc = createRimAccumulator(img.width, img.height); accW = img.width; accH = img.height; }
    acc.add(img);
    if (acc.count < SCAN_FRAMES) return false;
    const r = findRims(acc.result());
    acc.reset();
    scans.push(r); if (scans.length > 4) scans.shift();
    lastCands = r.candidates;
    const top = r.candidates[0], prev = scans.length > 1 ? scans[scans.length - 2].candidates[0] : null;
    // téléphone déplacé : plus aucun candidat à l'endroit retenu, et un autre cercle net ailleurs, plusieurs fois de suite
    if (rim && source === 'image+tirs') {
      const here = r.candidates.some(c => same(c, rim));
      if (!here && top && r.confidence >= 0.5 && same(top, prev)) moveVotes++; else if (here) moveVotes = 0;
      if (moveVotes >= 3) { moveVotes = 0; arcs.length = 0; confirmed = null; imageLock = null; rim = null; }
    }
    if (top && r.confidence >= 0.55 && same(top, prev)) {
      const lock = { xl: (top.xl + prev.xl) / 2, xr: (top.xr + prev.xr) / 2, y: (top.y + prev.y) / 2, conf: r.confidence };
      if (!imageLock || !same(imageLock, lock)) { imageLock = lock; decide(); }
    }
    return true;
  }

  // ---- suivi du ballon sans panier (images d'analyse ≈320 px) ----
  function addTrackFrame(img, t) {
    trW = img.width; trH = img.height;
    const out = tr.process(img, t);
    // forme de ballon : à peu près ronde (un peu étirée par le flou), pas un maillot ni un bras
    const maxA = (0.07 * trW) ** 2;
    const cs = (out.cands || []).filter(c => c.area >= 6 && c.area <= maxA && c.w / c.h > 0.45 && c.w / c.h < 2.4 && c.area / (c.w * c.h) > 0.35);
    let pick = null;
    if (track && track.pts.length) {
      const L = track.pts[track.pts.length - 1];
      let bd = 1e9;
      for (const c of cs) { const d = Math.hypot(c.x - L.x, c.y - L.y); if (d < bd) { bd = d; pick = c; } }
      const gate = Math.max(18, 4 * L.r + 0.06 * trW);
      if (bd > gate) pick = null;
    } else if (cs.length) pick = cs.reduce((a, b) => (b.area > a.area ? b : a));
    if (pick) {
      const p = { x: pick.x, y: pick.y, t, r: Math.sqrt(pick.area / Math.PI) / 0.8 };
      if (!track || t - track.last > 220) { if (track) closeTrack(); track = { pts: [] }; }
      track.pts.push(p); track.last = t;
      if (track.pts.length > 120) track.pts.shift();
    } else if (track && t - track.last > 220) { closeTrack(); track = null; }
  }

  function fitTY(pts) { // y = a + b t + c t², x = d + e t
    const n = pts.length, t0 = pts[0].t;
    let S = [0, 0, 0, 0, 0], Y = [0, 0, 0], X = [0, 0];
    for (const p of pts) { const t = (p.t - t0) / 1000; const t2 = t * t; S[0] += 1; S[1] += t; S[2] += t2; S[3] += t2 * t; S[4] += t2 * t2; Y[0] += p.y; Y[1] += p.y * t; Y[2] += p.y * t2; X[0] += p.x; X[1] += p.x * t; }
    const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(M); if (Math.abs(D) < 1e-12) return null;
    const col = i => M.map((r, k) => r.map((v, j) => (j === i ? Y[k] : v)));
    const a = det(col(0)) / D, b = det(col(1)) / D, c = det(col(2)) / D;
    const den = n * S[2] - S[1] * S[1]; if (Math.abs(den) < 1e-12) return null;
    const e = (n * X[1] - S[1] * X[0]) / den, d = (X[0] - e * S[1]) / n;
    return { t0, a, b, c, d, e, y: tt => a + b * tt + c * tt * tt, x: tt => d + e * tt };
  }

  const dbg = [], D = x => { if (dbg.length < 300) dbg.push(x); };
  function closeTrack() {
    const P = track && track.pts; if (P) D([Math.round(P[0].t), P.length]); if (!P || P.length < 8) return;
    let ai = 0; for (let i = 1; i < P.length; i++) if (P[i].y < P[ai].y) ai = i;
    if (ai < 3 || P.length - ai < 3) { D('noapex'); return; }
    const rMed = P.map(p => p.r).sort((a, b) => a - b)[P.length >> 1];
    // vol libre : on part du sommet et on prolonge la parabole des deux côtés tant que les points la suivent
    // (avant : on écarte le geste de tir et les dribbles ; après : on s'arrête au contact du cercle)
    const tol = Math.max(2, 0.7 * rMed);
    const seg = P.slice(ai - 3, ai + 4);
    let start = ai - 3;
    while (start > 0) {
      const f = fitTY(seg); if (!f || f.c <= 0) break;
      const q = P[start - 1], tt = (q.t - f.t0) / 1000;
      if (Math.hypot(f.x(tt) - q.x, f.y(tt) - q.y) > tol * 1.3) break;
      seg.unshift(q); start--;
    }
    if (ai - start < 4) { D('montée courte'); return; }
    let k = ai + 4, dev = null;
    while (k < P.length) {
      const f = fitTY(seg); if (!f || f.c <= 0) { D('fit'); return; }
      const tt = (P[k].t - f.t0) / 1000;
      if (Math.hypot(f.x(tt) - P[k].x, f.y(tt) - P[k].y) > tol) { dev = P[k - 1]; break; }
      seg.push(P[k]); k++;
    }
    if (!dev) dev = P[P.length - 1];                         // ballon disparu (dans le filet)
    const apex = P[ai];
    if (dev.y - apex.y < 3 * rMed) { D('short ' + Math.round(dev.y - apex.y) + ' ' + rMed.toFixed(1) + ' k' + k + ' ai' + ai + ' st' + start); return; }                    // pas un vrai tir
    if (dev.y > trH * 0.85) { D('floor'); return; }                           // tombé au sol sans rien toucher
    arcs.push({ x: dev.x / trW, y: dev.y / trH, r: rMed / trW, dir: Math.sign(dev.x - P[start].x) || 1 });
    if (arcs.length > 12) arcs.shift();
    decide();
  }

  function shotCluster() {
    if (arcs.length < 2) return null;
    // les 6 derniers tirs seulement (si le téléphone a bougé, les nouveaux tirs l'emportent vite)
    const recent = arcs.slice(-6);
    let best = null;
    for (const a of recent) {
      const near = recent.filter(b => Math.hypot(b.x - a.x, (b.y - a.y) * 0.5625) < 3.5 * a.r);
      if (!best || near.length > best.length) best = near;
    }
    if (!best || best.length < 2) return null;
    // position : tous les tirs mémorisés proches de ce groupe récent (plus de points, médiane plus stable)
    { const mx = best.reduce((n, a) => n + a.x, 0) / best.length, my = best.reduce((n, a) => n + a.y, 0) / best.length;
      best = arcs.filter(b => Math.hypot(b.x - mx, (b.y - my) * 0.5625) < 3.5 * b.r); if (best.length < 2) return null; }
    const med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
    const r = med(best.map(a => a.r)), dir = Math.sign(best.reduce((n, a) => n + a.dir, 0)) || 1;
    // les ratés touchent l'avant du cercle, les paniers entrent au centre : on décale vers l'arrière
    return { x: med(best.map(a => a.x)) + dir * 0.45 * r, y: med(best.map(a => a.y)), r, n: best.length, dir };
  }

  function decide() {
    const sc = shotCluster();
    let next = null, src = null;
    if (sc) {
      // candidat image le plus proche du point d'impact des tirs
      const pool = [...(confirmed ? [confirmed] : []), ...(imageLock ? [imageLock] : []), ...lastCands];
      let bestC = null, bd = 1e9;
      const expW = 3.8 * sc.r;                                  // cercle ≈ 1,9 diamètre de ballon
      for (const c of pool) {
        const cx = (c.xl + c.xr) / 2, w = c.xr - c.xl;
        if (w < 0.45 * expW || w > 2.4 * expW) continue;       // taille incompatible avec le ballon vu
        const d = Math.hypot(cx - sc.x, (c.y - sc.y) * 0.5625);
        if (d < Math.max(1.3 * w, 5 * sc.r) && d < bd) { bd = d; bestC = c; }
      }
      if (bestC) { confirmed = { xl: bestC.xl, xr: bestC.xr, y: bestC.y }; next = { ...confirmed }; src = 'image+tirs'; }
      else {
        // pas de candidat image : cercle déduit des tirs (diamètre du cercle ≈ 1,9 × ballon)
        const half = sc.r * 1.9;
        next = { xl: sc.x - half, xr: sc.x + half, y: sc.y }; src = 'tirs';
      }
    } else if (imageLock) { next = { xl: imageLock.xl, xr: imageLock.xr, y: imageLock.y }; src = 'image'; }
    if (next && (!rim || !same(rim, next) || src !== source)) { rim = next; source = src; changed = true; }
  }

  return {
    addScanFrame, addTrackFrame,
    get rim() { return rim; },
    get source() { return source; },
    get candidates() { return lastCands; },
    get imageLock() { return imageLock; },
    get shots() { return arcs.length; },
    get scanCount() { return scans.length; },
    get arcs() { return arcs; },
    get dbg() { return dbg; },
    _injectArc(a) { arcs.push(a); decide(); },
    takeChange() { const c = changed; changed = false; return c; },
    // l'utilisateur rejette le panier proposé : on passe au candidat suivant
    rejectCurrent() {
      if (!rim) return;
      const rest = lastCands.filter(c => !same(c, rim));
      if (rest.length) { rim = { xl: rest[0].xl, xr: rest[0].xr, y: rest[0].y }; source = 'image'; imageLock = { ...rim, conf: 0.5 }; changed = true; }
    },
    reset() { moveVotes = 0; scans.length = 0; imageLock = null; confirmed = null; rim = null; source = null; arcs.length = 0; track = null; lastCands = []; if (acc) acc.reset(); },
  };
}
