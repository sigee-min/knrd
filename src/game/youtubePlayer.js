// Lightweight wrapper around YouTube IFrame API for a tiny in-game BGM player.

const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=lzNKijtrqm4&list=RDlzNKijtrqm4&start_radio=1';

let player = null;
let apiReadyPromise = null;
let rotationTimer = null;
let rotationIntervalSec = 0; // disabled by default
let titleTarget = null;
let lastPlaylistSnapshot = null;
let lastVideoSnapshot = null;

function parseYouTubeUrl(url) {
  try {
    const u = new URL(url);
    const vid = u.searchParams.get('v') || '';
    const list = u.searchParams.get('list') || '';
    return { videoId: vid, playlistId: list };
  } catch (_) {
    return { videoId: '', playlistId: '' };
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
        try { player.nextVideo(); } catch (_) {}
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
} = {}) {
  titleTarget = document.getElementById(titleElementId) || null;
  const { videoId, playlistId } = parseYouTubeUrl(url);
  const YT = await waitForYouTubeApi();
  return new Promise((resolve) => {
    player = new YT.Player(containerId, {
      width,
      height,
      videoId: videoId || undefined,
      playerVars: {
        autoplay: autoplay ? 1 : 0,
        controls: 0,
        disablekb: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: window.location.origin,
        ...(playlistId ? { listType: 'playlist', list: playlistId } : {}),
      },
      events: {
        onReady: () => {
          try {
            player.setVolume(volume);
            // Start muted to satisfy autoplay policies; unmute on user input.
            player.mute();
            if (autoplay) {
              try { player.playVideo(); } catch (_) {}
            }
          } catch (_) {}
          updateTitle();
          setRotationInterval(rotationEverySec);
          resolve(player);
        },
        onStateChange: () => updateTitle(),
      },
    });
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

function nextVideo() {
  if (!player) return;
  try { player.nextVideo(); } catch (_) {}
}

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

export {
  initYouTubeMiniPlayer,
  togglePlay,
  nextVideo,
  setRotationInterval,
  unmuteAndPlay,
  playTemporaryClip,
};
