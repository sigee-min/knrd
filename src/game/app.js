import { elements } from '../ui/elements.js';
import { resetSharedUpgradeLevels } from '../systems/sharedUpgrade.js';
import {
  MAX_WAVES,
  BOSS_GRACE_DURATION,
  EARLY_EASE_ROUNDS,
  EARLY_EASE_MIN,
  EARLY_EASE_STEP,
  SETTINGS,
  CAMERA,
  GAME_STATE,
  CONFIG,
  initializeGlobals,
  updateCameraBounds,
  DIFFICULTY_PRESETS,
  PREP_WAVE_DURATION,
} from './globals.js';
import { showGameOverOverlay, hideGameOverOverlay, isGameOverOverlayVisible, buildGameOverStats } from './overlay.js';
import {
  registerCommandCallbacks,
  renderCommandPanel,
  refreshCommandStates,
  handleCommand,
  processCommands,
  onCommandClick,
  onCommandKeyDown,
  onCommandKeyUp,
} from './commands.js';
import {
  updateSelectionInfo,
  applyDragSelection,
  handleDoubleClickSelection,
  selectEnemyAtWorldPosition,
  selectTowerAtWorldPosition,
} from './selection.js';
import {
  orderSelectedTowers,
  clamp,
  clampToInnerRing,
  getRollCost,
  ERA_ORDER,
  lcgRandom,
  nextId,
  getDockyardUsage,
} from './combat.js';
import { setWaveStatus } from './status.js';
import { getProjectileStyle } from './projectileStyles.js';
import { PROJECTILE_TYPES, PROJECTILE_DEFAULTS } from '../constants/projectiles.js';
import { ENEMY_LIBRARY } from '../data/enemyLibrary.js';
import { getEnemySprite } from './enemySprites.js';
import { getBossSprite } from './bossSprites.js';
import { getTowerSprite } from './shipSprites.js';
import { initAudio, playSound, setSfxVolumePercent } from './audio.js';
import { initYouTubeMiniPlayer, togglePlay as ytTogglePlay, nextVideo as ytNextVideo, playEventVideo, hideEventOverlay, setBgmVolume } from './youtubePlayer.js';

let canvas;
let ctx;
let minimapCanvas;
let minimapCtx;

// Sprite default art faces to the right (0 rad). If visuals appear reversed in motion,
// apply a global heading offset. Using Math.PI flips orientation by 180 degrees.
// Now that ship assets are rotated at load, only enemies keep 180° offset.
const TOWER_HEADING_OFFSET = 0;
const ENEMY_HEADING_OFFSET = Math.PI;

function getEarlyWaveEase(round) {
  if (round <= EARLY_EASE_ROUNDS) {
    const eased = EARLY_EASE_MIN + (round - 1) * EARLY_EASE_STEP;
    return Math.min(1, Math.max(EARLY_EASE_MIN, eased));
  }
  return 1;
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

async function enterFullscreen() {
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
  } catch (e) {
    // Ignore; browser may block without user gesture
  }
  return false;
}

async function exitFullscreen() {
  try {
    if (!isFullscreen()) return true;
    const exit = document.exitFullscreen
      || document.webkitExitFullscreen
      || document.msExitFullscreen;
    if (typeof exit === 'function') {
      await exit.call(document);
      return true;
    }
  } catch (e) {}
  return false;
}

async function toggleFullscreen() {
  if (isFullscreen()) return exitFullscreen();
  return enterFullscreen();
}

const WORLD = {
  width: 2400,
  height: 1200,
};

const battlefieldEl = document.querySelector('.battlefield');
let cameraInitialized = false;

const EDGE_PAN_VERTICAL_FACTOR = 0.5;

const RARITY_COLOR = {
  common: '#8aa0b8',
  rare: '#5aa1e3',
  unique: '#9b59b6',
  legendary: '#f39c12',
  mythic: '#e74c3c',
  primordial: '#2ecc71',
};

const RARITY_FLOOR_STYLES = {
  common: { color: '#8aa0b8', alpha: 0.28, radius: 18, sparkle: 1, sparkleSize: 1.0, sparkleAlpha: 1.0 },
  rare: { color: '#5aa1e3', alpha: 0.34, radius: 20, sparkle: 3, sparkleSize: 1.2, sparkleAlpha: 1.1 },
  unique: { color: '#9b59b6', alpha: 0.38, radius: 22, sparkle: 4, sparkleSize: 1.35, sparkleAlpha: 1.2 },
  legendary: { color: '#f39c12', alpha: 0.44, radius: 24, sparkle: 5, sparkleSize: 1.5, sparkleAlpha: 1.3 },
  mythic: { color: '#e74c3c', alpha: 0.5, radius: 25, sparkle: 6, sparkleSize: 1.7, sparkleAlpha: 1.4 },
  primordial: { color: '#2ecc71', alpha: 0.54, radius: 26, sparkle: 7, sparkleSize: 1.9, sparkleAlpha: 1.5 },
};

const FUSION_AURA_STYLES = [
  null,
  { color: '#3fd1ff', glow: 'rgba(63, 209, 255, 0.28)', particles: 6, pulse: 0.16, particleScale: 0.6, radiusScale: 0.4 },
  { color: '#f6ff8a', glow: 'rgba(246, 255, 138, 0.3)', particles: 8, pulse: 0.2, particleScale: 0.6, radiusScale: 0.4 },
  { color: '#ff8dd6', glow: 'rgba(255, 141, 214, 0.34)', particles: 10, pulse: 0.26, particleScale: 0.6, radiusScale: 0.4 },
];

