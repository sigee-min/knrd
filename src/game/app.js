import { elements } from '../ui/elements.js';
import { SETTINGS, CAMERA, GAME_STATE, initializeGlobals, updateCameraBounds } from './globals.js';
import {
  registerCommandCallbacks,
  renderCommandPanel,
  onCommandClick,
  onCommandKeyDown,
  onCommandKeyUp,
  handleCommand,
} from './commands.js';
import { preloadCoreAssets } from './assetLoader.js';
import { updateSelectionInfo } from './selection.js';
import { clamp } from './combat.js';
import { setWaveStatus } from './status.js';
import { initAudio, playSound, setSfxVolumePercent } from './audio.js';
import { initYouTubeMiniPlayer, togglePlay as ytTogglePlay, nextVideo as ytNextVideo } from './youtubePlayer.js';
import { configureWorldGeometry } from '../core/world.js';
import { hideGameOverOverlay } from './overlay.js';
import {
  applyCameraSettings as applyCameraSettingsInternal,
  centerCamera as centerCameraInternal,
  panCamera as panCameraInternal,
  updateCameraEdgePan as computeCameraEdgePan,
  handleCameraKey as handleCameraKeyInternal,
  updateCameraKeyboard as computeCameraKeyboard,
} from '../core/cameraController.js';
import {
  applyDifficultyPreset as applyDifficultyPresetInternal,
  updateDifficultyUI as updateDifficultyUIInternal,
  setDifficulty as setDifficultyInternal,
} from '../core/difficulty.js';
import {
  updateHUD,
  updateCameraOverlay,
} from '../core/ui/hud.js';
import {
  updateEnemies,
  updateTowers,
  updateProjectiles,
  handleSpawning,
  endWave,
  summonBossByKey,
  startWave,
} from '../core/gameplay/loop.js';
import { isFullscreen, enterFullscreen, exitFullscreen, toggleFullscreen } from '../core/fullscreen.js';
import {
  updateSettingLabels,
  syncSettingsUI as syncSettingsUIInternal,
  applySettingsFromUI as applySettingsFromUIInternal,
} from '../core/settings.js';
import {
  setPointerTargets,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasMouseEnter,
  onCanvasMouseLeave,
  onCanvasContextMenu,
  onGlobalContextMenu,
} from '../core/input/pointer.js';
import {
  setSceneResizeCallback,
  setScene,
  closeSettings,
} from '../core/scene.js';
import {
  configureKeyboardHandlers,
  onKeyDown,
  onKeyUp,
} from '../core/input/keyboard.js';
import {
  wireOverlayButtons,
  wireMusicControls,
  wireSettingInputs,
} from '../core/ui/bindings.js';
import { startMainLoop } from '../core/update/gameLoop.js';

let canvas;
let ctx;
let minimapCanvas;
let minimapCtx;

// Ship sprites are authored nose-up (facing -Y). Heading offsets in core/constants/gameplay.js
// convert that to the expected direction of travel so vessels point where they are moving.

const battlefieldEl = document.querySelector('.battlefield');
let cameraInitialized = false;

// Generic check if a sprite image (HTMLImageElement or Canvas) is drawable
function isSpriteReady(img) {
  if (!img) return false;
  const isImgEl = (typeof Image !== 'undefined') && img instanceof Image;
  if (isImgEl) {
    return !!(img.complete && img.naturalWidth > 0);
  }
  const w = img.naturalWidth ?? img.width ?? 0;
  const h = img.naturalHeight ?? img.height ?? 0;
  return w > 0 && h > 0;
}

function applyDifficultyPreset(key) {
  return applyDifficultyPresetInternal(key);
}

function updateDifficultyUI() {
  updateDifficultyUIInternal();
}

function setDifficulty(key, { silent = false } = {}) {
  const preset = setDifficultyInternal(key, { silent });
  updateHUD();
  return preset;
}

function applyCameraSettings() {
  applyCameraSettingsInternal();
}

function centerCamera() {
  centerCameraInternal();
}

function panCamera(dx, dy) {
  const changed = panCameraInternal(dx, dy);
  if (changed) {
    updateCameraOverlay();
  }
  return changed;
}

function updateCameraEdgePan(delta) {
  const { dx, dy } = computeCameraEdgePan(delta);
  if (!dx && !dy) return;
  panCamera(dx, dy);
}

function handleAutoFullscreenToggle(enabled) {
  if (enabled) {
    if (GAME_STATE.scene === 'game' && !isFullscreen()) {
      void enterFullscreen().then(() => resizeCanvas());
    }
  } else if (isFullscreen()) {
    void exitFullscreen();
  }
}

function applySettingsFromUI() {
  applySettingsFromUIInternal({ onAutoFullscreenChange: handleAutoFullscreenToggle });
}

