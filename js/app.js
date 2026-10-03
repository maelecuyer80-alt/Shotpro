import { createTracker } from './tracker.js';
import { PROGRAM, TARGETS, PRO_DRILLS } from './program.js';
import { ANGLES, DISTANCES, HEIGHTS, PRESETS, buildMachinePlan, planDuration, courtSVG } from './machine.js';
import { DRILLS, ROUTINES, drawDemo, createDribbleCounter } from './dribble.js';
import { createClipRecorder, playClip } from './clips.js';
import { evaluateBadges, badgeKey, BADGES } from './badges.js';
import { store, save, askPersistence, syncPending, testSheet } from './store.js';
import { unlock, sfx, say } from './audio.js';
import { startCamera, stopCamera, frameLoop, videoRect, listCameras, keepAwake } from './camera.js';
import { createRimAuto } from './rimauto.js';

const VERSION = '2.1.0';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (m, a) => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);
const num = (v, d = 1) => (v == null || isNaN(v) ? '–' : (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ','));
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const frDate = iso => { const [y, m, d] = (iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const S_ = () => store.settings;

let toastT;
function toast(msg, ms = 2600) { const t = $('#toast'); t.classList.toggle('on-stage', !$('#stage').hidden); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }

// ======================= statistiques =======================
function exStats(ex) {
  const shots = ex.series.flatMap(s => s.shots || []);
  const made = shots.filter(s => s.made).length;
  const withA = shots.filter(s => s.angle != null), withAp = shots.filter(s => s.apex != null), withD = shots.filter(s => s.depth != null);
  const inA = withA.filter(s => s.angle >= TARGETS.angle[0] && s.angle <= TARGETS.angle[1]).length;
  return {
    made, att: shots.length, pct: pct(made, shots.length),
    angle: avg(withA.map(s => s.angle)), apex: avg(withAp.map(s => s.apex)), depth: avg(withD.map(s => s.depth)),
    inAngle: withA.length ? Math.round((inA / withA.length) * 100) : null, measured: withA.length,
  };
}
function sessStats(s) {
  const all = { series: s.exercises.flatMap(e => e.series) };
  return exStats(all);
}
const cycleNo = () => S_().cycle || 1;
const sessionsOfCycle = c => store.state.sessions.filter(s => (s.cycle || 1) === c && s.week);
function nextSlot() {
  const done = new Set(sessionsOfCycle(cycleNo()).map(s => `${s.week}-${s.seance}`));
  for (let w = 1; w <= 4; w++) for (let n = 1; n <= 3; n++) if (!done.has(`${w}-${n}`)) return { week: w, seance: n };
  return null;
}

// ======================= navigation =======================
let view = 'home';
let sel = null; // séance choisie {week, seance}
function go(v, arg) {
  view = v;
  for (const p of $$('main.page')) p.hidden = p.id !== 'v-' + v;
  $('#tabs').hidden = v === 'summary' || v === 'dsummary';
  const parent = { detail: 'progress', history: 'progress', machine: 'train', pro: 'train', dribble: 'train' }[v] || v;
  for (const b of $$('#tabs button')) b.toggleAttribute('aria-current', b.dataset.go === parent);
  for (const b of $$('#tabs button[aria-current]')) b.setAttribute('aria-current', 'page');
  if (v === 'home') renderHome();
  if (v === 'history') renderHistory();
  if (v === 'detail') renderDetail(arg);
  if (v === 'progress') renderProgress();
  if (v === 'settings') renderSettings();
  if (v === 'train') renderTrain();
  if (v === 'machine') renderMachine();
  if (v === 'pro') renderPro();
  if (v === 'dribble') renderDribble();
  if (v === 'badges') renderBadges();
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (b) go(b.dataset.go);
});

// ======================= accueil =======================
function volText(e) { return e.seconds ? `${e.series} × ${e.seconds >= 120 ? e.seconds / 60 + ' min' : e.seconds + ' s'}` : `${e.series} × ${e.per}`; }
// durée estimée d'une séance (≈ 6 s par tir, plus les repos)
function estMinutes(exs) {
  let sec = 0; const rest = S_().rest || 45;
  for (const e of exs) { const n = e.series || 1; sec += e.seconds ? n * e.seconds : n * (e.per || 10) * 6; sec += Math.max(0, n - 1) * rest + 60; }
  return Math.max(5, Math.round(sec / 300) * 5);
}
const DAY = 864e5;
const isoDay = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
function weekStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
// semaines d'affilée où l'objectif a été tenu (la semaine en cours compte si elle est déjà tenue)
function weekStreak() {
  const goal = S_().weeklyGoal || 3, days = new Set(store.state.sessions.map(s => s.date));
  const countWeek = ws => { let n = 0; for (let i = 0; i < 7; i++) if (days.has(isoDay(new Date(ws.getTime() + i * DAY)))) n++; return n; };
  let ws = weekStart(), streak = 0;
  if (countWeek(ws) >= goal) streak++;
  for (let k = 0; k < 104; k++) { ws = new Date(ws.getTime() - 7 * DAY); if (countWeek(ws) >= goal) streak++; else break; }
  return streak;
}
const FLAME = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2c1 4-3 5.5-3 9.5A3 3 0 0 0 12 15a3 3 0 0 0 3-3.2c0-1.3-.6-2.3-1.2-3.1C16.9 9.9 19 12.6 19 15.5A7 7 0 0 1 5 15.5C5 10 10.5 7.5 12 2z"/></svg>';

function renderHome() {
  const draft = store.state.draft;
  $('#resumeCard').hidden = !draft;
  if (draft) {
    const ex = draft.exercises[draft.ei];
    $('#resumeTitle').textContent = `${draft.week ? `S${draft.week} · séance ${draft.seance}` : draft.title} — ${ex ? ex.name : ''}, série ${draft.si + 1}`;
  }
  const nx = nextSlot();
  if (!sel) sel = nx || { week: 1, seance: 1 };
  const P = PROGRAM[sel.week];
  const cyc = sessionsOfCycle(cycleNo());
  const done = cyc.find(s => s.week === sel.week && s.seance === sel.seance);
  const trainedToday = store.state.sessions.some(s => s.date === today());
  $('#nextEyebrow').textContent = nx && nx.week === sel.week && nx.seance === sel.seance ? (trainedToday ? 'Prochaine séance' : 'Séance du jour') : done ? 'Séance déjà faite · à refaire' : 'Séance choisie';
  $('#nextTitle').textContent = `Semaine ${sel.week} · Séance ${sel.seance}`;
  $('#nextTime').textContent = `≈ ${estMinutes(P.ex)} min`;
  $('#nextTheme').textContent = P.theme;
  const shots = P.ex.reduce((n, e) => n + (e.per ? e.per * e.series : 0), 0);
  $('#nextChips').innerHTML = [`${P.ex.length} exercices`, shots ? `${shots} tirs` : null, P.ex.some(e => e.seconds) ? 'chrono' : null].filter(Boolean).map(t => `<span>${t}</span>`).join('');
  $('#nextList').innerHTML = P.ex.map(e => `<li><b>${esc(e.name)}</b><span class="vol">${volText(e)}</span></li>`).join('') + `<li class="goalline">${esc(P.goal)}</li>`;
  // objectif chiffré : battre la même séance, sinon la dernière séance du programme
  const prog = store.state.sessions.filter(s => s.type === 'program' || (!s.type && s.week)).sort((a, b) => b.startedAt - a.startedAt);
  const ref = prog.find(s => s.week === sel.week && s.seance === sel.seance) || prog[0];
  const rs = ref ? sessStats(ref) : null;
  $('#nextGoal').hidden = !(rs && rs.att);
  if (rs && rs.att) $('#nextGoal').innerHTML = `<span>À battre</span><b>${num(rs.pct, 0)} %</b><small>${ref.week === sel.week && ref.seance === sel.seance ? 'ton score sur cette séance' : 'ta dernière séance'}</small>`;

  // ---- semaine : objectif, jours, série ----
  const goal = S_().weeklyGoal || 3, ws = weekStart(), days = new Set(store.state.sessions.map(s => s.date));
  const dayNames = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  let nWeek = 0, dots = '';
  for (let i = 0; i < 7; i++) { const d = isoDay(new Date(ws.getTime() + i * DAY)), on = days.has(d); if (on) nWeek++; dots += `<div class="dd ${on ? 'on' : ''} ${d === today() ? 'today' : ''}"><i></i><small>${dayNames[i]}</small></div>`; }
  const streak = weekStreak(), pctW = Math.min(1, nWeek / goal), C = 2 * Math.PI * 26;
  $('#weekCard').innerHTML = `<div class="wk-ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" class="tr"/><circle cx="32" cy="32" r="26" class="pr" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pctW)}"/></svg><div><b>${nWeek}</b><small>/${goal}</small></div></div>
    <div class="wk-main"><div class="row between"><div class="h3">Ta semaine</div>${streak ? `<span class="streak">${FLAME}${streak} sem.</span>` : ''}</div>
    <div class="days">${dots}</div>
    <div class="wk-msg">${nWeek >= goal ? 'Objectif de la semaine tenu. Chaque séance en plus, c\'est du bonus.' : nWeek === goal - 1 ? 'Plus qu\'une séance pour tenir ton objectif.' : `Objectif : ${goal} séances cette semaine.`} <button class="link" id="planBtn">Planifier mes rappels</button></div></div>`;

  // ---- défi du jour + badge le plus proche ----
  const bl = evaluateBadges(store.state.sessions), got = bl.filter(b => b.level >= 0);
  const near = bl.filter(b => b.next != null && b.progress < 1).sort((a, b) => b.progress - a.progress);
  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / DAY);
  const ch = PRO_DRILLS[doy % PRO_DRILLS.length];
  const nb = near[0];
  $('#challengeCard').hidden = false;
  $('#challengeCard').innerHTML = `<div class="eyebrow">Défi du jour</div><div class="h2">${esc(ch.name)}</div><p class="muted">${esc(ch.desc)}</p>
    <div class="row gap wrap"><button class="btn primary" data-pro-home="${ch.id}" data-mode="${ch.camera === false ? 'manual' : 'camera'}">Relever le défi</button><button class="link" data-go="pro">Tous les défis</button></div>
    ${nb ? `<div class="nextbadge"><div class="medal ${nb.tierName || 'locked'}"><span>${esc(nb.icon)}</span></div><div><small>Prochain badge</small><b>${esc(nb.name)}</b><div class="bar"><i style="width:${Math.round(nb.progress * 100)}%"></i></div><small>${fmtVal(nb, nb.v)} / ${fmtVal(nb, nb.next)} · ${esc(nb.desc)}</small></div></div>` : ''}`;

  // ---- installation sur l'écran d'accueil ----
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  $('#installCard').hidden = standalone || !!S_().installDismissed;

  // ---- chiffres des 7 derniers jours ----
  const all = store.state.sessions.filter(s => s.type !== 'dribble');
  const since = (a, b) => all.filter(s => s.startedAt >= Date.now() - a * DAY && s.startedAt < Date.now() - b * DAY);
  const agg = list => exStats({ series: list.flatMap(s => s.exercises.flatMap(e => e.series)) });
  const w1 = agg(since(7, 0)), w0 = agg(since(14, 7));
  if (!all.length) {
    $('#quickStats').innerHTML = `<div class="h3">Tes chiffres</div><p class="muted">Après ta première séance : ton pourcentage, ton angle d'entrée et ta progression semaine après semaine.</p>`;
  } else if (!w1.att) {
    const last = [...all].sort((a, b) => b.startedAt - a.startedAt)[0], st = sessStats(last);
    $('#quickStats').innerHTML = `<div class="row between"><div class="h3">Dernière séance · ${frDate(last.date)}</div><button class="link" data-go="progress">Progrès</button></div>
      <div class="kpis"><div class="kpi"><div class="v">${num(st.pct, 0)}%</div><div class="k">Réussite</div></div><div class="kpi"><div class="v">${st.angle == null ? '–' : num(st.angle, 0) + '°'}</div><div class="k">Angle</div></div><div class="kpi"><div class="v">${st.att}</div><div class="k">Tirs</div></div></div>`;
  } else {
    const d = w0.att && w1.pct != null && w0.pct != null ? w1.pct - w0.pct : null;
    const delta = d == null ? '' : `<span class="delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${num(Math.abs(d), 0)}</span>`;
    $('#quickStats').innerHTML = `<div class="row between"><div class="h3">7 derniers jours</div><button class="link" data-go="progress">Progrès</button></div>
      <div class="kpis"><div class="kpi"><div class="v">${num(w1.pct, 0)}%${delta}</div><div class="k">Réussite</div></div><div class="kpi"><div class="v">${w1.angle == null ? '–' : num(w1.angle, 0) + '°'}</div><div class="k">Angle d'entrée</div></div><div class="kpi"><div class="v">${w1.att}</div><div class="k">Tirs</div></div></div>`;
  }

  // ---- programme (replié) ----
  $('#cycleNo').textContent = cycleNo();
  $('#cycleSum').textContent = `${new Set(cyc.map(s => s.week + '-' + s.seance)).size}/12 séances`;
  $('#newCycle').hidden = !!nx;
  let g = '';
  for (let w = 1; w <= 4; w++) {
    g += `<div class="wk">Sem. ${w}</div>`;
    for (let n = 1; n <= 3; n++) {
      const s2 = cyc.filter(x => x.week === w && x.seance === n).pop();
      const st = s2 ? sessStats(s2) : null;
      g += `<button data-w="${w}" data-n="${n}" class="${s2 ? 'done' : ''} ${sel.week === w && sel.seance === n ? 'sel' : ''}"><b>${s2 ? num(st.pct, 0) + '%' : n}</b>${s2 ? 'séance ' + n : 'à faire'}</button>`;
    }
  }
  $('#weekGrid').innerHTML = g;
  $('#homeBadges').innerHTML = `<div class="row between"><div class="h3">Badges · ${got.length}/${bl.length}</div><button class="link" data-go="badges">Tout voir</button></div><div class="badges compact">${near.slice(1, 3).map(badgeHTML).join('')}</div>`;
  $('#homeBadges').hidden = near.length < 2;
  renderSync();
}
$('#toggleList').addEventListener('click', () => { const l = $('#nextList'); l.hidden = !l.hidden; $('#toggleList').textContent = l.hidden ? 'Voir le détail' : 'Masquer le détail'; });
$('#installClose').addEventListener('click', () => { store.setSetting('installDismissed', true); $('#installCard').hidden = true; });
$('#v-home').addEventListener('click', e => {
  const b = e.target.closest('[data-pro-home]');
  if (b) { unlock(); const d = PRO_DRILLS.find(x => x.id === b.dataset.proHome); beginCustom(makeSession('pro', d.name, d.exercises, b.dataset.mode, { drill: d.id })); return; }
  if (e.target.closest('#planBtn')) { go('settings'); setTimeout(() => $('#remindCard').scrollIntoView({ behavior: 'smooth' }), 50); }
});
$('#weekGrid').addEventListener('click', e => {
  const b = e.target.closest('button[data-w]'); if (!b) return;
  sel = { week: +b.dataset.w, seance: +b.dataset.n }; renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('#newCycle').addEventListener('click', () => { store.setSetting('cycle', cycleNo() + 1); sel = null; renderHome(); toast(`Cycle ${cycleNo()} commencé`); });
$('#startCam').addEventListener('click', () => { unlock(); beginSession('camera'); });
$('#startManual').addEventListener('click', () => { unlock(); beginSession('manual'); });
$('#resumeBtn').addEventListener('click', () => { unlock(); resumeDraft(); });
$('#discardBtn').addEventListener('click', () => { $('#discardConfirm').hidden = false; });
$('#discardNo').addEventListener('click', () => { $('#discardConfirm').hidden = true; });
$('#discardYes').addEventListener('click', () => { store.setDraft(null); $('#discardConfirm').hidden = true; renderHome(); });

// ======================= synchro =======================
let syncMsg = '';
function renderSync() {
  const el = $('#syncState'); const q = store.state.queue.length;
  el.classList.toggle('err', syncMsg === 'error');
  if (!S_().sheetUrl) el.textContent = 'Google Sheet non relié';
  else if (syncMsg === 'sync') el.textContent = 'Synchronisation…';
  else if (syncMsg === 'error') el.textContent = `${q} séance(s) en attente d'envoi`;
  else if (syncMsg === 'offline') el.textContent = `Hors ligne · ${q} en attente`;
  else el.textContent = q ? `${q} séance(s) à envoyer` : 'Google Sheet à jour';
}
function doSync() { return syncPending((st, err) => { syncMsg = st; if (err) console.warn(err); renderSync(); if (view === 'settings' && err) $('#sheetMsg').textContent = 'Envoi impossible : ' + err; }); }
window.addEventListener('online', doSync);

// ======================= tracker + caméra =======================
const video = $('#video'), overlay = $('#overlay'), octx = overlay.getContext('2d');
const tracker = createTracker();
const dtracker = createTracker({ sizeFree: true, ballPx: 12 });   // dribble : pas de cercle, taille libre
const clipRec = createClipRecorder(video);
let clips = [];                  // ralentis de la séance en cours (mémoire seulement)
let source = { kind: 'camera', url: null, facing: 'environment' };
let processor = 'shot';
let camOn = false, stopLoop = null, camInfo = null;
let analysisHandler = null;     // fonction(img, t) selon le mode
let lastBall = null, lastBallT = 0, livePath = null, lastShotPath = null, lastShotMade = false, lastShotT = 0;
let showMask = false, maskImg = null, maskCv = document.createElement('canvas');

function applyTrackerSettings() {
  tracker.setOption('motionThr', S_().motionThr);
  tracker.setOption('hueTol', S_().hueTol);
  const c = store.state.calib;
  if (c) { tracker.setRim(c.rim); if (c.ball) tracker.setBallColor(c.ball); }
}

async function ensureCamera() {
  if (camOn) return camInfo;
  $('#stage').classList.toggle('mirror', source.kind === 'camera' && source.facing === 'user');
  if (source.kind === 'file') {
    stopCamera(video); video.srcObject = null; video.muted = true; video.setAttribute('playsinline', '');
    video.src = source.url;
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(new Error('Vidéo illisible')); });
    try { video.currentTime = Math.min(0.5, (video.duration || 2) / 4); } catch (e) {}
    await new Promise(r => setTimeout(r, 350));
    camInfo = { width: video.videoWidth, height: video.videoHeight, deviceId: '' };
  } else {
    camInfo = await startCamera(video, source.facing === 'user' ? undefined : (S_().deviceId || undefined), source.facing);
    if (source.facing !== 'user' && camInfo.deviceId && camInfo.deviceId !== S_().deviceId) store.setSetting('deviceId', camInfo.deviceId);
  }
  camOn = true;
  stopLoop = frameLoop(video, (img, t) => {
    clipRec.tick();
    if (processor === 'dribble') { const o = dtracker.process(img, t); if (showMask) buildMask(img.width, img.height, dtracker); if (analysisHandler) analysisHandler(img, t, o); return; }
    if (source.kind === 'camera' && (setupState.active || (S && S.mode === 'camera' && phase !== 'idle'))) feedRimAuto(img, t);
    const out = tracker.process(img, t);
    if (out.ball && (out.inShot || setupState.active)) { lastBall = out.ball; lastBallT = performance.now(); }
    if (showMask) buildMask(img.width, img.height);
    if (analysisHandler) analysisHandler(img, t, out);
  });
  return camInfo;
}
function closeCamera() {
  if (stopLoop) stopLoop(); stopLoop = null;
  clipRec.stop();
  stopCamera(video); camOn = false;
  if (video.getAttribute('src')) { video.pause(); video.removeAttribute('src'); video.load(); }
}
function buildMask(w, h, tr = tracker) {
  const m = tr.mask; if (!m) return;
  if (maskCv.width !== w) { maskCv.width = w; maskCv.height = h; }
  const c = maskCv.getContext('2d'); const id = c.createImageData(w, h);
  for (let i = 0; i < m.length; i++) if (m[i]) { id.data[i * 4] = 255; id.data[i * 4 + 1] = 40; id.data[i * 4 + 3] = 220; }
  c.putImageData(id, 0, 0); maskImg = maskCv;
}

