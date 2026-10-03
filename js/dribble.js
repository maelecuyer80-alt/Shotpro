// Module dribble : exercices, routines, démonstrations animées et comptage des rebonds à la caméra.

const yt = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

export const DRILLS = {
  poundR: { name: 'Dribble appuyé main droite', anim: 'poundR', bounce: true, cue: "Ballon frappé fort, à hauteur de hanche. Regard levé, genoux fléchis, l'autre bras protège.", tip: 'Frappe le ballon, ne le caresse pas : il doit revenir vite dans la main.', video: yt('pound dribble basketball drill') },
  poundL: { name: 'Dribble appuyé main gauche', anim: 'poundL', bounce: true, cue: 'Même travail main faible. Le ballon reste sur le côté, pas devant les pieds.', tip: 'Garde la même cadence que la main droite, même si le contrôle est moins bon.', video: yt('weak hand pound dribble basketball') },
  low: { name: 'Dribble bas et rapide', anim: 'low', bounce: true, cue: 'Ballon sous le genou, le plus vite possible, en restant bas sur les appuis.', tip: 'Des rebonds courts et rapides : seuls le poignet et les doigts travaillent.', video: yt('low fast dribble basketball drill') },
  cross: { name: 'Crossover', anim: 'cross', bounce: true, cue: 'Changement de main devant toi, rebond au centre, en V. Le ballon reste sous le genou.', tip: "Un rebond bas et rapide au centre : plus il est bas, plus il est dur à intercepter.", video: yt('crossover dribble basketball tutorial') },
  legs: { name: 'Entre les jambes', anim: 'legs', bounce: true, cue: "Fente avant, rebond entre les pieds, réception de l'autre main. Alterne la jambe avant.", tip: "Le rebond tombe sous ton centre de gravité, pas derrière toi.", video: yt('between the legs dribble basketball tutorial') },
  back: { name: 'Dans le dos', anim: 'back', bounce: true, cue: "Le ballon passe derrière les hanches et rebondit de l'autre côté, légèrement devant.", tip: "Enroule le poignet autour de la hanche : le ballon doit finir devant toi, pas derrière.", video: yt('behind the back dribble basketball tutorial') },
  inoutR: { name: 'In & out main droite', anim: 'inout', bounce: true, cue: "Feinte de crossover : le ballon part vers l'intérieur puis ressort du même côté.", tip: 'Vends la feinte avec les épaules et la tête, pas seulement avec le ballon.', video: yt('in and out dribble basketball tutorial') },
  spider: { name: 'Spider dribble', anim: 'spider', bounce: true, cue: 'Ballon entre les pieds, touches alternées : droite devant, gauche devant, droite derrière, gauche derrière.', tip: 'Des touches très courtes, du bout des doigts, sans regarder le ballon.', video: yt('spider dribble basketball drill') },
  eight: { name: 'Huit autour des jambes', anim: 'eight', bounce: false, cue: "Fais tourner le ballon en 8 autour des jambes, sans rebond, le plus vite possible.", tip: 'Bon exercice de toucher de balle avant de dribbler.', video: yt('figure 8 ball handling drill basketball') },
  combo: { name: 'Combo cross + jambes + dos', anim: 'combo', bounce: true, cue: 'Enchaîne crossover, entre les jambes et dans le dos sans t\'arrêter.', tip: "Qualité avant vitesse : accélère seulement quand l'enchaînement est propre.", video: yt('combo dribble moves crossover between legs behind back drill') },
};

export const ROUTINES = [
  { id: 'base', name: 'Routine de base · 8 min', desc: 'Les fondamentaux des deux mains, idéale avant le tir.', items: [['eight', 30], ['poundR', 40], ['poundL', 40], ['low', 30], ['cross', 45], ['legs', 45], ['back', 45], ['spider', 30]] },
  { id: 'weak', name: 'Main faible · 6 min', desc: 'Tout à gauche (ou à droite si tu es gaucher).', items: [['poundL', 45], ['low', 30], ['inoutR', 40], ['poundL', 45], ['cross', 40], ['poundL', 45]] },
  { id: 'moves', name: 'Changements de direction · 7 min', desc: 'Crossover, jambes, dos, in & out, puis les enchaînements.', items: [['cross', 45], ['legs', 45], ['back', 45], ['inoutR', 40], ['combo', 60], ['combo', 60]] },
  { id: 'speed', name: 'Vitesse · 5 min', desc: 'Séries courtes et intenses : bats ton record de rebonds.', items: [['low', 20], ['poundR', 20], ['poundL', 20], ['cross', 20], ['spider', 20], ['low', 20], ['cross', 20], ['spider', 20]] },
];

