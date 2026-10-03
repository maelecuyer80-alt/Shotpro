// Machine de renvoi : positions autour de l'arc, distances, hauteurs de passe, programmes.
// Convention d'angle : 0° = coin gauche (ligne de fond), 90° = axe du panier, 180° = coin droit.

export const ANGLES = [
  { deg: 0, label: 'Coin gauche' },
  { deg: 22.5, label: 'Ligne de fond gauche' },
  { deg: 45, label: 'Aile gauche' },
  { deg: 67.5, label: 'Haut de raquette gauche' },
  { deg: 90, label: 'Axe' },
  { deg: 112.5, label: 'Haut de raquette droit' },
  { deg: 135, label: 'Aile droite' },
  { deg: 157.5, label: 'Ligne de fond droite' },
  { deg: 180, label: 'Coin droit' },
];
export const DISTANCES = [
  { m: 2.5, label: 'Près du cercle' },
  { m: 4.5, label: 'Mi-distance' },
  { m: 5.8, label: 'Longue mi-distance' },
  { m: 6.75, label: '3 points' },
];
export const HEIGHTS = [
  { id: 'basse', label: 'Passe basse', hint: 'à hauteur de hanche (≈ 0,9 m) : tu dois descendre chercher le ballon' },
  { id: 'poitrine', label: 'Passe poitrine', hint: 'à hauteur de poitrine (≈ 1,2 m) : réception idéale' },
  { id: 'haute', label: 'Passe haute', hint: 'au-dessus de la tête (≈ 1,7 m) : réception puis redescente dans le geste' },
];

const angleLabel = d => (ANGLES.find(a => a.deg === d) || { label: d + '°' }).label;
const distLabel = m => (m >= 6.7 ? '3 pts' : String(m).replace('.', ',') + ' m');
const heightLabel = h => (HEIGHTS.find(x => x.id === h) || HEIGHTS[1]).label.toLowerCase();

export const PRESETS = [
  { id: 'arc-mid', name: "Tour de l'arc, mi-distance", desc: '5 positions × 10 tirs à 4,5 m, passe poitrine toutes les 3 s.', angles: [0, 45, 90, 135, 180], dists: [4.5], heights: ['poitrine'], per: 10, interval: 3 },
  { id: 'arc-3', name: "Tour de l'arc à 3 points", desc: '5 positions × 10 tirs derrière la ligne, passe poitrine toutes les 3,5 s.', angles: [0, 45, 90, 135, 180], dists: [6.75], heights: ['poitrine'], per: 10, interval: 3.5 },
  { id: 'all-angles', name: 'Tous les angles', desc: 'Les 9 angles de 0 à 180°, 6 tirs chacun à 4,5 m.', angles: ANGLES.map(a => a.deg), dists: [4.5], heights: ['poitrine'], per: 6, interval: 3 },
  { id: 'heights', name: 'Toutes les hauteurs de passe', desc: '5 positions × 3 hauteurs × 5 tirs : apprendre à tirer quelle que soit la passe.', angles: [0, 45, 90, 135, 180], dists: [4.5], heights: ['basse', 'poitrine', 'haute'], per: 5, interval: 3 },
  { id: 'ladder', name: 'Échelle de distance', desc: "Dans l'axe, de 2,5 m à 3 pts, 8 tirs par distance.", angles: [90], dists: [2.5, 4.5, 5.8, 6.75], heights: ['poitrine'], per: 8, interval: 3 },
  { id: 'catch', name: 'Catch and shoot rapide', desc: '5 positions × 12 tirs, une passe toutes les 2 s : réception et tir sans temps mort.', angles: [0, 45, 90, 135, 180], dists: [4.5], heights: ['poitrine'], per: 12, interval: 2 },
  { id: 'full', name: 'Grand tour complet', desc: '9 angles × 3 distances × 3 hauteurs × 3 tirs (243 tirs) : le défi.', angles: ANGLES.map(a => a.deg), dists: [2.5, 4.5, 6.75], heights: ['basse', 'poitrine', 'haute'], per: 3, interval: 2.5 },
  { id: 'random', name: 'Aléatoire', desc: '12 positions tirées au hasard parmi tous les angles, distances et hauteurs, 5 tirs chacune.', random: 12, per: 5, interval: 3 },
];