// dessin superposé (cercle, ballon, trajectoires)
function drawOverlay() {
  requestAnimationFrame(drawOverlay);
  if ($('#stage').hidden) return;
  const dpr = window.devicePixelRatio || 1;
  const W = overlay.clientWidth, H = overlay.clientHeight;
  if (overlay.width !== W * dpr || overlay.height !== H * dpr) { overlay.width = W * dpr; overlay.height = H * dpr; }
  octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, W, H);
  const rh = $('#rotateHint'), wantRot = camOn && processor === 'shot' && source.kind === 'camera' && H > W * 1.1;
  if (rh.hidden === wantRot) rh.hidden = !wantRot;
  if (!camOn) return;
  const R = videoRect(video), ox = R.left - R.el.left, oy = R.top - R.el.top;
  const P = (x, y) => [ox + x * R.width, oy + y * R.height];
  if (showMask && maskImg) { octx.globalAlpha = 0.85; octx.drawImage(maskImg, ox, oy, R.width, R.height); octx.globalAlpha = 1; }
  const st = setupState;
  const rim = st.active ? (st.step === 'manual' ? handlesRim() : (st.rim || st.saved)) : (store.state.calib && store.state.calib.rim);
  const tNow = performance.now();
  if (st.active && st.step === 'scan' && !st.rim) {
    // balayage pendant la recherche
    const k = (tNow % 2400) / 2400, yy = oy + (0.08 + 0.7 * k) * R.height;
    const g = octx.createLinearGradient(0, yy - 40, 0, yy);
    g.addColorStop(0, 'rgba(240,126,51,0)'); g.addColorStop(1, 'rgba(240,126,51,.35)');
    octx.fillStyle = g; octx.fillRect(0, yy - 40, W, 40);
    octx.fillStyle = 'rgba(240,126,51,.8)'; octx.fillRect(0, yy, W, 2);
    // candidats en cours d'examen
    octx.strokeStyle = 'rgba(255,255,255,.45)'; octx.lineWidth = 1.5; octx.setLineDash([4, 4]);
    for (const c of rimAuto.candidates.slice(0, 3)) { const [a, b] = P(c.xl, c.y), [e] = P(c.xr, c.y); octx.strokeRect(a - 4, b - (e - a) * 0.25, e - a + 8, (e - a) * 0.6); }
    octx.setLineDash([]);
  }
  if (rim) {
    const [x1, y1] = P(rim.xl, rim.y), [x2] = P(rim.xr, rim.y), w = x2 - x1, cx = (x1 + x2) / 2;
    const provisional = st.active && st.step === 'scan' && !st.rim;
    octx.save();
    if (provisional) { octx.globalAlpha = 0.6; octx.setLineDash([6, 5]); }
    octx.shadowColor = 'rgba(240,126,51,.9)'; octx.shadowBlur = provisional ? 0 : 12;
    octx.strokeStyle = '#F07E33'; octx.lineWidth = 3;
    octx.beginPath(); octx.ellipse(cx, y1, w / 2, Math.max(3, w * 0.12), 0, 0, Math.PI * 2); octx.stroke();
    if (st.active && st.step === 'scan') {
      // cadre « verrouillé » aux coins
      const pad = Math.max(10, w * 0.25), L = Math.max(8, w * 0.2), bx = x1 - pad, by = y1 - pad, bw = w + 2 * pad, bh = 2 * pad;
      octx.lineWidth = 3; octx.shadowBlur = 0; octx.setLineDash([]);
      octx.beginPath();
      for (const [px, py, dx, dy] of [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]]) { octx.moveTo(px + dx * L, py); octx.lineTo(px, py); octx.lineTo(px, py + dy * L); }
      octx.stroke();
    }
    octx.restore();
  }
  const now = performance.now();
  if (lastShotPath && now - lastShotT < 4000) {
    octx.globalAlpha = Math.max(0, 1 - (now - lastShotT) / 4000);
    octx.strokeStyle = lastShotMade ? '#3FB984' : '#E5605F'; octx.lineWidth = 4; octx.beginPath();
    lastShotPath.forEach(([x, y], i) => { const [a, b] = P(x, y); i ? octx.lineTo(a, b) : octx.moveTo(a, b); });
    octx.stroke(); octx.globalAlpha = 1;
  }
  if (lastBall && now - lastBallT < 200) {
    const [a, b] = P(lastBall.x, lastBall.y);
    octx.strokeStyle = '#FFFFFF'; octx.lineWidth = 2; octx.beginPath(); octx.arc(a, b, Math.max(8, lastBall.r * R.width * 1.3), 0, Math.PI * 2); octx.stroke();
  }
}
requestAnimationFrame(drawOverlay);

// reprise après mise en arrière-plan (iOS coupe la caméra)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || $('#stage').hidden || !camOn) return;
  if (video.srcObject && video.srcObject.getVideoTracks().every(t => t.readyState === 'live')) { video.play().catch(() => {}); return; }
  try { closeCamera(); await ensureCamera(); tracker.reset(); applyTrackerSettings(); } catch (e) { toast('Caméra indisponible : ' + e.message); }
});

// ======================= réglage caméra : calage automatique =======================
// Le joueur pose le téléphone (caméra avant ou arrière), l'appli trouve le cercle toute seule
// (couleur + forme + filet + panneau), puis les premiers tirs confirment ou corrigent la position.
// Les poignées manuelles ne servent plus qu'en secours.
const rimAuto = createRimAuto();
const scanCv = document.createElement('canvas'); let scanCtx = null, scanTick = 0, fileScanTimer = null;
function grabScan() {
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
  const k = 640 / Math.max(vw, vh), w = Math.round(vw * k), h = Math.round(vh * k);
  if (scanCv.width !== w || scanCv.height !== h) { scanCv.width = w; scanCv.height = h; scanCtx = scanCv.getContext('2d', { willReadFrequently: true }); }
  try { scanCtx.drawImage(video, 0, 0, w, h); return scanCtx.getImageData(0, 0, w, h); } catch (e) { return null; }
}
// appelé à chaque image d'analyse (caméra) : suivi du ballon pour les tirs + analyse d'image 1 fois sur 3
function feedRimAuto(img, t) {
  rimAuto.addTrackFrame(img, t);
  if (++scanTick % 3 === 0) { const g = grabScan(); if (g) rimAuto.addScanFrame(g); }
  if (!rimAuto.takeChange()) return;
  const rim = rimAuto.rim; if (!rim) return;
  if (setupState.active) onRimFound(rim, rimAuto.source);
  else if (S && S.mode === 'camera') {
    // en séance : le panier a été recalé (premiers tirs, ou téléphone déplacé)
    const old = store.state.calib && store.state.calib.rim;
    tracker.setRim(rim); tracker.softReset(); saveCalib(rim, rimAuto.source);
    if (old && (Math.abs((old.xl + old.xr) / 2 - (rim.xl + rim.xr) / 2) > 0.5 * (rim.xr - rim.xl) || Math.abs(old.y - rim.y) > 0.04)) toast('Panier recalé automatiquement');
  }
}
function saveCalib(rim, src) {
  const c = store.state.calib || {};
  store.setCalib({ rim: { xl: rim.xl, xr: rim.xr, y: rim.y }, ball: c.ball || null, aspect: video.videoWidth / video.videoHeight, facing: source.facing, deviceId: camInfo && camInfo.deviceId, savedAt: Date.now(), auto: src || 'main', fromFile: source.kind === 'file' });
}

