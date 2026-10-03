// Programme ShotPro — 4 semaines, 3 séances par semaine (source : PDF ShotPro).
// per : tirs par série ; seconds : série chronométrée (on compte ce qui est tiré).

export const PROGRAM = {
  1: {
    theme: 'Fondamentaux et placement',
    goal: "Pas de volume cette semaine : une base identique à chaque tir (pieds, équilibre, main de tir).",
    ex: [
      { name: 'Échauffement progressif', short: 'Échauffement', cue: "Tirs sous le panneau, puis recule d'un mètre après deux tirs de suite rentrés.", series: 5, per: 6 },
      { name: 'Tir statique, un point fixe', short: 'Tir statique', cue: 'Mi-distance. Même appui, même rythme, même main.', series: 6, per: 10 },
      { name: 'Lecture du renvoi', short: 'Lecture du renvoi', cue: 'Réception du renvoi, retour en position en deux temps maximum.', series: 4, per: 8 },
    ],
  },
  2: {
    theme: 'Volume et répétitions',
    goal: "La mécanique est posée : on augmente les tirs pour qu'elle tienne quand le bras chauffe.",
    ex: [
      { name: 'Séries longues', short: 'Séries longues', cue: '25 tirs sans pause, même position. Le 25e ressemble au premier.', series: 4, per: 25 },
      { name: 'Rotation deux positions', short: 'Rotation', cue: "Aile droite puis aile gauche, cinq tirs de chaque côté.", series: 6, per: 10 },
      { name: 'Tir après déplacement latéral', short: 'Déplacement latéral', cue: "Deux pas chassés, réception, tir. Pied d'appui posé avant le ballon.", series: 5, per: 12 },
    ],
  },
  3: {
    theme: 'Rythme et pression',
    goal: 'Chrono et fatigue : la semaine la plus dure. Accepte de perdre quelques points.',
    ex: [
      { name: 'Tir chronométré', short: 'Chrono 60 s', cue: '60 secondes, un maximum de tirs propres. Ce sont les réussites qui comptent.', series: 6, seconds: 60 },
      { name: 'Multi-positions rapide', short: 'Multi-positions', cue: "Cinq spots autour de l'arc, trois tirs par spot.", series: 4, per: 15 },
      { name: 'Fatigue + précision', short: 'Fatigue + précision', cue: "10 secondes d'effort puis cinq tirs. Le geste reste lent.", series: 6, per: 5 },
    ],
  },
  4: {
    theme: 'Situations de match',
    goal: 'Tout sort en conditions de jeu, et tu mesures.',
    ex: [
      { name: 'Catch and shoot rapide', short: 'Catch and shoot', cue: "Réception et tir en moins d'une seconde.", series: 5, per: 12 },
      { name: 'Combo dribble-tir', short: 'Dribble-tir', cue: 'Un ou deux dribbles puis tir. Alterne main droite et main gauche.', series: 6, per: 10 },
      { name: 'Test final chronométré', short: 'Test final 5 min', cue: '5 minutes, cinq positions en continu. Ton chiffre de référence.', series: 1, seconds: 300 },
    ],
  },
};

// Repères de trajectoire, tels que les citent couramment les systèmes de suivi de tir.
export const TARGETS = {
  angle: [43, 47],   // angle d'entrée idéal (degrés)
  depth: [0, 10],    // centre du ballon de 0 à 10 cm derrière le centre du cercle
  gainMin: 5,        // gain S1 → S4 jugé bon (ShotPro p. 8)
};

export function planShots(ex) { return ex.per ? ex.series * ex.per : null; }

