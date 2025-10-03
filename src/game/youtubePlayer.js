// Lightweight wrapper around YouTube IFrame API for a tiny in-game BGM player.

const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=lzNKijtrqm4&list=RDlzNKijtrqm4&start_radio=1';

let player = null;
let apiReadyPromise = null;
let rotationTimer = null;
let rotationIntervalSec = 0; // disabled by default
let titleTarget = null;
let lastPlaylistSnapshot = null;
let lastVideoSnapshot = null;
let programList = [];
let currentIndex = 0;
let doShuffle = false;
let doLoop = true;
let bgmVolume = 15; // 0..100

let autoplayIntent = false;
let userAutoplayBound = false;
let autoplayRetryTimer = null;

const YT_ORIGIN_RE = /^https:\/\/www\.youtube(?:-nocookie)?\.com\//i;
const PLAYER_READY_INTERVAL_MS = 80;
const PLAYER_READY_ATTEMPTS = 20;

function getPlayerIframe() {
  if (!player || typeof player.getIframe !== 'function') return null;
  try {
    return player.getIframe();
  } catch (_) {
    return null;
  }
}

function isPlayerIframeReady() {
  const iframe = getPlayerIframe();
  if (!iframe) return false;
  const src = iframe.src || '';
  return YT_ORIGIN_RE.test(src);
}

function runWithPlayerReady(callback, attempts = PLAYER_READY_ATTEMPTS) {
  if (typeof callback !== 'function' || !player) return;
  if (isPlayerIframeReady()) {
    try { callback(); } catch (_) {}
    return;
  }
  if (attempts <= 0) return;
  setTimeout(() => runWithPlayerReady(callback, attempts - 1), PLAYER_READY_INTERVAL_MS);
}

function isPlaying() {
  try {
    return player?.getPlayerState?.() === window.YT?.PlayerState?.PLAYING;
  } catch (_) {
    return false;
  }
}

function scheduleAutoplayRetry(delay = 900) {
  if (!autoplayIntent) return;
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    autoplayIntent = false;
    if (autoplayRetryTimer) {
      clearTimeout(autoplayRetryTimer);
      autoplayRetryTimer = null;
    }
    return;
  }
  if (autoplayRetryTimer) {
    clearTimeout(autoplayRetryTimer);
    autoplayRetryTimer = null;
  }
  autoplayRetryTimer = setTimeout(() => {
    runWithPlayerReady(() => {
      if (isPlaying()) return;
      if (!isPlayerIframeReady()) {
        scheduleAutoplayRetry(delay + 300);
        return;
      }
      if (player?.getIframe) {
        try {
          const iframeSrc = player.getIframe().src || '';
          if (!iframeSrc.startsWith('http')) {
            scheduleAutoplayRetry(delay + 300);
            return;
          }
        } catch (_) {
          scheduleAutoplayRetry(delay + 300);
          return;
        }
      }
      try { player.playVideo(); } catch (_) {}
    });
  }, Math.max(120, delay));
}

function bindUserAutoplayNudge() {
  if (userAutoplayBound) return;
  userAutoplayBound = true;
  const handler = () => {
    runWithPlayerReady(() => {
      try { player.unMute(); } catch (_) {}
      try { player.playVideo(); } catch (_) {}
    });
  };
  const opts = { once: true, capture: true };
  window.addEventListener('pointerdown', handler, opts);
  window.addEventListener('keydown', handler, opts);
}

function parseYouTubeUrl(url) {
  try {
    const u = new URL(url);
    let vid = u.searchParams.get('v') || '';
    const list = u.searchParams.get('list') || '';
    // Handle youtu.be short links
    if (!vid && (u.hostname.includes('youtu.be'))) {
      vid = u.pathname.replace(/^\//, '').split('/')[0] || '';
    }
    // Handle shorts URLs
    if (!vid && u.pathname.includes('/shorts/')) {
      const parts = u.pathname.split('/');
      const idx = parts.indexOf('shorts');
      if (idx >= 0 && parts[idx + 1]) vid = parts[idx + 1];
    }
    const tParam = u.searchParams.get('t');
    const t = tParam ? Number(tParam) || 0 : 0;
    return { videoId: vid, playlistId: list, startSeconds: t };
  } catch (_) {
    return { videoId: '', playlistId: '', startSeconds: 0 };
  }
}

function waitForYouTubeApi() {
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      try { prev && prev(); } catch (_) {}
      resolve(window.YT);
    };
  });
  return apiReadyPromise;
}