const setupState = { active: false, step: 'scan', mode: 'full', after: null, hl: { x: 0.62, y: 0.45 }, hr: { x: 0.72, y: 0.45 }, rim: null, src: null, startedAt: 0, goAt: 0, announced: false, shots: 0, made: 0, saved: null };
function handlesRim() { const a = setupState.hl, b = setupState.hr; return { xl: Math.min(a.x, b.x), xr: Math.max(a.x, b.x), y: (a.y + b.y) / 2 }; }
const isMirror = () => source.kind === 'camera' && source.facing === 'user';
// coordonnées image (0–1) <-> écran, en tenant compte du plein écran et du miroir de la caméra avant
function toScreen(x, y) { const R = videoRect(video); return [R.left + (isMirror() ? 1 - x : x) * R.width, R.top + y * R.height]; }
function fromScreen(cx, cy) { const R = videoRect(video); let x = (cx - R.left) / R.width; if (isMirror()) x = 1 - x; return [x, (cy - R.top) / R.height]; }

async function openSetup(after, mode = 'full') {
  Object.assign(setupState, { active: true, after, mode, step: 'scan', rim: null, src: null, startedAt: performance.now(), goAt: 0, announced: false, shots: 0, made: 0, saved: null });
  $('#stage').hidden = false; $('#setupUI').hidden = false; $('#liveUI').hidden = true;
  $('#stage').classList.remove('manual-mode');
  try { await ensureCamera(); }
  catch (e) { closeSetup(); $('#stage').hidden = true; toast("Caméra refusée ou indisponible. Autorise l'accès à la caméra pour Safari dans Réglages > Safari > Caméra.", 6000); go('home'); return; }
  rimAuto.reset(); scanTick = 0; tracker.reset(); applyTrackerSettings();
  tracker.setRim(null);
  // dernier réglage : proposé tout de suite s'il correspond à la même caméra, l'analyse le confirme ou le corrige
  const c = store.state.calib;
  if (c && c.rim && !c.fromFile && source.kind === 'camera' && (c.facing || 'environment') === source.facing && Math.abs((c.aspect || 0) - video.videoWidth / video.videoHeight) < 0.03) setupState.saved = c.rim;
  const r0 = setupState.saved || { xl: 0.62, xr: 0.72, y: 0.45 };
  setupState.hl = { x: r0.xl, y: r0.y }; setupState.hr = { x: r0.xr, y: r0.y };
  // objectifs (arrière) : ultra grand-angle utile si tout ne rentre pas
  const sel = $('#camSelect');
  if (source.kind === 'camera' && source.facing !== 'user') {
    const cams = (await listCameras()).filter(d => !/front|avant|user|facetime/i.test(d.label || ''));
    sel.innerHTML = cams.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Objectif ' + (i + 1))}</option>`).join('');
    sel.value = camInfo.deviceId || ''; sel.dataset.n = cams.length;
  } else sel.dataset.n = 0;
  analysisHandler = setupAnalysis;
  clearInterval(fileScanTimer);
  if (source.kind === 'file') {
    // vidéo à l'arrêt : on analyse l'image affichée
    fileScanTimer = setInterval(() => {
      if (!setupState.active) { clearInterval(fileScanTimer); return; }
      const g = grabScan(); if (g) rimAuto.addScanFrame(g);
      if (rimAuto.takeChange() && rimAuto.rim) onRimFound(rimAuto.rim, rimAuto.source);
    }, 60);
  }
  renderSetup();
}
function closeSetup() {
  setupState.active = false; analysisHandler = null; showMask = false; clearInterval(fileScanTimer);
  $('#setupUI').hidden = true; $('#loupe').hidden = true;
}
function onRimFound(rim, src) {
  const st = setupState; if (!st.active || st.step !== 'scan') return;
  const first = !st.rim;
  st.rim = rim; st.src = src;
  tracker.setRim(rim); tracker.softReset();
  st.hl = { x: rim.xl, y: rim.y }; st.hr = { x: rim.xr, y: rim.y };
  if (first) {
    sfx.tick();
    if (S_().voice && !st.announced) say('Panier trouvé', { interrupt: true });
    st.announced = true;
    // départ automatique après 3 s si une séance attend (annulable)
    if (st.after) st.goAt = performance.now() + 3200;
  }
  renderSetup();
}
// rafraîchissement de l'écran de réglage (compte à rebours, aide si rien n'est trouvé)
setInterval(() => {
  const st = setupState; if (!st.active || st.step !== 'scan') return;
  if (st.goAt && performance.now() >= st.goAt) { st.goAt = 0; finishSetup(); return; }
  renderSetup();
}, 250);

function renderSetup() {
  const st = setupState, scan = st.step === 'scan';
  const elapsed = (performance.now() - st.startedAt) / 1000;
  let title, text, label, state;
  if (!scan) {
    title = 'Placer le cercle à la main';
    text = "Fais glisser les deux poignées sur les bords gauche et droit de l'avant du cercle. Une loupe apparaît sous ton doigt.";
  } else if (st.rim) {
    title = st.src === 'image' ? 'Panier trouvé' : 'Panier trouvé et confirmé';
    text = st.after ? 'Vérifie que le cadre orange est bien sur le cercle. Tes premiers tirs affineront le réglage.' : 'Le cadre orange doit être sur le cercle. Fais un ou deux tirs pour vérifier.';
    label = st.src === 'image' ? 'Panier repéré' : st.src === 'tirs' ? 'Repéré grâce à tes tirs' : 'Confirmé par tes tirs';
    if (st.shots) label += ` · ${st.shots} tir${st.shots > 1 ? 's' : ''} vu${st.shots > 1 ? 's' : ''}, ${st.made} rentré${st.made > 1 ? 's' : ''}`;
    state = 'ok';
  } else {
    title = source.kind === 'file' ? 'Recherche du panier dans la vidéo' : 'Pose le téléphone, je trouve le panier';
    text = source.facing === 'user' && source.kind === 'camera'
      ? "Caméra avant : écran tourné vers toi, téléphone à l'horizontale, le panier bien visible."
      : "À l'horizontale, de côté, le panier visible avec de l'espace au-dessus. Pas besoin de toucher l'écran.";
    if (elapsed > 7) {
      text = source.kind === 'file' ? 'Je ne trouve pas le cercle sur cette image. Place-le à la main.'
        : "Je ne le vois pas encore. Tu peux commencer à tirer : 2 ou 3 tirs suffisent pour que je le repère avec la trajectoire du ballon. Sinon, évite le contre-jour ou place-le à la main.";
      label = rimAuto.shots ? `Analyse de tes tirs… (${rimAuto.shots})` : 'Toujours en recherche…';
      state = 'wait';
    } else { label = 'Recherche du panier…'; state = 'scan'; }
  }
  $('#setupTitle').textContent = title; $('#setupText').textContent = text;
  const ss = $('#scanStatus'); ss.hidden = !scan; ss.dataset.state = state || ''; $('#scanLabel').textContent = label || '';
  $('#flipCam').hidden = source.kind !== 'camera' || !scan;
  $('#camSelect').hidden = !scan || source.kind !== 'camera' || source.facing === 'user' || +($('#camSelect').dataset.n || 0) < 2;
  $('#hL').hidden = $('#hR').hidden = scan;
  $('#setupManual').textContent = scan ? 'Placer à la main' : 'Repérage auto';
  $('#setupManual').classList.toggle('pulse', scan && !st.rim && elapsed > 7);
  $('#setupOther').hidden = !scan || !st.rim || st.src !== 'image' || rimAuto.candidates.length < 2;
  const next = $('#setupNext');
  const ready = !scan || st.rim || st.saved;
  next.disabled = !ready;
  const left = st.goAt ? Math.max(0, Math.ceil((st.goAt - performance.now()) / 1000)) : 0;
  next.textContent = !scan ? 'Valider' : st.mode === 'recal' ? 'Reprendre' : !st.after ? 'Terminer' : left ? `C'est parti · ${left}` : (!st.rim && st.saved) ? 'Garder le dernier réglage' : "C'est parti";
  if (!scan) placeHandles();
}
function placeHandles() {
  for (const [id, h] of [['#hL', setupState.hl], ['#hR', setupState.hr]]) {
    const [x, y] = toScreen(h.x, h.y); const el = $(id); el.style.left = x + 'px'; el.style.top = y + 'px';
  }
}
window.addEventListener('resize', () => { if (setupState.active && setupState.step === 'manual') placeHandles(); });

// poignées + loupe (secours)
for (const id of ['#hL', '#hR']) {
  const el = $(id), key = id === '#hL' ? 'hl' : 'hr';
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); moveHandle(e, key); });
  el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) moveHandle(e, key); });
  el.addEventListener('pointerup', () => { $('#loupe').hidden = true; });
  el.addEventListener('pointercancel', () => { $('#loupe').hidden = true; });
}
function moveHandle(e, key) {
  let [x, y] = fromScreen(e.clientX, e.clientY);
  x = Math.min(1, Math.max(0, x)); y = Math.min(1, Math.max(0, y));
  setupState[key] = { x, y }; placeHandles();
  // loupe : zoom x4 au-dessus du doigt
  const L = $('#loupe'), lc = L.getContext('2d'), vw = video.videoWidth, vh = video.videoHeight;
  const span = 0.06 * vw;
  L.hidden = false; L.style.left = Math.min(window.innerWidth - 160, Math.max(10, e.clientX - 75)) + 'px';
  L.style.top = Math.max(10, e.clientY - 200) + 'px';
  lc.fillStyle = '#000'; lc.fillRect(0, 0, 150, 150);
  lc.save(); if (isMirror()) { lc.translate(150, 0); lc.scale(-1, 1); }
  try { lc.drawImage(video, x * vw - span / 2, y * vh - span / 2, span, span, 0, 0, 150, 150); } catch (err) {}
  lc.restore();
  lc.strokeStyle = '#F07E33'; lc.lineWidth = 2; lc.beginPath(); lc.moveTo(75, 0); lc.lineTo(75, 150); lc.moveTo(0, 75); lc.lineTo(150, 75); lc.stroke();
}

function setupAnalysis(img, t, out) {
  const st = setupState;
  if (st.step === 'scan' && out.events.length) {
    for (const ev of out.events) {
      st.shots++; if (ev.made) st.made++;
      lastShotPath = ev.path; lastShotMade = ev.made; lastShotT = performance.now();
      ev.made ? sfx.made() : sfx.miss();
    }
    renderSetup();
  }
}
$('#setupClose').addEventListener('click', () => {
  const recal = setupState.mode === 'recal';
  closeSetup();
  if (recal) { resumeAfterRecal(); return; }
  closeCamera(); $('#stage').hidden = true; keepAwake(false); go(view === 'summary' ? 'home' : view);
});
$('#setupManual').addEventListener('click', () => {
  unlock(); const st = setupState; st.goAt = 0;
  if (st.step === 'manual') { st.step = 'scan'; renderSetup(); return; }
  st.step = 'manual';
  const r = st.rim || st.saved; if (r) { st.hl = { x: r.xl, y: r.y }; st.hr = { x: r.xr, y: r.y }; }
  renderSetup();
});
$('#setupOther').addEventListener('click', () => {
  unlock(); const st = setupState; st.goAt = 0;
  rimAuto.rejectCurrent();
  if (rimAuto.takeChange() && rimAuto.rim) { st.rim = null; onRimFound(rimAuto.rim, rimAuto.source); st.goAt = 0; renderSetup(); }
});
$('#flipCam').addEventListener('click', async () => {
  unlock();
  source = { ...source, facing: source.facing === 'user' ? 'environment' : 'user' };
  store.setSetting('facing', source.facing);
  closeCamera();
  try { await openSetup(setupState.after, setupState.mode); } catch (e) { toast('Impossible de changer de caméra'); }
});
$('#camSelect').addEventListener('change', async e => {
  store.setSetting('deviceId', e.target.value); closeCamera();
  try { await openSetup(setupState.after, setupState.mode); } catch (err) { toast("Impossible de changer d'objectif"); }
});
function finishSetup() {
  const st = setupState;
  const rim = st.step === 'manual' ? handlesRim() : (st.rim || st.saved);
  if (!rim) return;
  if (st.step === 'manual' && rim.xr - rim.xl < 0.015) { toast('Écarte les deux poignées : une sur chaque bord du cercle.'); return; }
  saveCalib(rim, st.step === 'manual' ? 'main' : st.src || 'dernier');
  applyTrackerSettings();
  const after = st.after, mode = st.mode; closeSetup();
  if (mode === 'recal') { toast('Panier recalé'); resumeAfterRecal(); return; }
  if (after) after();
  else { toast('Réglage enregistré'); closeCamera(); $('#stage').hidden = true; keepAwake(false); go('settings'); }
}
$('#setupNext').addEventListener('click', () => { unlock(); finishSetup(); });

// ======================= séance en direct =======================
let S = null;                   // séance en cours
let phase = 'idle', phaseEndsAt = 0, pausedRemaining = 0, pausedPhase = null, grace = null, ticker = null, lastSpoken = -1;

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function newSession(week, seance, mode) {
  const P = PROGRAM[week];
  return {
    id: newId(), type: 'program', title: `Semaine ${week} · séance ${seance}`,
    cycle: cycleNo(), date: today(), week, seance, mode, startedAt: Date.now(), note: '',
    exercises: P.ex.map(e => ({ name: e.name, cue: e.cue, plan: { series: e.series, per: e.per || null, seconds: e.seconds || null }, series: [] })),
    ei: 0, si: 0,
  };
}
function makeSession(type, title, exercises, mode, extra = {}) {
  return { id: newId(), type, title, cycle: cycleNo(), date: today(), mode, startedAt: Date.now(), note: '',
    exercises: exercises.map(e => ({ name: e.name, cue: e.cue || '', plan: { series: 1, per: null, seconds: null, ...e.plan }, spot: e.spot || null, series: [] })), ei: 0, si: 0, ...extra };
}
const curEx = () => S.exercises[S.ei];
const progEx = () => curEx();
function curSeries() { const ex = curEx(); if (!ex.series[S.si]) ex.series[S.si] = { shots: [] }; return ex.series[S.si]; }
function persist() { store.setDraft(S); }

function beginSession(mode) {
  S = newSession(sel.week, sel.seance, mode);
  persist(); enterLive(mode);
}
function beginCustom(session) { unlock(); S = session; persist(); enterLive(S.mode); }
function resumeDraft() { S = store.state.draft; if (!S) return; if (S.type === 'video') { store.setDraft(null); toast("L'analyse vidéo ne peut pas reprendre : relance-la."); renderHome(); return; } enterLive(S.mode); }

