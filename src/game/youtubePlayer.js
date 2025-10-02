// Lightweight wrapper around YouTube IFrame API for a tiny in-game BGM player.

const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=lzNKijtrqm4&list=RDlzNKijtrqm4&start_radio=1';

let player = null;
let eventPlayer = null;
let eventContainer = null;
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
      if (!player) return;
      const state = player.getPlayerState?.();
      // Only rotate while playing
      if (state === window.YT.PlayerState.PLAYING) {
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
  eventContainer = document.getElementById('yt-event-player') || null;
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
          try {
            player.setVolume(volume);
            // Force unmuted playback on ready (may be blocked by browser policy)
            player.unMute();
            if (autoplay) { try { player.playVideo(); } catch (_) {} }
          } catch (_) {}
          updateTitle();
          setRotationInterval(rotationEverySec);
          resolve(player);
        },
        onStateChange: (ev) => {
          updateTitle();
          if (ev && ev.data === window.YT.PlayerState.ENDED) {
            goNext();
          }
        },
      },
    });

    // Lazy-create event overlay player when container exists
    if (eventContainer && !eventPlayer) {
      try {
        eventPlayer = new YT.Player(eventContainer, {
          width,
          height,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {},
            onStateChange: (ev) => {
              if (ev && ev.data === window.YT.PlayerState.ENDED) {
                hideEventOverlay({ resumeMain: true });
              }
            },
          },
        });
      } catch (_) {}
    }
  });
}

function togglePlay() {
  if (!player) return;
  const state = player.getPlayerState?.();
  if (state === window.YT.PlayerState.PLAYING) {
    try { player.pauseVideo(); } catch (_) {}
  } else {
    try { player.playVideo(); } catch (_) {}
  }
}

function goNext() {
  if (!player) return;
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
    try { player.loadVideoById(id); player.playVideo(); } catch (_) {}
    return;
  }
  try { player.nextVideo(); } catch (_) {}
}

function nextVideo() { goNext(); }

function unmuteAndPlay() {
  if (!player) return;
  try {
    player.unMute();
    player.playVideo();
  } catch (_) {}
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
  try {
    // Snapshot current context
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
  }, ms);
}

function showEventOverlay(videoId, { startSec = 0, endSec = null } = {}) {
  if (!eventContainer || !eventPlayer) return false;
  try {
    // Pause main
    try { player.pauseVideo(); } catch (_) {}
    // Show overlay
    eventContainer.style.display = 'block';
    eventPlayer.unMute();
    if (endSec != null && endSec > 0) {
      eventPlayer.loadVideoById({ videoId, startSeconds: Math.max(0, startSec), endSeconds: endSec });
    } else if (startSec > 0) {
      eventPlayer.loadVideoById({ videoId, startSeconds: Math.max(0, startSec) });
    } else {
      eventPlayer.loadVideoById(videoId);
    }
    eventPlayer.playVideo();
    return true;
  } catch (_) {
    return false;
  }
}

function hideEventOverlay({ resumeMain = true } = {}) {
  if (!eventContainer || !eventPlayer) return;
  try {
    eventPlayer.stopVideo();
  } catch (_) {}
  eventContainer.style.display = 'none';
  if (resumeMain) {
    try { player.playVideo(); } catch (_) {}
  }
}

/**
 * Plays an event video on an overlay player, then hides it and resumes main.
 */
function playEventVideo(urlOrId, opts = {}) {
  const parsed = (typeof urlOrId === 'string' && urlOrId.includes('http')) ? parseYouTubeUrl(urlOrId) : { videoId: String(urlOrId || '') };
  const id = parsed.videoId || '';
  if (!id) return false;
  const startSec = Number.isFinite(opts.startSec) ? opts.startSec : (parsed.startSeconds || 0);
  const endSec = Number.isFinite(opts.endSec) ? opts.endSec : null;
  return showEventOverlay(id, { startSec, endSec });
}

export {
  initYouTubeMiniPlayer,
  togglePlay,
  nextVideo,
  setRotationInterval,
  unmuteAndPlay,
  playTemporaryClip,
  goNext,
  playEventVideo,
  hideEventOverlay,
};
