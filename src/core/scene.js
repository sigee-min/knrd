import {
  GAME_STATE,
  SETTINGS,
  CONFIG,
  CAMERA,
  PREP_WAVE_DURATION,
} from '../game/globals.js';
import { elements } from '../ui/elements.js';
import { configureWorldGeometry } from './world.js';
import { applyCameraSettings as applyCameraSettingsInternal, centerCamera as centerCameraInternal } from './cameraController.js';
import { applyDifficultyPreset } from './difficulty.js';
import { updateHUD, updateCameraOverlay } from './ui/hud.js';
import { setWaveStatus } from '../game/status.js';
import { hideGameOverOverlay } from '../game/overlay.js';
import { renderCommandPanel } from '../game/commands.js';
import { resetUnitPoolCache } from '../game/combat.js';
import { updateSelectionInfo } from '../game/selection.js';
import { resetSharedUpgradeLevels } from '../systems/sharedUpgrade.js';
import { startWave } from './gameplay/loop.js';
import { isFullscreen, enterFullscreen, exitFullscreen } from './fullscreen.js';
import { syncSettingsUI as syncSettingsUIInternal, applySettingsFromUI as applySettingsFromUIInternal } from './settings.js';

let resizeCanvasCallback = () => {};

function setSceneResizeCallback(fn) {
  resizeCanvasCallback = typeof fn === 'function' ? fn : () => {};
}

function handleAutoFullscreenToggle(enabled) {
  if (enabled) {
    if (GAME_STATE.scene === 'game' && !isFullscreen()) {
      void enterFullscreen().then(() => resizeCanvasCallback());
    }
  } else if (isFullscreen()) {
    void exitFullscreen();
  }
}

function resetForNewRun() {
  configureWorldGeometry();
  applyDifficultyPreset(GAME_STATE.difficulty || 'normal');
  GAME_STATE.gold = 50;
  GAME_STATE.round = 0;
  GAME_STATE.eraIndex = 0;
  GAME_STATE.pendingEraUpgrades = 0;
  GAME_STATE.waveTimer = PREP_WAVE_DURATION;
  GAME_STATE.spawnAccumulator = 0;
  GAME_STATE.spawnedThisWave = 0;
  GAME_STATE.spawnTarget = 0;
  GAME_STATE.bossCountdown = CONFIG.wave.bossInterval;
  GAME_STATE.isBossWave = false;
  GAME_STATE.bossSpawned = false;
  GAME_STATE.bossSpawnTimer = 0;
  GAME_STATE.running = false;
  GAME_STATE.paused = false;
  GAME_STATE.waveActive = false;
  GAME_STATE.time = 0;
  GAME_STATE.minimapBossAlert = 0;
  GAME_STATE.pendingCommands = [];
  resetUnitPoolCache();
  GAME_STATE.towers = [];
  GAME_STATE.towerIndex = new Map();
  GAME_STATE.enemies = [];
  GAME_STATE.projectiles = [];
  GAME_STATE.floaters = [];
  GAME_STATE.hitBlips = [];
  GAME_STATE.selections.clear();
  GAME_STATE.selectedEnemy = null;
  GAME_STATE.cameraInput = { up: false, down: false, left: false, right: false };
  GAME_STATE.pointer.inside = false;
  GAME_STATE.pointer.screenX = CAMERA.width / 2;
  GAME_STATE.pointer.screenY = CAMERA.height / 2;
  GAME_STATE.showGuide = false;
  GAME_STATE.dragStartScreen = { x: 0, y: 0 };
  GAME_STATE.dragCurrentScreen = { x: 0, y: 0 };
  GAME_STATE.dragStartWorld = { x: 0, y: 0 };
  GAME_STATE.dockyards = 1;
  GAME_STATE.bossMustDie = false;
  GAME_STATE.bossGraceTimer = 0;
  resetSharedUpgradeLevels();
  applyCameraSettingsInternal();
  centerCameraInternal();
  updateSelectionInfo();
  updateHUD();
  setWaveStatus('준비 라운드 대기 중');
  hideGameOverOverlay();
}

function setScene(scene, options = {}) {
  const prev = GAME_STATE.scene;
  const force = !!options.force;
  if (!force && prev === scene && !(scene === 'game' && options.reset)) return;
  hideGameOverOverlay();

  if (scene === 'lobby') {
    GAME_STATE.scene = 'lobby';
    GAME_STATE.sceneReturn = 'lobby';
    GAME_STATE.running = false;
    GAME_STATE.pointer.inside = false;
    if (!options.skipReset) resetForNewRun();
    setWaveStatus('로비 대기');
    syncSettingsUIInternal();
    elements.lobbyOverlay?.classList.remove('hidden');
    elements.settingsOverlay?.classList.add('hidden');
    updateCameraOverlay();
    updateHUD();
    renderCommandPanel(true);
    updateSelectionInfo();
      return;
  }

  if (scene === 'settings') {
    if (prev !== 'settings') {
      GAME_STATE.sceneReturn = prev || 'lobby';
    }
    GAME_STATE.scene = 'settings';
    GAME_STATE.running = false;
    GAME_STATE.pointer.inside = false;
    elements.lobbyOverlay?.classList.add('hidden');
    elements.settingsOverlay?.classList.remove('hidden');
    syncSettingsUIInternal();
    if (elements.settingsToLobbyButton) {
      const showLobbyButton = GAME_STATE.sceneReturn === 'game';
      elements.settingsToLobbyButton.classList.toggle('hidden', !showLobbyButton);
    }
    if (elements.settingsBackButton) {
      elements.settingsBackButton.textContent = GAME_STATE.sceneReturn === 'game' ? '돌아가기' : '뒤로';
    }
    setWaveStatus('설정');
    updateCameraOverlay();
    updateHUD();
    renderCommandPanel(true);
    updateSelectionInfo();
      return;
  }

  if (scene === 'game') {
    elements.lobbyOverlay?.classList.add('hidden');
    elements.settingsOverlay?.classList.add('hidden');
    GAME_STATE.scene = 'game';
    GAME_STATE.sceneReturn = 'game';
    GAME_STATE.pointer.inside = false;
    if (SETTINGS.autoFullscreen && !isFullscreen()) {
      void enterFullscreen().then(() => resizeCanvasCallback());
    }
    const shouldReset = options.reset || (prev !== 'game' && !options.resume);
    if (shouldReset) {
      resetForNewRun();
      startWave(true);
      GAME_STATE.running = true;
      GAME_STATE.paused = false;
    } else if (options.resume) {
      GAME_STATE.running = true;
      if (!GAME_STATE.paused) {
        setWaveStatus('전투 재개');
      }
    } else if (!GAME_STATE.running) {
      GAME_STATE.running = true;
    }
    updateCameraOverlay();
    updateHUD();
    renderCommandPanel(true);
    updateSelectionInfo();
    }
}

function closeSettings(save = true, targetScene) {
  if (save) {
    applySettingsFromUIInternal({ onAutoFullscreenChange: handleAutoFullscreenToggle });
  }
  const next = targetScene || GAME_STATE.sceneReturn || 'lobby';
  if (next === 'game') {
    setScene('game', { resume: true });
  } else {
    setScene('lobby');
  }
}

export {
  setSceneResizeCallback,
  resetForNewRun,
  setScene,
  closeSettings,
};