function withAlpha(color, alpha) {
  if (!color) return `rgba(255, 255, 255, ${alpha})`;
  const normalized = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((ch) => ch + ch).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${normalized})`;
  }
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (match) {
    const parts = match[1].split(',').map((part) => part.trim());
    const [r = '255', g = '255', b = '255'] = parts;
    return `rgba(${r}, ${g}, ${b}, ${normalized})`;
  }
  return color;
}

// Angle helpers for smooth sprite heading
function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function moveAngleTowards(current, target, maxStep) {
  const delta = normalizeAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

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

function rollDamage(baseDamage) {
  const variance = 0.9 + lcgRandom() * 0.2;
  return baseDamage * variance;
}

function dealDamage(enemy, rawAmount, style, hits = 1) {
  if (!enemy || hits <= 0) return 0;
  let total = 0;
  spawnHitBlip(enemy.x, enemy.y, style);
  for (let i = 0; i < hits; i += 1) {
    if (enemy.hp <= 0) break;
    const mitigation = enemy.defense ?? 0;
    const applied = Math.max(1, Math.round(rawAmount - mitigation));
    enemy.hp -= applied;
    total += applied;
    spawnDamageFloater(enemy.x, enemy.y, applied, style);
    if (enemy.hp <= 0) {
      handleEnemyDeath(enemy);
      break;
    }
  }
  return total;
}

function projectAngleToSquare(angle, halfSize) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const denom = Math.max(Math.abs(cos), Math.abs(sin)) || 1;
  const scale = halfSize / denom;
  return {
    x: cos * scale,
    y: sin * scale,
  };
}

function applyDifficultyPreset(key) {
  const preset = DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.normal;
  GAME_STATE.difficulty = preset.id;
  GAME_STATE.difficultyMultiplier = preset.hpMultiplier;
  return preset;
}

function updateDifficultyUI() {
  if (!elements) return;
  const current = GAME_STATE.difficulty || 'normal';
  const preset = DIFFICULTY_PRESETS[current] || DIFFICULTY_PRESETS.normal;
  if (Array.isArray(elements.difficultyButtons)) {
    elements.difficultyButtons.forEach((button) => {
      if (!button) return;
      const { difficulty } = button.dataset || {};
      button.classList.toggle('is-active', difficulty === preset.id);
    });
  }
  if (elements.difficultyLabel) {
    elements.difficultyLabel.textContent = preset.label;
  }
  if (elements.difficultySummary) {
    const hpText = Math.round(preset.hpMultiplier * 100);
    const summary = preset.summary ? ` · ${preset.summary}` : '';
    elements.difficultySummary.textContent = `적 체력 ${hpText}%${summary}`;
  }
}

function setDifficulty(key, { silent = false } = {}) {
  const preset = applyDifficultyPreset(key);
  updateDifficultyUI();
  if (!silent) {
    const hpText = Math.round(preset.hpMultiplier * 100);
    setWaveStatus(`난이도 설정: ${preset.label} (적 체력 ${hpText}%)`, { duration: 1600 });
  }
  updateHUD();
}

function configureWorldGeometry() {
  CONFIG.battlefield.width = WORLD.width;
  CONFIG.battlefield.height = WORLD.height;
  CONFIG.grid.width = CONFIG.grid.cols * CONFIG.grid.cellSize;
  CONFIG.grid.height = CONFIG.grid.rows * CONFIG.grid.cellSize;
  CONFIG.grid.offsetX = Math.floor((WORLD.width - CONFIG.grid.width) / 2);
  CONFIG.grid.offsetY = Math.floor((WORLD.height - CONFIG.grid.height) / 2);
  const baseOrbitRadius = Math.min(CONFIG.grid.width, CONFIG.grid.height) * 0.42;
  const orbitScale = 0.96; // keep battlefield square tighter (80% of previous size)
  CONFIG.orbit.radius = baseOrbitRadius * orbitScale;
  CONFIG.innerOrbitRadius = baseOrbitRadius * 0.9 * orbitScale;
  CONFIG.orbit.centerX = WORLD.width / 2;
  CONFIG.orbit.centerY = WORLD.height / 2;
}

function applyCameraSettings() {
  CAMERA.pointerSensitivity = SETTINGS.pointerSensitivity;
  CAMERA.panSpeed = CAMERA.basePanSpeed * SETTINGS.panSpeedMultiplier;
  CAMERA.minX = 0;
  CAMERA.minY = 0;
  CAMERA.maxX = Math.max(0, WORLD.width - CAMERA.width);
  CAMERA.maxY = Math.max(0, WORLD.height - CAMERA.height);
  CAMERA.edgeZone = Math.min(120, Math.min(CAMERA.width, CAMERA.height) * 0.12);
}

function getSpawnTargetForRound(round) {
  if (round <= 0) return 0;
  const base = CONFIG.wave.spawnCountBase ?? CONFIG.wave.spawnCount ?? 40;
  const growth = CONFIG.wave.spawnCountGrowth ?? 0;
  return Math.max(1, Math.floor(base + (round - 1) * growth));
}

function getEnemyEraForRound(round) {
  if (round <= 10) return '초기';
  if (round <= 20) return '조선';
  if (round <= 30) return '근대';
  return '현대';
}

function pickEnemyArchetype(round) {
  const era = getEnemyEraForRound(round);
  const list = ENEMY_LIBRARY[era] || [];
  if (list.length === 0) return null;
  const idx = Math.floor(lcgRandom() * list.length);
  return { era, def: list[idx] };
}

function centerCamera() {
  CAMERA.x = clamp((WORLD.width - CAMERA.width) / 2, CAMERA.minX, CAMERA.maxX);
  CAMERA.y = clamp((WORLD.height - CAMERA.height) / 2, CAMERA.minY, CAMERA.maxY);
}

function panCamera(dx, dy) {
  if (!dx && !dy) return;
  const nextX = clamp(CAMERA.x + dx, CAMERA.minX, CAMERA.maxX);
  const nextY = clamp(CAMERA.y + dy, CAMERA.minY, CAMERA.maxY);
  if (nextX === CAMERA.x && nextY === CAMERA.y) return;
  CAMERA.x = nextX;
  CAMERA.y = nextY;
  updateCameraOverlay();
}

function updateCameraEdgePan(delta) {
  if (!GAME_STATE.pointer.inside) return;
  const zone = CAMERA.edgeZone || 60;
  let dx = 0;
  let dy = 0;
  if (GAME_STATE.pointer.screenX < zone) dx -= 1;
  else if (GAME_STATE.pointer.screenX > CAMERA.width - zone) dx += 1;
  const verticalZone = Math.max(8, zone * EDGE_PAN_VERTICAL_FACTOR);
  if (GAME_STATE.pointer.screenY < verticalZone) dy -= 1;
  else if (GAME_STATE.pointer.screenY > CAMERA.height - verticalZone) dy += 1;
  if (dx || dy) {
    const length = Math.hypot(dx, dy) || 1;
    const speed = CAMERA.panSpeed * delta * GAME_STATE.speedMultiplier;
    panCamera((dx / length) * speed, (dy / length) * speed);
  }
}

function getPointerPositions(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const screenX = (event.clientX - rect.left) * scaleX;
  const screenY = (event.clientY - rect.top) * scaleY;
  return {
    screenX,
    screenY,
    worldX: screenX + CAMERA.x,
    worldY: screenY + CAMERA.y,
  };
}

function updatePointerPosition(screenX, screenY) {
  GAME_STATE.pointer.screenX = clamp(screenX, 0, CAMERA.width);
  GAME_STATE.pointer.screenY = clamp(screenY, 0, CAMERA.height);
  GAME_STATE.pointer.inside = true;
  updateCameraOverlay();
  updateCustomCursor();
}

function onCanvasMouseDown(event) {
  if (GAME_STATE.commandMode === 'boss') {
    // Clicking the battlefield exits the boss summon menu
    GAME_STATE.commandMode = 'main';
    renderCommandPanel(true);
    return;
  }
  if (event.button !== 0) return;
  const positions = getPointerPositions(event);
  if (event.detail === 2) {
    GAME_STATE.dragSelecting = false;
    handleDoubleClickSelection(positions.worldX, positions.worldY);
    return;
  }
  if (event.detail > 2) return;
  GAME_STATE.dragSelecting = true;
  GAME_STATE.dragAdditive = event.shiftKey;
  GAME_STATE.dragToggle = event.ctrlKey || event.metaKey;
  GAME_STATE.dragStartScreen = { x: positions.screenX, y: positions.screenY };
  GAME_STATE.dragCurrentScreen = { x: positions.screenX, y: positions.screenY };
  GAME_STATE.dragStartWorld = { x: positions.worldX, y: positions.worldY };
  updatePointerPosition(positions.screenX, positions.screenY);
}

function onCanvasMouseMove(event) {
  const positions = getPointerPositions(event);
  updatePointerPosition(positions.screenX, positions.screenY);
  if (GAME_STATE.dragSelecting) {
    GAME_STATE.dragCurrentScreen = { x: positions.screenX, y: positions.screenY };
  }
}

function onCanvasMouseUp(event) {
  if (!GAME_STATE.dragSelecting) return;
  const positions = getPointerPositions(event);
  GAME_STATE.dragCurrentScreen = { x: positions.screenX, y: positions.screenY };
  GAME_STATE.dragSelecting = false;
  applyDragSelection();
}

function updateSettingLabels() {
  if (elements.settingSensitivity && elements.settingSensitivityValue) {
    elements.settingSensitivityValue.textContent = Number(elements.settingSensitivity.value).toFixed(1);
  }
  if (elements.settingPanSpeed && elements.settingPanSpeedValue) {
    elements.settingPanSpeedValue.textContent = Number(elements.settingPanSpeed.value).toFixed(1);
  }
  if (elements.settingBgmVolume && elements.settingBgmVolumeValue) {
    elements.settingBgmVolumeValue.textContent = `${Math.round(Number(elements.settingBgmVolume.value) || 0)}`;
  }
  if (elements.settingSfxVolume && elements.settingSfxVolumeValue) {
    elements.settingSfxVolumeValue.textContent = `${Math.round(Number(elements.settingSfxVolume.value) || 0)}`;
  }
}

function syncSettingsUI() {
  if (!elements.settingInterest) return;
  elements.settingInterest.checked = SETTINGS.interestEnabled;
  if (elements.settingAutoFullscreen) {
    elements.settingAutoFullscreen.checked = SETTINGS.autoFullscreen;
  }
  if (elements.settingSensitivity) {
    elements.settingSensitivity.value = SETTINGS.pointerSensitivity.toFixed(1);
  }
  if (elements.settingPanSpeed) {
    elements.settingPanSpeed.value = SETTINGS.panSpeedMultiplier.toFixed(1);
  }
  if (elements.settingBgmVolume) {
    elements.settingBgmVolume.value = `${Math.round(SETTINGS.bgmVolume)}`;
  }
  if (elements.settingSfxVolume) {
    elements.settingSfxVolume.value = `${Math.round(SETTINGS.sfxVolume)}`;
  }
  updateSettingLabels();
}

function applySettingsFromUI() {
  if (!elements.settingInterest) return;
  SETTINGS.interestEnabled = !!elements.settingInterest.checked;
  const prevAutoFullscreen = SETTINGS.autoFullscreen;
  if (elements.settingAutoFullscreen) {
    SETTINGS.autoFullscreen = !!elements.settingAutoFullscreen.checked;
  }
  if (elements.settingSensitivity) {
    SETTINGS.pointerSensitivity = parseFloat(elements.settingSensitivity.value) || SETTINGS.pointerSensitivity;
  }
  if (elements.settingPanSpeed) {
    SETTINGS.panSpeedMultiplier = parseFloat(elements.settingPanSpeed.value) || SETTINGS.panSpeedMultiplier;
  }
  if (elements.settingBgmVolume) {
    const v = Math.max(0, Math.min(100, Math.round(Number(elements.settingBgmVolume.value) || SETTINGS.bgmVolume)));
    SETTINGS.bgmVolume = v;
    setBgmVolume(v);
  }
  if (elements.settingSfxVolume) {
    const v = Math.max(0, Math.min(100, Math.round(Number(elements.settingSfxVolume.value) || SETTINGS.sfxVolume)));
    SETTINGS.sfxVolume = v;
    setSfxVolumePercent(v);
  }
  GAME_STATE.interestEnabled = SETTINGS.interestEnabled;
  applyCameraSettings();
  if (SETTINGS.autoFullscreen !== prevAutoFullscreen) {
    if (SETTINGS.autoFullscreen && GAME_STATE.scene === 'game' && !isFullscreen()) {
      void enterFullscreen().then(() => resizeCanvas());
    }
    if (!SETTINGS.autoFullscreen && isFullscreen()) {
      void exitFullscreen().then(() => resizeCanvas());
    }
  }
  updateSettingLabels();
  updateCameraOverlay();
  updateHUD();
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
  GAME_STATE.towers = [];
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
  GAME_STATE.interestEnabled = SETTINGS.interestEnabled;
  GAME_STATE.dockyards = 1;
  GAME_STATE.bossMustDie = false;
  GAME_STATE.bossGraceTimer = 0;
  resetSharedUpgradeLevels();
  applyCameraSettings();
  centerCamera();
  updateSelectionInfo();
  updateHUD();
  setWaveStatus('준비 라운드 대기 중');
  updateCustomCursor();
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
    updateDifficultyUI();
    elements.lobbyOverlay?.classList.remove('hidden');
    elements.settingsOverlay?.classList.add('hidden');
    updateCameraOverlay();
    updateHUD();
    renderCommandPanel(true);
    updateSelectionInfo();
    updateCustomCursor();
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
    syncSettingsUI();
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
    updateCustomCursor();
    return;
  }

  if (scene === 'game') {
    elements.lobbyOverlay?.classList.add('hidden');
    elements.settingsOverlay?.classList.add('hidden');
    GAME_STATE.scene = 'game';
    GAME_STATE.sceneReturn = 'game';
    GAME_STATE.pointer.inside = false;
    if (SETTINGS.autoFullscreen && !isFullscreen()) {
      void enterFullscreen().then(() => resizeCanvas());
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
    updateCustomCursor();
  }
}

function closeSettings(save = true, targetScene) {
  if (save) applySettingsFromUI();
  const next = targetScene || GAME_STATE.sceneReturn || 'lobby';
  if (next === 'game') {
    setScene('game', { resume: true });
  } else {
    setScene('lobby');
  }
}

registerCommandCallbacks({
  onHudUpdate: () => updateHUD(),
  onSelectionChanged: () => updateSelectionInfo(),
  onCloseSettings: (save, targetScene) => closeSettings(save, targetScene),
  onOpenSettings: (scene, options) => setScene(scene, options),
  onGuideToggle: () => updateCustomCursor(),
});

function handleCameraKey(code, isDown) {
  const mapping = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };
  const dir = mapping[code];
  if (!dir) return false;
  GAME_STATE.cameraInput[dir] = isDown;
  updateCameraOverlay();
  return true;
}

function updateCameraKeyboard(delta) {
  const input = GAME_STATE.cameraInput;
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (!dx && !dy) return;
  const length = Math.hypot(dx, dy) || 1;
  const speed = CAMERA.panSpeed * delta;
  panCamera((dx / length) * speed, (dy / length) * speed);
}

function resizeCanvas() {
  if (!canvas || !ctx || !battlefieldEl) return;
  const rect = battlefieldEl.getBoundingClientRect();
  const styles = getComputedStyle(battlefieldEl);
  const borderX = parseFloat(styles.borderLeftWidth) + parseFloat(styles.borderRightWidth);
  const borderY = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth);
  const displayWidth = Math.max(480, Math.floor(rect.width - borderX));
  const displayHeight = Math.max(320, Math.floor(rect.height - borderY));
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.width = displayWidth;
  canvas.height = displayHeight;
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
  // Resize minimap canvas to maintain 2:1 rectangular ratio and match panel width
  if (minimapCanvas && minimapCtx) {
    const container = minimapCanvas.parentElement;
    if (container) {
      const cs = getComputedStyle(container);
      const padX = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
      const available = Math.max(200, Math.floor(container.clientWidth - padX));
      const miniWidth = available;
      const miniHeight = Math.max(80, Math.floor(miniWidth / 2));
      minimapCanvas.style.width = `${miniWidth}px`;
      minimapCanvas.style.height = `${miniHeight}px`;
      minimapCanvas.width = miniWidth;
      minimapCanvas.height = miniHeight;
    }
  }
  updateHUD();
  updateCustomCursor();
}

function onCanvasMouseEnter(event) {
  const positions = getPointerPositions(event);
  updatePointerPosition(positions.screenX, positions.screenY);
}

function onCanvasMouseLeave() {
  GAME_STATE.pointer.inside = false;
  updateCameraOverlay();
  updateCustomCursor();
}

function spawnEnemy() {
  const pattern = getCurrentPattern();
  const angle = lcgRandom() * Math.PI * 2;
  spawnEnemyWithPattern(pattern, angle, CONFIG.orbit.radius, 0);
}

function spawnBoss() {
  const angle = lcgRandom() * Math.PI * 2;
  const stats = scaleBossStats();
  const era = getEnemyEraForRound(GAME_STATE.round);
  const bossKey = (
    era === '초기' ? 'boss_ancient_galley' :
    era === '조선' ? 'boss_atakebune' :
    era === '근대' ? 'boss_armored_cruiser' :
    'boss_missile_leader'
  );
  const boss = {
    id: nextId(),
    type: 'boss',
    angle,
    angularSpeed: stats.angularSpeed,
    radius: CONFIG.orbit.radius * 0.9,
    hp: stats.hp,
    maxHp: stats.hp,
    reward: CONFIG.wave.bossReward,
    size: 28,
    abilityCooldown: 3,
    defense: stats.defense,
    era,
    bossKey,
    spawnAt: GAME_STATE.time,
    isWaveBoss: true,
    waveLevel: GAME_STATE.round,
  };
  updateEnemyPosition(boss);
  GAME_STATE.enemies.push(boss);
  GAME_STATE.bossSpawned = true;
  GAME_STATE.bossMustDie = true;
  GAME_STATE.bossGraceTimer = 0;
  GAME_STATE.minimapBossAlert = 2.5;
  setWaveStatus('보스 출현!');
  // Loud cue for boss spawn
  playSound('boss_spawn', { volume: 0.9 });
  // Play event clip overlay for 20~25s segment
  try {
    playEventVideo('https://www.youtube.com/shorts/6j_w126Mecs', { startSec: 20, endSec: 25 });
  } catch (_) {}
}

function getBossEraForKey(key) {
  if (!key) return '초기';
  if (key.includes('ancient')) return '초기';
  if (key.includes('atakebune')) return '조선';
  if (key.includes('cruiser') || key.includes('armored')) return '근대';
  return '현대';
}

function summonBossByKey(bossKey) {
  const angle = lcgRandom() * Math.PI * 2;
  const stats = scaleBossStats();
  const era = getBossEraForKey(bossKey);
  const entry = (GAME_STATE.bossSummons || []).find((e) => e.key === bossKey);
  const boss = {
    id: nextId(),
    type: 'boss',
    angle,
    angularSpeed: stats.angularSpeed,
    radius: CONFIG.orbit.radius * 0.9,
    hp: stats.hp,
    maxHp: stats.hp,
    reward: CONFIG.wave.bossReward,
    size: 28,
    abilityCooldown: 3,
    defense: stats.defense,
    era,
    bossKey,
    spawnAt: GAME_STATE.time,
    isWaveBoss: false,
    summonLevel: entry?.level ?? 1,
  };
  updateEnemyPosition(boss);
  GAME_STATE.enemies.push(boss);
  GAME_STATE.minimapBossAlert = 2.0;
}

function scaleEnemyStats() {
  const round = Math.max(1, GAME_STATE.round);
  const roundFactor = 1 + (round - 1) * 0.18;
  const ease = getEarlyWaveEase(round);
  const baseDefense = (CONFIG.wave.baseDefense ?? 0) + (round - 1) * (CONFIG.wave.defenseGrowth ?? 0);
  const hpMultiplier = GAME_STATE.difficultyMultiplier ?? 1;
  return {
    hp: 150 * roundFactor * ease * hpMultiplier,
    angularSpeed: 0.35 + (round - 1) * 0.02,
    defense: baseDefense * ease,
  };
}

function scaleBossStats(roundOverride) {
  const round = Math.max(1, roundOverride ?? GAME_STATE.round);
  const difficulty = Math.max(1, Math.floor(round / CONFIG.wave.bossInterval));
  const roundScaling = 1 + (round - 1) * 0.12;
  const ease = getEarlyWaveEase(round);
  const hpMultiplier = GAME_STATE.difficultyMultiplier ?? 1;
  return {
    hp: 4000 * difficulty * roundScaling * ease * hpMultiplier,
    angularSpeed: 0.25 + difficulty * 0.01,
    defense:
      ((CONFIG.wave.baseBossDefense ?? CONFIG.wave.baseDefense ?? 0) +
        (difficulty - 1) * (CONFIG.wave.bossDefenseGrowth ?? CONFIG.wave.defenseGrowth ?? 0)) *
      ease,
  };
}

function computeBossRewardByLevel(level) {
  // Returns extra essence and bonus gold based on boss level milestones
  // Mapping:
  // 1 -> essence 1
  // 10 -> essence 1, +20G
  // 20 -> essence 2
  // 30 -> essence 2, +30G
  // 40 -> essence 3
  let essence = 1;
  let goldBonus = 0;
  if (level >= 40) {
    essence = 3;
    goldBonus = 0;
  } else if (level >= 30) {
    essence = 2;
    goldBonus = 30;
  } else if (level >= 20) {
    essence = 2;
    goldBonus = 0;
  } else if (level >= 10) {
    essence = 1;
    goldBonus = 20;
  } else {
    essence = 1;
    goldBonus = 0;
  }
  return { essence, goldBonus };
}

function ensureBossSummonUnlocked(key, name, icon, level) {
  // Compute per-boss cooldown based on difficulty (level).
  // Higher level bosses get longer cooldowns.
  const computeBossSummonCooldown = (lvl) => {
    const lv = Math.max(1, Math.floor(lvl || 1));
    // 10-level bands: 1~10:120s, 11~20:180s, 21~30:240s, ...
    const band = Math.floor((lv - 1) / 10); // 0-based
    return 120 + band * 60;
  };
  if (!key) return;
  if (!Array.isArray(GAME_STATE.bossSummons)) {
    GAME_STATE.bossSummons = [];
  }
  const statsNow = scaleBossStats(level);
  const rewards = computeBossRewardByLevel(level);
  const totalGold = (CONFIG.wave.bossReward ?? 0) + (rewards.goldBonus ?? 0);
  const existing = GAME_STATE.bossSummons.find((entry) => entry.key === key);
  if (existing) {
    existing.unlocked = true;
    existing.level = level ?? existing.level;
    existing.hp = Math.round(statsNow.hp);
    existing.reward = totalGold;
    existing.essence = rewards.essence;
    existing.cooldownBase = computeBossSummonCooldown(existing.level);
    return existing;
  }
  GAME_STATE.bossSummons.push({
    key,
    name: name || '보스',
    icon: icon || 'assets/svg/icons/icon_boss.svg',
    unlocked: true,
    cooldownRemaining: 0,
    cooldownBase: computeBossSummonCooldown(level),
    hp: Math.round(statsNow.hp),
    reward: totalGold,
    essence: rewards.essence,
    level,
  });
  return GAME_STATE.bossSummons[GAME_STATE.bossSummons.length - 1];
}

function getCurrentPattern() {
  if (GAME_STATE.isBossWave) return 'boss';
  if (GAME_STATE.round % 9 === 0) return 'split';
  if (GAME_STATE.round % 6 === 0) return 'spiral';
  if (GAME_STATE.round % 4 === 0) return 'sprint';
  return 'standard';
}

function getPatternLabel(pattern) {
  const labels = {
    boss: '보스',
    split: '분열',
    spiral: '나선',
    sprint: '광속',
    standard: '표준',
  };
  return labels[pattern] || pattern;
}

function spawnEnemyWithPattern(pattern, angle, radius, childLevel) {
  const stats = scaleEnemyStats();
  const archetype = pickEnemyArchetype(GAME_STATE.round);
  const enemy = {
    id: nextId(),
    type: 'enemy',
    pattern,
    angle,
    angularSpeed: stats.angularSpeed,
    radius,
    hp: stats.hp,
    maxHp: stats.hp,
    reward: CONFIG.wave.enemyReward,
    size: 12,
    childLevel,
    defense: stats.defense,
  };
  if (archetype && archetype.def) {
    const d = archetype.def;
    enemy.hp = Math.max(1, Math.floor(enemy.hp * d.hpMul));
    enemy.maxHp = enemy.hp;
    enemy.angularSpeed *= d.speedMul;
    enemy.defense = (enemy.defense || 0) + (d.defense || 0);
    enemy.size = d.size || enemy.size;
    enemy.reward = Math.max(1, Math.floor(enemy.reward * (d.rewardMul || 1)));
    enemy.fill = d.color || null;
    enemy.archetype = d.id;
    enemy.era = archetype.era;
    enemy.displayName = d.name || null;
  }
  switch (pattern) {
    case 'spiral':
      enemy.radialSpeed = (lcgRandom() > 0.5 ? 1 : -1) * 55;
      enemy.angularSpeed *= 1.3;
      enemy.radius = radius + lcgRandom() * 120 - 60;
      break;
    case 'sprint':
      enemy.angularSpeed *= 1.8;
      enemy.hp *= 0.8;
      enemy.size = 10;
      break;
    case 'split':
      enemy.hp *= 1.2;
      break;
    default:
      break;
  }
  if (childLevel > 0) {
    enemy.hp *= 0.6;
    enemy.maxHp = enemy.hp;
    enemy.size = Math.max(8, enemy.size * 0.7);
    enemy.reward = Math.max(1, Math.floor(enemy.reward * 0.5));
    enemy.defense *= 0.7;
  }
  enemy.radius = clamp(enemy.radius, CONFIG.orbit.radius * 0.4, CONFIG.orbit.radius);
  enemy.maxHp = enemy.hp;
  updateEnemyPosition(enemy);
  const initialVelocity = computeEnemyVelocity(enemy);
  const initialHeading = Math.atan2(initialVelocity.vy, initialVelocity.vx);
  enemy.heading = Number.isFinite(initialHeading) ? initialHeading : 0;
  GAME_STATE.enemies.push(enemy);
}

function triggerBossAbility(boss) {
  const shots = 3;
  const baseAngle = boss.angle;
  for (let i = 0; i < shots; i += 1) {
    const offset = (i - (shots - 1) / 2) * 0.25;
    const spawnAngle = baseAngle + offset;
    spawnEnemyWithPattern('spiral', spawnAngle, boss.radius + 40, 1);
  }
  GAME_STATE.minimapBossAlert = 1.2;
}

function updateEnemyPosition(enemy) {
  const halfSize = CONFIG.orbit.radius;
  const radius = clamp(Math.abs(enemy.radius), 0, halfSize);
  const coords = projectAngleToSquare(enemy.angle, radius);
  enemy.x = CONFIG.orbit.centerX + coords.x;
  enemy.y = CONFIG.orbit.centerY + coords.y;
}

function updateEnemies(delta) {
  const effectiveDelta = delta * GAME_STATE.speedMultiplier;
  for (const enemy of GAME_STATE.enemies) {
    const prevX = enemy.x;
    const prevY = enemy.y;
    enemy.angle += enemy.angularSpeed * effectiveDelta;
    if (enemy.radialSpeed) {
      enemy.radius += enemy.radialSpeed * effectiveDelta;
      const minRadius = CONFIG.orbit.radius * 0.6;
      const maxRadius = CONFIG.orbit.radius;
      if (enemy.radius < minRadius || enemy.radius > maxRadius) {
        enemy.radialSpeed *= -1;
        enemy.radius = clamp(enemy.radius, minRadius, maxRadius);
      }
    }
    updateEnemyPosition(enemy);
    const dx = enemy.x - prevX;
    const dy = enemy.y - prevY;
    const speedSq = dx * dx + dy * dy;
    if (speedSq > 0.0001) {
      const heading = Math.atan2(dy, dx);
      if (Number.isFinite(heading)) {
        enemy.heading = heading;
      }
    }
    if (enemy.type === 'boss') {
      enemy.abilityCooldown -= effectiveDelta;
      if (enemy.abilityCooldown <= 0) {
        triggerBossAbility(enemy);
        enemy.abilityCooldown = 4 - Math.min(2.5, GAME_STATE.round * 0.05);
      }
    }
  }
  let removedSelection = false;
  GAME_STATE.enemies = GAME_STATE.enemies.filter((enemy) => {
    if (enemy.hp > 0) return true;
    if (GAME_STATE.selectedEnemy === enemy.id) {
      GAME_STATE.selectedEnemy = null;
      removedSelection = true;
    }
    return false;
  });
  if (removedSelection) updateSelectionInfo();
}

function updateTowers(delta) {
  const effectiveDelta = delta * GAME_STATE.speedMultiplier;
  for (const tower of GAME_STATE.towers) {
    if (typeof tower.targetX !== 'number') {
      tower.targetX = tower.x;
      tower.targetY = tower.y;
    }
    const dx = tower.targetX - tower.x;
    const dy = tower.targetY - tower.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const moveStep = Math.min(dist, tower.moveSpeed * effectiveDelta);
      if (dist > 0) {
        tower.x += (dx / dist) * moveStep;
        tower.y += (dy / dist) * moveStep;
      }
      const clamped = clampToInnerRing(tower.x, tower.y, 32);
      tower.x = clamped.x;
      tower.y = clamped.y;
      tower.moving = true;
    } else {
      tower.x = tower.targetX;
      tower.y = tower.targetY;
      tower.moving = false;
    }
    // Initialize heading once
    if (typeof tower.heading !== 'number' || Number.isNaN(tower.heading)) {
      tower.heading = Math.atan2(CONFIG.orbit.centerY - tower.y, CONFIG.orbit.centerX - tower.x);
    }
    // Smoothly turn toward movement direction when moving; keep last heading when stationary
    const turnRate = 4.0; // rad/s
    const maxTurn = turnRate * effectiveDelta;
    const desiredHeading = tower.moving ? Math.atan2(tower.targetY - tower.y, tower.targetX - tower.x) : tower.heading;
    tower.heading = moveAngleTowards(tower.heading, desiredHeading, maxTurn);
    tower.col = Math.round((tower.x - CONFIG.grid.offsetX) / CONFIG.grid.cellSize);
    tower.row = Math.round((tower.y - CONFIG.grid.offsetY) / CONFIG.grid.cellSize);
  }
  resolveTowerCollisions();
  for (const tower of GAME_STATE.towers) {
    tower.cooldown -= effectiveDelta;
    if (tower.cooldown <= 0) {
      const target = findTarget(tower);
      if (target) {
        fireProjectile(tower, target);
        tower.cooldown = Math.max(0.1, 1 / tower.fireRate);
      }
    }
  }
}

function resolveTowerCollisions() {
  for (let i = 0; i < GAME_STATE.towers.length; i += 1) {
    const a = GAME_STATE.towers[i];
    for (let j = i + 1; j < GAME_STATE.towers.length; j += 1) {
      const b = GAME_STATE.towers[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const desired = (a.colliderRadius ?? 18) + (b.colliderRadius ?? 18);
      if (dist === 0) {
        const angle = lcgRandom() * Math.PI * 2;
        const offset = 0.5;
        const clampedA = clampToInnerRing(a.x + Math.cos(angle) * offset, a.y + Math.sin(angle) * offset, 32);
        const clampedB = clampToInnerRing(b.x - Math.cos(angle) * offset, b.y - Math.sin(angle) * offset, 32);
        a.x = clampedA.x;
        a.y = clampedA.y;
        b.x = clampedB.x;
        b.y = clampedB.y;
        continue;
      }
      if (dist < desired) {
        const overlap = (desired - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        const ax = a.x - nx * overlap;
        const ay = a.y - ny * overlap;
        const bx = b.x + nx * overlap;
        const by = b.y + ny * overlap;
        const clampedA = clampToInnerRing(ax, ay, 32);
        const clampedB = clampToInnerRing(bx, by, 32);
        a.x = clampedA.x;
        a.y = clampedA.y;
        b.x = clampedB.x;
        b.y = clampedB.y;
      }
    }
  }
}

function findTarget(tower) {
  let chosen = null;
  let closest = Infinity;
  for (const enemy of GAME_STATE.enemies) {
    const dx = enemy.x - tower.x;
    const dy = enemy.y - tower.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= tower.range * tower.range && distSq < closest) {
      closest = distSq;
      chosen = enemy;
    }
  }
  return chosen;
}

function computeEnemyVelocity(enemy) {
  const angle = enemy.angle ?? 0;
  const radius = enemy.radius ?? 0;
  const angularSpeed = enemy.angularSpeed ?? 0;
  const radialSpeed = enemy.radialSpeed ?? 0;
  const speedMultiplier = GAME_STATE.speedMultiplier ?? 1;
  const vx = (-Math.sin(angle) * angularSpeed * radius + Math.cos(angle) * radialSpeed) * speedMultiplier;
  const vy = (Math.cos(angle) * angularSpeed * radius + Math.sin(angle) * radialSpeed) * speedMultiplier;
  return { vx, vy };
}

function estimateProjectileLead(tower, target, projectileSpeed) {
  const { vx: targetVx, vy: targetVy } = computeEnemyVelocity(target);
  const speedMultiplier = GAME_STATE.speedMultiplier ?? 1;
  const effectiveProjectileSpeed = projectileSpeed * speedMultiplier;
  const toTargetX = target.x - tower.x;
  const toTargetY = target.y - tower.y;
  const a = targetVx * targetVx + targetVy * targetVy - effectiveProjectileSpeed * effectiveProjectileSpeed;
  const b = 2 * (targetVx * toTargetX + targetVy * toTargetY);
  const c = toTargetX * toTargetX + toTargetY * toTargetY;
  let impactTime = 0;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) {
      impactTime = Math.max(0, -c / b);
    }
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const sqrtDiscriminant = Math.sqrt(discriminant);
      const t1 = (-b - sqrtDiscriminant) / (2 * a);
      const t2 = (-b + sqrtDiscriminant) / (2 * a);
      const candidates = [t1, t2].filter((t) => t > 0 && Number.isFinite(t));
      if (candidates.length > 0) {
        impactTime = Math.min(...candidates);
      }
    }
  }
  const clampedTime = Math.min(Math.max(impactTime, 0), 1.8);
  const leadX = target.x + targetVx * clampedTime;
  const leadY = target.y + targetVy * clampedTime;
  return { x: leadX, y: leadY };
}

function fireProjectile(tower, target) {
  const projectileSpeed = tower.projectileSpeed * 1.5;
  const leadPoint = estimateProjectileLead(tower, target, projectileSpeed);
  const aimX = Number.isFinite(leadPoint.x) ? leadPoint.x : target.x;
  const aimY = Number.isFinite(leadPoint.y) ? leadPoint.y : target.y;
  const dx = aimX - tower.x;
  const dy = aimY - tower.y;
  const distance = Math.hypot(dx, dy) || 1;
  const projectileType = tower.projectileType || PROJECTILE_TYPES.NORMAL;
  const style = getProjectileStyle(tower.weaponType);
  const visualSize = style.size ?? 18;
  const baseRadius = style.collisionRadius ?? Math.max(3.5, visualSize * 0.3);
  const radius = baseRadius + (tower.projectileRadiusBonus ?? 0);
  const projectile = {
    id: nextId(),
    towerId: tower.id,
    damage: computeTowerDamage(tower),
    x: tower.x,
    y: tower.y,
    vx: (dx / distance) * projectileSpeed,
    vy: (dy / distance) * projectileSpeed,
    ttl: 2,
    radius,
    originX: tower.x,
    originY: tower.y,
    maxDistanceSq: tower.range * tower.range,
    weaponType: tower.weaponType || 'default',
    projectileType,
    critChance: tower.critChance ?? 0,
    style,
  };

  if (projectileType === PROJECTILE_TYPES.EXPLOSIVE) {
    projectile.explosionRadius = tower.explosionRadius
      ?? style.explosionRadius
      ?? PROJECTILE_DEFAULTS.explosionRadius;
  }

  if (projectileType === PROJECTILE_TYPES.PIERCING) {
    projectile.hitEnemyIds = [];
  }

  GAME_STATE.projectiles.push(projectile);
}

function computeTowerDamage(tower) {
  return tower.baseDamage + tower.upgDamage * tower.upgradeLevel;
}

function applyExplosiveSplash(projectile, impactEnemy, { crit = false } = {}) {
  const style = projectile.style || getProjectileStyle(projectile.weaponType);
  const baseRadius = projectile.explosionRadius
    ?? style?.explosionRadius
    ?? PROJECTILE_DEFAULTS.explosionRadius;
  if (!baseRadius || baseRadius <= 0) return;
  const radius = baseRadius;
  const radiusSq = radius * radius;
  const maxRatio = PROJECTILE_DEFAULTS.splashMaxRatio;
  const minRatio = PROJECTILE_DEFAULTS.splashMinRatio;
  const ratioSpan = maxRatio - minRatio;
  spawnHitBlip(projectile.x, projectile.y, { ...style, hitRadius: radius });
  const hits = crit ? 2 : 1;
  for (const enemy of GAME_STATE.enemies) {
    if (enemy === impactEnemy) continue;
    if (enemy.hp <= 0) continue;
    const dx = enemy.x - projectile.x;
    const dy = enemy.y - projectile.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq) continue;
    const dist = Math.sqrt(distSq);
    const normalized = Math.min(1, dist / radius);
    const damageRatio = maxRatio - ratioSpan * normalized;
    const baseDamage = rollDamage(projectile.damage * damageRatio);
    dealDamage(enemy, baseDamage, style, hits);
  }
}

function updateProjectiles(delta) {
  const effectiveDelta = delta * GAME_STATE.speedMultiplier;
  for (const projectile of GAME_STATE.projectiles) {
    projectile.style = projectile.style || getProjectileStyle(projectile.weaponType);
    projectile.x += projectile.vx * effectiveDelta;
    projectile.y += projectile.vy * effectiveDelta;
    projectile.ttl -= effectiveDelta;
    if (projectile.ttl <= 0) continue;
    const traveledSq = (projectile.x - projectile.originX) ** 2 + (projectile.y - projectile.originY) ** 2;
    if (traveledSq >= projectile.maxDistanceSq) {
      projectile.ttl = 0;
      continue;
    }
    const projectileType = projectile.projectileType || PROJECTILE_TYPES.NORMAL;
    for (const enemy of GAME_STATE.enemies) {
      if (enemy.hp <= 0) continue;
      if (projectileType === PROJECTILE_TYPES.PIERCING) {
        projectile.hitEnemyIds = projectile.hitEnemyIds || [];
        if (projectile.hitEnemyIds.includes(enemy.id)) {
          continue;
        }
      }
      const dx = enemy.x - projectile.x;
      const dy = enemy.y - projectile.y;
      const distanceSq = dx * dx + dy * dy;
      const hitRadius = enemy.size + projectile.radius;
      if (distanceSq > hitRadius * hitRadius) continue;
      const critChance = projectile.critChance ?? 0;
      const isCrit = critChance > 0 && lcgRandom() < critChance;
      const hits = isCrit ? 2 : 1;
      const baseDamage = rollDamage(projectile.damage);
      dealDamage(enemy, baseDamage, projectile.style, hits);
      // Impact SFX (throttled)
      if (projectileType === PROJECTILE_TYPES.EXPLOSIVE) {
        playSound('explosion', { volume: 0.5, throttleMs: 60 });
      } else {
        playSound('hit', { volume: 0.22, throttleMs: 35 });
      }
      if (projectileType === PROJECTILE_TYPES.PIERCING) {
        projectile.hitEnemyIds.push(enemy.id);
        continue;
      }
      if (projectileType === PROJECTILE_TYPES.EXPLOSIVE) {
        applyExplosiveSplash(projectile, enemy, { crit: isCrit });
      }
      projectile.ttl = 0;
      break;
    }
  }
  GAME_STATE.projectiles = GAME_STATE.projectiles.filter((projectile) => projectile.ttl > 0);
}

function handleEnemyDeath(enemy) {
  GAME_STATE.gold += enemy.reward;
  if (GAME_STATE.selectedEnemy === enemy.id) {
    GAME_STATE.selectedEnemy = null;
    updateSelectionInfo();
  }
  if (enemy.pattern === 'split' && enemy.childLevel < 1) {
    const childCount = 2;
    for (let i = 0; i < childCount; i += 1) {
      const angle = enemy.angle + (i === 0 ? -0.2 : 0.2);
      spawnEnemyWithPattern('sprint', angle, enemy.radius, enemy.childLevel + 1);
    }
  }
  if (enemy.type === 'boss') {
    // Compute boss reward based on level
    const level = enemy.isWaveBoss ? (enemy.waveLevel ?? GAME_STATE.round) : (enemy.summonLevel ?? GAME_STATE.round);
    const extra = computeBossRewardByLevel(level);
    GAME_STATE.essence = (GAME_STATE.essence ?? 0) + (extra.essence ?? 0);
    GAME_STATE.gold += (extra.goldBonus ?? 0);
    let statusMessage = '소환 보스 처치! 추가 보상을 획득했습니다.';
    // Wave boss grants era upgrade and records unlock key
    if (enemy.isWaveBoss) {
      if (enemy.bossKey) {
        GAME_STATE.lastWaveBossKey = enemy.bossKey;
        const bossName = enemy.displayName || enemy.name || `${enemy.era || ''} 보스`.trim();
        ensureBossSummonUnlocked(enemy.bossKey, bossName || '웨이브 보스', enemy.icon || 'assets/svg/icons/icon_boss.svg', level);
      }
      statusMessage = '웨이브 보스 처치! 보상 획득';
    }
    GAME_STATE.bossMustDie = false;
    GAME_STATE.bossGraceTimer = 0;
    setWaveStatus(statusMessage);
    renderCommandPanel();
  }
}

function handleSpawning(delta) {
  const effectiveDelta = delta * GAME_STATE.speedMultiplier;
  if (GAME_STATE.isBossWave) {
    GAME_STATE.bossSpawnTimer += effectiveDelta;
    if (!GAME_STATE.bossSpawned && GAME_STATE.bossSpawnTimer >= CONFIG.wave.bossSpawnDelay) {
      spawnBoss();
    }
    return;
  }

  const target = GAME_STATE.spawnTarget || getSpawnTargetForRound(GAME_STATE.round);
  const interval = target > 0 ? CONFIG.wave.spawnDuration / target : CONFIG.wave.spawnDuration;
  GAME_STATE.spawnAccumulator += effectiveDelta;
  while (
    GAME_STATE.spawnedThisWave < target &&
    GAME_STATE.spawnAccumulator >= interval
  ) {
    GAME_STATE.spawnAccumulator -= interval;
    GAME_STATE.spawnedThisWave += 1;
    spawnEnemy();
  }
}

function processInterest() {
  if (!GAME_STATE.interestEnabled) return;
  const interest = Math.min(GAME_STATE.gold * CONFIG.economy.interestRate, CONFIG.economy.interestCap);
  if (interest > 0) {
    GAME_STATE.gold = Math.floor(GAME_STATE.gold + interest);
  }
}

function endWave() {
  processInterest();
  const nextRound = GAME_STATE.round + 1;
  GAME_STATE.bossCountdown -= 1;
  if (GAME_STATE.bossCountdown <= 0) {
    GAME_STATE.bossCountdown = CONFIG.wave.bossInterval;
  }
  GAME_STATE.waveActive = false;
  GAME_STATE.bossMustDie = false;
  GAME_STATE.bossGraceTimer = 0;
  if (nextRound > MAX_WAVES) {
    GAME_STATE.running = false;
    GAME_STATE.waveTimer = 0;
    GAME_STATE.pendingCommands = [];
    GAME_STATE.enemies = [];
    GAME_STATE.projectiles = [];
    GAME_STATE.spawnAccumulator = 0;
    GAME_STATE.spawnedThisWave = 0;
    GAME_STATE.bossCountdown = CONFIG.wave.bossInterval;
    GAME_STATE.sceneReturn = 'lobby';
    renderCommandPanel(true);
    updateHUD();
    setWaveStatus('모든 웨이브 방어 성공!', { persistent: true });
    const stats = buildGameOverStats(MAX_WAVES);
    showGameOverOverlay('게임 클리어', {
      title: '방어 성공',
      message: '모든 웨이브 방어에 성공했습니다!',
      stats,
    });
    playSound('victory', { volume: 0.9 });
    return;
  }
  // Wave clear cue when proceeding to next round
  playSound('wave_clear', { volume: 0.6 });
  GAME_STATE.round = nextRound;
  startWave();
}

function startWave(initial = false) {
  const isPrepWave = GAME_STATE.round === 0;
  GAME_STATE.waveTimer = isPrepWave ? PREP_WAVE_DURATION : CONFIG.wave.waveDuration;
  GAME_STATE.spawnAccumulator = 0;
  GAME_STATE.spawnedThisWave = 0;
  GAME_STATE.spawnTarget = isPrepWave ? 0 : getSpawnTargetForRound(GAME_STATE.round);
  GAME_STATE.bossSpawnTimer = 0;
  GAME_STATE.bossSpawned = false;
  GAME_STATE.isBossWave = !isPrepWave && GAME_STATE.round % CONFIG.wave.bossInterval === 0;
  GAME_STATE.waveActive = true;
  // Ensure base boss summon unlock and unlock previous wave boss every 10 rounds (round 1, 11, 21 ...)
  if (!Array.isArray(GAME_STATE.bossSummons)) GAME_STATE.bossSummons = [];
  // Base unlock at round 1 when first entering combat
  if (GAME_STATE.round === 1 && GAME_STATE.bossSummons.length === 0) {
    ensureBossSummonUnlocked('boss_ancient_galley', '고대 보스', 'assets/svg/icons/icon_boss.svg', 1);
  }
  if (GAME_STATE.round > 1 && (GAME_STATE.round - 1) % 10 === 0 && GAME_STATE.lastWaveBossKey) {
    const lastBossLevel = GAME_STATE.round - 1;
    ensureBossSummonUnlocked(GAME_STATE.lastWaveBossKey, '정예 보스', 'assets/svg/icons/icon_boss.svg', lastBossLevel);
  }
  let statusMessage;
  let statusOptions = {};
  if (isPrepWave) {
    statusMessage = '준비 라운드! Q 건조 · W 강화 · B 조선소 증설.';
    statusOptions = { duration: PREP_WAVE_DURATION * 1000 };
  } else if (GAME_STATE.isBossWave) {
    statusMessage = '보스 라운드 준비';
  } else if (GAME_STATE.round === 1) {
    statusMessage = '전투 시작';
  } else {
    statusMessage = '다음 라운드';
  }
  setWaveStatus(statusMessage, statusOptions);
  if (!isPrepWave) {
    playSound('wave_start', { volume: 0.5 });
  }
}

function onCanvasContextMenu(event) {
  event.preventDefault();
  if (GAME_STATE.scene !== 'game') return;
  if (GAME_STATE.selections.size === 0) return;
  const positions = getPointerPositions(event);
  const target = clampToInnerRing(positions.worldX, positions.worldY, 32);
  orderSelectedTowers(target);
}

function onGlobalContextMenu(event) {
  if (GAME_STATE.scene === 'game') {
    const appRoot = document.getElementById('app');
    if (!appRoot || appRoot.contains(event.target)) {
      event.preventDefault();
    }
  }
}

function updateWaveInfo() {
  if (!elements.waveInfo) return;

  if (GAME_STATE.scene !== 'game') {
    elements.waveInfo.classList.add('hidden');
    const context = GAME_STATE.scene === 'settings'
      ? '설정을 조정한 뒤 돌아가기를 누르세요.'
      : '플레이 버튼을 눌러 방어를 시작하세요.';
    const infoLabel = GAME_STATE.scene === 'settings' ? '설정' : '로비';
    const roundInfo = GAME_STATE.scene === 'settings'
      ? `라운드 ${GAME_STATE.round} 진행 중`
      : '라운드 1 준비 완료';
    elements.waveInfo.innerHTML = `
      <div class="title-row">
        <span>${infoLabel}</span>
        <span>&nbsp;</span>
      </div>
      <div class="wave-metrics">
        <span>${context}</span>
        <span>이자: ${SETTINGS.interestEnabled ? 'ON' : 'OFF'}</span>
        <span>감도 ${SETTINGS.pointerSensitivity.toFixed(1)} · 속도 ${SETTINGS.panSpeedMultiplier.toFixed(1)}</span>
        <span>${roundInfo}</span>
      </div>
      <div class="wave-progress">
        <span style="width:0%"></span>
      </div>
    `;
    return;
  }
  elements.waveInfo.classList.remove('hidden');

  if (isGameOverOverlayVisible()) {
    elements.waveInfo.classList.add('hidden');
    return;
  }

  const waveNumber = Math.min(GAME_STATE.round, MAX_WAVES);
  const isPrepWave = GAME_STATE.round === 0;
  const isFinalWave = !isPrepWave && waveNumber === MAX_WAVES;
  const gameCleared = !GAME_STATE.running && !GAME_STATE.waveActive && isFinalWave;

  if (gameCleared) {
    const { used: usedCapacity, total: totalCapacity } = getDockyardUsage();
    elements.waveInfo.innerHTML = `
      <div class="title-row">
        <span>웨이브 ${waveNumber}/${MAX_WAVES}</span>
        <span>완료</span>
      </div>
      <div class="wave-metrics">
        <span>모든 웨이브 방어에 성공했습니다.</span>
        <span>총 조선소 ${GAME_STATE.dockyards}개</span>
        <span>함대 용량 ${usedCapacity}/${totalCapacity}</span>
        <span>전투 시간 ${Math.floor(GAME_STATE.time)}초</span>
      </div>
      <div class="wave-progress">
        <span style="width:100%"></span>
      </div>
    `;
    return;
  }

  const difficultyPreset = DIFFICULTY_PRESETS[GAME_STATE.difficulty] || DIFFICULTY_PRESETS.normal;
  const difficultyLabel = difficultyPreset.label;
  const waveTypeLeft = isPrepWave
    ? '<strong class="em">준비 라운드</strong> · 함대를 준비하세요'
    : `웨이브 <strong class=\"em\">${waveNumber}</strong>/<strong class=\"muted\">${MAX_WAVES}</strong> · <strong class=\"em\">${difficultyLabel}</strong>${GAME_STATE.isBossWave ? ' · <span class=\"boss\">보스</span>' : ''}`;
  let progress = 0;
  let statusLine = '';
  const timerRemain = Math.max(0, Math.floor(GAME_STATE.waveTimer));
  const spawnTarget = GAME_STATE.spawnTarget || getSpawnTargetForRound(GAME_STATE.round);

  if (GAME_STATE.waveActive) {
    if (isPrepWave) {
      const elapsed = Math.max(0, PREP_WAVE_DURATION - GAME_STATE.waveTimer);
      progress = PREP_WAVE_DURATION > 0 ? Math.min(1, elapsed / PREP_WAVE_DURATION) : 1;
      statusLine = `준비 시간 ${timerRemain}s · Q: 건조 · W: 강화 · B: 조선소`;
    } else if (GAME_STATE.isBossWave) {
      if (GAME_STATE.bossSpawned) {
        progress = 1;
        statusLine = '보스 전투 진행 중';
      } else {
        progress = Math.min(1, CONFIG.wave.bossSpawnDelay === 0 ? 1 : GAME_STATE.bossSpawnTimer / CONFIG.wave.bossSpawnDelay);
        const remain = Math.max(0, CONFIG.wave.bossSpawnDelay - GAME_STATE.bossSpawnTimer);
        statusLine = `보스 등장까지 <strong class=\"em\">${remain.toFixed(1)}</strong>초`;
      }
    } else {
      progress = spawnTarget === 0 ? 1 : Math.min(1, GAME_STATE.spawnedThisWave / spawnTarget);
      const spawnRate = CONFIG.wave.spawnDuration > 0 ? (spawnTarget / CONFIG.wave.spawnDuration) : 0;
      statusLine = `<strong class=\"em\">${GAME_STATE.spawnedThisWave}</strong>/<strong>${spawnTarget}</strong> 스폰 · <strong class=\"em\">${spawnRate.toFixed(1)}</strong>/s`;
    }
  } else {
    progress = 0;
    statusLine = isPrepWave ? '준비 중' : '다음 웨이브 준비 중';
  }
  const timerLine = GAME_STATE.paused ? '정지 중' : `남은 <strong class=\"em\">${timerRemain}</strong>초`;
  const progressPercent = Math.round(progress * 100);
  const enemyInfo = `적 활동 <strong class=\"em\">${GAME_STATE.enemies.length}</strong>/<strong>${CONFIG.wave.defeatThreshold}</strong>`;
  const speedInfo = `속도 <strong class=\"em\">${GAME_STATE.paused ? '정지' : `x${GAME_STATE.speedMultiplier}`}</strong>`;

  elements.waveInfo.innerHTML = `
    <div class=\"title-row\">
      <span>${waveTypeLeft}</span>
      <span>${timerLine}</span>
    </div>
    <div class=\"wave-metrics\">
      <span>${statusLine}</span>
      <span>${enemyInfo}</span>
      <span>${speedInfo}</span>
    </div>
    <div class=\"wave-progress\">
      <span style="width:${progressPercent}%"></span>
    </div>
  `;
}