async function enterLive(mode) {
  askPersistence(); clips = []; processor = 'shot';
  source = S.type === 'video' ? source : { kind: 'camera', url: null, facing: S_().facing || 'environment' };
  $('#stage').hidden = false; $('#liveUI').hidden = true; $('#setupUI').hidden = true;
  $('#stage').classList.toggle('manual-mode', mode !== 'camera');
  keepAwake(true);
  if (S.type === 'video') { closeCamera(); await openSetup(startLiveUI, 'file'); return; }
  if (mode === 'camera') {
    await openSetup(startLiveUI, 'full');
  } else {
    closeCamera(); startLiveUI();
  }
}
function startLiveUI() {
  $('#setupUI').hidden = true; $('#liveUI').hidden = false;
  const c = store.state.calib;
  $('#liveUI').classList.toggle('rim-left', !!(c && S.mode === 'camera' && (isMirror() ? 1 - (c.rim.xl + c.rim.xr) / 2 : (c.rim.xl + c.rim.xr) / 2) < 0.5));
  analysisHandler = S.mode === 'camera' ? liveAnalysis : null;
  tracker.reset(); applyTrackerSettings();
  showMask = false;
  if (S.mode === 'camera' && S.type !== 'video') clipRec.start();
  renderLive();
  if (S.type === 'video') { phase = 'running'; setCenter(null, null); video.currentTime = 0; video.play().catch(() => {}); video.onended = () => { if (S && S.type === 'video') finishSession(); }; }
  else showReady();
  clearInterval(ticker); ticker = setInterval(tick, 200);
}
function liveAnalysis(img, t, out) {
  for (const ev of out.events) {
    lastShotPath = ev.path; lastShotMade = ev.made; lastShotT = performance.now();
    const ref = addShot(ev.made, { angle: ev.angle, apex: ev.apex, depth: ev.depth, flags: ev.flags, distance: ev.distance, launch: ev.launch, speed: ev.speed, src: 'auto' });
    if (ref && S.type !== 'video') {
      const path = ev.path, made = ev.made;
      setTimeout(() => {
        const frames = clipRec.cut(3000); if (frames.length < 5) return;
        clips.push({ ...ref, made, path, frames, m: { angle: ev.angle, apex: ev.apex, depth: ev.depth, distance: ev.distance } });
        if (clips.length > 40) clips.shift();
      }, 450);
    }
  }
}

function setCenter(big, sub, btn, btn2) {
  const cm = $('#centerMsg'); cm.hidden = !big && !sub;
  const ui = $('#liveUI'); ui.classList.toggle('has-center', !cm.hidden); ui.classList.toggle('no-foot', !cm.hidden && phase !== 'rest');
  $('#cmBig').textContent = big || ''; $('#cmSub').textContent = sub || '';
  const b = $('#cmBtn'); b.hidden = !btn; if (btn) { b.textContent = btn[0]; b.onclick = btn[1]; }
  const b2 = $('#cmBtn2'); b2.hidden = !btn2; if (btn2) { b2.textContent = btn2[0]; b2.onclick = btn2[1]; }
}
function seriesLabel() { const ex = curEx(), lb = ex.plan.seriesLabels && ex.plan.seriesLabels[S.si]; return ex.plan.series > 1 ? `Série ${S.si + 1}/${ex.plan.series}${lb ? ' · ' + lb : ''}` : (lb || 'Série unique'); }
const secTxt = s => (s >= 120 ? s / 60 + ' min' : s + ' s');
function planLabel() {
  const p = curEx().plan;
  if (p.game === 'beatpro') return 'arrive à 0 avant 10';
  if (p.game === 'contest') return `25 tirs en ${secTxt(p.seconds)}`;
  if (p.makes) return `objectif ${p.makes} réussis`;
  if (p.per) return `${p.per} tirs`;
  if (p.seconds) return `${secTxt(p.seconds)} chrono`;
  return 'tir libre';
}

function showReady() {
  phase = 'ready'; renderLive();
  const pe = progEx();
  setCenter(S.exercises.length > 1 || curEx().plan.series > 1 ? seriesLabel() : curEx().name, `${curEx().name} · ${planLabel()}. ${pe.cue || ''}`, ['Go', () => { unlock(); startCountdown(S_().startDelay, true); }]);
}
function announceSeries() {
  const p = curEx().plan;
  const lb = p.seriesLabels && p.seriesLabels[S.si];
  const what = p.game === 'beatpro' ? 'Beat the Pro. Tu pars à 5.' : p.makes ? `Objectif ${p.makes} réussis.` : p.per ? p.per + ' tirs.' : p.seconds ? (p.seconds >= 120 ? p.seconds / 60 + ' minutes' : p.seconds + ' secondes') + ' chrono.' : 'Tir libre.';
  const spot = curEx().spot ? ` Machine : angle ${String(curEx().spot.deg).replace('.', ',')} degrés, ${String(curEx().spot.m).replace('.', ',')} mètres.` : '';
  return `${S.si === 0 ? curEx().name + '. ' : ''}${p.series > 1 ? `Série ${S.si + 1} sur ${p.series}. ` : ''}${lb ? lb + '. ' : ''}${what}${spot}`;
}
function startCountdown(sec, speak) {
  phase = 'countdown'; phaseEndsAt = performance.now() + sec * 1000; lastSpoken = -1;
  if (speak && S_().voice) say(announceSeries(), { interrupt: true });
  setCenter(String(sec), `${seriesLabel()} · ${planLabel()}`);
}
function startRunning() {
  phase = 'running'; const ser = curSeries(); ser.startedAt = ser.startedAt || Date.now();
  const p = curEx().plan; phaseEndsAt = p.seconds ? performance.now() + p.seconds * 1000 : 0;
  setCenter(null, null); if (S_().beeps) sfx.go(); if (S_().voice) say('Go', { interrupt: true });
  tracker.softReset();
  renderLive(); persist();
}
function addShot(made, m = {}) {
  let ser = null;
  if (phase === 'running') ser = curSeries();
  else if (grace && performance.now() < grace.until) ser = grace.series;
  else if (m.src !== 'auto' && phase === 'rest' && lastEnded) ser = lastEnded;
  else if (m.src !== 'auto' && (phase === 'paused' || phase === 'ready' || phase === 'countdown')) ser = curSeries();
  if (!ser) return; // tirs d'échauffement pendant le repos : ignorés
  ser.shots.push({ t: Date.now(), made, angle: m.angle ?? null, apex: m.apex ?? null, depth: m.depth ?? null, distance: m.distance ?? null, launch: m.launch ?? null, speed: m.speed ?? null, flags: m.flags || [], src: m.src || 'manual' });
  const p0 = curEx().plan;
  if (p0.game === 'beatpro' && ser === curSeries()) { ser.score = (ser.score ?? 5) + (made ? -1 : 1); }
  if (p0.game === 'contest') ser.points = contestPoints(ser);
  if (S_().beeps) made ? sfx.made() : sfx.miss();
  const fl = $('#flash'); fl.className = 'flash ' + (made ? 'm' : 'x'); setTimeout(() => (fl.className = 'flash'), 60);
  if (m.src === 'auto') showShotMetrics(m, made);
  const att = ser.shots.length, mk = ser.shots.filter(s => s.made).length;
  if (S_().voice && p0.game === 'beatpro' && ser === curSeries()) say(String(ser.score), { interrupt: true });
  else if (S_().voice && S_().sayEachShot && ser === curSeries()) say(`${mk} sur ${att}`, { interrupt: true });
  persist(); renderLive();
  if (ser !== curSeries()) toast(`Ajouté à la série précédente : ${mk}/${att}`);
  const p = curEx().plan, cs = curSeries();
  const ref = { ser, k: ser.shots.length - 1, exName: (S.exercises.find(e => e.series.includes(ser)) || curEx()).name };
  if (phase === 'running') {
    if (p.game === 'beatpro' && (cs.score <= 0 || cs.score >= 10)) { cs.result = cs.score <= 0 ? 'win' : 'lose'; endSeries(); }
    else if (p.makes && cs.shots.filter(x => x.made).length >= p.makes) endSeries();
    else if (p.per && cs.shots.length >= p.per) endSeries();
  }
  return ref;
}
function contestPoints(ser) { return ser.shots.reduce((n, x, i) => n + (x.made ? (i % 5 === 4 ? 2 : 1) : 0), 0); }
function showShotMetrics(m, made) {
  const ok = (v, [a, b]) => v != null && v >= a && v <= b;
  const depthTxt = m.depth == null ? '–' : (m.depth > 0 ? '+' : '') + m.depth + ' cm';
  const depthWord = m.depth == null ? '' : m.depth < TARGETS.depth[0] - 5 ? 'court' : m.depth > TARGETS.depth[1] + 5 ? 'long' : 'bon';
  $('#lMetrics').innerHTML = `<div>${made ? 'Rentré' : 'Raté'}${(m.flags || []).includes('contact') ? ' · touche le cercle' : ''}${(m.flags || []).includes('airball') ? ' · air ball' : ''}${(m.flags || []).includes('incertain') ? ' · à vérifier' : ''}</div>
    <div>Angle <b class="${ok(m.angle, TARGETS.angle) ? 'ok' : 'off'}">${num(m.angle, 0)}°</b></div>
    <div>Sommet <b>${m.apex == null ? '–' : '+' + num(m.apex / 100, 2) + ' m'}</b></div>
    <div>Arrivée <b class="${depthWord === 'bon' ? 'ok' : 'off'}">${depthTxt}</b> ${depthWord}</div>
    ${m.distance ? `<div>Distance <b>${num(m.distance / 100, 1)} m</b>${m.launch ? ` · sortie ${num(m.launch, 0)}°` : ''}</div>` : ''}`;
}
let lastEnded = null;
function endSeries() {
  const ser = curSeries(); ser.endedAt = Date.now(); lastEnded = ser;
  const mk = ser.shots.filter(s => s.made).length, att = ser.shots.length;
  const p = curEx().plan;
  if (p.seconds) grace = { series: ser, until: performance.now() + 1500 }; else grace = null;
  if (S_().beeps) sfx.end();
  const lastSeries = S.si + 1 >= p.series, lastEx = S.ei + 1 >= S.exercises.length;
  let msg = `Série terminée. ${mk} sur ${att}.`;
  if (p.game === 'beatpro') msg = ser.result === 'win' ? `Gagné ! Beat the Pro en ${att} tirs.` : ser.result === 'lose' ? 'Perdu : 10 atteint. Revanche ?' : msg;
  if (p.game === 'contest') msg = `Concours terminé : ${ser.points || 0} points sur 30.`;
  if (p.makes && !p.game) { const secs = Math.round(((ser.endedAt - (ser.startedAt || ser.endedAt)) / 1000)); msg = `${mk} réussis en ${att} tirs, ${secs} secondes.`; }
  if (lastSeries && S.exercises.length > 1) { const st = exStats(curEx()); msg = `Exercice terminé. ${st.made} sur ${st.att}, ${Math.round(st.pct || 0)} pour cent.`; }
  const tip = coachTip(ser.shots);
  ser.tip = tip || null;
  if (S_().voice) say(msg + (tip ? ' ' + tip : ''), { interrupt: true });
  advance(msg + (tip ? '\n' + tip : ''));
}
// passe à la série / à l'exercice suivant (msg : annonce de fin, ou null si on saute)
function advance(msg) {
  const p = curEx().plan;
  const lastSeries = S.si + 1 >= p.series, lastEx = S.ei + 1 >= S.exercises.length;
  if (lastSeries && lastEx) { persist(); phase = 'done'; setCenter('Fini', msg || ''); setTimeout(finishSession, msg ? 1800 : 300); return; }
  if (lastSeries) { S.ei++; S.si = 0; } else S.si++;
  persist();
  if (msg) startRest(lastSeries ? Math.max(60, S_().rest) : S_().rest, lastSeries, msg);
  else showReady();
}
function startRest(sec, newEx, msg) {
  phase = 'rest'; phaseEndsAt = performance.now() + sec * 1000; lastSpoken = -1;
  const next = newEx ? `Ensuite : ${curEx().name} · ${planLabel()}. ${progEx().cue}` : `Ensuite : ${seriesLabel()} · ${planLabel()}`;
  setCenter(String(sec), `${msg}\nRepos. ${next}`, ['Revoir la série', () => openClipViewer(lastEnded)], ['Passer le repos', () => { phaseEndsAt = performance.now() + 3100; }]);
  $('#cmBtn').hidden = !clips.some(c => c.ser === lastEnded);
  if (newEx && S_().voice) setTimeout(() => say(`Prochain exercice : ${curEx().name}.`), 2500);
  renderLive();
}
function tick() {
  const now = performance.now();
  const remain = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));
  if (phase === 'countdown' || phase === 'rest') {
    $('#cmBig').textContent = String(remain);
    if (remain !== lastSpoken) {
      lastSpoken = remain;
      if (phase === 'rest' && remain === 10 && S_().voice) say('Reprise dans 10 secondes');
      if (remain <= 3 && remain > 0 && S_().beeps) sfx.tick();
    }
    if (now >= phaseEndsAt) startRunning();
  } else if (phase === 'running' && phaseEndsAt) {
    $('#lClock').textContent = fmtClock(remain);
    if (remain !== lastSpoken) { lastSpoken = remain; if (remain <= 3 && remain > 0 && S_().beeps) sfx.tick(); if (remain === 10 && S_().voice) say('10 secondes'); }
    if (now >= phaseEndsAt) { $('#lClock').textContent = '0:00'; endSeries(); }
  }
}
const fmtClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function renderLive() {
  if (!S) return;
  const ex = curEx(), ser = ex.series[S.si] || { shots: [] };
  $('#lExName').textContent = ex.name;
  $('#lExSub').textContent = `${S.title || ''}${S.exercises.length > 1 ? ` · exercice ${S.ei + 1}/${S.exercises.length}` : ''} · ${seriesLabel()}`;
  const mk = ser.shots.filter(s => s.made).length;
  const p = ex.plan;
  if (p.game === 'beatpro') { $('#lMade').textContent = ser.score ?? 5; $('#lAtt').textContent = '10'; }
  else { $('#lMade').textContent = mk; $('#lAtt').textContent = ser.shots.length; }
  $('#lPlan').textContent = p.game === 'beatpro' ? 'score · 0 = gagné' : p.game === 'contest' ? `${ser.points || 0} points` : p.makes ? `objectif ${p.makes} réussis` : p.per ? `sur ${p.per} tirs` : p.seconds ? 'tirs chronométrés' : `${pct(mk, ser.shots.length) == null ? '–' : num(pct(mk, ser.shots.length), 0)} %${rhythmTxt(ser)}`;
  $('#lDots').innerHTML = ser.shots.map(s => `<i class="${s.made ? 'm' : 'x'}"></i>`).join('') + (p.per ? '<i></i>'.repeat(Math.max(0, p.per - ser.shots.length)) : '');
  if (!(phase === 'running' && p.seconds)) $('#lClock').textContent = p.seconds && phase !== 'running' ? fmtClock(p.seconds) : '';
}

