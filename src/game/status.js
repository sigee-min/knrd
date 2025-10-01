import { elements } from '../ui/elements.js';
import { HUD_ALERT_DEFAULT_DURATION } from './globals.js';

let waveStatusTimer = null;

/**
 * Updates the wave status banner with a message and optional timing rules.
 * @param {string} message
 * @param {{duration?: number, persistent?: boolean}} [options]
 */
function setWaveStatus(message, options = {}) {
  const node = elements.waveStatus;
  if (!node) return;
  const { duration = HUD_ALERT_DEFAULT_DURATION, persistent = false } = options;
  node.textContent = message;
  node.classList.add('is-visible');
  if (waveStatusTimer) {
    clearTimeout(waveStatusTimer);
    waveStatusTimer = null;
  }
  if (!persistent) {
    waveStatusTimer = window.setTimeout(() => {
      node.classList.remove('is-visible');
      waveStatusTimer = null;
    }, Math.max(0, duration));
  }
}

export { setWaveStatus };
