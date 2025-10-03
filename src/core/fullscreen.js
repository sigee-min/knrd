export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

export async function enterFullscreen() {
  try {
    if (isFullscreen()) return true;
    const root = document.documentElement || document.getElementById('app') || document.body;
    const req = root.requestFullscreen
      || root.webkitRequestFullscreen
      || root.msRequestFullscreen;
    if (typeof req === 'function') {
      await req.call(root);
      return true;
    }
  } catch (_) {
    // Ignore policy errors or missing user gestures
  }
  return false;
}

export async function exitFullscreen() {
  try {
    if (!isFullscreen()) return true;
    const exit = document.exitFullscreen
      || document.webkitExitFullscreen
      || document.msExitFullscreen;
    if (typeof exit === 'function') {
      await exit.call(document);
      return true;
    }
  } catch (_) {
    // Ignore failures
  }
  return false;
}

export async function toggleFullscreen() {
  if (isFullscreen()) return exitFullscreen();
  return enterFullscreen();
}
