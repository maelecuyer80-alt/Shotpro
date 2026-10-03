// Détection automatique du cercle (panier) dans l'image, sans intervention.
//
// Idée : on moyenne une série d'images pour effacer ce qui bouge (joueur, ballon),
// puis on cherche une structure orange/rouge, fine et horizontale (le cercle vu de côté
// ou légèrement de dessous), et on la note selon ce qui l'entoure normalement :
// un filet texturé juste en dessous, un panneau / un support vertical sur un côté,
// une position dans le haut de l'image. Le meilleur candidat donne le cercle.
// Entrée : images RGBA (≈640 px de large). Sortie : candidats normalisés {xl, xr, y, score}.

function hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

function isRimColor(r, g, b) {
  if (r - b <= 45) return false;
  const [h, s, v] = hsv(r, g, b);
  return (h <= 32 || h >= 340) && s >= 0.42 && v >= 0.2;
}

export function createRimAccumulator(W, H) {
  const n = W * H;
  const sum = new Float32Array(n * 3), sq = new Float32Array(n), hits = new Uint16Array(n);
  let count = 0;
  return {
    add(frame) {
      const d = frame.data;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        sum[i * 3] += d[p]; sum[i * 3 + 1] += d[p + 1]; sum[i * 3 + 2] += d[p + 2];
        const L = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        sq[i] += L * L;
        if (isRimColor(d[p], d[p + 1], d[p + 2])) hits[i]++;
      }
      count++;
    },
    get count() { return count; },
    // image moyenne + carte « immobile » (faible variance)
    result() {
      const mean = new Uint8ClampedArray(n * 4), still = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const r = sum[i * 3] / count, g = sum[i * 3 + 1] / count, b = sum[i * 3 + 2] / count;
        mean[i * 4] = r; mean[i * 4 + 1] = g; mean[i * 4 + 2] = b; mean[i * 4 + 3] = 255;
        const L = 0.299 * r + 0.587 * g + 0.114 * b;
        const v = sq[i] / count - L * L;
        still[i] = v < 260 ? 1 : 0; // écart-type < ~16 niveaux
      }
      const rimFrac = new Float32Array(n);
      for (let i = 0; i < n; i++) rimFrac[i] = hits[i] / count;
      return { data: mean, width: W, height: H, still, rimFrac };
    },
    reset() { sum.fill(0); sq.fill(0); hits.fill(0); count = 0; },
  };
}