// ---------- démonstration animée (vue de face) ----------
// renvoie {ball:{x,y,behind}, hR:{x,y}, hL:{x,y}, stance} pour p ∈ [0,1)
const bounceY = (p, top, floor) => { const u = Math.abs(Math.cos(Math.PI * p)); return floor - (floor - top) * u * u; };
const lerp = (a, b, t) => a + (b - a) * t;
function pose(anim, p) {
  const top = 0.56, floor = 0.94;
  const rest = { hR: { x: 0.2, y: 0.5 }, hL: { x: -0.2, y: 0.5 } };
  switch (anim) {
    case 'poundR': case 'poundL': {
      const s = anim === 'poundR' ? 1 : -1, y = bounceY(p, top, floor);
      const h = { x: 0.24 * s, y: Math.min(top + 0.02, y - 0.04) };
      return { ball: { x: 0.24 * s, y }, hR: s > 0 ? h : rest.hR, hL: s < 0 ? h : rest.hL };
    }
    case 'low': {
      const q = (p * 2) % 1, y = bounceY(q, 0.78, floor);
      return { ball: { x: 0.24, y }, hR: { x: 0.24, y: Math.min(0.8, y - 0.04) }, hL: { x: -0.18, y: 0.6 }, low: true };
    }
    case 'cross': case 'legs': case 'back': {
      const half = p < 0.5, t = (p % 0.5) * 2, from = half ? 0.26 : -0.26, to = -from;
      const x = lerp(from, to, t), y = 0.6 + (floor - 0.6) * Math.sin(Math.PI * t);
      const b = { x, y: anim === 'legs' ? y : y, behind: anim === 'back' && Math.abs(x) < 0.15 };
      if (anim === 'legs') b.y = 0.62 + (floor - 0.62) * Math.sin(Math.PI * t);
      const hand = { x: from, y: 0.58 }, catcher = { x: to, y: 0.58 };
      return { ball: b, hR: half ? (t < 0.3 ? { x: lerp(0.26, x, 0.6), y: 0.58 } : hand) : catcher, hL: half ? catcher : (t < 0.3 ? { x: lerp(-0.26, x, 0.6), y: 0.58 } : hand), lunge: anim === 'legs' };
    }
    case 'inout': {
      const t = p, x = 0.24 - 0.16 * Math.sin(Math.PI * t), y = bounceY(t * 2 % 1, top, floor);
      return { ball: { x, y }, hR: { x, y: Math.min(top, y - 0.04) }, hL: rest.hL };
    }
    case 'spider': {
      const k = Math.min(3, Math.floor(p * 4)), t = (p * 4) % 1;
      const pts = [[0.07, 0.86, false], [-0.07, 0.86, false], [0.07, 0.9, true], [-0.07, 0.9, true]];
      const [x, , behind] = pts[k], y = bounceY(t, 0.8, floor);
      return { ball: { x, y, behind }, hR: { x: 0.1, y: k % 2 === 0 ? y - 0.05 : 0.8 }, hL: { x: -0.1, y: k % 2 === 1 ? y - 0.05 : 0.8 }, low: true };
    }
    case 'eight': {
      const a = 2 * Math.PI * p, x = 0.2 * Math.sin(a), y = 0.74 + 0.05 * Math.sin(2 * a);
      const behind = Math.cos(2 * a) < 0;
      return { ball: { x, y, behind }, hR: { x: Math.max(0.05, x), y: y - 0.04 }, hL: { x: Math.min(-0.05, x), y: y - 0.04 }, low: true };
    }
    case 'combo': {
      const seq = ['cross', 'legs', 'back'], k = Math.min(2, Math.floor(p * 3));
      return pose(seq[k], (p * 3) % 1);
    }
  }
  return { ball: { x: 0.24, y: 0.7 }, ...rest };
}

