// Lightweight audio manager with graceful failure when assets are missing.
// Usage: import { initAudio, playSound } from './audio.js';
// Ensure initAudio() is called once during boot to wire unlock handlers.

const SOUND_FILES = {
  ui_click: 'assets/audios/ui_click.ogg',
  build: 'assets/audios/build.ogg',
  upgrade: 'assets/audios/upgrade.ogg',
  fusion: 'assets/audios/fusion.ogg',
  sell: 'assets/audios/sell.ogg',
  dockyard: 'assets/audios/dockyard.ogg',
  roll: 'assets/audios/roll.ogg',
  era_up: 'assets/audios/era_up.ogg',
  boss_spawn: 'assets/audios/boss_spawn.ogg',
  wave_start: 'assets/audios/wave_start.ogg',
  wave_clear: 'assets/audios/wave_clear.ogg',
  victory: 'assets/audios/victory.ogg',
  game_over: 'assets/audios/game_over.ogg',
  hit: 'assets/audios/hit.ogg',
  explosion: 'assets/audios/explosion.ogg',
};

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

function ensureContext() {
  if (ctx) return ctx;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = CATEGORY_GAIN.master;
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
  const url = SOUND_FILES[key];
  if (!url) {
    buffers.set(key, null);
    return null;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.arrayBuffer();
    // Ensure audio context exists for decoding
    if (!ensureContext()) throw new Error('No AudioContext');
    const buf = await ctx.decodeAudioData(data.slice(0));
    buffers.set(key, buf);
    return buf;
  } catch (_) {
    // If fetch/decode failed (e.g., file:// CORS), fall back to HTMLAudioElement.
    try {
      const el = new Audio();
      el.src = url;
      el.preload = 'auto';
      // Note: MediaElement fallback does not route through WebAudio graph.
      buffers.set(key, el);
      return el;
    } catch (_) {
      buffers.set(key, null);
      return null;
    }
  }
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
    const masterVol = CATEGORY_GAIN.master ?? 1;
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
      void asset.play();
    } catch (_) {}
  }
}

export { initAudio, playSound };