function updateTitle() {
  if (!titleTarget || !player || !player.getVideoData) return;
  const data = player.getVideoData() || {};
  const title = data.title || '재생 중';
  titleTarget.textContent = title.length > 36 ? `${title.slice(0, 33)}...` : title;
}

function setRotationInterval(seconds) {
  rotationIntervalSec = Math.max(0, Math.floor(seconds || 0));
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
  if (rotationIntervalSec > 0) {
    rotationTimer = setInterval(() => {
      if (!player || !isPlayerIframeReady()) return;
      let state;
      try {
        state = player.getPlayerState?.();
      } catch (_) {
        state = undefined;
      }
      // Only rotate while playing
      if (state === window.YT?.PlayerState?.PLAYING) {
        goNext();
      }
    }, rotationIntervalSec * 1000);
  }
}

async function initYouTubeMiniPlayer({
  containerId = 'yt-player',
  titleElementId = 'yt-title',
  url = DEFAULT_VIDEO_URL,
  width = 160,
  height = 90,
  autoplay = false,
  volume = 15,
  rotationEverySec = 0,
  playlist = undefined,
  shuffle = false,
  loop = true,
} = {}) {
  titleTarget = document.getElementById(titleElementId) || null;
  const { videoId, playlistId } = parseYouTubeUrl(url);
  // Program-driven playlist setup
  programList = Array.isArray(playlist) ? playlist.slice() : [];
  if (programList.length === 0 && videoId) programList = [url];
  programList = programList.map((item) => (typeof item === 'string' && item.includes('http')
    ? (parseYouTubeUrl(item).videoId || item)
    : String(item || '')
  )).filter(Boolean);
  doShuffle = !!shuffle;
  doLoop = !!loop;
  currentIndex = 0;
  autoplayIntent = !!autoplay;
  if (autoplayIntent) {
    bindUserAutoplayNudge();
  }
  const YT = await waitForYouTubeApi();
  return new Promise((resolve) => {
    player = new YT.Player(containerId, {
      width,
      height,
      videoId: (programList[0] || videoId || undefined),
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        controls: 0,
        disablekb: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin,
        // If we manage our own program list, avoid passing YT playlist for full control
        ...(programList.length === 0 && playlistId ? { listType: 'playlist', list: playlistId } : {}),
      },
      events: {
        onReady: () => {
          bgmVolume = volume;
          runWithPlayerReady(() => {
            try { player.setVolume(bgmVolume); } catch (_) {}
            try { player.unMute(); } catch (_) {}
            updateTitle();
            if (autoplayIntent) {
              scheduleAutoplayRetry(300);
            }
          });
          setRotationInterval(rotationEverySec);
          resolve(player);
        },
        onStateChange: (ev) => {
          updateTitle();
          if (ev && ev.data === window.YT.PlayerState.PLAYING) {
            if (autoplayRetryTimer) {
              clearTimeout(autoplayRetryTimer);
              autoplayRetryTimer = null;
            }
          }
          if (ev && ev.data === window.YT.PlayerState.ENDED) {
            goNext();
          }
          if (autoplayIntent && ev && ev.data === window.YT.PlayerState.PAUSED) {
            scheduleAutoplayRetry(1400);
          }
        },
      },
    });

    // Event overlay player removed
  });
}

function togglePlay() {
  if (!player) return;
  runWithPlayerReady(() => {
    const state = player.getPlayerState?.();
    if (state === window.YT?.PlayerState?.PLAYING) {
      try { player.pauseVideo(); } catch (_) {}
      autoplayIntent = false;
      if (autoplayRetryTimer) {
        clearTimeout(autoplayRetryTimer);
        autoplayRetryTimer = null;
      }
    } else {
      try { player.playVideo(); } catch (_) {}
      autoplayIntent = true;
      bindUserAutoplayNudge();
      scheduleAutoplayRetry(400);
    }
  });
}

