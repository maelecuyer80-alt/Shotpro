// Badges : objectifs de progression, catégorisés, avec niveaux bronze / argent / or.
const shotsOf = s => (s.exercises || []).flatMap(e => e.series.flatMap(x => x.shots || []));
const TIERS = ['bronze', 'argent', 'or'];

function streak(arr, pred) { let best = 0, cur = 0; for (const x of arr) { if (pred(x)) { cur++; best = Math.max(best, cur); } else cur = 0; } return best; }
function std(a) { if (a.length < 2) return 99; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); }
function dayStreak(sessions) {
  const days = [...new Set(sessions.map(s => s.date))].sort();
  let best = 0, cur = 0, prev = null;
  for (const d of days) { const t = new Date(d).getTime(); cur = prev != null && t - prev === 864e5 ? cur + 1 : 1; best = Math.max(best, cur); prev = t; }
  return best;
}

// Chaque badge : value(sessions) → nombre ; tiers : seuils bronze/argent/or (ou un seul seuil)
export const BADGES = [
  // Volume
  { id: 'shots', cat: 'Volume', icon: '◎', name: 'Tireur assidu', desc: 'Tirs tentés au total', tiers: [500, 2500, 10000], value: S => S.reduce((n, s) => n + shotsOf(s).length, 0) },
  { id: 'makes', cat: 'Volume', icon: '✓', name: 'Ficelle', desc: 'Tirs réussis au total', tiers: [250, 1500, 6000], value: S => S.reduce((n, s) => n + shotsOf(s).filter(x => x.made).length, 0) },
  { id: 'sessions', cat: 'Assiduité', icon: '▦', name: 'Habitué du gymnase', desc: 'Séances enregistrées', tiers: [5, 25, 100], value: S => S.length },
  { id: 'days', cat: 'Assiduité', icon: '↗', name: 'Sans relâche', desc: "Jours d'entraînement consécutifs", tiers: [3, 7, 21], value: S => dayStreak(S) },
  // Précision
  { id: 'hot', cat: 'Précision', icon: '♨', name: 'Main chaude', desc: 'Tirs réussis de suite', tiers: [5, 10, 20], value: S => Math.max(0, ...S.map(s => streak(shotsOf(s), x => x.made))) },
  { id: 'perfect', cat: 'Précision', icon: '★', name: 'Série parfaite', desc: 'Une série de 10 tirs ou plus sans aucun raté', tiers: [1], value: S => S.some(s => (s.exercises || []).some(e => e.series.some(x => x.shots.length >= 10 && x.shots.every(y => y.made)))) ? 1 : 0 },
  { id: 'sniper', cat: 'Précision', icon: '⌖', name: 'Sniper', desc: 'Réussite sur une séance de 50 tirs ou plus (%)', tiers: [50, 60, 70], value: S => Math.max(0, ...S.map(s => { const a = shotsOf(s); return a.length >= 50 ? Math.round(a.filter(x => x.made).length / a.length * 100) : 0; })) },
  // Trajectoire
  { id: 'arc', cat: 'Trajectoire', icon: '⌒', name: 'Arc parfait', desc: 'Tirs de suite entre 43 et 47° d\'angle d\'entrée', tiers: [5, 10, 20], value: S => Math.max(0, ...S.map(s => streak(shotsOf(s).filter(x => x.angle != null), x => x.angle >= 43 && x.angle <= 47))) },
  { id: 'metronome', cat: 'Trajectoire', icon: '≡', name: 'Métronome', desc: "Écart d'angle sur 20 tirs mesurés (plus c'est bas, mieux c'est)", tiers: [1], value: S => S.some(s => { const a = shotsOf(s).filter(x => x.angle != null).map(x => x.angle); for (let i = 0; i + 20 <= a.length; i++) if (std(a.slice(i, i + 20)) < 2.5) return true; return false; }) ? 1 : 0 },
  { id: 'swish', cat: 'Trajectoire', icon: '◌', name: 'Swish', desc: 'Paniers de suite sans toucher le cercle (mesurés à la caméra)', tiers: [3, 6, 12], value: S => Math.max(0, ...S.map(s => streak(shotsOf(s).filter(x => x.src && x.src.startsWith('auto')), x => x.made && !(x.flags || []).includes('contact')))) },
  // Programme
  { id: 'week1', cat: 'Programme ShotPro', icon: '1', name: 'Fondations', desc: 'Semaine 1 terminée (3 séances)', tiers: [3], value: S => new Set(S.filter(s => s.type !== 'dribble' && s.week === 1).map(s => s.seance)).size },
  { id: 'cycle', cat: 'Programme ShotPro', icon: '4', name: 'Cycle complet', desc: 'Les 12 séances du programme', tiers: [12], value: S => new Set(S.filter(s => s.week).map(s => `${s.cycle || 1}-${s.week}-${s.seance}`)).size },
  { id: 'gain', cat: 'Programme ShotPro', icon: '+', name: 'Progression', desc: 'Points gagnés entre la semaine 1 et la semaine 4', tiers: [3, 5, 8], value: S => { const p = w => { const a = S.filter(s => s.week === w).flatMap(shotsOf); return a.length ? a.filter(x => x.made).length / a.length * 100 : null; }; const a = p(1), b = p(4); return a != null && b != null ? Math.max(0, Math.round(b - a)) : 0; } },
  // Machine
  { id: 'angles', cat: 'Machine de renvoi', icon: '◠', name: 'Tous les angles', desc: 'Angles différents travaillés avec la machine', tiers: [5, 9], value: S => new Set(S.filter(s => s.type === 'machine').flatMap(s => s.exercises.filter(e => e.spot && e.series.some(x => x.shots.length)).map(e => e.spot.deg))).size },
  { id: 'heights', cat: 'Machine de renvoi', icon: '↕', name: 'Toutes les passes', desc: 'Hauteurs de passe travaillées (basse, poitrine, haute)', tiers: [3], value: S => new Set(S.filter(s => s.type === 'machine').flatMap(s => s.exercises.filter(e => e.spot && e.series.some(x => x.shots.length)).map(e => e.spot.h))).size },
  { id: 'three', cat: 'Machine de renvoi', icon: '3', name: 'Tireur à 3 points', desc: 'Réussite à 3 points sur 25 tirs ou plus (%)', tiers: [35, 45, 55], value: S => { const a = S.filter(s => s.type === 'machine').flatMap(s => s.exercises.filter(e => e.spot && e.spot.m >= 6.7).flatMap(e => e.series.flatMap(x => x.shots))); return a.length >= 25 ? Math.round(a.filter(x => x.made).length / a.length * 100) : 0; } },
  // Défis pros
  { id: 'beatpro', cat: 'Défis pros', icon: '⚑', name: 'Beat the Pro', desc: 'Parties de Beat the Pro gagnées', tiers: [1, 5, 15], value: S => S.filter(s => s.drill === 'beatpro').reduce((n, s) => n + s.exercises[0].series.filter(x => x.result === 'win').length, 0) },
  { id: 'contest', cat: 'Défis pros', icon: '$', name: 'Concours à 3 points', desc: 'Meilleur score au concours (sur 30)', tiers: [12, 18, 24], value: S => Math.max(0, ...S.filter(s => s.drill === 'contest').map(s => s.exercises[0].series[0] ? s.exercises[0].series[0].points || 0 : 0)) },
  { id: 'hundred', cat: 'Défis pros', icon: 'C', name: 'Défi 100', desc: 'Défi 100 réussis terminé', tiers: [1], value: S => S.some(s => s.drill === 'hundred' && shotsOf(s).filter(x => x.made).length >= 100) ? 1 : 0 },
  { id: 'world', cat: 'Défis pros', icon: '⊕', name: 'Tour du monde', desc: 'Tour du monde terminé', tiers: [1], value: S => S.some(s => s.drill === 'world' && s.exercises[0].series.length >= 7 && s.exercises[0].series.every(x => x.shots.filter(y => y.made).length >= 2)) ? 1 : 0 },
  // Dribble
  { id: 'bounces', cat: 'Dribble', icon: '●', name: 'Poignets de fer', desc: 'Rebonds comptés à la caméra', tiers: [1000, 5000, 20000], value: S => S.filter(s => s.type === 'dribble').reduce((n, s) => n + s.drills.reduce((m, d) => m + (d.count || 0), 0), 0) },
  { id: 'speed', cat: 'Dribble', icon: '»', name: 'Vitesse de main', desc: 'Meilleure cadence (rebonds par seconde)', tiers: [3, 4, 5], value: S => Math.max(0, ...S.filter(s => s.type === 'dribble').flatMap(s => s.drills.map(d => d.best || 0))) },
  { id: 'weak', cat: 'Dribble', icon: '⇆', name: 'Ambidextre', desc: 'Routine où la main faible fait au moins 45 % des rebonds', tiers: [1], value: S => S.some(s => s.type === 'dribble' && (() => { const l = s.drills.reduce((m, d) => m + (d.left || 0), 0), r = s.drills.reduce((m, d) => m + (d.right || 0), 0); return l + r >= 200 && Math.min(l, r) / (l + r) >= 0.45; })()) ? 1 : 0 },
  { id: 'dsessions', cat: 'Dribble', icon: '∞', name: 'Routine quotidienne', desc: 'Routines de dribble terminées', tiers: [5, 20, 60], value: S => S.filter(s => s.type === 'dribble').length },
];

export function evaluateBadges(sessions) {
  return BADGES.map(b => {
    const v = b.value(sessions) || 0;
    let level = -1; b.tiers.forEach((t, i) => { if (v >= t) level = i; });
    const next = b.tiers[level + 1];
    const tierName = b.tiers.length === 1 ? (level >= 0 ? 'or' : null) : level >= 0 ? TIERS[level] : null;
    return { ...b, v, level, tierName, next, progress: next ? Math.min(1, v / next) : 1 };
  });
}
export function badgeKey(b) { return b.level >= 0 ? `${b.id}:${b.level}` : null; }