function updateCameraOverlay() {
  if (!elements.cameraOverlay) return;
  if (GAME_STATE.scene !== 'game') {
    elements.cameraOverlay.classList.add('hidden');
    return;
  }
  const hasKeyInput = GAME_STATE.cameraInput.up || GAME_STATE.cameraInput.down || GAME_STATE.cameraInput.left || GAME_STATE.cameraInput.right;
  const shouldShow = GAME_STATE.pointer.inside || hasKeyInput;
  elements.cameraOverlay.classList.toggle('hidden', !shouldShow);
  if (!shouldShow) return;
  const camInfo = `CAM ${Math.round(CAMERA.x)},${Math.round(CAMERA.y)} · VIEW ${CAMERA.width}×${CAMERA.height}`;
  const speedInfo = `SPD ${GAME_STATE.speedMultiplier.toFixed(1)}x`;
  const lockInfo = 'CURSOR';
  const controlInfo = 'Arrow Keys / Edge Pan';
  const sensInfo = `SENS ${SETTINGS.pointerSensitivity.toFixed(1)}`;
  const panInfo = `PAN ${SETTINGS.panSpeedMultiplier.toFixed(1)}`;
  elements.cameraOverlay.textContent = `${camInfo} · ${speedInfo} · ${lockInfo} · ${controlInfo} · ${sensInfo} · ${panInfo}`;
}