function syncSettingsUI() {
  syncSettingsUIInternal();
}

function setupEventListeners() {
  configureKeyboardHandlers({
    toggleFullscreen,
    onResize: resizeCanvas,
    onCameraKey: handleCameraKey,
    onCommandKeyDown,
    onCommandKeyUp,
  });

  if (elements.commandGrid) {
    elements.commandGrid.addEventListener('click', onCommandClick);
    elements.commandGrid.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  const skipButton = elements.waveSkipButton;
  if (skipButton) {
    skipButton.addEventListener('click', () => {
      if (skipButton.disabled) return;
      handleCommand('skip');
    });
  }

  if (elements.commandPanelTitle) {
    elements.commandPanelTitle.addEventListener('click', () => {
      playSound('ui_click', { volume: 0.6, throttleMs: 80 });
      if (GAME_STATE.scene === 'settings') {
        closeSettings(true);
      } else {
        setScene('settings');
      }
    });
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('contextmenu', onCanvasContextMenu);
  canvas.addEventListener('mousedown', onCanvasMouseDown);
  window.addEventListener('mousemove', onCanvasMouseMove);
  window.addEventListener('mouseup', onCanvasMouseUp);
  canvas.addEventListener('mouseenter', onCanvasMouseEnter);
  canvas.addEventListener('mouseleave', onCanvasMouseLeave);

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('fullscreenchange', resizeCanvas);
  document.addEventListener('webkitfullscreenchange', resizeCanvas);
  document.addEventListener('msfullscreenchange', resizeCanvas);
  document.addEventListener('contextmenu', onGlobalContextMenu, { capture: true });

  wireMusicControls({ onToggle: ytTogglePlay, onNext: ytNextVideo });
  wireOverlayButtons({
    setScene,
    closeSettings,
    setDifficulty,
    updateDifficultyUI,
    hideGameOverOverlay,
    setWaveStatus,
    continueInfiniteMode,
  });
  wireSettingInputs({ updateSettingLabels, applySettingsFromUI });
  updateDifficultyUI();
  syncSettingsUI();
}


registerCommandCallbacks({
  onHudUpdate: () => updateHUD(),
  onSelectionChanged: () => updateSelectionInfo(),
  onCloseSettings: (save, targetScene) => closeSettings(save, targetScene),
  onOpenSettings: (scene, options) => setScene(scene, options),
});

function handleCameraKey(code, isDown) {
  const mapping = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };
  if (!mapping[code]) return false;
  handleCameraKeyInternal(code, isDown);
  updateCameraOverlay();
  return true;
}

function continueInfiniteMode() {
  if (!GAME_STATE.awaitingInfiniteChoice) return;
  const nextRound = GAME_STATE.pendingInfiniteRound ?? (GAME_STATE.round + 1);
  GAME_STATE.infiniteMode = true;
  GAME_STATE.awaitingInfiniteChoice = false;
  GAME_STATE.pendingInfiniteRound = null;
  GAME_STATE.scene = 'game';
  GAME_STATE.sceneReturn = 'game';
  GAME_STATE.running = true;
  GAME_STATE.waveActive = false;
  GAME_STATE.round = Math.max(1, nextRound);
  startWave();
  renderCommandPanel();
  updateHUD();
  setWaveStatus('무한 모드 돌입! 끝까지 버텨보세요.', { duration: 3200 });
}

function updateCameraKeyboard(delta) {
  const { dx, dy } = computeCameraKeyboard(delta);
  if (!dx && !dy) return;
  panCamera(dx, dy);
}

function resizeCanvas() {
  if (!canvas || !ctx || !battlefieldEl) return;
  const rect = battlefieldEl.getBoundingClientRect();
  const styles = getComputedStyle(battlefieldEl);
  const borderX = parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
  const borderY = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  const displayWidth = Math.max(480, Math.floor(rect.width - borderX));
  const displayHeight = Math.max(320, Math.floor(rect.height - borderY));
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const physicalWidth = Math.max(1, Math.round(displayWidth * dpr));
  const physicalHeight = Math.max(1, Math.round(displayHeight * dpr));

  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';
  canvas.logicalWidth = displayWidth;
  canvas.logicalHeight = displayHeight;
  if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
    canvas.width = physicalWidth;
    canvas.height = physicalHeight;
  }

  if (typeof ctx.setTransform === "function") {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.scale(dpr, dpr);
  ctx.imageSmoothingEnabled = false;

  updateCameraBounds(canvas);
  applyCameraSettings();
  CAMERA.x = clamp(CAMERA.x, CAMERA.minX, CAMERA.maxX);
  CAMERA.y = clamp(CAMERA.y, CAMERA.minY, CAMERA.maxY);
  if (!cameraInitialized) {
    centerCamera();
    cameraInitialized = true;
  }
  GAME_STATE.pointer.screenX = clamp(GAME_STATE.pointer.screenX, 0, CAMERA.width);
  GAME_STATE.pointer.screenY = clamp(GAME_STATE.pointer.screenY, 0, CAMERA.height);
  GAME_STATE.pointer.inside = false;

  if (minimapCanvas && minimapCtx) {
    const container = minimapCanvas.parentElement;
    if (container) {
      const cs = getComputedStyle(container);
      const padX = parseFloat(cs.paddingLeft || "0") + parseFloat(cs.paddingRight || "0");
      const available = Math.max(200, Math.floor(container.clientWidth - padX));
      const miniWidth = available;
      const miniHeight = Math.max(80, Math.floor(miniWidth / 2));
      const miniDpr = dpr;
      const miniPhysicalWidth = Math.max(1, Math.round(miniWidth * miniDpr));
      const miniPhysicalHeight = Math.max(1, Math.round(miniHeight * miniDpr));
      minimapCanvas.style.width = miniWidth + 'px';
      minimapCanvas.style.height = miniHeight + 'px';
      minimapCanvas.logicalWidth = miniWidth;
      minimapCanvas.logicalHeight = miniHeight;
      if (minimapCanvas.width !== miniPhysicalWidth || minimapCanvas.height !== miniPhysicalHeight) {
        minimapCanvas.width = miniPhysicalWidth;
        minimapCanvas.height = miniPhysicalHeight;
      }
      if (typeof minimapCtx.setTransform === "function") {
        minimapCtx.setTransform(1, 0, 0, 1, 0, 0);
      }
      minimapCtx.scale(miniDpr, miniDpr);
      minimapCtx.imageSmoothingEnabled = false;
    }
  }
  updateHUD();
}




async function initializeGame() {
  canvas = document.getElementById('game-canvas');
  if (!canvas) throw new Error('Game canvas not found');
  ctx = canvas.getContext('2d');
  minimapCanvas = document.getElementById('minimap');
  if (!minimapCanvas) throw new Error('Minimap canvas not found');
  minimapCtx = minimapCanvas.getContext('2d');

  setPointerTargets({ canvas, battlefieldEl });
  setSceneResizeCallback(resizeCanvas);

  initializeGlobals({ canvas, minimapCanvas });
  initAudio();
  try { setSfxVolumePercent(SETTINGS.sfxVolume); } catch (_) {}
  applyDifficultyPreset(GAME_STATE.difficulty || 'normal');
  configureWorldGeometry();
  applyCameraSettings();
  setupEventListeners();

  setWaveStatus('필수 에셋 로딩 중...');
  try {
    await preloadCoreAssets();
    setWaveStatus('에셋 로딩 완료', { duration: 1200 });
  } catch (error) {
    console.error('Asset preload failed', error);
    setWaveStatus('에셋 로딩 실패 · 계속 진행합니다', { duration: 2000 });
  }

  void initYouTubeMiniPlayer({
    containerId: 'yt-player',
    titleElementId: 'yt-title',
    url: 'https://www.youtube.com/watch?v=lzNKijtrqm4&list=RDlzNKijtrqm4&start_radio=1',
    width: 160,
    height: 90,
    autoplay: true,
    volume: SETTINGS.bgmVolume,
    rotationEverySec: 0,
    playlist: [
      'https://www.youtube.com/watch?v=6zU8qCe3Wi0&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=9',
      'https://www.youtube.com/watch?v=0klbXBrm8Bw&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=10',
      'https://www.youtube.com/watch?v=ev7--kNpImM&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=4',
      'https://www.youtube.com/watch?v=3kwdw6EEAwk&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=3',
      'https://www.youtube.com/watch?v=7guX0JWCiVY&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=6',
      'https://www.youtube.com/watch?v=GIrzImYEpsw&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=2',
      'https://www.youtube.com/watch?v=eH7HfilYIwc&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=5',
      'https://www.youtube.com/watch?v=nFn4EcpcFtI&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=7',
      'https://www.youtube.com/watch?v=VCd1fhQOmmY&list=PLBGGxb9ewboPS4pEcl8pdqiqsqOw_vT41&index=11',
    ],
    shuffle: false,
    loop: true,
  });

  requestAnimationFrame((timestamp) => {
    GAME_STATE.lastFrame = timestamp;
    resizeCanvas();
    setScene('lobby', { force: true });
    startMainLoop({
      ctx,
      minimapCtx,
      minimapCanvas,
      handleCameraEdgePan: updateCameraEdgePan,
      handleCameraKeyboard: updateCameraKeyboard,
      renderCommandPanel,
    });
  });
}

export { initializeGame };