function goNext() {
  if (!player) return;
  runWithPlayerReady(() => {
    autoplayIntent = true;
    bindUserAutoplayNudge();
    if (programList.length > 0) {
      let nextIdx = currentIndex;
      if (doShuffle && programList.length > 1) {
        do {
          nextIdx = Math.floor(Math.random() * programList.length);
        } while (nextIdx === currentIndex);
      } else {
        nextIdx = currentIndex + 1;
        if (nextIdx >= programList.length) {
          if (!doLoop) return; // stop at end
          nextIdx = 0;
        }
      }
      currentIndex = nextIdx;
      const id = programList[currentIndex];
      try {
        player.loadVideoById(id);
        player.setVolume(bgmVolume);
        player.playVideo();
      } catch (_) {}
      scheduleAutoplayRetry(500);
      return;
    }
    try { player.nextVideo(); } catch (_) {}
    scheduleAutoplayRetry(700);
  });
}

function nextVideo() { goNext(); }

function unmuteAndPlay() {
  if (!player) return;
  runWithPlayerReady(() => {
    autoplayIntent = true;
    bindUserAutoplayNudge();
    try {
      player.unMute();
      player.playVideo();
    } catch (_) {}
    scheduleAutoplayRetry(360);
  });
}

function isBgmPlaying() {
  if (!player || !isPlayerIframeReady()) return false;
  try {
    const state = player.getPlayerState?.();
    return state === window.YT?.PlayerState?.PLAYING;
  } catch (_) {
    return false;
  }
}

function playBgm() {
  if (!player) return;
  runWithPlayerReady(() => {
    autoplayIntent = true;
    bindUserAutoplayNudge();
    try { player.unMute(); } catch (_) {}
    try { player.playVideo(); } catch (_) {}
    scheduleAutoplayRetry(320);
  });
}

function pauseBgm() {
  if (!player) return;
  runWithPlayerReady(() => {
    try { player.pauseVideo(); } catch (_) {}
    autoplayIntent = false;
    if (autoplayRetryTimer) {
      clearTimeout(autoplayRetryTimer);
      autoplayRetryTimer = null;
    }
  });
}

/**
 * Temporarily plays a specific video, then resumes the previous playlist/video.
 * Useful to play longer “effect” tracks via YouTube without keeping them forever.
 */
function playTemporaryClip(urlOrId, durationSec = 5) {
  if (!player) return;
  const id = typeof urlOrId === 'string' && urlOrId.includes('http')
    ? (parseYouTubeUrl(urlOrId).videoId || '')
    : String(urlOrId || '');
  if (!id) return;
  runWithPlayerReady(() => {
    autoplayIntent = true;
    try {
      const playlist = player.getPlaylist?.();
      const index = player.getPlaylistIndex?.();
      const t = player.getCurrentTime?.() || 0;
      lastPlaylistSnapshot = Array.isArray(playlist) && playlist.length > 0 ? { playlist, index, t } : null;
      lastVideoSnapshot = !lastPlaylistSnapshot ? { id: player.getVideoData?.().video_id, t } : null;
      player.loadVideoById(id);
      player.unMute();
    } catch (_) {}
    const ms = Math.max(1000, Math.floor(durationSec * 1000));
    setTimeout(() => {
      runWithPlayerReady(() => {
        try {
          if (lastPlaylistSnapshot) {
            const { playlist, index, t } = lastPlaylistSnapshot;
            player.cuePlaylist(playlist, index, t);
            player.playVideo();
          } else if (lastVideoSnapshot && lastVideoSnapshot.id) {
            player.cueVideoById(lastVideoSnapshot.id, lastVideoSnapshot.t);
            player.playVideo();
          }
        } catch (_) {}
        lastPlaylistSnapshot = null;
        lastVideoSnapshot = null;
        scheduleAutoplayRetry(360);
      });
    }, ms);
    scheduleAutoplayRetry(400);
  });
}

function setBgmVolume(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  bgmVolume = p;
  if (!player) return;
  runWithPlayerReady(() => {
    try { player.setVolume(bgmVolume); } catch (_) {}
  });
}

export {
  initYouTubeMiniPlayer,
  togglePlay,
  nextVideo,
  setRotationInterval,
  unmuteAndPlay,
  isBgmPlaying,
  playBgm,
  pauseBgm,
  playTemporaryClip,
  goNext,
  setBgmVolume,
};