function updateCustomCursor() {
  const cursorEl = elements.gameCursor;
  if (!cursorEl) return;
  cursorEl.classList.add('hidden');
}

function updateHUD() {
  updateWaveInfo();
  elements.gold.textContent = GAME_STATE.gold.toLocaleString();
  if (elements.essence) {
    elements.essence.textContent = (GAME_STATE.essence ?? 0).toLocaleString();
  }
  elements.round.textContent = GAME_STATE.round;
  const eraLabel = ERA_ORDER[GAME_STATE.eraIndex];
  elements.era.textContent = eraLabel;
  if (elements.bossCountdown) {
    elements.bossCountdown.textContent = GAME_STATE.isBossWave ? '보스' : GAME_STATE.bossCountdown;
  }

  const difficultyPreset = DIFFICULTY_PRESETS[GAME_STATE.difficulty] || DIFFICULTY_PRESETS.normal;
  if (elements.chipDifficulty) {
    elements.chipDifficulty.textContent = difficultyPreset.label;
  }
  if (elements.chipSpeed) {
    elements.chipSpeed.textContent = GAME_STATE.paused ? '정지' : `x${GAME_STATE.speedMultiplier}`;
  }
  if (elements.chipBoss) {
    if (GAME_STATE.isBossWave) {
      elements.chipBoss.textContent = '보스 웨이브';
    } else {
      const remaining = Math.max(0, (GAME_STATE.bossCountdown ?? 1) - 1);
      elements.chipBoss.textContent = remaining <= 0 ? '다음 웨이브' : `${remaining} 웨이브`;
    }
  }

  const goldBadge = elements.gold?.closest('.resource');
  if (goldBadge) {
    const rollCost = getRollCost();
    goldBadge.classList.toggle('is-warning', GAME_STATE.gold < rollCost);
    goldBadge.classList.toggle('is-ready', GAME_STATE.gold >= rollCost);
  }
  const roundBadge = elements.round?.closest('.resource');
  if (roundBadge) {
    roundBadge.classList.toggle('is-highlight', GAME_STATE.waveActive);
  }
  const bossBadge = elements.bossCountdown?.closest?.('.resource');
  if (bossBadge && elements.bossCountdown) {
    bossBadge.classList.toggle('is-critical', GAME_STATE.isBossWave || GAME_STATE.bossCountdown <= 2);
  }

  if (elements.dockyardUsage) {
    const { used, total } = getDockyardUsage();
    elements.dockyardUsage.textContent = `${used}/${total}`;
    elements.dockyardUsage.classList.toggle('over-capacity', used > total);
    const dockyardContainer = elements.dockyardUsage.closest('.shipyard-display');
    if (dockyardContainer) {
      dockyardContainer.title = `조선소 ${GAME_STATE.dockyards}개 · 용량 ${total} · 사용 ${used}`;
      dockyardContainer.classList.toggle('over-capacity', used > total);
    }
  }
  if (elements.waveInfo) {
    elements.waveInfo.classList.toggle('is-boss', GAME_STATE.isBossWave);
    elements.waveInfo.classList.toggle('is-urgent', !GAME_STATE.isBossWave && GAME_STATE.bossCountdown <= 2);
  }
  updateCameraOverlay();
  refreshCommandStates();
}

