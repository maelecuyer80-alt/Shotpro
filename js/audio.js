// Sons et voix (mains libres). iOS exige un premier geste : appeler unlock() dans un clic.
let ctx = null, voice = null, unlocked = false;

export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {}
  if (!unlocked && 'speechSynthesis' in window) {
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    pickVoice(); unlocked = true;
  }
}

function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices();
    voice = vs.find(v => /fr[-_]FR/i.test(v.lang) && /Thomas|Amélie|Audrey|Aurélie/i.test(v.name)) || vs.find(v => /^fr/i.test(v.lang)) || null;
  } catch (e) {}
}
if ('speechSynthesis' in window) try { speechSynthesis.onvoiceschanged = pickVoice; } catch (e) {}

export function tone(freq = 880, ms = 120, type = 'sine', gain = 0.25, when = 0) {
  if (!ctx) return;
  try {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
  } catch (e) {}
}

export const sfx = {
  made() { tone(784, 110, 'triangle', 0.3); tone(1175, 160, 'triangle', 0.3, 0.1); },
  miss() { tone(220, 220, 'sawtooth', 0.12); },
  tick() { tone(660, 80, 'square', 0.12); },
  go() { tone(988, 350, 'triangle', 0.35); },
  end() { tone(523, 180, 'triangle', 0.3); tone(392, 260, 'triangle', 0.3, 0.18); },
};

export function say(text, { interrupt = false } = {}) {
  if (!('speechSynthesis' in window)) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR'; if (voice) u.voice = voice; u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (e) {}
}