// Construit la liste des blocs (un bloc = une position de machine).
export function buildMachinePlan(cfg) {
  let combos = [];
  if (cfg.random) {
    const all = [];
    for (const a of ANGLES) for (const d of DISTANCES) for (const h of HEIGHTS) all.push([a.deg, d.m, h.id]);
    for (let i = 0; i < cfg.random; i++) combos.push(all.splice(Math.floor(Math.random() * all.length), 1)[0]);
  } else {
    for (const d of cfg.dists) for (const h of cfg.heights) for (const a of cfg.angles) combos.push([a, d, h]);
    if (cfg.shuffle) combos.sort(() => Math.random() - 0.5);
  }
  return combos.map(([deg, m, h]) => ({
    name: `${angleLabel(deg)} · ${distLabel(m)} · ${heightLabel(h).replace('passe ', 'passe ')}`,
    cue: `Machine : angle ${String(deg).replace('.', ',')}°, ${String(m).replace('.', ',')} m, ${heightLabel(h)}, une passe toutes les ${String(cfg.interval).replace('.', ',')} s.`,
    plan: { series: 1, per: cfg.per, seconds: null },
    spot: { deg, m, h, interval: cfg.interval },
  }));
}

export function planDuration(blocks) {
  const shots = blocks.reduce((n, b) => n + b.plan.per, 0);
  const secs = blocks.reduce((n, b) => n + b.plan.per * b.spot.interval, 0) + blocks.length * 25;
  return { shots, minutes: Math.round(secs / 60) };
}

// Position sur un demi-terrain vu de dessus (mètres) : panier en (7,5 ; 1,575).
export function spotXY(deg, m) {
  const r = (deg * Math.PI) / 180;
  return { x: 7.5 - Math.cos(r) * m, y: 1.575 + Math.sin(r) * m };
}

// Carte des tirs : stats = [{deg, m, made, att}]
export function courtSVG(stats, opts = {}) {
  const W = 340, S = W / 15, H = Math.round(9.5 * S);
  const X = x => x * S, Y = y => y * S;
  const rx = X(7.5), ry = Y(1.575);
  let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="var(--surface2)" rx="10"/>`;
  g += `<line x1="0" y1="1" x2="${W}" y2="1" class="court-line"/>`;
  g += `<rect x="${X(5.05)}" y="0" width="${X(4.9)}" height="${Y(5.8)}" class="court-line" fill="none"/>`;
  g += `<circle cx="${rx}" cy="${Y(5.8)}" r="${X(1.8)}" class="court-line" fill="none"/>`;
  // ligne à 3 points : droites dans les coins puis arc de 6,75 m
  const cornerY = 1.575 + Math.sqrt(6.75 * 6.75 - 6.6 * 6.6);
  g += `<path class="court-line" fill="none" d="M ${X(0.9)} 0 L ${X(0.9)} ${Y(cornerY)} A ${X(6.75)} ${X(6.75)} 0 0 0 ${X(14.1)} ${Y(cornerY)} L ${X(14.1)} 0"/>`;
  g += `<line x1="${X(6.6)}" y1="${Y(1.2)}" x2="${X(8.4)}" y2="${Y(1.2)}" class="court-line strong"/>`;
  g += `<circle cx="${rx}" cy="${ry}" r="${X(0.23)}" fill="none" stroke="var(--ball)" stroke-width="2"/>`;
  for (const s of stats) {
    const p = spotXY(s.deg, s.m), pc = s.att ? s.made / s.att : null;
    const col = pc == null ? 'var(--muted)' : pc >= 0.6 ? 'var(--made)' : pc >= 0.4 ? 'var(--ball)' : 'var(--miss)';
    const cx = Math.min(W - 14, Math.max(14, X(p.x))), cy = Math.min(H - 12, Math.max(12, Y(p.y)));
    g += `<circle cx="${cx}" cy="${cy}" r="13" fill="${col}" fill-opacity="${pc == null ? 0.25 : 0.9}"/>`;
    g += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="court-pct">${pc == null ? '' : Math.round(pc * 100)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${opts.label || 'Carte des tirs'}">${g}</svg>`;
}
