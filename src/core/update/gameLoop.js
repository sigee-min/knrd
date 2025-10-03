import { GAME_STATE, CONFIG, MAX_WAVES, CAMERA } from '../../game/globals.js';
import { updateHUD, updateWaveInfo } from '../ui/hud.js';
import { setWaveStatus } from '../../game/status.js';
import { buildGameOverStats, showGameOverOverlay } from '../../game/overlay.js';
import { playSound } from '../../game/audio.js';
import { processCommands } from '../../game/commands.js';
import {
  updateEnemies,
  updateTowers,
  updateProjectiles,
  handleSpawning,
  endWave,
  summonBossByKey,
} from '../gameplay/loop.js';
import { renderScene, renderMinimap } from '../render/sceneRender.js';
import { updateFloaters, updateHitBlips } from '../render/effects.js';

let animationFrameId = null;
let loopBindings = null;

function triggerDefeat(reason, { ctx, minimapCtx, renderCommandPanel: renderCmdPanel } = {}) {
  if (!GAME_STATE.running) return;
  GAME_STATE.running = false;
  GAME_STATE.waveActive = false;
  GAME_STATE.bossMustDie = false;
  GAME_STATE.bossGraceTimer = 0;
  GAME_STATE.pendingCommands = [];
  GAME_STATE.sceneReturn = 'lobby';
  setWaveStatus(reason || '패배', { persistent: true });
  if (typeof renderCmdPanel === 'function') renderCmdPanel(true);
  const stats = buildGameOverStats(MAX_WAVES);
  showGameOverOverlay(reason || '패배', { stats });
  updateHUD();
  playSound('game_over', { volume: 0.8 });
  if (ctx) {
    ctx.fillStyle = '#111621';
    ctx.fillRect(0, 0, CAMERA.width, CAMERA.height);
  }
  if (minimapCtx) {
    minimapCtx.clearRect(0, 0, (minimapCtx.canvas.logicalWidth || minimapCtx.canvas.width), (minimapCtx.canvas.logicalHeight || minimapCtx.canvas.height));
  }
}

function updateGame(delta, helpers) {
  const {
    handleCameraEdgePan,
    handleCameraKeyboard,
    renderCommandPanel: renderCmdPanel,
    triggerDefeat: defeatCallback,
    ctx,
    minimapCtx,
  } = helpers;

  const defeat = typeof defeatCallback === 'function'
    ? (reason) => defeatCallback(reason)
    : (reason) => triggerDefeat(reason, { ctx, minimapCtx, renderCommandPanel: renderCmdPanel });

  if (!GAME_STATE.running) return;
  if (GAME_STATE.scene !== 'game') return;

  if (GAME_STATE.paused) {
    handleCameraEdgePan?.(delta);
    handleCameraKeyboard?.(delta);
    return;
  }

  const scaledDelta = delta * GAME_STATE.speedMultiplier;
  GAME_STATE.time += scaledDelta;

  if (Array.isArray(GAME_STATE.bossSummons)) {
    for (const entry of GAME_STATE.bossSummons) {
      entry.cooldownRemaining = Math.max(0, (entry.cooldownRemaining ?? 0) - scaledDelta);
    }
  }

  GAME_STATE.waveTimer = Math.max(0, GAME_STATE.waveTimer - scaledDelta);
  const bossAlive = GAME_STATE.isBossWave && GAME_STATE.bossMustDie;

  if (GAME_STATE.waveTimer <= 0) {
    if (bossAlive) {
      if (GAME_STATE.bossGraceTimer === 0) {
        setWaveStatus('보스를 처치하세요!');
      }
      const graceDuration = CONFIG.bossGraceDuration ?? 15;
      GAME_STATE.bossGraceTimer = Math.min(graceDuration, GAME_STATE.bossGraceTimer + scaledDelta);
      if (GAME_STATE.bossGraceTimer >= graceDuration) {
        defeat('보스를 처치하지 못했습니다');
        return;
      }
    } else if (GAME_STATE.waveActive) {
      GAME_STATE.bossGraceTimer = 0;
      endWave();
    }
  } else if (GAME_STATE.bossGraceTimer > 0) {
    GAME_STATE.bossGraceTimer = 0;
  }

  renderCmdPanel?.();
  processCommands();

  if (GAME_STATE.nextSummonBossKey) {
    const key = GAME_STATE.nextSummonBossKey;
    GAME_STATE.nextSummonBossKey = null;
    summonBossByKey(key);
    const entry = (GAME_STATE.bossSummons || []).find((e) => e.key === key);
    if (entry) {
      const base = Math.max(0, Math.floor(entry.cooldownBase ?? 0));
      entry.cooldownRemaining = base > 0 ? base : 120;
    }
    setWaveStatus('보스 소환!');
    renderCmdPanel?.();
  }

  handleSpawning(delta);
  updateEnemies(delta);

  for (const enemy of GAME_STATE.enemies) {
    if (enemy.type === 'boss' && enemy.isWaveBoss === false) {
      const aliveFor = GAME_STATE.time - (enemy.spawnAt || GAME_STATE.time);
      if (aliveFor >= 100) {
        defeat('보스 증원 처치 실패');
        return;
      }
    }
  }

  updateTowers(delta);
  updateProjectiles(delta);
  updateFloaters(delta);
  updateHitBlips(delta);
  GAME_STATE.minimapBossAlert = Math.max(0, GAME_STATE.minimapBossAlert - delta);
  handleCameraEdgePan?.(delta);
  handleCameraKeyboard?.(delta);
  if (GAME_STATE.enemies.length >= CONFIG.wave.defeatThreshold) {
    defeat('적 병력 포화!');
  }
}

function renderGameFrame({ ctx, minimapCtx, minimapCanvas }) {
  if (!ctx || !minimapCtx) return;
  ctx.fillStyle = '#111621';
  ctx.fillRect(0, 0, CAMERA.width, CAMERA.height);
  renderScene(ctx);
  renderMinimap(minimapCtx, minimapCanvas);
}

function mainLoop(timestamp) {
  if (!loopBindings) return;
  const {
    ctx,
    minimapCtx,
    minimapCanvas,
    handleCameraEdgePan,
    handleCameraKeyboard,
    renderCommandPanel: renderCmdPanel,
    onDefeat,
  } = loopBindings;

  if (typeof GAME_STATE.lastFrame !== 'number') {
    GAME_STATE.lastFrame = timestamp;
  }
  const deltaMs = Math.max(0, Math.min(200, timestamp - GAME_STATE.lastFrame));
  const delta = deltaMs / 1000;
  GAME_STATE.lastFrame = timestamp;

  updateGame(delta, {
    handleCameraEdgePan,
    handleCameraKeyboard,
    renderCommandPanel: renderCmdPanel,
    triggerDefeat: onDefeat,
    ctx,
    minimapCtx,
  });

  renderGameFrame({ ctx, minimapCtx, minimapCanvas });
  updateHUD();

  animationFrameId = requestAnimationFrame(mainLoop);
}

function startMainLoop(bindings) {
  loopBindings = {
    ctx: bindings?.ctx ?? null,
    minimapCtx: bindings?.minimapCtx ?? null,
    minimapCanvas: bindings?.minimapCanvas ?? null,
    handleCameraEdgePan: bindings?.handleCameraEdgePan,
    handleCameraKeyboard: bindings?.handleCameraKeyboard,
    renderCommandPanel: bindings?.renderCommandPanel,
    onDefeat: bindings?.triggerDefeat,
  };
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  animationFrameId = requestAnimationFrame(mainLoop);
}

export { updateGame, renderGameFrame, triggerDefeat, startMainLoop };
