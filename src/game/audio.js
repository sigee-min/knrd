// Lightweight audio manager with graceful failure when assets are missing.
// Usage: import { initAudio, playSound } from './audio.js';
// Ensure initAudio() is called once during boot to wire unlock handlers.

// You can point to exact files or let the loader try common locations using the key name.
const SOUND_FILES = {
  // UI
  ui_click: 'assets/svg/audios/UI인터렉션.wav',
  // Core actions
  build: 'assets/svg/audios/배생산.wav',
  roll: 'assets/svg/audios/배생산.wav',
  upgrade: 'assets/svg/audios/배강화및배시대업그레이드.wav',
  fusion: 'assets/svg/audios/배강화및배시대업그레이드.wav',
  era_up: 'assets/svg/audios/배강화및배시대업그레이드.wav',
  dockyard: 'assets/svg/audios/배생산.wav',
  sell: 'assets/svg/audios/배판매.wav',
  // Combat impacts
  hit: 'assets/svg/audios/배격침.wav',
  explosion: 'assets/svg/audios/대포맟험포발사.wav',
  // Ally fire
  fire_arrow: 'assets/svg/audios/활및바리스타발사.wav',
  fire_gun: 'assets/svg/audios/소총발사.wav',
  fire_cannon: 'assets/svg/audios/대포맟험포발사.wav',
  // Session events (fallback to UI click to avoid 404 spam)
  boss_spawn: 'assets/svg/audios/UI인터렉션.wav',
  wave_start: 'assets/svg/audios/UI인터렉션.wav',
  wave_clear: 'assets/svg/audios/UI인터렉션.wav',
  victory: 'assets/svg/audios/UI인터렉션.wav',
  game_over: 'assets/svg/audios/UI인터렉션.wav',
};

// Additional common directories and extensions to probe automatically
const SOUND_BASE_DIRS = [
  'assets/audios/',
  'assets/audio/',
  'assets/sfx/',
  'assets/sounds/',
];
// Prefer WAV first as requested; fall back to OGG/MP3 if needed
const SOUND_EXTS = ['.wav', '.ogg', '.mp3'];

function getCandidateUrls(key) {
  const out = [];
  const seen = new Set();
  const direct = SOUND_FILES[key];
  if (Array.isArray(direct)) {
    for (const u of direct) { if (!seen.has(u)) { seen.add(u); out.push(u); } }
  } else if (typeof direct === 'string' && direct) {
    if (!seen.has(direct)) { seen.add(direct); out.push(direct); }
  }
  for (const base of SOUND_BASE_DIRS) {
    for (const ext of SOUND_EXTS) {
      const u = `${base}${key}${ext}`;
      if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
  }
  return out;
}

const SOUND_CATEGORY = {
  ui_click: 'ui',
  build: 'sfx',
  upgrade: 'sfx',
  fusion: 'sfx',
  sell: 'ui',
  dockyard: 'ui',
  roll: 'ui',
  era_up: 'sfx',
  boss_spawn: 'boss',
  wave_start: 'ui',
  wave_clear: 'ui',
  victory: 'boss',
  game_over: 'boss',
  hit: 'impact',
  explosion: 'impact',
};

const CATEGORY_GAIN = {
  master: 0.8,
  ui: 0.4,
  sfx: 0.6,
  impact: 0.35,
  boss: 0.7,
};

let ctx = null;
let masterGain = null;
const categoryGains = new Map();
// Cache: key -> AudioBuffer | HTMLAudioElement | null on failure
const buffers = new Map();
const lastPlayTime = new Map(); // key -> timestamp
const unlocked = { value: false };
let sfxVolumeScalar = 1; // 0..1 scale applied on top of CATEGORY_GAIN.master

function ensureContext() {
  if (ctx) return ctx;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = CATEGORY_GAIN.master * sfxVolumeScalar;
    masterGain.connect(ctx.destination);
    for (const cat of ['ui', 'sfx', 'impact', 'boss']) {
      const g = ctx.createGain();
      g.gain.value = CATEGORY_GAIN[cat] ?? 0.5;
      g.connect(masterGain);
      categoryGains.set(cat, g);
    }
  } catch (_) {
    ctx = null;
  }
  return ctx;
}