export function drawDemo(cv, anim, tSec, colors) {
  const ctx = cv.getContext('2d'), dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const period = anim === 'eight' ? 1.6 : anim === 'combo' ? 3 : anim === 'spider' ? 1.4 : 1.1;
  const P = pose(anim, (((Math.max(0, tSec) / period) % 1) + 1) % 1);
  const sz = Math.min(W, H), ox = W / 2, oy = (H - sz) / 2;
  const X = x => ox + x * sz, Y = y => oy + y * sz;
  const crouch = P.low ? 0.08 : 0.03;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = colors.line; ctx.lineWidth = Math.max(1, sz * 0.006);
  ctx.beginPath(); ctx.moveTo(X(-0.45), Y(0.955)); ctx.lineTo(X(0.45), Y(0.955)); ctx.stroke();
  const drawBall = () => {
    ctx.globalAlpha = P.ball.behind ? 0.35 : 1;
    ctx.fillStyle = colors.ball; ctx.beginPath(); ctx.arc(X(P.ball.x), Y(P.ball.y) - sz * 0.02, sz * 0.04, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  };
  if (P.ball.behind) drawBall();
  ctx.strokeStyle = colors.body; ctx.lineWidth = sz * 0.035;
  const hip = { x: 0, y: 0.5 + crouch }, sh = { y: 0.24 + crouch };
  const footL = P.lunge ? { x: -0.16, y: 0.95 } : { x: -0.13, y: 0.95 }, footR = P.lunge ? { x: 0.18, y: 0.93 } : { x: 0.13, y: 0.95 };
  const knee = s => ({ x: s * (P.low ? 0.16 : 0.1), y: 0.73 + crouch / 2 });
  ctx.beginPath();
  ctx.moveTo(X(footL.x), Y(footL.y)); ctx.lineTo(X(knee(-1).x), Y(knee(-1).y)); ctx.lineTo(X(hip.x), Y(hip.y));
  ctx.lineTo(X(knee(1).x), Y(knee(1).y)); ctx.lineTo(X(footR.x), Y(footR.y));
  ctx.moveTo(X(0), Y(hip.y)); ctx.lineTo(X(0), Y(sh.y));
  ctx.moveTo(X(-0.1), Y(sh.y)); ctx.lineTo(X(P.hL.x), Y(P.hL.y));
  ctx.moveTo(X(0.1), Y(sh.y)); ctx.lineTo(X(P.hR.x), Y(P.hR.y));
  ctx.moveTo(X(-0.1), Y(sh.y)); ctx.lineTo(X(0.1), Y(sh.y));
  ctx.stroke();
  ctx.fillStyle = colors.body; ctx.beginPath(); ctx.arc(X(0), Y(sh.y - 0.09), sz * 0.055, 0, Math.PI * 2); ctx.fill();
  if (!P.ball.behind) drawBall();
}

// ---------- comptage des rebonds (caméra frontale, joueur face au téléphone) ----------
// Utilise les candidats « ballon » du moteur de tir (couleur + mouvement).
export function createDribbleCounter() {
  let last = null, dir = 0, topY = null, lastBounceT = -1e9, nowT = 0;
  const times = [];
  const st = { count: 0, left: 0, right: 0 };
  function pick(cands, H) {
    if (!cands.length) return null;
    if (last) {
      let best = null, bd = 1e9;
      for (const c of cands) { const d = Math.hypot(c.x - last.x, c.y - last.y); if (d < bd) { bd = d; best = c; } }
      if (bd < H * 0.35) return best;
    }
    return cands.reduce((a, b) => (b.area > a.area ? b : a));
  }
  return {
    reset() { last = null; dir = 0; topY = null; times.length = 0; st.count = st.left = st.right = 0; },
    // cands en pixels d'analyse ; W,H taille d'analyse ; t en ms. Renvoie true si un rebond vient d'être compté.
    step(cands, W, H, t) {
      nowT = t;
      const c = pick(cands, H);
      if (!c) { if (last && t - last.t > 400) { last = null; dir = 0; } return false; }
      let bounced = false;
      if (last) {
        const dy = c.y - last.y;
        const r = Math.max(3, Math.sqrt(c.area / Math.PI) * 1.2);
        if (dy > 0.6) { if (dir < 0 && topY === null) topY = last.y; dir = 1; }
        else if (dy < -0.6) {
          if (dir > 0) {
            // passage descente → montée : le ballon vient de toucher le sol
            const amp = topY === null ? 1e9 : last.y - topY;
            if (amp > Math.max(2.2 * r, H * 0.05) && t - lastBounceT > 110) {
              st.count++; lastBounceT = t; times.push(t);
              // vue de face, image non inversée : la main droite du joueur est à gauche de l'image
              if (last.x < W / 2) st.right++; else st.left++;
              bounced = true;
            }
          }
          dir = -1; topY = null;
        }
        if (dir < 0) topY = topY === null ? c.y : Math.min(topY, c.y);
      }
      last = { x: c.x, y: c.y, t };
      while (times.length && t - times[0] > 5000) times.shift();
      return bounced;
    },
    get stats() { return { ...st }; },
    rate(t = nowT) { const n = times.filter(x => t - x <= 3000).length; return Math.round((n / 3) * 10) / 10; },
  };
}