// ---------- Défis inspirés des entraînements de joueurs professionnels ----------
// plan.makes : la série se termine au nombre de tirs réussis ; plan.game : règles de jeu particulières.
export const PRO_DRILLS = [
  { id: 'form', name: 'Form shooting 35', source: 'Inspiré de la routine de tir attribuée à Stephen Curry',
    desc: "Échauffement près du cercle : 10 réussis à 1 m, 10 à 1,5 m, 10 à 2 m, puis 5 lancers francs. Une main, coude sous le ballon, poignet cassé.",
    exercises: [
      { name: 'Form shooting · 1 m', cue: 'Une main, tout près du cercle. Coude aligné, poignet cassé, on tient le geste.', plan: { series: 1, makes: 10 } },
      { name: 'Form shooting · 1,5 m', cue: 'Même geste, un pas en arrière.', plan: { series: 1, makes: 10 } },
      { name: 'Form shooting · 2 m', cue: 'Les jambes commencent à donner la force, le bras reste identique.', plan: { series: 1, makes: 10 } },
      { name: 'Lancers francs', cue: 'Même routine avant chaque lancer : respiration, dribbles, tir.', plan: { series: 1, makes: 5 } },
    ] },
  { id: 'fivespot', name: '5 positions mi-distance et 3 pts', source: 'Inspiré de la même routine (5 × 5 réussis par zone)',
    desc: '5 réussis sur chacune des 5 positions à mi-distance, puis 5 réussis sur 5 positions à 3 points.',
    exercises: [
      { name: 'Mi-distance · 5 positions', cue: '5 réussis par position : coin gauche, aile gauche, axe, aile droite, coin droit.', plan: { series: 5, makes: 5, seriesLabels: ['Coin gauche', 'Aile gauche', 'Axe', 'Aile droite', 'Coin droit'] } },
      { name: '3 points · 5 positions', cue: '5 réussis par position derrière la ligne.', plan: { series: 5, makes: 5, seriesLabels: ['Coin gauche', 'Aile gauche', 'Axe', 'Aile droite', 'Coin droit'] } },
    ] },
  { id: 'mikan', name: 'Mikan drill', source: 'Exercice classique de finition près du cercle, du nom de George Mikan',
    desc: "Double-pas alternés sous le cercle, main droite côté droit, main gauche côté gauche, sans que le ballon touche le sol. 1 minute, compte tes paniers.",
    camera: false,
    exercises: [{ name: 'Mikan drill · 1 min', cue: 'Alterne droite et gauche sous le cercle, le ballon ne touche jamais le sol.', plan: { series: 2, seconds: 60 } }] },
  { id: 'beatpro', name: 'Beat the Pro', source: 'Jeu de tir classique des entraîneurs',
    desc: "Tu pars à 5 points. Rentré : −1. Raté : +1. Gagne en arrivant à 0 avant d'atteindre 10.",
    exercises: [{ name: 'Beat the Pro', cue: 'Choisis ta position et ne la change pas. Arrive à 0 avant 10.', plan: { series: 1, game: 'beatpro' } }] },
  { id: 'world', name: 'Tour du monde', source: 'Jeu de tir classique',
    desc: '7 positions autour de la raquette : 2 réussis pour passer à la position suivante.',
    exercises: [{ name: 'Tour du monde', cue: 'Ligne de fond gauche jusqu\'à la ligne de fond droite, 2 réussis par position.', plan: { series: 7, makes: 2, seriesLabels: ['Ligne de fond gauche', 'Coin gauche', 'Aile gauche', 'Axe', 'Aile droite', 'Coin droit', 'Ligne de fond droite'] } }] },
  { id: 'contest', name: 'Concours à 3 points', source: 'Inspiré du concours à 3 points du All-Star Game NBA',
    desc: '5 positions × 5 ballons, chrono 70 s. Le 5e ballon de chaque position vaut 2 points. Idéal avec la machine.',
    exercises: [{ name: 'Concours à 3 points', cue: '5 tirs par position, enchaîne vite. Le dernier ballon de chaque position vaut double.', plan: { series: 1, per: 25, seconds: 70, game: 'contest' } }] },
  { id: 'hundred', name: 'Défi 100 réussis', source: 'Défi de volume répandu chez les shooteurs professionnels',
    desc: '100 tirs réussis le plus vite possible, en changeant de position tous les 10 réussis. Ton temps est enregistré.',
    exercises: [{ name: 'Défi 100 réussis', cue: 'Change de position tous les 10 réussis. Le chrono tourne.', plan: { series: 10, makes: 10, seriesLabels: Array.from({ length: 10 }, (_, i) => `Réussis ${i * 10 + 1} à ${i * 10 + 10}`) } }] },
  { id: 'ft', name: 'Lancers francs sous fatigue', source: 'Routine de fin de séance courante en club et en NBA',
    desc: '5 séries de 2 lancers francs, avec 20 secondes de course entre chaque série : comme en fin de match.',
    exercises: [{ name: 'Lancers francs sous fatigue', cue: 'Cours 20 secondes, puis 2 lancers. Même routine à chaque fois.', plan: { series: 5, per: 2 } }] },
];