$('#addMade').addEventListener('click', () => { unlock(); addShot(true, { src: 'manual' }); });
$('#addMiss').addEventListener('click', () => { unlock(); addShot(false, { src: 'manual' }); });
$('#flipLast').addEventListener('click', () => {
  const ser = (grace && performance.now() < grace.until) ? grace.series : curSeries();
  const s = ser.shots[ser.shots.length - 1] || lastSeriesShot(); if (!s) return;
  s.made = !s.made; s.src = s.src === 'auto' ? 'auto-corrigé' : s.src; persist(); renderLive(); toast(`Dernier tir : ${s.made ? 'rentré' : 'raté'}`);
});
$('#undoLast').addEventListener('click', () => {
  const exs = S.exercises;
  for (let e = S.ei; e >= 0; e--) { const ss = exs[e].series; for (let i = ss.length - 1; i >= 0; i--) if (ss[i].shots.length) { ss[i].shots.pop(); persist(); renderLive(); toast('Dernier tir supprimé'); return; } }
});
function lastSeriesShot() {
  // pendant le repos : le dernier tir est dans la série précédente
  const exs = S.exercises; for (let e = S.ei; e >= 0; e--) { const ss = exs[e].series; for (let i = ss.length - 1; i >= 0; i--) { const sh = ss[i].shots; if (sh.length) return sh[sh.length - 1]; } }
  return null;
}

// pause
$('#liveMenu').addEventListener('click', () => {
  if (phase === 'paused') return;
  pausedPhase = phase; pausedRemaining = phaseEndsAt ? phaseEndsAt - performance.now() : 0; phase = 'paused';
  try { speechSynthesis.cancel(); } catch (e) {}
  $('#pmRecal').hidden = !(S && S.mode === 'camera' && S.type !== 'video');
  $('#pauseMenu').hidden = false;
});
$('#pmResume').addEventListener('click', () => {
  $('#pauseMenu').hidden = true; phase = pausedPhase;
  if (phaseEndsAt) phaseEndsAt = performance.now() + pausedRemaining;
  if (phase === 'ready') showReady();
});
$('#pmSkipSeries').addEventListener('click', () => {
  $('#pauseMenu').hidden = true; phase = pausedPhase;
  if (phase === 'running') endSeries(); else advance(null);
});
$('#pmSkipEx').addEventListener('click', () => {
  $('#pauseMenu').hidden = true;
  if (S.ei + 1 >= S.exercises.length) { finishSession(); return; }
  S.ei++; S.si = 0; persist(); showReady();
});
$('#pmRecal').addEventListener('click', () => {
  $('#pauseMenu').hidden = true; $('#liveUI').hidden = true; analysisHandler = null;
  openSetup(null, 'recal');
});
function resumeAfterRecal() {
  $('#setupUI').hidden = true; $('#liveUI').hidden = false;
  analysisHandler = liveAnalysis; tracker.reset(); applyTrackerSettings();
  phase = pausedPhase || 'ready';
  if (phaseEndsAt) phaseEndsAt = performance.now() + pausedRemaining;
  if (phase === 'ready') showReady(); else renderLive();
}
$('#pmFinish').addEventListener('click', () => { $('#pauseMenu').hidden = true; finishSession(); });

function finishSession() {
  phase = 'idle'; clearInterval(ticker); analysisHandler = null; grace = null;
  video.onended = null;
  S.endedAt = Date.now(); persist();
  closeCamera(); keepAwake(false); $('#stage').hidden = true; $('#liveUI').hidden = true;
  renderSummary(); go('summary');
}