function unlockAudio() {
  if (!ctx) return;
  if (unlocked.value) return;
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    unlocked.value = true;
  } catch (_) {}
}

function initAudio() {
  if (!ensureContext()) return;
  const handler = () => unlockAudio();
  window.addEventListener('pointerdown', handler, { once: true, capture: true });
  window.addEventListener('keydown', handler, { once: true, capture: true });
  window.addEventListener('touchstart', handler, { once: true, capture: true });
}

async function loadBuffer(key) {
  if (buffers.has(key)) return buffers.get(key);
  const candidates = getCandidateUrls(key);
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        continue;
      }
      const data = await res.arrayBuffer();
      if (!ensureContext()) throw new Error('No AudioContext');
      const buf = await ctx.decodeAudioData(data.slice(0));
      buffers.set(key, buf);
      return buf;
    } catch (e) {
      // Try HTMLAudioElement fallback for this candidate
      try {
        const el = new Audio();
        const supportOgg = typeof el.canPlayType === 'function' && el.canPlayType('audio/ogg');
        const supportMp3 = typeof el.canPlayType === 'function' && el.canPlayType('audio/mpeg');
        const supportWav = typeof el.canPlayType === 'function' && el.canPlayType('audio/wav');
        if (!supportOgg && !supportMp3 && !supportWav) {
          continue;
        }
        el.preload = 'auto';
        el.src = url;
        try { el.load?.(); } catch (_) {}
        buffers.set(key, el);
        return el;
      } catch (_) {
        // continue to next candidate
      }
    }
  }
  buffers.set(key, null);
  return null;
}

/**
 * Plays a sound key if available.
 * @param {string} key sound id from SOUND_FILES
 * @param {{ volume?: number, rate?: number, throttleMs?: number }} [opts]
 */
async function playSound(key, opts = {}) {
  const now = performance.now();
  const throttleMs = Math.max(0, opts.throttleMs ?? 0);
  const last = lastPlayTime.get(key) || 0;
  if (throttleMs > 0 && now - last < throttleMs) return;
  lastPlayTime.set(key, now);
  const asset = await loadBuffer(key);
  if (!asset) return;

  // WebAudio path
  if (typeof AudioBuffer !== 'undefined' && asset instanceof AudioBuffer) {
    if (!ensureContext()) return;
    const source = ctx.createBufferSource();
    source.buffer = asset;
    if (typeof opts.rate === 'number' && opts.rate > 0) {
      source.playbackRate.value = opts.rate;
    } else if (key === 'hit') {
      // Slight randomization for repeated hits
      source.playbackRate.value = 0.95 + Math.random() * 0.1;
    }
    const gainNode = ctx.createGain();
    const cat = SOUND_CATEGORY[key] || 'sfx';
    const baseCat = categoryGains.get(cat) || masterGain;
    const vol = Math.max(0, Math.min(1, opts.volume ?? 1));
    gainNode.gain.value = vol;
    source.connect(gainNode);
    gainNode.connect(baseCat);
    try { source.start(0); } catch (_) {}
    return;
  }

  // Fallback: HTMLMediaElement (works even when fetch is blocked on file://)
  if (typeof HTMLAudioElement !== 'undefined' && asset instanceof HTMLAudioElement) {
    const cat = SOUND_CATEGORY[key] || 'sfx';
    const baseCatVol = CATEGORY_GAIN[cat] ?? 0.5;
    const masterVol = (CATEGORY_GAIN.master ?? 1) * sfxVolumeScalar;
    const vol = Math.max(0, Math.min(1, (opts.volume ?? 1) * baseCatVol * masterVol));
    try {
      asset.pause();
      asset.currentTime = 0;
      if (typeof opts.rate === 'number' && opts.rate > 0) {
        asset.playbackRate = opts.rate;
      } else if (key === 'hit') {
        asset.playbackRate = 0.95 + Math.random() * 0.1;
      } else {
        asset.playbackRate = 1;
      }
      asset.volume = vol;
      const p = asset.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (_) {}
  }
}

function setSfxVolumePercent(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  sfxVolumeScalar = p / 100;
  if (masterGain) masterGain.gain.value = CATEGORY_GAIN.master * sfxVolumeScalar;
}

export { initAudio, playSound, setSfxVolumePercent };