export function findRims(img, opts = {}) {
  const { data, width: W, height: H } = img;
  const still = img.still || null;
  const n = W * H;
  const lum = new Float32Array(n), mask = new Uint8Array(n);
  const sat = new Float32Array(n), val = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const [h, s, v] = hsv(r, g, b);
    sat[i] = s; val[i] = v;
    // pixel « couleur de cercle » présent dans au moins un tiers des images (ignore ce qui passe devant)
    if (img.rimFrac ? img.rimFrac[i] >= 0.34 : isRimColor(r, g, b)) mask[i] = 1;
  }
  // on retire les structures verticales (liseré du panneau, poteau peint, bras) qui collent au cercle
  const V = Math.max(10, Math.round(0.035 * H));
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!mask[y * W + x]) { y++; continue; }
      let e = y; while (e < H && mask[e * W + x]) e++;
      if (e - y > V) for (let k = y; k < e; k++) mask[k * W + x] = 0;
      y = e;
    }
  }
  // fermeture horizontale (relie les morceaux du cercle cachés par les crochets du filet)
  const m2 = new Uint8Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (mask[i]) { m2[i] = 1; continue; }
    let l = 0, r = 0;
    for (let k = 1; k <= 3 && x - k >= 0; k++) if (mask[i - k]) { l = 1; break; }
    for (let k = 1; k <= 3 && x + k < W; k++) if (mask[i + k]) { r = 1; break; }
    if (l && r) m2[i] = 1;
  }
  // composantes connexes (8-voisinage)
  const lab = new Int32Array(n), stack = new Int32Array(n), comps = [];
  let id = 0;
  for (let i = 0; i < n; i++) {
    if (!m2[i] || lab[i]) continue;
    id++; let sp = 0; stack[sp++] = i; lab[i] = id;
    let area = 0, x0 = W, x1 = -1, y0 = H, y1 = -1, sy = 0;
    while (sp) {
      const j = stack[--sp], x = j % W, y = (j / W) | 0;
      area++; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx; if (m2[k] && !lab[k]) { lab[k] = id; stack[sp++] = k; }
      }
    }
    if (area >= 8) comps.push({ id, area, x0, x1, y0, y1, cy: sy / area });
  }

  const tex = (xa, xb, ya, yb, dir) => {     // densité de bords dans une zone
    xa = Math.max(1, Math.round(xa)); xb = Math.min(W - 2, Math.round(xb));
    ya = Math.max(1, Math.round(ya)); yb = Math.min(H - 2, Math.round(yb));
    if (xb <= xa || yb <= ya) return 0;
    let c = 0, t = 0;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const i = y * W + x;
      const g = dir === 'h' ? Math.abs(lum[i + 1] - lum[i - 1]) : Math.abs(lum[i + W] - lum[i - W]);
      if (g > 22) c++; t++;
    }
    return c / t;
  };
  const bright = (xa, xb, ya, yb) => {
    xa = Math.max(0, Math.round(xa)); xb = Math.min(W - 1, Math.round(xb));
    ya = Math.max(0, Math.round(ya)); yb = Math.min(H - 1, Math.round(yb));
    if (xb <= xa || yb <= ya) return 0;
    let c = 0, t = 0;
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const i = y * W + x; if (val[i] > 0.62 && sat[i] < 0.28) c++; t++; }
    return c / t;
  };
  // plus long segment vertical de contraste dans une bande de colonnes (bord de panneau, support)
  const verticalRun = (xa, xb, ya, yb) => {
    xa = Math.max(1, Math.round(xa)); xb = Math.min(W - 2, Math.round(xb));
    ya = Math.max(1, Math.round(ya)); yb = Math.min(H - 2, Math.round(yb));
    let best = 0;
    for (let x = xa; x <= xb; x++) {
      let run = 0;
      for (let y = ya; y <= yb; y++) {
        const i = y * W + x;
        const g = Math.max(Math.abs(lum[i + 1] - lum[i - 1]), Math.abs(lum[i + 2 < n ? i + 1 : i] - lum[i - 1]));
        if (g > 28) { run++; if (run > best) best = run; } else run = Math.max(0, run - 1);
      }
    }
    return best;
  };

  // « fils » : lignes où l'intensité alterne plusieurs fois (filet), comparé à une zone témoin
  const strings = (xa, xb, ya, yb) => {
    xa = Math.max(1, Math.round(xa)); xb = Math.min(W - 2, Math.round(xb));
    ya = Math.max(1, Math.round(ya)); yb = Math.min(H - 2, Math.round(yb));
    if (xb - xa < 4 || yb <= ya) return 0;
    let rows = 0, hit = 0;
    for (let y = ya; y <= yb; y++) {
      let peaks = 0, last = 0;
      for (let x = xa; x <= xb; x++) {
        const i = y * W + x, g = lum[i + 1] - lum[i - 1];
        const sgn = g > 14 ? 1 : g < -14 ? -1 : 0;
        if (sgn && sgn !== last) { peaks++; last = sgn; }
      }
      rows++; if (peaks >= 4) hit++;
    }
    return hit / rows;
  };

  const cands = [];
  for (const c of comps) {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    if (w < Math.max(12, 0.018 * W) || w > 0.42 * W) continue;
    // téléphone posé à 1–1,5 m : le cercle (3,05 m) est dans le haut de l'image ; en bas ce sont des lignes au sol
    if (c.cy > (opts.maxY || 0.64) * H || c.cy < 0.03 * H) continue;
    if (w / h < 2.2) continue;                                 // pas assez horizontal
    // profil par colonne : longueur des traits verticaux (un cercle = trait fin, 1 ou 2 fois par colonne)
    const runs = []; let cover = 0, two = 0;
    for (let x = c.x0; x <= c.x1; x++) {
      let r = 0, nr = 0, any = false;
      for (let y = c.y0; y <= c.y1 + 1; y++) {
        const on = y <= c.y1 && lab[y * W + x] === c.id;
        if (on) r++; else if (r) { runs.push(r); nr++; r = 0; any = true; }
      }
      if (any) cover++; if (nr >= 2) two++;
    }
    runs.sort((a, b) => a - b);
    const thick = runs.length ? runs[runs.length >> 1] : 99;
    const colCover = cover / w;
    if (opts.debug && w > 15) console.log('comp', c.x0, c.x1, Math.round(c.cy), 'w', w, 'h', h, 'thick', thick, 'cover', colCover.toFixed(2));
    if (thick > Math.max(5, 0.16 * w)) continue;               // trop épais : affiche, banderole, maillot…
    if (colCover < 0.7) continue;
    const fill = c.area / (w * h);
    const y = c.cy, xl = c.x0, xr = c.x1;
    // filet : texture verticale (fils) sous le cercle, comparée au fond au-dessus
    const yb0 = c.y1 + 1;
    const below = strings(xl + 0.08 * w, xr - 0.08 * w, yb0, yb0 + 0.45 * w);
    const above = strings(xl + 0.08 * w, xr - 0.08 * w, c.y0 - 0.5 * w, c.y0 - 1);
    const net = Math.max(0, below - above * 0.8) * 2.2;
    // panneau / support : long segment vertical près d'un bout du cercle
    const span = Math.round(Math.max(8, 1.2 * w));
    const vrR = verticalRun(xr - 0.05 * w, xr + 0.9 * w, y - span, y + 0.3 * w);
    const vrL = verticalRun(xl - 0.9 * w, xl + 0.05 * w, y - span, y + 0.3 * w);
    const vr = Math.max(vrR, vrL), boardSide = vrR >= vrL ? 1 : -1;
    const board = Math.min(1, vr / (0.8 * w));
    const boardBright = Math.max(bright(xr, xr + 0.5 * w, y - w, y), bright(xl - 0.5 * w, xl, y - w, y));
    // fond sous le cercle : un vrai cercle est en l'air (pas collé à une grande masse orange)
    const posY = y / H;
    const prior = posY < 0.75 ? 1 : 0.4;
    const size = Math.max(-1.5, Math.min(1.2, Math.log2(w / (0.07 * W))));
    const score = (Math.min(w / h, 12) / 12) * 0.6 + colCover * 0.5 + (1 - Math.min(1, thick / (0.16 * w))) * 0.5
      + Math.min(1.6, net) * 1.8 + board * 1.0 + boardBright * 0.4 + prior * 0.5 + size * (opts.sizeW ?? 1.0) + (two / w) * 0.3;
    cands.push({ xl, xr, y, w, thick, net, board, boardSide, score, comp: c.id, src: 'rim' });
  }
  // ---- deuxième source : le filet lui-même (utile si le cercle se confond avec le fond) ----
  const CW = 6, CH = 4, GW = Math.floor(W / CW), GH = Math.floor(H / CH);
  const cell = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    let ch = 0;
    for (let y = gy * CH; y < gy * CH + CH; y++) {
      let last = 0;
      for (let x = Math.max(1, gx * CW - 2); x < Math.min(W - 1, gx * CW + CW + 2); x++) {
        const i = y * W + x, g = lum[i + 1] - lum[i - 1], sg = g > 14 ? 1 : g < -14 ? -1 : 0;
        if (sg && sg !== last) { ch++; last = sg; }
      }
    }
    cell[gy * GW + gx] = ch / CH;
  }
  const netCell = new Uint8Array(GW * GH);
  for (let i = 0; i < GW * GH; i++) netCell[i] = cell[i] >= 2.2 ? 1 : 0;
  const nlab = new Int32Array(GW * GH); let nid = 0;
  for (let i = 0; i < GW * GH; i++) {
    if (!netCell[i] || nlab[i]) continue;
    nid++; const st = [i]; nlab[i] = nid; let x0 = GW, x1 = -1, y0 = GH, y1 = -1, cnt = 0;
    while (st.length) {
      const j = st.pop(), x = j % GW, y = (j / GW) | 0; cnt++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [j - 1, j + 1, j - GW, j + GW]) if (k >= 0 && k < GW * GH && netCell[k] && !nlab[k] && Math.abs((k % GW) - x) <= 1) { nlab[k] = nid; st.push(k); }
    }
    const wpx = (x1 - x0 + 1) * CW, hpx = (y1 - y0 + 1) * CH;
    if (wpx < 14 || wpx > 0.4 * W || hpx < 0.4 * wpx || hpx > 2.2 * wpx || cnt < 0.35 * (x1 - x0 + 1) * (y1 - y0 + 1)) continue;
    // largeur du haut du filet = largeur du cercle ; le filet se rétrécit vers le bas
    let topA = x1, topB = x0;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= Math.min(y1, y0 + 1); y++) if (nlab[y * GW + x] === nid) { topA = Math.min(topA, x); topB = Math.max(topB, x); }
    let botA = x1, botB = x0;
    for (let x = x0; x <= x1; x++) for (let y = Math.max(y0, y1 - 1); y <= y1; y++) if (nlab[y * GW + x] === nid) { botA = Math.min(botA, x); botB = Math.max(botB, x); }
    const topW = (topB - topA + 1) * CW, botW = (botB - botA + 1) * CW;
    if (topW < 14 || botW > topW * 1.05) continue;              // un filet est plus large en haut
    const y = y0 * CH, xl = topA * CW, xr = (topB + 1) * CW, w = xr - xl;
    if (y < 0.03 * H || y > (opts.maxY || 0.64) * H) continue;
    // couleur de cercle le long du bord supérieur ?
    let rc = 0, tot = 0;
    for (let x = xl; x < xr; x++) for (let yy = Math.max(0, y - 4); yy <= Math.min(H - 1, y + 2); yy++) { const i = yy * W + x; tot++; if (mask[i]) rc++; }
    const rimTop = tot ? Math.min(1, (rc / tot) * 5) : 0;
    const span = Math.round(Math.max(8, 1.2 * w));
    const vrR = verticalRun(xr - 0.05 * w, xr + 0.9 * w, y - span, y + 0.3 * w), vrL = verticalRun(xl - 0.9 * w, xl + 0.05 * w, y - span, y + 0.3 * w);
    const board = Math.min(1, Math.max(vrR, vrL) / (0.8 * w));
    const taper = Math.max(0, Math.min(1, (topW - botW) / (0.5 * topW)));
    const size = Math.max(-1.5, Math.min(1.2, Math.log2(w / (0.07 * W))));
    const score = 1.2 + rimTop * 1.6 + board * 1.0 + taper * 0.8 + size * (opts.sizeW ?? 1.0);
    // fusion avec un candidat « cercle » déjà trouvé au même endroit
    const dup = cands.find(c => Math.abs(c.y - y) < Math.max(6, 0.35 * w) && Math.abs((c.xl + c.xr) / 2 - (xl + xr) / 2) < 0.4 * w);
    if (dup) { dup.score += 0.8; continue; }
    cands.push({ xl, xr, y: Math.max(0, y - 1), w, thick: 2, net: 1, board, boardSide: vrR >= vrL ? 1 : -1, score, src: 'net' });
  }
  cands.sort((a, b) => b.score - a.score);

  // affinage des bords : le haut du filet donne la vraie largeur du cercle
  // (évite d'inclure la fixation quand elle est de la même couleur)
  for (const c of cands.slice(0, 4)) {
    const ya = Math.round(c.y + c.thick + 1), yb = Math.round(c.y + c.thick + Math.max(4, 0.25 * c.w));
    const colTex = [];
    for (let x = Math.max(1, c.xl - 2); x <= Math.min(W - 2, c.xr + 2); x++) {
      let k = 0, t = 0;
      for (let yy = Math.max(1, ya + 1); yy <= Math.min(H - 2, yb); yy++) { const i = yy * W + x; if (Math.abs(lum[i + 1] - lum[i - 1]) > 18 || Math.abs(lum[i + 2 < n ? i + 2 : i] - lum[i - 2 >= 0 ? i - 2 : i]) > 22) k++; t++; }
      colTex.push([x, t ? k / t : 0]);
    }
    // texture lissée par colonne : sous la fixation il n'y a pas de filet
    const r = Math.max(2, Math.round(0.08 * c.w));
    const sm = colTex.map((_, i) => { let t = 0, k = 0; for (let j = Math.max(0, i - r); j <= Math.min(colTex.length - 1, i + r); j++) { t += colTex[j][1]; k++; } return t / k; });
    const mx = Math.max(...sm, 0), thr = Math.max(0.06, 0.3 * mx);
    if (opts.debug) console.log('affinage', JSON.stringify({ xl: c.xl, xr: c.xr, w: c.w, net: c.net, board: c.board, side: c.boardSide, src: c.src }), sm.map(v => v.toFixed(2)).join(' '));
    if (!opts.noTrim && c.net > 0.3 && c.board > 0.3 && mx > 0.12) {
      // on ne coupe que côté panneau : c'est là que la fixation prolonge la couleur du cercle
      // depuis le côté panneau : on saute le bord du panneau, puis le creux sous la fixation, et le filet commence
      const order = c.boardSide < 0 ? sm.map((_, i) => i) : sm.map((_, i) => sm.length - 1 - i);
      let k = 0;
      while (k < order.length && sm[order[k]] > thr) k++;                 // bord du panneau éventuel
      const valley = k;
      while (k < order.length && sm[order[k]] <= thr) k++;                // creux (fixation, sans filet)
      if (k < order.length && k - valley >= Math.max(2, 0.08 * c.w)) {
        const x = colTex[order[k]][0] - c.boardSide * Math.round(r * 0.6);
        if (c.boardSide < 0 && x - c.xl > 0.08 * c.w && c.xr - x > 0.45 * c.w) c.xl = x;
        if (c.boardSide > 0 && c.xr - x > 0.08 * c.w && x - c.xl > 0.45 * c.w) c.xr = x;
      } else if (!opts.noRel) {
        // pas de vrai creux : on cherche une marche nette (texture faible côté panneau, forte ensuite)
        const L = order.length, need = Math.max(3, Math.round(0.12 * c.w));
        let best = -1, bestGain = 0;
        for (let j = need; j < Math.round(0.45 * L); j++) {
          let a = 0, b = 0;
          for (let q = 0; q < j; q++) a += sm[order[q]];
          for (let q = j; q < Math.min(L, j + need * 2); q++) b += sm[order[q]];
          a /= j; b /= Math.min(L, j + need * 2) - j;
          if (a < 0.62 * b && b - a > bestGain) { bestGain = b - a; best = j; }
        }
        if (best > 0 && bestGain > 0.18 * mx) {
          const x = colTex[order[best]][0];
          if (c.boardSide < 0 && c.xr - x > 0.5 * c.w) c.xl = x;
          if (c.boardSide > 0 && x - c.xl > 0.5 * c.w) c.xr = x;
        }
      }
    }
  }
  const top = cands[0];
  const conf = !top ? 0 : Math.max(0, Math.min(1, (top.score - 2.2) / 2.2)) * (cands[1] ? Math.min(1, 0.5 + (top.score - cands[1].score)) : 1);
  return {
    candidates: cands.slice(0, 5).map(c => ({ xl: c.xl / W, xr: c.xr / W, y: c.y / H, score: Math.round(c.score * 100) / 100, net: Math.round(c.net * 100) / 100, board: Math.round(c.board * 100) / 100 })),
    confidence: Math.round(conf * 100) / 100,
  };
}