// ======================= bilan / détail =======================
function sessionHTML(s, editable) {
  const st = sessStats(s);
  let h = `<section class="card"><div class="kpis">
    <div class="kpi"><div class="v">${num(st.pct)}%</div><div class="k">Réussite · ${st.made}/${st.att}</div></div>
    <div class="kpi"><div class="v">${st.angle == null ? '–' : num(st.angle) + '°'}</div><div class="k">Angle moyen</div></div>
    <div class="kpi"><div class="v">${st.apex == null ? '–' : num(st.apex / 100, 2) + ' m'}</div><div class="k">Sommet moyen</div></div></div>
    ${st.measured ? `<p class="hint">${st.inAngle}% des tirs mesurés arrivent entre ${TARGETS.angle[0]} et ${TARGETS.angle[1]}°. Profondeur moyenne : ${st.depth > 0 ? '+' : ''}${num(st.depth, 0)} cm par rapport au centre du cercle (repère : 0 à +10 cm).</p>` : ''}</section>`;
  h += `<section class="card"><div class="h3">Par exercice</div><div class="tablebox"><table class="tbl"><thead><tr><th>Exercice</th><th>Réussis</th><th>%</th><th>Angle</th><th>Arrivée</th></tr></thead><tbody>`;
  s.exercises.forEach((ex, i) => {
    const e = exStats(ex); if (!e.att && !editable) return;
    h += `<tr><td>${esc(ex.name)}</td>
      <td>${e.made}/${e.att}</td><td>${num(e.pct)}</td><td>${e.angle == null ? '–' : num(e.angle, 0) + '°'}</td><td>${e.depth == null ? '–' : (e.depth > 0 ? '+' : '') + num(e.depth, 0) + ' cm'}</td></tr>`;
    if (editable) h += `<tr class="adj"><td colspan="5"><div class="row gap wrap"><button class="btn sm ghost" data-adj="${i}" data-v="1">+ rentré</button><button class="btn sm ghost" data-adj="${i}" data-v="0">+ raté</button><button class="btn sm ghost" data-adj="${i}" data-v="-1">− dernier</button></div></td></tr>`;
  });
  h += `</tbody></table></div></section>`;
  const shots = s.exercises.flatMap(e => e.series.flatMap(x => x.shots)).filter(x => x.angle != null && x.depth != null);
  if (shots.length) h += `<section class="card"><div class="h3">Carte des arrivées</div>${scatterSVG(shots)}<p class="hint">Chaque point est un tir : à droite, il arrive trop long, à gauche trop court ; en haut, la courbe est plus haute. Le rectangle vert est la zone visée.</p></section>`;
  h += extrasHTML(s, editable);
  if (s.note && !editable) h += `<section class="card"><div class="h3">Note</div><p>${esc(s.note)}</p></section>`;
  return h;
}
function extrasHTML(s, editable) {
  let h = '';
  const shots = s.exercises.flatMap(e => e.series.flatMap(x => x.shots));
  const ex0 = s.exercises[0], ser0 = ex0 && ex0.series[0];
  if (ex0 && ex0.plan.game === 'beatpro') h += `<section class="card"><div class="h3">Beat the Pro</div><p class="big-result">${s.exercises[0].series.map(x => x.result === 'win' ? 'Gagné' : x.result === 'lose' ? 'Perdu' : 'Partie inachevée').join(', ')}</p></section>`;
  if (ex0 && ex0.plan.game === 'contest' && ser0) h += `<section class="card"><div class="h3">Concours à 3 points</div><p class="big-result">${ser0.points || 0} points <small>/ 30</small></p></section>`;
  if (s.drill === 'hundred' || s.drill === 'form' || s.drill === 'world') { const t = s.endedAt && s.startedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : null; if (t) h += `<section class="card"><div class="h3">Temps total</div><p class="big-result">${t} min</p></section>`; }
  // distances
  const withD = shots.filter(x => x.distance);
  if (withD.length >= 3) {
    const bins = [[0, 300, 'Moins de 3 m'], [300, 500, '3 à 5 m'], [500, 675, '5 m à 6,75 m'], [675, 2000, '3 points']];
    h += `<section class="card"><div class="h3">Réussite par distance</div><div class="tablebox"><table class="tbl"><thead><tr><th>Distance</th><th>Réussis</th><th>%</th><th>Angle</th></tr></thead><tbody>${bins.map(([a, b, l]) => { const g = withD.filter(x => x.distance >= a && x.distance < b); if (!g.length) return ''; const mk = g.filter(x => x.made).length, an = avg(g.filter(x => x.angle != null).map(x => x.angle)); return `<tr><td>${l}</td><td>${mk}/${g.length}</td><td>${num(pct(mk, g.length))}</td><td>${an == null ? '–' : num(an, 0) + '°'}</td></tr>`; }).join('')}</tbody></table></div><p class="hint">Distance estimée depuis le point de lâcher vu par la caméra.</p></section>`;
  }
  // machine : carte des positions
  if (s.type === 'machine') {
    const by = {};
    for (const e of s.exercises) if (e.spot) { const k = e.spot.deg + '|' + e.spot.m; by[k] = by[k] || { deg: e.spot.deg, m: e.spot.m, made: 0, att: 0 }; for (const x of e.series.flatMap(z => z.shots)) { by[k].att++; if (x.made) by[k].made++; } }
    h += `<section class="card"><div class="h3">Carte des tirs</div>${courtSVG(Object.values(by))}<p class="hint">Pourcentage par position. Vert : 60 % et plus, orange : 40 à 59 %, rouge : moins de 40 %.</p></section>`;
    const byH = HEIGHTS.map(hh => { const g = s.exercises.filter(e => e.spot && e.spot.h === hh.id).flatMap(e => e.series.flatMap(z => z.shots)); return { l: hh.label, mk: g.filter(x => x.made).length, n: g.length }; }).filter(x => x.n);
    if (byH.length > 1) h += `<section class="card"><div class="h3">Par hauteur de passe</div><div class="kpis">${byH.map(x => `<div class="kpi"><div class="v">${num(pct(x.mk, x.n), 0)}%</div><div class="k">${esc(x.l)} · ${x.mk}/${x.n}</div></div>`).join('')}</div></section>`;
  }
  // conseils
  const tips = s.exercises.flatMap(e => e.series.map(x => x.tip)).filter(Boolean);
  const overall = coachTip(shots);
  if (overall || tips.length) h += `<section class="card"><div class="h3">Conseils</div><ul class="tips">${[...new Set([overall, ...tips].filter(Boolean))].slice(0, 4).map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
  if (editable && clips.length) h += `<section class="card"><div class="h3">Ralentis</div><p class="muted">${clips.length} tir(s) filmé(s) pendant la séance. Ils ne sont gardés que jusqu'à l'enregistrement.</p><button class="btn ghost" id="openClips">Revoir mes tirs</button></section>`;
  return h;
}
function scatterSVG(shots) {
  const W = 340, H = 220, L = 34, Rr = 10, T = 10, B = 30;
  const dx = [-40, 40], ay = [25, 65];
  const X = v => L + ((Math.max(dx[0], Math.min(dx[1], v)) - dx[0]) / (dx[1] - dx[0])) * (W - L - Rr);
  const Y = v => T + (1 - (Math.max(ay[0], Math.min(ay[1], v)) - ay[0]) / (ay[1] - ay[0])) * (H - T - B);
  let g = `<rect x="${X(TARGETS.depth[0])}" y="${Y(TARGETS.angle[1])}" width="${X(TARGETS.depth[1]) - X(TARGETS.depth[0])}" height="${Y(TARGETS.angle[0]) - Y(TARGETS.angle[1])}" fill="var(--target)" stroke="var(--made)" stroke-dasharray="3 3"/>`;
  for (const v of [-40, -20, 0, 20, 40]) g += `<line class="chart-axis" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${H - B}"/><text class="chart-label" x="${X(v)}" y="${H - B + 14}" text-anchor="middle">${v > 0 ? '+' : ''}${v}</text>`;
  for (const v of [30, 40, 50, 60]) g += `<line class="chart-axis" x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="chart-label" x="${L - 5}" y="${Y(v) + 3}" text-anchor="end">${v}°</text>`;
  g += `<text class="chart-label" x="${(W + L) / 2}" y="${H - 3}" text-anchor="middle">court ← arrivée (cm) → long</text>`;
  for (const s of shots) g += `<circle cx="${X(s.depth)}" cy="${Y(s.angle)}" r="4.5" fill="${s.made ? 'var(--made)' : 'var(--miss)'}" fill-opacity=".8"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Carte des arrivées">${g}</svg>`;
}
function renderSummary() {
  $('#sumTitle').textContent = S.title || `Semaine ${S.week} · séance ${S.seance}`;
  $('#sumEyebrow').textContent = `Bilan · ${frDate(S.date)}`;
  $('#sumBody').innerHTML = sessionHTML(S, true);
  $('#sumNote').value = S.note || '';
  // en-tête : le chiffre qui compte, comparé à la fois précédente
  const st = sessStats(S), prev = store.state.sessions.filter(x => x.type !== 'dribble' && x.id !== S.id).sort((a, b) => b.startedAt - a.startedAt);
  const same = prev.find(x => (S.week && x.week === S.week && x.seance === S.seance) || (!S.week && x.title === S.title)) || prev[0];
  const ps = same ? sessStats(same) : null;
  const d = ps && ps.att && st.pct != null ? st.pct - ps.pct : null;
  const best = prev.filter(x => sessStats(x).att >= 20).reduce((m, x) => Math.max(m, sessStats(x).pct || 0), 0);
  const record = st.att >= 20 && prev.length && st.pct > best;
  const C = 2 * Math.PI * 52, f = Math.max(0, Math.min(1, (st.pct || 0) / 100));
  const goal = S_().weeklyGoal || 3, ws = weekStart(), days = new Set([...store.state.sessions.map(x => x.date), S.date]);
  let nWeek = 0; for (let i = 0; i < 7; i++) if (days.has(isoDay(new Date(ws.getTime() + i * DAY)))) nWeek++;
  const word = st.att === 0 ? '' : record ? 'Record personnel !' : d != null && d >= 5 ? 'Grosse progression' : d != null && d > 0 ? 'En progrès' : st.pct >= 60 ? 'Très bonne séance' : d != null && d < -5 ? 'Séance difficile, ça arrive' : 'Séance faite';
  $('#sumHero').innerHTML = st.att ? `<div class="sh-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="tr"/><circle cx="60" cy="60" r="52" class="pr" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - f)}"/></svg><div><b>${num(st.pct, 0)}<small>%</small></b><span>${st.made}/${st.att}</span></div></div>
    <div class="sh-main"><div class="sh-word ${record ? 'rec' : ''}">${word}</div>
    ${d != null ? `<div class="sh-delta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲ +' : '▼ '}${num(d, 0)} pts <small>vs ${same.week ? 'la même séance' : 'la dernière fois'} (${num(ps.pct, 0)} %)</small></div>` : '<div class="sh-delta">Première référence : la prochaine fois, tu sauras si tu progresses.</div>'}
    ${st.angle != null ? `<div class="sh-line">Angle d'entrée moyen <b>${num(st.angle, 0)}°</b> ${st.angle >= TARGETS.angle[0] && st.angle <= TARGETS.angle[1] ? '· dans la cible' : `· cible ${TARGETS.angle[0]}–${TARGETS.angle[1]}°`}</div>` : ''}
    <div class="sh-line">Semaine : <b>${Math.min(nWeek, 7)}/${goal}</b> séances${nWeek >= goal ? ' · objectif tenu' : ''}</div></div>` : '';
}
$('#sumBody').addEventListener('click', e => {
  if (e.target.closest('#openClips')) { openClipViewer(null); return; }
  const b = e.target.closest('[data-adj]'); if (!b) return;
  const ex = S.exercises[+b.dataset.adj], v = +b.dataset.v;
  if (!ex.series.length) ex.series.push({ shots: [] });
  const ser = ex.series[ex.series.length - 1];
  if (v === -1) { for (let i = ex.series.length - 1; i >= 0; i--) if (ex.series[i].shots.length) { ex.series[i].shots.pop(); break; } }
  else ser.shots.push({ t: Date.now(), made: !!v, angle: null, apex: null, depth: null, flags: [], src: 'manual' });
  persist(); renderSummary();
});
$('#sumNote').addEventListener('input', e => { S.note = e.target.value; persist(); });
$('#sumSave').addEventListener('click', () => {
  const att = sessStats(S).att;
  if (!att) { store.setDraft(null); S = null; toast('Séance vide : rien à enregistrer'); go('home'); return; }
  const clean = { ...S }; delete clean.ei; delete clean.si;
  store.addSession(clean); S = null; sel = null; clips = [];
  toast('Séance enregistrée'); go('home'); checkNewBadges(); doSync();
});

// historique
function renderHistory() {
  const list = [...store.state.sessions].sort((a, b) => b.startedAt - a.startedAt);
  $('#histList').innerHTML = list.length ? list.map(s => {
    const st = sessStats(s);
    const typeName = { program: 'Programme', machine: 'Machine', pro: 'Défi pro', free: 'Tir libre', video: 'Vidéo', dribble: 'Dribble' }[s.type || 'program'];
    if (s.type === 'dribble') { const n = s.drills.reduce((m, d) => m + (d.count || 0), 0);
      return `<button class="card hist-item" data-id="${esc(s.id)}"><div class="t"><span>${frDate(s.date)} · ${esc(s.title)}</span><span class="pct">${n || '–'}</span></div><div class="muted">${s.drills.length} exercices de dribble${n ? ` · ${n} rebonds` : ''}</div><div><span class="pill">${typeName}</span> <span class="pill ${s.synced ? 'ok' : 'warn'}">${s.synced ? 'Dans le Google Sheet' : 'Pas encore envoyée'}</span></div></button>`; }
    return `<button class="card hist-item" data-id="${esc(s.id)}"><div class="t"><span>${frDate(s.date)} · ${esc(s.title || `S${s.week} séance ${s.seance}`)}</span><span class="pct">${num(st.pct)}%</span></div>
      <div class="muted">${st.made}/${st.att} tirs${st.angle != null ? ` · angle moyen ${num(st.angle, 0)}°` : ''} · <span class="pill">${typeName}</span></div>
      <div><span class="pill ${s.synced ? 'ok' : 'warn'}">${s.synced ? 'Dans le Google Sheet' : 'Pas encore envoyée'}</span> <span class="pill">${s.mode === 'camera' ? 'Caméra' : 'Saisie au doigt'}</span></div></button>`;
  }).join('') : `<div class="empty">Aucune séance enregistrée.<br>Lance ta première séance depuis l'onglet Séance.</div>`;
}
$('#histList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) go('detail', b.dataset.id); });
function renderDetail(id) {
  const s = store.state.sessions.find(x => x.id === id); if (!s) { go('history'); return; }
  const body = s.type === 'dribble' ? `<section class="card"><div class="tablebox"><table class="tbl"><thead><tr><th>Exercice</th><th>Durée</th><th>Rebonds</th><th>D / G</th><th>Max /s</th></tr></thead><tbody>${s.drills.map(d => `<tr><td>${esc(d.name)}</td><td>${d.seconds} s</td><td>${d.count ?? '–'}</td><td>${d.count == null ? '–' : `${d.right}/${d.left}`}</td><td>${d.best ? num(d.best, 1) : '–'}</td></tr>`).join('')}</tbody></table></div></section>` : sessionHTML(s, false);
  $('#detailBody').innerHTML = `<div class="eyebrow">${frDate(s.date)}</div><div class="h1" style="margin:4px 0 12px">${esc(s.title || `S${s.week} · séance ${s.seance}`)}</div>${body}
    <section class="card"><button class="btn danger ghost" id="delSess">Supprimer cette séance</button>
    <div class="confirm" id="delConfirm" hidden><span>Elle restera dans le Google Sheet si elle y a déjà été envoyée.</span><button class="btn danger sm" id="delYes">Supprimer</button><button class="btn ghost sm" id="delNo">Annuler</button></div></section>`;
  $('#delSess').onclick = () => ($('#delConfirm').hidden = false);
  $('#delNo').onclick = () => ($('#delConfirm').hidden = true);
  $('#delYes').onclick = () => { store.removeSession(id); toast('Séance supprimée'); go('history'); };
}

// ======================= progrès =======================
function renderProgress() {
  const c = cycleNo(), ss = sessionsOfCycle(c);
  $('#progCycle').textContent = `Cycle ${c}`;
  const rows = [1, 2, 3, 4].map(w => {
    const list = ss.filter(s => s.week === w);
    const st = exStats({ series: list.flatMap(s => s.exercises.flatMap(e => e.series)) });
    return { w, n: list.length, ...st };
  });
  const base = rows[0].pct;
  $('#progTable').innerHTML = `<thead><tr><th>Semaine</th><th>Séances</th><th>Tirs</th><th>%</th><th>Gain</th><th>Angle</th></tr></thead><tbody>` +
    rows.map(r => { const g = r.pct != null && base != null && r.w > 1 ? r.pct - base : null;
      return `<tr><td>S${r.w}</td><td>${r.n}/3</td><td>${r.made}/${r.att}</td><td>${num(r.pct)}</td><td>${g == null ? '–' : (g > 0 ? '+' : '') + num(g)}</td><td>${r.angle == null ? '–' : num(r.angle, 0) + '°'}</td></tr>`; }).join('') + '</tbody>';
  $('#progChart').innerHTML = barsSVG(rows.map(r => ({ label: 'S' + r.w, v: r.pct })), 340, 180, 100, '%');
  const sorted = [...ss].sort((a, b) => a.startedAt - b.startedAt).map(s => ({ label: `S${s.week}.${s.seance}`, v: sessStats(s).angle }));
  $('#angleChart').innerHTML = lineSVG(sorted, 340, 180);
  const p4 = rows[3].pct;
  let v;
  if (base == null) v = "Commence par la semaine 1 : c'est ta référence.";
  else if (p4 == null) v = `Référence semaine 1 : ${num(base)} %. Le verdict tombe après la semaine 4.`;
  else { const g = p4 - base; v = g >= TARGETS.gainMin ? `+${num(g)} points entre la semaine 1 et la semaine 4 : bon résultat. Recommence le cycle avec des volumes plus élevés.` : `${g > 0 ? '+' : ''}${num(g)} points : reprends la semaine 1 avant d'ajouter du volume.`; }
  $('#verdict').textContent = v;
  const all = store.state.sessions;
  const by = {};
  for (const s of all.filter(x => x.type === 'machine')) for (const e of s.exercises) if (e.spot) { const k = e.spot.deg + '|' + e.spot.m; by[k] = by[k] || { deg: e.spot.deg, m: e.spot.m, made: 0, att: 0 }; for (const x of e.series.flatMap(z => z.shots)) { by[k].att++; if (x.made) by[k].made++; } }
  $('#progMachine').hidden = !Object.keys(by).length;
  $('#progMachineSvg').innerHTML = courtSVG(Object.values(by), { label: 'Carte des tirs machine' });
  const dr = {};
  for (const s of all.filter(x => x.type === 'dribble')) for (const d of s.drills) { if (d.count == null) continue; const r = dr[d.id] = dr[d.id] || { name: d.name, n: 0, best: 0, bestRate: 0 }; r.n++; r.best = Math.max(r.best, Math.round(d.count * 30 / d.seconds)); r.bestRate = Math.max(r.bestRate, d.best || 0); }
  $('#progDribble').hidden = !Object.keys(dr).length;
  $('#progDribbleTbl').innerHTML = `<thead><tr><th>Exercice</th><th>Séances</th><th>Record / 30 s</th><th>Max /s</th></tr></thead><tbody>${Object.values(dr).map(r => `<tr><td>${esc(r.name)}</td><td>${r.n}</td><td>${r.best}</td><td>${num(r.bestRate, 1)}</td></tr>`).join('')}</tbody>`;
}
function renderTrain() {}
function barsSVG(items, W, H, max, unit) {
  const L = 30, Rr = 8, T = 16, B = 24, ph = H - T - B, bw = (W - L - Rr) / items.length;
  let g = '';
  for (const v of [0, 25, 50, 75, 100]) { const y = T + ph - (v / max) * ph; g += `<line class="chart-axis" x1="${L}" x2="${W - Rr}" y1="${y}" y2="${y}"/><text class="chart-label" x="${L - 5}" y="${y + 3}" text-anchor="end">${v}</text>`; }
  items.forEach((it, i) => {
    const x = L + i * bw + bw * 0.22, w = bw * 0.56;
    if (it.v != null) { const h = (it.v / max) * ph, y = T + ph - h; g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="var(--ball)"/><text class="chart-value" x="${x + w / 2}" y="${y - 4}" text-anchor="middle">${num(it.v, 0)}${unit}</text>`; }
    else g += `<text class="chart-label" x="${x + w / 2}" y="${T + ph - 4}" text-anchor="middle">–</text>`;
    g += `<text class="chart-label" x="${x + w / 2}" y="${H - 6}" text-anchor="middle">${it.label}</text>`;
  });
  return g;
}
function lineSVG(items, W, H) {
  const pts = items.filter(i => i.v != null);
  if (!pts.length) return `<text class="chart-label" x="${W / 2}" y="${H / 2}" text-anchor="middle">Pas encore de tir mesuré par la caméra</text>`;
  const L = 30, Rr = 10, T = 10, B = 24, lo = 30, hi = 60;
  const X = i => L + (pts.length === 1 ? (W - L - Rr) / 2 : (i / (pts.length - 1)) * (W - L - Rr));
  const Y = v => T + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (H - T - B);
  let g = `<rect x="${L}" y="${Y(TARGETS.angle[1])}" width="${W - L - Rr}" height="${Y(TARGETS.angle[0]) - Y(TARGETS.angle[1])}" fill="var(--target)"/>`;
  for (const v of [30, 40, 50, 60]) g += `<line class="chart-axis" x1="${L}" x2="${W - Rr}" y1="${Y(v)}" y2="${Y(v)}"/><text class="chart-label" x="${L - 5}" y="${Y(v) + 3}" text-anchor="end">${v}°</text>`;
  g += `<polyline fill="none" stroke="var(--ball)" stroke-width="2.5" points="${pts.map((p, i) => `${X(i)},${Y(p.v)}`).join(' ')}"/>`;
  pts.forEach((p, i) => { g += `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${i === pts.length - 1 ? 5 : 3.5}" fill="var(--ball)"/>`; if (pts.length <= 12) g += `<text class="chart-label" x="${X(i)}" y="${H - 6}" text-anchor="middle">${p.label}</text>`; });
  return g;
}

// ======================= réglages =======================
function renderSettings() {
  const s = S_();
  $('#setVoice').checked = s.voice; $('#setBeeps').checked = s.beeps; $('#setSayEach').checked = s.sayEachShot;
  $('#setRest').value = String(s.rest); $('#setDelay').value = String(s.startDelay);
  $('#setThr').value = s.motionThr; $('#thrVal').textContent = s.motionThr;
  $('#setTol').value = s.hueTol; $('#tolVal').textContent = s.hueTol + '°';
  $('#setUrl').value = s.sheetUrl; $('#setKey').value = s.sheetKey;
  const c = store.state.calib;
  $('#calibInfo').textContent = c ? `Dernier repérage : ${new Date(c.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} (${({ image: 'image', 'image+tirs': 'image et tirs', tirs: 'tirs', main: 'à la main' })[c.auto] || 'auto'}).` : '';
  $$('#facingSeg [data-facing]').forEach(b => b.setAttribute('aria-pressed', String((S_().facing || 'environment') === b.dataset.facing)));
  $('#ver').textContent = VERSION;
  $('#setGoal').value = String(S_().weeklyGoal || 3);
  const rd = S_().remindDays || [1, 3, 5];
  $('#remindDays').innerHTML = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((n, i) => `<button class="chip ${rd.includes(i + 1) ? 'on' : ''}" data-rd="${i + 1}">${n}</button>`).join('');
  $('#remindTime').value = S_().remindTime || '18:30';
}
$('#setGoal').addEventListener('change', e => store.setSetting('weeklyGoal', +e.target.value));
$('#remindDays').addEventListener('click', e => {
  const b = e.target.closest('[data-rd]'); if (!b) return;
  const d = +b.dataset.rd; let rd = [...(S_().remindDays || [1, 3, 5])];
  rd = rd.includes(d) ? rd.filter(x => x !== d) : [...rd, d].sort(); store.setSetting('remindDays', rd); b.classList.toggle('on');
});
$('#remindTime').addEventListener('change', e => store.setSetting('remindTime', e.target.value));
$('#remindBtn').addEventListener('click', () => {
  const rd = S_().remindDays || [1, 3, 5]; if (!rd.length) { toast('Choisis au moins un jour'); return; }
  const [hh, mm] = (S_().remindTime || '18:30').split(':').map(Number);
  const by = rd.map(d => ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][d - 1]).join(',');
  const start = new Date(); start.setHours(hh, mm, 0, 0); start.setDate(start.getDate() + 1);
  const p2 = n => String(n).padStart(2, '0');
  const dt = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
  const end = new Date(start.getTime() + 60 * 6e4);
  const url = location.href.split('#')[0];
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ShotPro Live//FR', 'BEGIN:VEVENT', `UID:shotpro-${Date.now()}@shotpro`, `DTSTAMP:${dt(new Date())}`, `DTSTART:${dt(start)}`, `DTEND:${dt(end)}`, `RRULE:FREQ=WEEKLY;BYDAY=${by}`, 'SUMMARY:ShotPro · séance de tir', `DESCRIPTION:Ouvre ShotPro Live et lance la séance du jour. ${url}`, `URL:${url}`, 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Séance de tir dans 15 min', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'shotpro-rappels.ics'; document.body.appendChild(a); a.click(); a.remove();
});
const bindCheck = (id, key) => $(id).addEventListener('change', e => store.setSetting(key, e.target.checked));
bindCheck('#setVoice', 'voice'); bindCheck('#setBeeps', 'beeps'); bindCheck('#setSayEach', 'sayEachShot');
$('#setRest').addEventListener('change', e => store.setSetting('rest', +e.target.value));
$('#setDelay').addEventListener('change', e => store.setSetting('startDelay', +e.target.value));
$('#setThr').addEventListener('input', e => { store.setSetting('motionThr', +e.target.value); $('#thrVal').textContent = e.target.value; });
$('#setTol').addEventListener('input', e => { store.setSetting('hueTol', +e.target.value); $('#tolVal').textContent = e.target.value + '°'; });
$('#setUrl').addEventListener('change', e => store.setSetting('sheetUrl', e.target.value.trim()));
$('#setKey').addEventListener('change', e => store.setSetting('sheetKey', e.target.value.trim()));
$('#openSetup').addEventListener('click', () => { unlock(); keepAwake(true); source = { kind: 'camera', url: null, facing: S_().facing || 'environment' }; processor = 'shot'; openSetup(null, 'full'); });
$$('#facingSeg [data-facing]').forEach(b => b.addEventListener('click', () => { store.setSetting('facing', b.dataset.facing); $$('#facingSeg [data-facing]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }));
$('#testSheet').addEventListener('click', async () => {
  store.setSetting('sheetUrl', $('#setUrl').value.trim()); store.setSetting('sheetKey', $('#setKey').value.trim());
  $('#sheetMsg').textContent = 'Test en cours…';
  try { const r = await testSheet(S_().sheetUrl, S_().sheetKey); $('#sheetMsg').textContent = `Connexion réussie au Sheet « ${r.title || 'ShotPro'} ».`; doSync(); }
  catch (e) { $('#sheetMsg').textContent = "Échec : vérifie l'adresse (elle finit par /exec) et la clé. " + (e.message || ''); }
});
$('#syncNow').addEventListener('click', () => { $('#sheetMsg').textContent = ''; doSync().then(() => { if (syncMsg === 'ok') $('#sheetMsg').textContent = 'Tout est envoyé.'; }); });
$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'shotpro-live', version: VERSION, exportedAt: new Date().toISOString(), sessions: store.state.sessions, calib: store.state.calib, settings: { ...S_(), sheetKey: '' } }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shotpro-${today()}.json`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.sessions)) throw new Error('fichier non reconnu');
    const have = new Set(store.state.sessions.map(s => s.id)); let n = 0;
    for (const s of data.sessions) if (s && s.id && !have.has(s.id) && Array.isArray(s.exercises)) { store.state.sessions.push(s); n++; }
    if (!store.state.calib && data.calib) store.state.calib = data.calib;
    save(); toast(`${n} séance(s) importée(s)`);
  } catch (err) { toast('Import impossible : ' + err.message); }
  e.target.value = '';
});
$('#wipeBtn').addEventListener('click', () => ($('#wipeConfirm').hidden = false));
$('#wipeNo').addEventListener('click', () => ($('#wipeConfirm').hidden = true));
$('#wipeYes').addEventListener('click', () => { store.reset(); $('#wipeConfirm').hidden = true; toast('Séances effacées'); renderSettings(); });


// ======================= conseils, rythme =======================
function coachTip(shots) {
  if (!shots || shots.length < 4) return '';
  const m = shots.filter(x => x.angle != null), miss = shots.filter(x => !x.made && x.depth != null);
  const made = shots.filter(x => x.made).length, p = made / shots.length;
  if (m.length >= 4) {
    const a = avg(m.map(x => x.angle));
    const sd = Math.sqrt(avg(m.map(x => (x.angle - a) ** 2)));
    if (a < 39) return 'Courbe trop plate : monte le ballon, vise le haut du cercle.';
    if (a > 54) return 'Courbe très haute : tu peux tirer un peu plus tendu.';
    if (sd > 4.5) return "Angle irrégulier d'un tir à l'autre : garde exactement le même geste.";
  }
  if (miss.length >= 3) {
    const d = avg(miss.map(x => x.depth));
    if (d < -8) return 'Tes ratés sont courts : pousse davantage avec les jambes.';
    if (d > 15) return 'Tes ratés sont longs : relâche le poignet, un peu moins de force.';
  }
  if (p >= 0.8) return 'Très bonne série, garde ce rythme.';
  if (p < 0.35) return "Série difficile : ralentis, soigne l'appui et l'équilibre.";
  return '';
}
function rhythmTxt(ser) {
  const t = ser.shots.map(x => x.t); if (t.length < 3) return '';
  const gaps = t.slice(1).map((x, i) => (x - t[i]) / 1000).filter(g => g < 20);
  return gaps.length ? ` · 1 tir / ${num(avg(gaps), 1)} s` : '';
}

// ======================= ralentis =======================
let stopPlay = null, viewerList = [], viewerIdx = 0, viewerSpeed = 1;
function openClipViewer(ser) {
  viewerList = ser ? clips.filter(c => c.ser === ser) : clips.slice();
  if (!viewerList.length) { toast('Pas de ralenti disponible (caméra uniquement)'); return; }
  viewerIdx = viewerList.length - 1; $('#clipViewer').hidden = false; playCurrent();
}
function playCurrent() {
  if (stopPlay) stopPlay();
  const c = viewerList[viewerIdx];
  $('#cvTitle').textContent = `${c.exName} · tir ${c.k + 1} · ${c.made ? 'rentré' : 'raté'}`;
  $('#cvInfo').textContent = [c.m.angle != null ? `angle ${num(c.m.angle, 0)}°` : '', c.m.apex != null ? `sommet +${num(c.m.apex / 100, 2)} m` : '', c.m.depth != null ? `arrivée ${c.m.depth > 0 ? '+' : ''}${c.m.depth} cm` : '', c.m.distance ? `${num(c.m.distance / 100, 1)} m` : ''].filter(Boolean).join(' · ');
  $('#cvPos').textContent = `${viewerIdx + 1} / ${viewerList.length}`;
  stopPlay = playClip($('#cvCanvas'), c, { speed: viewerSpeed });
}
$('#cvClose').addEventListener('click', () => { if (stopPlay) stopPlay(); stopPlay = null; $('#clipViewer').hidden = true; });
$('#cvPrev').addEventListener('click', () => { viewerIdx = (viewerIdx - 1 + viewerList.length) % viewerList.length; playCurrent(); });
$('#cvNext').addEventListener('click', () => { viewerIdx = (viewerIdx + 1) % viewerList.length; playCurrent(); });
$('#cvSpeed').addEventListener('click', e => { viewerSpeed = viewerSpeed === 1 ? 0.4 : 1; e.target.textContent = viewerSpeed === 1 ? 'Ralenti' : 'Vitesse normale'; playCurrent(); });

// ======================= catalogue « Entraîner » =======================
$('#trainList').addEventListener('click', e => {
  const b = e.target.closest('[data-train]'); if (!b) return;
  const k = b.dataset.train; unlock();
  if (k === 'program') go('home');
  else if (k === 'machine') go('machine');
  else if (k === 'pro') go('pro');
  else if (k === 'dribble') go('dribble');
  else if (k === 'free') beginCustom(makeSession('free', 'Tir libre', [{ name: 'Tir libre', cue: 'Tire à ton rythme. Pause puis « Terminer » quand tu as fini.', plan: { series: 1 } }], 'camera'));
  else if (k === 'freeManual') beginCustom(makeSession('free', 'Tir libre', [{ name: 'Tir libre', cue: 'Note chaque tir avec les gros boutons.', plan: { series: 1 } }], 'manual'));
});
$('#videoFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  source = { kind: 'file', url: URL.createObjectURL(f), facing: 'environment' };
  unlock();
  S = makeSession('video', 'Vidéo importée', [{ name: 'Analyse vidéo', cue: '', plan: { series: 1 } }], 'camera');
  S.fileName = f.name; enterLive('camera'); e.target.value = '';
});

// ======================= machine de renvoi =======================
const mcfg = { angles: [0, 45, 90, 135, 180], dists: [4.5], heights: ['poitrine'], per: 10, interval: 3, shuffle: false };
function chip(group, val, label, on) { return `<button class="chip ${on ? 'on' : ''}" data-g="${group}" data-v="${val}" aria-pressed="${on}">${esc(label)}</button>`; }
function renderMachine() {
  $('#presetList').innerHTML = PRESETS.map(p => { const b = buildMachinePlan(p), d = planDuration(b);
    return `<button class="card preset" data-preset="${p.id}"><div class="t"><b>${esc(p.name)}</b><span class="pill">${d.shots} tirs · ~${d.minutes} min</span></div><div class="muted">${esc(p.desc)}</div></button>`; }).join('');
  $('#mAngles').innerHTML = ANGLES.map(a => chip('angles', a.deg, `${String(a.deg).replace('.', ',')}° ${a.label}`, mcfg.angles.includes(a.deg))).join('');
  $('#mDists').innerHTML = DISTANCES.map(d => chip('dists', d.m, `${String(d.m).replace('.', ',')} m · ${d.label}`, mcfg.dists.includes(d.m))).join('');
  $('#mHeights').innerHTML = HEIGHTS.map(h => chip('heights', h.id, h.label, mcfg.heights.includes(h.id))).join('');
  $('#mPer').value = mcfg.per; $('#mInt').value = mcfg.interval; $('#mShuffle').checked = mcfg.shuffle;
  const blocks = buildMachinePlan(mcfg), d = planDuration(blocks);
  $('#mSummary').textContent = blocks.length ? `${blocks.length} positions · ${d.shots} tirs · environ ${d.minutes} min` : 'Choisis au moins un angle, une distance et une hauteur.';
  $('#mPreview').innerHTML = courtSVG(mcfg.angles.flatMap(a => mcfg.dists.map(m => ({ deg: a, m, made: 0, att: 0 }))), { label: 'Positions choisies' });
  $('#mStart').disabled = !blocks.length;
  const heightHint = HEIGHTS.filter(h => mcfg.heights.includes(h.id)).map(h => `${h.label} : ${h.hint}.`).join(' ');
  $('#mHeightHint').textContent = heightHint;
}
$('#v-machine').addEventListener('click', e => {
  const c = e.target.closest('.chip[data-g]');
  if (c) { const g = c.dataset.g, v = g === 'heights' ? c.dataset.v : +c.dataset.v; const a = mcfg[g]; const i = a.indexOf(v); i >= 0 ? a.splice(i, 1) : a.push(v); a.sort((x, y) => (typeof x === 'number' ? x - y : 0)); renderMachine(); return; }
  const pr = e.target.closest('[data-preset]');
  if (pr) { const p = PRESETS.find(x => x.id === pr.dataset.preset); startMachine(p, p.name); }
});
$('#mPer').addEventListener('change', e => { mcfg.per = Math.max(1, Math.min(50, +e.target.value || 10)); renderMachine(); });
$('#mInt').addEventListener('change', e => { mcfg.interval = Math.max(1, Math.min(10, +e.target.value || 3)); renderMachine(); });
$('#mShuffle').addEventListener('change', e => { mcfg.shuffle = e.target.checked; renderMachine(); });
$('#mStart').addEventListener('click', () => startMachine(mcfg, 'Machine · séance perso'));
function startMachine(cfg, title) {
  const blocks = buildMachinePlan(cfg); if (!blocks.length) return;
  const mode = $('#mManual').checked ? 'manual' : 'camera';
  beginCustom(makeSession('machine', title, blocks, mode, { machine: { per: cfg.per, interval: cfg.interval } }));
}

// ======================= défis pros =======================
function renderPro() {
  $('#proList').innerHTML = PRO_DRILLS.map(d => `<article class="card"><div class="eyebrow">${esc(d.source)}</div><div class="h2">${esc(d.name)}</div><p class="muted">${esc(d.desc)}</p>
    <div class="row gap wrap"><button class="btn primary" data-pro="${d.id}" data-mode="${d.camera === false ? 'manual' : 'camera'}">${d.camera === false ? 'Lancer (saisie au doigt)' : 'Lancer avec la caméra'}</button>
    <button class="btn ghost" data-pro="${d.id}" data-mode="manual">Sans caméra</button></div></article>`).join('');
}
$('#proList').addEventListener('click', e => {
  const b = e.target.closest('[data-pro]'); if (!b) return;
  const d = PRO_DRILLS.find(x => x.id === b.dataset.pro);
  beginCustom(makeSession('pro', d.name, d.exercises, b.dataset.mode, { drill: d.id }));
});

// ======================= badges =======================
function renderBadges() {
  const list = evaluateBadges(store.state.sessions);
  const got = list.filter(b => b.level >= 0).length;
  $('#badgeCount').textContent = `${got} / ${list.length} débloqués`;
  const cats = [...new Set(list.map(b => b.cat))];
  $('#badgeBody').innerHTML = cats.map(c => `<section class="card"><div class="h3">${esc(c)}</div><div class="badges">${list.filter(b => b.cat === c).map(badgeHTML).join('')}</div></section>`).join('');
}
function badgeHTML(b) {
  const tier = b.tierName || 'locked';
  const nextTxt = b.next != null ? `${fmtVal(b, b.v)} / ${fmtVal(b, b.next)}` : 'Niveau max';
  return `<div class="badge ${tier}"><div class="medal"><span>${esc(b.icon)}</span></div><div class="bmeta"><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
    <div class="bar"><i style="width:${Math.round(b.progress * 100)}%"></i></div><small class="bnext">${b.tierName ? b.tierName.toUpperCase() + ' · ' : ''}${nextTxt}</small></div></div>`;
}
function fmtVal(b, v) { return b.tiers.length === 1 && b.tiers[0] === 1 ? (v >= 1 ? 'fait' : 'à faire') : Math.round(v).toLocaleString('fr-FR'); }
function checkNewBadges() {
  const list = evaluateBadges(store.state.sessions), fresh = [];
  for (const b of list) for (let l = 0; l <= b.level; l++) { const k = `${b.id}:${l}`; if (!store.state.badges[k]) { store.state.badges[k] = Date.now(); if (l === b.level) fresh.push(b); } }
  save();
  if (fresh.length) {
    const t = fresh.map(b => `${b.name}${b.tierName && b.tiers.length > 1 ? ' (' + b.tierName + ')' : ''}`).join(', ');
    setTimeout(() => { toast(`Badge débloqué : ${t}`, 4500); if (S_().voice) say(`Badge débloqué : ${t}`); sfx.made(); }, 600);
  }
  return fresh;
}

// ======================= dribble =======================
let demoRaf = null;
function renderDribble() {
  $('#routineList').innerHTML = ROUTINES.map(r => `<button class="card preset" data-routine="${r.id}"><div class="t"><b>${esc(r.name)}</b><span class="pill">${r.items.length} exercices</span></div><div class="muted">${esc(r.desc)}</div></button>`).join('');
  $('#drillList').innerHTML = Object.entries(DRILLS).map(([id, d]) => `<article class="card drill"><canvas class="demo" data-anim="${d.anim}" aria-label="Démonstration animée : ${esc(d.name)}"></canvas>
    <div class="dmeta"><div class="h3">${esc(d.name)}</div><p>${esc(d.cue)}</p><p class="muted"><b>Le détail qui compte :</b> ${esc(d.tip)}</p>
    <div class="row gap wrap"><button class="btn primary sm" data-drill="${id}">S'entraîner 30 s</button><a class="btn ghost sm" href="${d.video}" target="_blank" rel="noopener">Tutos vidéo ↗</a></div></div></article>`).join('');
  animateDemos();
}
function demoColors() { const cs = getComputedStyle(document.documentElement); return { ball: cs.getPropertyValue('--ball').trim() || '#F07E33', body: cs.getPropertyValue('--ink').trim() || '#fff', line: cs.getPropertyValue('--line').trim() || '#444' }; }
function animateDemos() {
  cancelAnimationFrame(demoRaf);
  const t0 = performance.now(), col = demoColors();
  const loop = now => {
    const cvs = [...document.querySelectorAll('canvas.demo')].filter(c => c.offsetParent !== null);
    if (!cvs.length) return;
    for (const c of cvs) drawDemo(c, c.dataset.anim, (now - t0) / 1000, col);
    demoRaf = requestAnimationFrame(loop);
  };
  demoRaf = requestAnimationFrame(loop);
}
$('#v-dribble').addEventListener('click', e => {
  const r = e.target.closest('[data-routine]'), d = e.target.closest('[data-drill]');
  if (r) { const R = ROUTINES.find(x => x.id === r.dataset.routine); startDribble(R.name, R.items); }
  else if (d) startDribble(DRILLS[d.dataset.drill].name, [[d.dataset.drill, 30]]);
});

let D = null, dphase = 'idle', dEnds = 0, dTick = null, dCounter = createDribbleCounter(), dLastSpoken = -1, dRaf = null;
async function startDribble(title, items) {
  unlock(); askPersistence();
  const useCam = $('#dCam').checked;
  D = { id: newId(), type: 'dribble', title, date: today(), startedAt: Date.now(), cycle: cycleNo(), mode: useCam ? 'camera' : 'manual', exercises: [],
    drills: items.map(([id, sec]) => ({ id, name: DRILLS[id].name, seconds: sec, count: null, left: null, right: null, best: null })), i: 0 };
  $('#stage').hidden = false; $('#setupUI').hidden = true; $('#liveUI').hidden = true; $('#dribbleUI').hidden = false;
  $('#stage').classList.toggle('manual-mode', !useCam);
  keepAwake(true);
  processor = 'dribble'; analysisHandler = null; closeCamera();
  if (useCam) {
    source = { kind: 'camera', url: null, facing: 'user' };
    try { await ensureCamera(); } catch (e) { toast('Caméra indisponible : le comptage est désactivé.'); D.mode = 'manual'; $('#stage').classList.add('manual-mode'); }
    const c = store.state.calib; dtracker.setOption('motionThr', S_().motionThr); dtracker.setOption('hueTol', S_().hueTol); if (c && c.ball) dtracker.setBallColor(c.ball);
    analysisHandler = dribbleAnalysis;
  }
  clearInterval(dTick); dTick = setInterval(dribbleTick, 150);
  dReady();
  cancelAnimationFrame(dRaf); const t0 = performance.now(), col = { ball: '#F07E33', body: '#FFFFFF', line: 'rgba(255,255,255,.4)' };
  const loop = now => { if ($('#dribbleUI').hidden) return; const d = D && D.drills[D.i]; if (d) drawDemo($('#dDemo'), DRILLS[d.id].anim, (now - t0) / 1000, col); dRaf = requestAnimationFrame(loop); };
  dRaf = requestAnimationFrame(loop);
}
function dribbleAnalysis(img, t, out) {
  if (dphase !== 'running') return;
  if (dCounter.step(out.cands || [], img.width, img.height, t)) {
    const st = dCounter.stats, d = D.drills[D.i];
    d.count = st.count; d.left = st.left; d.right = st.right;
    const r = dCounter.rate(t); if (r > (d.best || 0)) d.best = r;
    renderDribbleLive();
  }
}
function dSet(big, sub, btn) {
  $('#dCenter').hidden = !big && !sub; $('#dBig').textContent = big || ''; $('#dSub').textContent = sub || '';
  const b = $('#dBtn'); b.hidden = !btn; if (btn) { b.textContent = btn[0]; b.onclick = btn[1]; }
}
function dReady() {
  dphase = 'ready'; const d = D.drills[D.i], dd = DRILLS[d.id];
  renderDribbleLive();
  dSet(dd.name, `${d.seconds} s. ${dd.cue}`, ['Go', () => { unlock(); dCountdown(); }]);
}
function dCountdown() { dphase = 'countdown'; dEnds = performance.now() + 5000; dLastSpoken = -1; const d = D.drills[D.i]; if (S_().voice) say(`${d.name}. ${d.seconds} secondes.`, { interrupt: true }); dSet('5', D.drills[D.i].name); }
function dRun() {
  dphase = 'running'; const d = D.drills[D.i]; dEnds = performance.now() + d.seconds * 1000; dCounter.reset();
  if (D.mode === 'camera') { d.count = 0; d.left = 0; d.right = 0; d.best = 0; }
  dSet(null, null); if (S_().beeps) sfx.go(); if (S_().voice) say('Go'); renderDribbleLive();
}
function dEnd() {
  const d = D.drills[D.i]; if (S_().beeps) sfx.end();
  const msg = d.count != null ? `${d.count} rebonds${d.best ? `, ${num(d.best, 1)} par seconde` : ''}.` : 'Exercice terminé.';
  if (S_().voice) say(msg);
  if (D.i + 1 >= D.drills.length) { dphase = 'done'; dSet('Fini', msg); setTimeout(finishDribble, 1500); return; }
  D.i++; dphase = 'rest'; dEnds = performance.now() + 15000; dLastSpoken = -1;
  const nx = D.drills[D.i];
  dSet('15', `${msg}\nRepos. Ensuite : ${nx.name} (${nx.seconds} s). ${DRILLS[nx.id].cue}`, ['Passer le repos', () => { dEnds = performance.now() + 3100; }]);
}
function dribbleTick() {
  if (!D) return;
  const now = performance.now(), remain = Math.max(0, Math.ceil((dEnds - now) / 1000));
  if (dphase === 'countdown' || dphase === 'rest') {
    $('#dBig').textContent = String(remain);
    if (remain !== dLastSpoken) { dLastSpoken = remain; if (remain <= 3 && remain > 0 && S_().beeps) sfx.tick(); }
    if (now >= dEnds) dRun();
  } else if (dphase === 'running') {
    $('#dClock').textContent = fmtClock(remain);
    if (remain !== dLastSpoken) { dLastSpoken = remain; if (remain <= 3 && remain > 0 && S_().beeps) sfx.tick(); if (remain === 10 && S_().voice) say('10 secondes'); }
    if (D.mode === 'camera') $('#dRate').textContent = num(dCounter.rate(), 1);
    else $('#dCount').textContent = remain;
    if (now >= dEnds) dEnd();
  }
}
function renderDribbleLive() {
  const d = D.drills[D.i];
  $('#dName').textContent = d.name; $('#dSub2').textContent = `${D.title} · exercice ${D.i + 1}/${D.drills.length}`;
  $('#dCount').textContent = d.count == null ? d.seconds : d.count;
  $('#dLR').textContent = d.count == null ? 'secondes · au chrono, sans comptage' : `droite ${d.right || 0} · gauche ${d.left || 0}`;
  $('#dribbleUI').querySelector('.lplan').hidden = d.count == null;
  if (dphase !== 'running') $('#dClock').textContent = fmtClock(d.seconds);
}
$('#dStop').addEventListener('click', () => { if (D) finishDribble(); });
function finishDribble() {
  clearInterval(dTick); dphase = 'idle'; analysisHandler = null; processor = 'shot';
  closeCamera(); keepAwake(false); $('#stage').hidden = true; $('#dribbleUI').hidden = true; $('#stage').classList.remove('mirror');
  D.endedAt = Date.now();
  const done = D.drills.filter(d => d.count != null || D.mode === 'manual');
  $('#dsTitle').textContent = D.title;
  $('#dsBody').innerHTML = `<section class="card"><div class="tablebox"><table class="tbl"><thead><tr><th>Exercice</th><th>Durée</th><th>Rebonds</th><th>D / G</th><th>Max /s</th></tr></thead><tbody>${
    D.drills.map(d => `<tr><td>${esc(d.name)}</td><td>${d.seconds} s</td><td>${d.count ?? '–'}</td><td>${d.count == null ? '–' : `${d.right}/${d.left}`}</td><td>${d.best ? num(d.best, 1) : '–'}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint">${D.mode === 'camera' ? 'Rebonds comptés à la caméra frontale. D/G : main droite / main gauche, selon le côté où le ballon touche le sol.' : 'Séance au chrono, sans comptage caméra.'}</p></section>`;
  go('dsummary');
}
$('#dsSave').addEventListener('click', () => {
  if (!D) return; const s = { ...D }; delete s.i; s.note = $('#dsNote').value;
  store.addSession(s); D = null; checkNewBadges(); toast('Routine enregistrée'); go('home'); doSync();
});
$('#dsDiscard').addEventListener('click', () => { D = null; go('dribble'); });
// ======================= démarrage =======================
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
go('home');
doSync();
// premier lancement : 3 écrans pour comprendre en 10 secondes
let obI = 0;
function obShow(i) {
  obI = i; $('#obSlides').style.transform = `translateX(${-100 * i}%)`;
  $$('#obDots i').forEach((d, k) => d.classList.toggle('on', k === i));
  $('#obNext').textContent = i === 2 ? 'Commencer' : 'Suivant';
}
function obDone() { store.setSetting('onboarded', true); $('#onboard').hidden = true; }
if (!S_().onboarded && !store.state.sessions.length && !new URLSearchParams(location.search).has('noob')) { $('#onboard').hidden = false; obShow(0); }
$('#obNext').addEventListener('click', () => { if (obI < 2) obShow(obI + 1); else obDone(); });
$('#obSkip').addEventListener('click', obDone);
window.__shotpro = { rimAuto, tracker, store, get S() { return S; }, get phase() { return phase; }, get D() { return D; }, get dphase() { return dphase; }, get clips() { return clips; } }; // pour les tests
