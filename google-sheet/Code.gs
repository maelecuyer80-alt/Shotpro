/**
 * ShotPro Live → Google Sheet
 * Reçoit chaque séance enregistrée sur l'iPhone et l'ajoute :
 *  - au JOURNAL DES SÉANCES (une ligne par exercice), ce qui met à jour le suivi de progression ;
 *  - à l'onglet « Tirs » (une ligne par tir, avec angle d'entrée, sommet et arrivée).
 * Installation : voir le guide (Extensions > Apps Script, coller ce code, Déployer > Application Web).
 */

// Clé partagée avec l'appli (Réglages > Google Sheet > Clé). Ne la partage pas.
const KEY = 'o0iP3CLDfojTHpU2Md1Qdc6f';

function doGet() {
  return ContentService.createTextOutput('ShotPro Live : le script est en ligne.');
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.key !== KEY) return out_({ ok: false, error: 'Clé incorrecte' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (body.ping) return out_({ ok: true, title: ss.getName() });

    const s = body.session;
    if (!s || !s.id || (!Array.isArray(s.exercises) && !Array.isArray(s.drills))) return out_({ ok: false, error: 'Séance invalide' });

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const props = PropertiesService.getScriptProperties();
      if (props.getProperty('s_' + s.id)) return out_({ ok: true, duplicate: true });

      const date = toDate_(s.date);
      if (s.type === 'dribble') writeDribble_(ss, s, date);
      else { writeJournal_(ss, s, date); writeShots_(ss, s, date); }

      props.setProperty('s_' + s.id, new Date().toISOString());
    } finally {
      lock.releaseLock();
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

// ---------- journal (une ligne par exercice) ----------
function writeJournal_(ss, s, date) {
  const found = findJournal_(ss);
  if (!found) throw new Error('Tableau « JOURNAL DES SÉANCES » introuvable (en-tête « Date » en colonne A).');
  const sh = found.sheet;
  let r = found.headerRow + 1;
  const last = Math.max(sh.getLastRow(), r);
  const colD = sh.getRange(r, 4, last - r + 1, 1).getValues();
  let i = 0;
  while (i < colD.length && colD[i][0] !== '') i++;
  r += i;

  const rows = [];
  s.exercises.forEach(function (ex) {
    const shots = [].concat.apply([], ex.series.map(function (x) { return x.shots || []; }));
    if (!shots.length) return;
    const made = shots.filter(function (x) { return x.made; }).length;
    rows.push({ name: ex.name, att: shots.length, made: made });
  });
  if (!rows.length) return;

  const values = rows.map(function (x, k) {
    const note = k === 0 ? [s.mode === 'camera' ? 'Caméra' : 'Saisie', s.note || ''].filter(String).join(' · ') : '';
    const label = { machine: 'Machine', pro: 'Défi pro', free: 'Tir libre', video: 'Vidéo' }[s.type] || '';
    return [date, s.week || '', s.seance || label, x.name, x.att, x.made, null, k === 0 && label ? [label + ' · ' + (s.title || ''), note].filter(String).join(' · ') : note];
  });
  sh.getRange(r, 1, values.length, 8).setValues(values.map(function (v) { return v.map(function (c) { return c === null ? '' : c; }); }));
  sh.getRange(r, 1, values.length, 1).setNumberFormat('dd/mm/yyyy');
  for (let k = 0; k < values.length; k++) {
    const row = r + k;
    sh.getRange(row, 7).setFormula('=IF(E' + row + '="","",IF(E' + row + '=0,0,ROUND(F' + row + '/E' + row + '*100,1)))');
  }
}

function findJournal_(ss) {
  const sheets = ss.getSheets();
  for (let k = 0; k < sheets.length; k++) {
    const sh = sheets[k];
    const n = Math.min(sh.getLastRow(), 200);
    if (n < 1) continue;
    const colA = sh.getRange(1, 1, n, 1).getValues();
    for (let i = 0; i < colA.length; i++) {
      if (String(colA[i][0]).toUpperCase().indexOf('JOURNAL DES S') === 0) {
        for (let j = i + 1; j < Math.min(colA.length, i + 4); j++) {
          if (String(colA[j][0]).trim() === 'Date') return { sheet: sh, headerRow: j + 1 };
        }
      }
    }
  }
  return null;
}

// ---------- détail par tir ----------
function writeShots_(ss, s, date) {
  let sh = ss.getSheetByName('Tirs');
  if (!sh) {
    sh = ss.insertSheet('Tirs');
    sh.getRange(1, 1, 1, 18).setValues([['Date', 'Semaine', 'Séance', 'Exercice', 'Série', 'Tir n°', 'Résultat', "Angle d'entrée (°)", 'Sommet au-dessus du cercle (cm)', 'Arrivée vs centre (cm)', 'Détection', 'Remarque', 'Cycle', 'Distance (cm)', 'Angle de sortie (°)', 'Vitesse (m/s)', 'Type', 'Position machine']]);
    sh.getRange(1, 1, 1, 18).setFontWeight('bold').setBackground('#1C2B3D').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  const rows = [];
  s.exercises.forEach(function (ex) {
    ex.series.forEach(function (ser, si) {
      (ser.shots || []).forEach(function (x, k) {
        const flags = (x.flags || []).map(function (f) {
          return { contact: 'touche le cercle', airball: 'air ball', incertain: 'à vérifier' }[f] || f;
        }).join(', ');
        rows.push([date, s.week, s.seance, ex.name, si + 1, k + 1, x.made ? 'Rentré' : 'Raté',
          x.angle == null ? '' : x.angle, x.apex == null ? '' : x.apex, x.depth == null ? '' : x.depth,
          x.src === 'auto' ? 'Caméra' : x.src === 'auto-corrigé' ? 'Caméra, corrigé' : 'Manuel', flags, s.cycle || 1,
          x.distance == null ? '' : x.distance, x.launch == null ? '' : x.launch, x.speed == null ? '' : x.speed,
          s.type || 'program', ex.spot ? ex.spot.deg + '° · ' + ex.spot.m + ' m · passe ' + ex.spot.h : '']);
      });
    });
  });
  if (!rows.length) return;
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  sh.getRange(start, 1, rows.length, 1).setNumberFormat('dd/mm/yyyy');
}

// ---------- dribble ----------
function writeDribble_(ss, s, date) {
  let sh = ss.getSheetByName('Dribble');
  if (!sh) {
    sh = ss.insertSheet('Dribble');
    sh.getRange(1, 1, 1, 9).setValues([['Date', 'Routine', 'Exercice', 'Durée (s)', 'Rebonds', 'Main droite', 'Main gauche', 'Cadence max (/s)', 'Rebonds par 30 s']]);
    sh.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#1C2B3D').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  const rows = s.drills.map(function (d) {
    return [date, s.title || '', d.name, d.seconds, d.count == null ? '' : d.count, d.right == null ? '' : d.right, d.left == null ? '' : d.left, d.best || '', d.count == null ? '' : Math.round(d.count * 30 / d.seconds)];
  });
  if (!rows.length) return;
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, 9).setValues(rows);
  sh.getRange(start, 1, rows.length, 1).setNumberFormat('dd/mm/yyyy');
}

function toDate_(iso) {
  const p = String(iso || '').split('-');
  return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date();
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