function renderGrid() {
  ctx.strokeStyle = '#1d2638';
  ctx.lineWidth = 1;
  const startCol = Math.max(0, Math.floor((CAMERA.x - CONFIG.grid.offsetX) / CONFIG.grid.cellSize));
  const endCol = Math.min(
    CONFIG.grid.cols,
    Math.ceil((CAMERA.x + CAMERA.width - CONFIG.grid.offsetX) / CONFIG.grid.cellSize)
  );
  const startRow = Math.max(0, Math.floor((CAMERA.y - CONFIG.grid.offsetY) / CONFIG.grid.cellSize));
  const endRow = Math.min(
    CONFIG.grid.rows,
    Math.ceil((CAMERA.y + CAMERA.height - CONFIG.grid.offsetY) / CONFIG.grid.cellSize)
  );

  for (let col = startCol; col <= endCol; col += 1) {
    const worldX = CONFIG.grid.offsetX + col * CONFIG.grid.cellSize + 0.5;
    const screenX = worldX - CAMERA.x;
    ctx.beginPath();
    ctx.moveTo(screenX, CONFIG.grid.offsetY - CAMERA.y);
    ctx.lineTo(screenX, CONFIG.grid.offsetY + CONFIG.grid.height - CAMERA.y);
    ctx.stroke();
  }
  for (let row = startRow; row <= endRow; row += 1) {
    const worldY = CONFIG.grid.offsetY + row * CONFIG.grid.cellSize + 0.5;
    const screenY = worldY - CAMERA.y;
    ctx.beginPath();
    ctx.moveTo(CONFIG.grid.offsetX - CAMERA.x, screenY);
    ctx.lineTo(CONFIG.grid.offsetX + CONFIG.grid.width - CAMERA.x, screenY);
    ctx.stroke();
  }
}

