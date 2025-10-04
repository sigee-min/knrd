import { elements } from '../ui/elements.js';
import { GAME_STATE } from './globals.js';
import { getUsedShipyardCapacity, getTotalShipyardCapacity } from '../systems/shipyard.js';

function showGameOverOverlay(reason, summary = {}) {
  if (!elements.gameOverOverlay) return;
  elements.gameOverOverlay.classList.remove('hidden');
  elements.gameOverOverlay.dataset.mode = summary?.mode || '';
  const showContinue = !!summary?.showContinue;
  const hideRetry = !!summary?.hideRetry;
  const hideLobby = !!summary?.hideLobby;
  const stats = Array.isArray(summary?.stats) ? summary.stats : [];
  if (elements.gameOverTitle) {
    elements.gameOverTitle.textContent = summary?.title ?? '방어 실패';
  }
  if (elements.gameOverMessage) {
    elements.gameOverMessage.textContent = reason || summary?.message || '방어 실패';
  }
  if (elements.gameOverStats) {
    elements.gameOverStats.innerHTML = stats
      .map((stat) => `<div class="stat-row"><span>${stat.label}</span><strong>${stat.value}</strong></div>`)
      .join('');
  }
  elements.gameOverContinue?.classList.toggle('hidden', !showContinue);
  elements.gameOverRetry?.classList.toggle('hidden', hideRetry);
  elements.gameOverLobby?.classList.toggle('hidden', hideLobby);
}

function hideGameOverOverlay() {
  if (elements.gameOverOverlay) {
    elements.gameOverOverlay.classList.add('hidden');
    delete elements.gameOverOverlay.dataset.mode;
  }
  if (elements.gameOverStats) {
    elements.gameOverStats.innerHTML = '';
  }
  elements.gameOverContinue?.classList.add('hidden');
  elements.gameOverRetry?.classList.remove('hidden');
  elements.gameOverLobby?.classList.remove('hidden');
}

function isGameOverOverlayVisible() {
  return !!(elements.gameOverOverlay && !elements.gameOverOverlay.classList.contains('hidden'));
}

function buildGameOverStats(maxWaves) {
  const waveNumber = Math.max(1, Math.min(GAME_STATE.round, maxWaves));
  const usedCapacity = getUsedShipyardCapacity(GAME_STATE.towers);
  const totalCapacity = getTotalShipyardCapacity(GAME_STATE.dockyards);
  return [
    { label: '도달 웨이브', value: `${waveNumber}/${maxWaves}` },
    { label: '조선소', value: `${GAME_STATE.dockyards}개 (용량 ${usedCapacity}/${totalCapacity})` },
    { label: '보유 골드', value: `${GAME_STATE.gold.toLocaleString()}G` },
    { label: '전투 시간', value: `${Math.floor(GAME_STATE.time)}초` },
  ];
}

export { showGameOverOverlay, hideGameOverOverlay, isGameOverOverlayVisible, buildGameOverStats };