function renderGuideOverlays() {
  if (!GAME_STATE.showGuide) return;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(55, 160, 242, 0.35)';
  const innerHalf = CONFIG.innerOrbitRadius;
  const squareX = CONFIG.orbit.centerX - CAMERA.x - innerHalf;
  const squareY = CONFIG.orbit.centerY - CAMERA.y - innerHalf;
  const squareSize = innerHalf * 2;
  ctx.strokeRect(squareX, squareY, squareSize, squareSize);
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(55, 160, 242, 0.9)';
  for (const towerId of GAME_STATE.selections) {
    const tower = GAME_STATE.towers.find((t) => t.id === towerId);
    if (!tower) continue;
    const screenX = tower.x - CAMERA.x;
    const screenY = tower.y - CAMERA.y;
    ctx.beginPath();
    ctx.arc(screenX, screenY, tower.range, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function renderInnerRing() {
  const centerX = CONFIG.orbit.centerX - CAMERA.x;
  const centerY = CONFIG.orbit.centerY - CAMERA.y;
  const outerHalf = CONFIG.orbit.radius;
  const innerHalf = CONFIG.innerOrbitRadius;
  ctx.save();
  ctx.setLineDash([10, 12]);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(255, 170, 90, 0.5)';
  ctx.strokeRect(centerX - outerHalf, centerY - outerHalf, outerHalf * 2, outerHalf * 2);
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(72, 168, 255, 0.85)';
  ctx.strokeRect(centerX - innerHalf, centerY - innerHalf, innerHalf * 2, innerHalf * 2);
  ctx.restore();
}

function renderSelectionBox() {
  if (!GAME_STATE.dragSelecting) return;
  const start = GAME_STATE.dragStartScreen;
  const current = GAME_STATE.dragCurrentScreen;
  const minX = Math.min(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  if (width < 3 && height < 3) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(55, 160, 242, 0.9)';
  ctx.fillStyle = 'rgba(55, 160, 242, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minX, minY, width, height);
  ctx.setLineDash([]);
  ctx.fillRect(minX, minY, width, height);
  ctx.restore();
}

function spawnDamageFloater(x, y, value, style) {
  const theme = style || getProjectileStyle();
  GAME_STATE.floaters.push({
    x,
    y,
    value: Math.round(value),
    age: 0,
    ttl: theme.damageTtl ?? 1,
    color: theme.damageColor,
    outline: theme.damageOutline,
    font: theme.damageFont,
  });
}

function spawnHitBlip(x, y, style) {
  const theme = style || getProjectileStyle();
  GAME_STATE.hitBlips.push({
    x,
    y,
    age: 0,
    ttl: theme.hitTtl ?? 0.28,
    maxRadius: theme.hitRadius ?? 26,
    color: theme.hitColor,
  });
}

function updateFloaters(delta) {
  GAME_STATE.floaters.forEach((floater) => {
    floater.age += delta;
  });
  GAME_STATE.floaters = GAME_STATE.floaters.filter((floater) => floater.age < floater.ttl);
}

function updateHitBlips(delta) {
  GAME_STATE.hitBlips.forEach((blip) => {
    blip.age += delta;
  });
  GAME_STATE.hitBlips = GAME_STATE.hitBlips.filter((blip) => blip.age < blip.ttl);
}

function renderHitBlips() {
  ctx.save();
  for (const blip of GAME_STATE.hitBlips) {
    const progress = blip.age / blip.ttl;
    const radius = progress * blip.maxRadius;
    const alpha = 1 - progress;
    const screenX = blip.x - CAMERA.x;
    const screenY = blip.y - CAMERA.y;
    if (screenX + radius < 0 || screenX - radius > CAMERA.width) continue;
    if (screenY + radius < 0 || screenY - radius > CAMERA.height) continue;
    const tint = withAlpha(blip.color || '#ecf0f1', alpha * 0.85);
    const fill = withAlpha(blip.color || '#ecf0f1', alpha * 0.35);
    ctx.strokeStyle = tint;
    ctx.fillStyle = fill;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function renderFloaters() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const floater of GAME_STATE.floaters) {
    const progress = floater.age / floater.ttl;
    const alpha = 1 - progress;
    const yOffset = progress * 28;
    const screenX = floater.x - CAMERA.x;
    const screenY = floater.y - CAMERA.y - yOffset;
    if (screenX < -40 || screenX > CAMERA.width + 40) continue;
    if (screenY < -40 || screenY > CAMERA.height + 40) continue;
    const font = floater.font || 'bold 14px system-ui, sans-serif';
    ctx.font = font;
    const fill = withAlpha(floater.color || '#f39c12', alpha);
    ctx.fillStyle = fill;
    if (floater.outline) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = withAlpha(floater.outline, alpha * 0.9);
      ctx.strokeText(floater.value.toString(), screenX, screenY);
    }
    ctx.shadowColor = withAlpha(floater.outline || floater.color || '#000000', alpha * 0.35);
    ctx.shadowBlur = 6 * alpha;
    ctx.fillText(floater.value.toString(), screenX, screenY);
  }
  ctx.shadowBlur = 0;
  ctx.restore();
}

function renderRarityFloor(tower, screenX, screenY) {
  const style = RARITY_FLOOR_STYLES[tower.rarity];
  if (!style) return;
  const time = GAME_STATE.time ?? 0;
  const radius = style.radius ?? 20;
  const alpha = style.alpha ?? 0.26;
  ctx.save();
  const floorOffsetY = 12; // keep floor glow tucked under hull instead of trailing far below
  ctx.translate(screenX, screenY + floorOffsetY);
  ctx.scale(1.2, 0.42);
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
  gradient.addColorStop(0, withAlpha(style.color, alpha));
  gradient.addColorStop(1, 'rgba(10, 14, 24, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  const sparkleCount = style.sparkle || 0;
  if (sparkleCount > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const sparkleAlphaScale = style.sparkleAlpha ?? 1;
    const sparkleSizeScale = style.sparkleSize ?? 1;
    for (let i = 0; i < sparkleCount; i += 1) {
      const angle = time * 0.95 + (tower.id * 0.17) + (i * (Math.PI * 2 / sparkleCount));
      const distance = radius * 0.55 + Math.sin(time * 1.4 + i) * 2.2;
      const px = Math.cos(angle) * distance;
      const py = Math.sin(angle) * distance * 0.7;
      const size = (1.2 + Math.sin(time * 2.1 + i) * 0.4) * sparkleSizeScale;
      const baseAlpha = 0.38 + 0.22 * Math.sin(time * 1.8 + i * 1.3);
      ctx.globalAlpha = Math.min(1, Math.max(0, baseAlpha * sparkleAlphaScale));
      ctx.fillStyle = withAlpha(style.color, 0.9);
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function renderFusionAura(tower, screenX, screenY) {
  const tier = Math.max(0, tower.fusionTier ?? 0);
  if (tier === 0) return;
  const styleIndex = Math.min(FUSION_AURA_STYLES.length - 1, tier);
  const auraStyle = FUSION_AURA_STYLES[styleIndex];
  if (!auraStyle) return;
  const time = GAME_STATE.time ?? 0;
  const baseRadiusDefault = 26 + tier * 4;
  const radiusScale = auraStyle.radiusScale ?? 1;
  const baseRadius = baseRadiusDefault * radiusScale;
  const pulseStrength = auraStyle.pulse ?? 0.18;
  const pulse = 1 + pulseStrength * Math.sin(time * (1.6 + tier * 0.3) + tower.id * 0.15);
  const glowRadius = baseRadius * pulse;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = auraStyle.glow;
  ctx.beginPath();
  ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.strokeStyle = auraStyle.color;
  ctx.globalAlpha = 0.65;
  const ringRadius = (baseRadiusDefault + tier * 2) * radiusScale;
  ctx.beginPath();
  ctx.arc(screenX, screenY, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  const particleCount = Math.max(4, auraStyle.particles || 6);
  const orbitRadius = (baseRadiusDefault + 8 + tier * 3) * radiusScale;
  const wobble = (4 + tier * 1.3) * radiusScale;
  for (let i = 0; i < particleCount; i += 1) {
    const angle = time * (1.2 + tier * 0.25) + (i / particleCount) * Math.PI * 2;
    const wobbleOffset = Math.sin(time * 1.7 + i) * wobble;
    const px = screenX + Math.cos(angle) * (orbitRadius + wobbleOffset);
    const py = screenY + Math.sin(angle) * (orbitRadius + wobbleOffset);
    const sizeBase = 1.6 + tier * 0.6 + 0.4 * Math.sin(time * 2.3 + i);
    const particleScale = auraStyle.particleScale ?? 1;
    const size = sizeBase * particleScale;
    ctx.globalAlpha = 0.65 + 0.25 * Math.sin(time * 2.1 + i);
    ctx.fillStyle = auraStyle.color;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderTowers() {
  for (const tower of GAME_STATE.towers) {
    const screenX = tower.x - CAMERA.x;
    const screenY = tower.y - CAMERA.y;
    if (screenX < -24 || screenX > CAMERA.width + 24) continue;
    if (screenY < -24 || screenY > CAMERA.height + 24) continue;
    renderRarityFloor(tower, screenX, screenY);
    renderFusionAura(tower, screenX, screenY);
    // Draw ship sprite
    const sprite = getTowerSprite(tower);
    const size = sprite.size ?? 36;
    if (isSpriteReady(sprite.image)) {
      ctx.save();
      ctx.translate(screenX, screenY);
      // Use smoothed tower.heading computed in updateTowers
      const drawAngle = typeof tower.heading === 'number'
        ? tower.heading
        : Math.atan2(CONFIG.orbit.centerY - tower.y, CONFIG.orbit.centerX - tower.x);
      ctx.rotate(drawAngle + TOWER_HEADING_OFFSET);
      ctx.drawImage(sprite.image, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      // Fallback circle while image loads
      ctx.fillStyle = RARITY_COLOR[tower.rarity] || '#ffffff';
      ctx.beginPath();
      const fallbackR = Math.max(10, Math.round(size * 0.35));
      ctx.arc(screenX, screenY, fallbackR, 0, Math.PI * 2);
      ctx.fill();
    }
    if (GAME_STATE.selections.has(tower.id)) {
      ctx.strokeStyle = '#37a0f2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const selR = Math.max(12, tower.selectionRadius ?? Math.round(size * 0.35));
      ctx.arc(screenX, screenY, selR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function renderEnemies() {
  for (const enemy of GAME_STATE.enemies) {
    const screenX = enemy.x - CAMERA.x;
    const screenY = enemy.y - CAMERA.y;
    if (screenX < -enemy.size || screenX > CAMERA.width + enemy.size) continue;
    if (screenY < -enemy.size || screenY > CAMERA.height + enemy.size) continue;
    const velocity = computeEnemyVelocity(enemy);
    const computedHeading = Math.atan2(velocity.vy, velocity.vx);
    const heading = Number.isFinite(enemy.heading) ? enemy.heading
      : Number.isFinite(computedHeading) ? computedHeading : 0;
    if (enemy.type !== 'boss') {
      const sprite = getEnemySprite(enemy);
      if (sprite.image && sprite.image.complete && sprite.image.naturalWidth > 0) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(heading + ENEMY_HEADING_OFFSET);
        const sz = sprite.size || enemy.size * 1.7;
        ctx.drawImage(sprite.image, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else {
        const visualRadius = enemy.size * 1.7;
        ctx.fillStyle = enemy.fill || '#c85f85';
        ctx.beginPath();
        ctx.arc(screenX, screenY, visualRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(heading);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.beginPath();
        ctx.moveTo(visualRadius * 0.8, 0);
        ctx.lineTo(visualRadius * 0.25, visualRadius * 0.35);
        ctx.lineTo(visualRadius * 0.25, -visualRadius * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else {
      const sprite = getBossSprite(enemy);
      // Aura
      const eraAura = {
        '초기': '#d4aa70',
        '조선': '#6b7b4a',
        '근대': '#3f5a7a',
        '현대': '#c85f85',
      }[enemy.era] || '#d35400';
      const t = (GAME_STATE.time - (enemy.spawnAt || GAME_STATE.time));
      const pulse = 1 + 0.06 * Math.sin(t * 3.2);
      const auraR = enemy.size * 1.6 * pulse;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = eraAura;
      ctx.beginPath();
      ctx.arc(screenX, screenY, auraR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.ellipse(screenX + 2, screenY + enemy.size * 0.55, enemy.size * 0.9, enemy.size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (sprite.image && sprite.image.complete && sprite.image.naturalWidth > 0) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(heading + ENEMY_HEADING_OFFSET);
        const sz = sprite.size || enemy.size * 1.7;
        ctx.drawImage(sprite.image, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else {
        ctx.fillStyle = '#d35400';
        ctx.beginPath();
        ctx.arc(screenX, screenY, enemy.size * 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
    if (enemy.type === 'boss') {
      const w = 56, h = 6;
      const x = screenX - w / 2;
      const y = screenY - enemy.size - 14;
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(x, y, w * hpPercent, h);
      ctx.strokeStyle = '#0e141e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    } else {
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(screenX - 16, screenY - enemy.size - 10, 32, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(screenX - 16, screenY - enemy.size - 10, 32 * hpPercent, 4);
    }
  }
}

function renderProjectiles() {
  for (const projectile of GAME_STATE.projectiles) {
    const style = projectile.style || getProjectileStyle(projectile.weaponType);
    const screenX = projectile.x - CAMERA.x;
    const screenY = projectile.y - CAMERA.y;
    if (screenX < -projectile.radius || screenX > CAMERA.width + projectile.radius) continue;
    if (screenY < -projectile.radius || screenY > CAMERA.height + projectile.radius) continue;
    const angle = Math.atan2(projectile.vy, projectile.vx);
    if (style?.trail) {
      ctx.save();
      ctx.strokeStyle = style.trail;
      ctx.lineWidth = Math.max(1.4, projectile.radius * 0.55);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX - projectile.vx * 0.06, screenY - projectile.vy * 0.06);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);
    const size = style?.size ?? projectile.radius * 2;
    if (style?.image && style.image.complete && style.image.naturalWidth > 0) {
      ctx.drawImage(style.image, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = style?.color || '#ecf0f1';
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.4, size * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function renderMinimap() {
  minimapCtx.fillStyle = '#0f121b';
  minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);
  minimapCtx.strokeStyle = '#2a3242';
  minimapCtx.strokeRect(0.5, 0.5, minimapCanvas.width - 1, minimapCanvas.height - 1);

  const scaleX = minimapCanvas.width / WORLD.width;
  const scaleY = minimapCanvas.height / WORLD.height;

  if (GAME_STATE.minimapBossAlert > 0) {
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 100);
    minimapCtx.save();
    minimapCtx.lineWidth = 3;
    minimapCtx.strokeStyle = `rgba(211, 84, 0, ${pulse.toFixed(2)})`;
    minimapCtx.strokeRect(1.5, 1.5, minimapCanvas.width - 3, minimapCanvas.height - 3);
    minimapCtx.restore();
  }

  minimapCtx.fillStyle = '#37a0f2';
  for (const tower of GAME_STATE.towers) {
    minimapCtx.fillRect(tower.x * scaleX - 2, tower.y * scaleY - 2, 4, 4);
  }

  for (const enemy of GAME_STATE.enemies) {
    minimapCtx.fillStyle = enemy.type === 'boss' ? '#d35400' : '#c85f85';
    minimapCtx.fillRect(enemy.x * scaleX - 2, enemy.y * scaleY - 2, 4, 4);
  }

  minimapCtx.strokeStyle = '#37a0f2';
  minimapCtx.lineWidth = 1;
  const camWidth = Math.min(CAMERA.width, WORLD.width);
  const camHeight = Math.min(CAMERA.height, WORLD.height);
  const camX = clamp(CAMERA.x, 0, WORLD.width - camWidth);
  const camY = clamp(CAMERA.y, 0, WORLD.height - camHeight);
  minimapCtx.strokeRect(
    camX * scaleX + 0.5,
    camY * scaleY + 0.5,
    camWidth * scaleX,
    camHeight * scaleY
  );
}

function renderPauseOverlay() {
  if (!GAME_STATE.paused) return;
  ctx.save();
  ctx.fillStyle = 'rgba(15, 17, 21, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#eaeef2';
  ctx.font = 'bold 32px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('일시 정지', canvas.width / 2, canvas.height / 2);
  ctx.restore();
}

function render() {
  ctx.fillStyle = '#111621';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  renderGrid();
  renderInnerRing();
  renderGuideOverlays();
  renderTowers();
  renderEnemies();
  renderHitBlips();
  renderProjectiles();
  renderFloaters();
  renderSelectionBox();
  renderMinimap();
  renderPauseOverlay();
  updateHUD();
}

function onKeyDown(event) {
  if ((event.code === 'Enter' && event.altKey) || event.code === 'F11') {
    event.preventDefault();
    void toggleFullscreen().then(() => resizeCanvas());
    return;
  }
  if (GAME_STATE.scene === 'game' && handleCameraKey(event.code, true)) {
    if (
      event.code.startsWith('Arrow')
    ) {
      event.preventDefault();
      return;
    }
  }
  if (GAME_STATE.scene !== 'game' && event.code.startsWith('Arrow')) {
    event.preventDefault();
  }
  if (onCommandKeyDown(event)) {
    event.preventDefault();
  }
}

function onKeyUp(event) {
  if (event.code === 'F11') {
    event.preventDefault();
    return;
  }
  if (GAME_STATE.scene === 'game' && handleCameraKey(event.code, false)) {
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
  }
  if (GAME_STATE.scene !== 'game' && event.code.startsWith('Arrow')) {
    event.preventDefault();
  }
  onCommandKeyUp(event);
}

function setupEventListeners() {
  if (elements.commandGrid) {
    elements.commandGrid.addEventListener('click', onCommandClick);
    elements.commandGrid.addEventListener('contextmenu', (event) => event.preventDefault());
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
  // Music widget controls
  elements.youtubeBtnPlay?.addEventListener('click', () => {
    ytTogglePlay();
  });
  elements.youtubeBtnNext?.addEventListener('click', () => {
    ytNextVideo();
  });
  elements.playButton?.addEventListener('click', () => {
    // Open difficulty picker overlay in the lobby
    elements.difficultyOverlay?.classList.remove('hidden');
    // Reflect current difficulty selection highlight if any
    updateDifficultyUI();
  });
  elements.settingsButton?.addEventListener('click', () => setScene('settings'));
  elements.exitButton?.addEventListener('click', () => {
    setWaveStatus('브라우저 탭을 닫으면 게임이 종료됩니다.', { duration: 2800 });
  });
  elements.settingsBackButton?.addEventListener('click', () => closeSettings(true));
  elements.settingsToLobbyButton?.addEventListener('click', () => closeSettings(true, 'lobby'));
  elements.difficultyBackButton?.addEventListener('click', () => {
    // Close difficulty picker
    elements.difficultyOverlay?.classList.add('hidden');
  });
  elements.settingInterest?.addEventListener('change', () => applySettingsFromUI());
  elements.settingSensitivity?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });
  elements.settingPanSpeed?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });
  elements.settingBgmVolume?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });
  elements.settingSfxVolume?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });
  if (Array.isArray(elements.difficultyButtons)) {
    elements.difficultyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const { difficulty } = button.dataset || {};
        if (!difficulty) return;
        // Always set difficulty
        setDifficulty(difficulty, { silent: true });
        // If difficulty overlay is visible, start the game immediately
        const fromPicker = !!(elements.difficultyOverlay && !elements.difficultyOverlay.classList.contains('hidden'));
        if (fromPicker) {
          elements.difficultyOverlay.classList.add('hidden');
          setScene('game', { reset: true });
        } else {
          updateDifficultyUI();
        }
      });
    });
  }
  // Fullscreen toggles automatically when the setting is enabled (default).
  updateDifficultyUI();
  syncSettingsUI();
  elements.gameOverRetry?.addEventListener('click', () => {
    hideGameOverOverlay();
    setScene('game', { reset: true });
  });
  elements.gameOverLobby?.addEventListener('click', () => {
    hideGameOverOverlay();
    setScene('lobby');
  });
}

function update(delta) {
  if (!GAME_STATE.running) return;
  if (GAME_STATE.scene !== 'game') return;
  if (GAME_STATE.paused) {
    updateCameraEdgePan(delta);
    updateCameraKeyboard(delta);
    return;
  }
  const scaledDelta = delta * GAME_STATE.speedMultiplier;
  GAME_STATE.time += scaledDelta;
  // Tick boss summon cooldowns
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
      GAME_STATE.bossGraceTimer = Math.min(BOSS_GRACE_DURATION, GAME_STATE.bossGraceTimer + scaledDelta);
      if (GAME_STATE.bossGraceTimer >= BOSS_GRACE_DURATION) {
        triggerDefeat('보스를 처치하지 못했습니다');
        return;
      }
    } else if (GAME_STATE.waveActive) {
      GAME_STATE.bossGraceTimer = 0;
      endWave();
    }
  } else if (GAME_STATE.bossGraceTimer > 0) {
    GAME_STATE.bossGraceTimer = 0;
  }
  processCommands();
  // Handle pending boss summon request
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
    renderCommandPanel();
  }
  handleSpawning(delta);
  updateEnemies(delta);
  // Summoned boss defeat timer (100s)
  for (const enemy of GAME_STATE.enemies) {
    if (enemy.type === 'boss' && enemy.isWaveBoss === false) {
      const aliveFor = (GAME_STATE.time - (enemy.spawnAt || GAME_STATE.time));
      if (aliveFor >= 100) {
        triggerDefeat('보스 증원 처치 실패');
        return;
      }
    }
  }
  updateTowers(delta);
  updateProjectiles(delta);
  updateFloaters(delta);
  updateHitBlips(delta);
  GAME_STATE.minimapBossAlert = Math.max(0, GAME_STATE.minimapBossAlert - delta);
  updateCameraEdgePan(delta);
  updateCameraKeyboard(delta);
  if (GAME_STATE.enemies.length >= CONFIG.wave.defeatThreshold) {
    triggerDefeat('적 병력 포화!');
    return;
  }
}

function triggerDefeat(reason) {
  if (!GAME_STATE.running) return;
  GAME_STATE.running = false;
  GAME_STATE.waveActive = false;
  GAME_STATE.bossMustDie = false;
  GAME_STATE.bossGraceTimer = 0;
  GAME_STATE.pendingCommands = [];
  GAME_STATE.sceneReturn = 'lobby';
  setWaveStatus(reason || '패배', { persistent: true });
  renderCommandPanel(true);
  const stats = buildGameOverStats(MAX_WAVES);
  showGameOverOverlay(reason || '패배', { stats });
  updateHUD();
  playSound('game_over', { volume: 0.8 });
}


function gameLoop(now) {
  GAME_STATE.delta = (now - GAME_STATE.lastFrame) / 1000;
  GAME_STATE.lastFrame = now;
  update(GAME_STATE.delta);
  render();
  requestAnimationFrame(gameLoop);
}

function initializeGame() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  minimapCanvas = document.getElementById('minimap');
  minimapCtx = minimapCanvas.getContext('2d');

  initializeGlobals({ canvas, minimapCanvas });
  initAudio();
  // Apply initial SFX volume
  try { setSfxVolumePercent(SETTINGS.sfxVolume); } catch (_) {}
  applyDifficultyPreset(GAME_STATE.difficulty || 'normal');
  configureWorldGeometry();
  applyCameraSettings();
  setupEventListeners();
  // Initialize the embedded YouTube mini player (BGM) over the minimap
  void initYouTubeMiniPlayer({
    containerId: 'yt-player',
    titleElementId: 'yt-title',
    url: 'https://www.youtube.com/watch?v=lzNKijtrqm4&list=RDlzNKijtrqm4&start_radio=1',
    width: 160,
    height: 90,
    autoplay: true,
    volume: SETTINGS.bgmVolume,
    rotationEverySec: 0,
    // Program decides next song with a fixed order playlist provided by user.
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
    gameLoop(timestamp);
  });
}

export { initializeGame };
