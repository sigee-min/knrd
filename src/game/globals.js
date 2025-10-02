import { UNIT_LIBRARY as RAW_UNIT_LIBRARY } from '../data/unitLibrary.js';
import { DOCKYARD_CAPACITY } from '../systems/shipyard.js';
import { MAX_SELECTION, HUD_ALERT_DEFAULT_DURATION, MAX_WAVES, BOSS_GRACE_DURATION, EARLY_EASE_ROUNDS, EARLY_EASE_MIN, EARLY_EASE_STEP } from './constants.js';

const PREP_WAVE_DURATION = 15;

// Build grouped unit library with 4 eras
const UNIT_LIBRARY = {
  '초기': [
    ...(RAW_UNIT_LIBRARY['고대'] || []),
    ...(RAW_UNIT_LIBRARY['삼국'] || []),
    ...(RAW_UNIT_LIBRARY['고려'] || []),
  ],
  '조선': [
    ...(RAW_UNIT_LIBRARY['조선 전기'] || []),
    ...(RAW_UNIT_LIBRARY['조선 후기'] || []),
  ],
  '근대': [
    ...(RAW_UNIT_LIBRARY['개화기/대한제국'] || []),
  ],
  '현대': [
    ...(RAW_UNIT_LIBRARY['현대 초창기'] || []),
    ...(RAW_UNIT_LIBRARY['현대'] || []),
    ...(RAW_UNIT_LIBRARY['근미래'] || []),
  ],
};

const SETTINGS = {
  interestEnabled: true,
  pointerSensitivity: 1.0,
  panSpeedMultiplier: 1.0,
  autoFullscreen: true,
};

const CAMERA = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  minX: 0,
  minY: 0,
  maxX: 0,
  maxY: 0,
  panSpeed: 600,
  basePanSpeed: 600,
  pointerSensitivity: SETTINGS.pointerSensitivity,
  edgeZone: 80,
};

const COMMAND_TO_ELEMENT = {};

const COMMAND_LIBRARY = {
  roll: {
    id: 'roll',
    hotkey: 'Q',
    label: '건조',
    icon: 'assets/svg/ui/cmd_roll.svg',
    hint: 'Shift+Q: 한 번에 5척 건조',
  },
  speed: {
    id: 'speed',
    hotkey: 'R',
    label: '속도',
    icon: 'assets/svg/ui/cmd_speed.svg',
  },
  upgrade: {
    id: 'upgrade',
    hotkey: 'W',
    label: '강화',
    icon: 'assets/svg/ui/cmd_upgrade.svg',
    hint: 'Shift+W: 선택 유닛 일괄 강화',
  },
  fusion: {
    id: 'fusion',
    hotkey: 'F',
    label: '융합',
    icon: 'assets/svg/ui/cmd_fusion.svg',
    hint: '같은 함선 3척을 모아 융합합니다',
  },
  era: {
    id: 'era',
    hotkey: 'E',
    label: '시대 업',
    icon: 'assets/svg/ui/cmd_era.svg',
    hint: '5G로 선택 유닛을 다음 시대 동일 등급으로 업그레이드',
  },
  guide: {
    id: 'guide',
    hotkey: 'X',
    label: '사거리 표시',
    icon: 'assets/svg/icons/icon_round.svg',
    hint: '선택 유닛 사거리 표시 토글',
  },
  shop: {
    id: 'shop',
    hotkey: 'G',
    label: '구입',
    icon: 'assets/svg/icons/icon_gold.svg',
    hint: '정수를 사용해 고급 함선을 즉시 구입합니다',
  },
  boss: {
    id: 'boss',
    hotkey: 'H',
    label: '보스 소환',
    icon: 'assets/svg/icons/icon_boss.svg',
    hint: '소환 가능한 보스 목록 열기',
  },
  cancel: {
    id: 'cancel',
    hotkey: 'S',
    label: '선택 해제',
    icon: 'assets/svg/cursors/cursor_cancel.svg',
    hint: '선택 및 예약 명령 취소',
  },
  dockyard: {
    id: 'dockyard',
    hotkey: 'B',
    label: '조선소 증설',
    icon: 'assets/svg/icons/icon_shipyard.svg',
    hint: '조선소를 증설하여 용량 +8 (비용: 현재 최대 함선 크기)',
  },
  // Hotkey-only command (no button): round skip when cleared
  skip: {
    id: 'skip',
    hotkey: 'N',
    label: '라운드 스킵',
    icon: 'assets/svg/icons/icon_timer.svg',
    hint: '라운드 내 모든 적 처치 시 다음 라운드로 즉시 진행',
  },
  sell: {
    id: 'sell',
    hotkey: 'Del',
    label: '판매',
    icon: 'assets/svg/icons/icon_gold.svg',
    hint: '선택 유닛 판매\nShift: 선택 전부 판매',
  },
  back: {
    id: 'back',
    hotkey: 'Backspace',
    label: '되돌리기',
    icon: 'assets/svg/cursors/cursor_cancel.svg',
    hint: '보스 소환 목록 등에서 돌아가기',
  },
};

const HOTKEY_TO_COMMAND = {
  KeyQ: 'roll',
  KeyW: 'upgrade',
  KeyF: 'fusion',
  KeyE: 'era',
  KeyR: 'speed',
  KeyS: 'cancel',
  KeyZ: 'selectAll',
  KeyX: 'guide',
  KeyG: 'shop',
  KeyH: 'boss',
  KeyB: 'dockyard',
  KeyN: 'skip',
  KeyC: 'options',
  KeyP: 'pause',
  Delete: 'sell',
  Backspace: 'back',
  Escape: 'toggleSettings',
};

const DIFFICULTY_PRESETS = {
  normal: {
    id: 'normal',
    label: '보통',
    hpMultiplier: 1,
    summary: '균형잡힌 기본 전투',
  },
  hard: {
    id: 'hard',
    label: '어려움',
    hpMultiplier: 2,
    summary: '전략적인 집중이 필요한 난이도',
  },
  extreme: {
    id: 'extreme',
    label: '극한',
    hpMultiplier: 3,
    summary: '압도적인 적 물량과 체력',
  },
};

let CONFIG = null;

const GAME_STATE = {
  running: false,
  speedMultiplier: 1,
  scene: 'lobby',
  sceneReturn: 'lobby',
  paused: false,
  gold: 50,
  essence: 0,
  round: 0,
  eraIndex: 0,
  pendingEraUpgrades: 0,
  waveTimer: PREP_WAVE_DURATION,
  spawnAccumulator: 0,
  spawnedThisWave: 0,
  bossCountdown: 0,
  isBossWave: false,
  bossSpawned: false,
  bossSpawnTimer: 0,
  enemies: [],
  towers: [],
  projectiles: [],
  selections: new Set(),
  selectedEnemy: null,
  pendingCommands: [],
  commandMode: 'main',
  bossSummons: [],
  lastWaveBossKey: null,
  nextSummonBossKey: null,
  rngSeed: (Date.now() * 9301) >>> 0,
  nextEntityId: 1,
  time: 0,
  lastFrame: performance.now(),
  delta: 0,
  waveActive: true,
  showGuide: false,
  interestEnabled: true,
  dragSelecting: false,
  dragAdditive: false,
  dragToggle: false,
  dragStartScreen: { x: 0, y: 0 },
  dragCurrentScreen: { x: 0, y: 0 },
  dragStartWorld: { x: 0, y: 0 },
  pointer: {
    screenX: 0,
    screenY: 0,
    inside: false,
  },
  cameraInput: { up: false, down: false, left: false, right: false },
  floaters: [],
  hitBlips: [],
  minimapBossAlert: 0,
  dockyards: 1,
  bossMustDie: false,
  bossGraceTimer: 0,
  difficulty: 'normal',
  difficultyMultiplier: DIFFICULTY_PRESETS.normal.hpMultiplier,
  // Event flags
  lastUniqueEventRound: -1,
};

function createConfig(canvas, minimapCanvas) {
  const config = {
    battlefield: {
      width: canvas.width,
      height: canvas.height,
    },
    grid: {
      cols: 8,
      rows: 5,
      cellSize: 120,
    },
    wave: {
      spawnCountBase: 40,
      spawnCountGrowth: 1,
      spawnDuration: 40,
      waveDuration: 90,
      bossInterval: 10,
      bossSpawnDelay: 10,
      defeatThreshold: 150,
      enemyReward: 1,
      bossReward: 50,
    },
    economy: {
      baseRollCost: 10,
      rollCostRamp: 5,
      rollCostStep: 5,
      upgradeBaseCost: 3,
      upgradeStep: 2,
      tierCosts: [5, 5, 5, 5, 5],
      interestRate: 0.05,
      interestCap: 50,
      essenceBossReward: 1,
    },
    rng: {
      rarity: [
        { tier: 'primordial', chance: 0.0001 },
        { tier: 'mythic', chance: 0.001 },
        { tier: 'legendary', chance: 0.01 },
        { tier: 'unique', chance: 0.10 },
        { tier: 'rare', chance: 0.40 },
        { tier: 'common', chance: 0.4889 },
      ],
    },
    orbit: {
      radius: 0,
      centerX: canvas.width / 2,
      centerY: canvas.height / 2,
    },
    minimap: {
      width: minimapCanvas.width,
      height: minimapCanvas.height,
    },
  };

  config.grid.width = config.grid.cols * config.grid.cellSize;
  config.grid.height = config.grid.rows * config.grid.cellSize;
  config.grid.offsetX = Math.floor((config.battlefield.width - config.grid.width) / 2);
  config.grid.offsetY = Math.floor((config.battlefield.height - config.grid.height) / 2);
  const baseOrbitRadius = Math.min(config.grid.width, config.grid.height) * 0.42;
  config.orbit.radius = baseOrbitRadius * 1.2;
  config.innerOrbitRadius = baseOrbitRadius * 0.9 * 1.2;

  return config;
}

function createInitialGameState(config) {
  return {
    running: false,
    speedMultiplier: 1,
    scene: 'lobby',
    sceneReturn: 'lobby',
    paused: false,
    gold: 50,
    essence: 0,
    round: 0,
    eraIndex: 0,
    pendingEraUpgrades: 0,
    waveTimer: PREP_WAVE_DURATION,
    spawnAccumulator: 0,
    spawnedThisWave: 0,
    spawnTarget: 0,
    bossCountdown: config.wave.bossInterval,
    isBossWave: false,
    bossSpawned: false,
    bossSpawnTimer: 0,
    enemies: [],
    towers: [],
    projectiles: [],
    selections: new Set(),
    selectedEnemy: null,
    pendingCommands: [],
    rngSeed: (Date.now() * 9301) >>> 0,
    nextEntityId: 1,
    time: 0,
    lastFrame: performance.now(),
    delta: 0,
    waveActive: true,
    showGuide: false,
    interestEnabled: SETTINGS.interestEnabled,
    dragSelecting: false,
    dragAdditive: false,
    dragToggle: false,
    dragStartScreen: { x: 0, y: 0 },
    dragCurrentScreen: { x: 0, y: 0 },
    dragStartWorld: { x: 0, y: 0 },
    pointer: {
      screenX: 0,
      screenY: 0,
      inside: false,
    },
    cameraInput: { up: false, down: false, left: false, right: false },
    floaters: [],
    hitBlips: [],
    minimapBossAlert: 0,
    dockyards: 1,
    bossMustDie: false,
    bossGraceTimer: 0,
    difficulty: 'normal',
    difficultyMultiplier: DIFFICULTY_PRESETS.normal.hpMultiplier,
    lastUniqueEventRound: -1,
  };
}

function updateCameraBounds(canvas) {
  if (!canvas) return;
  CAMERA.width = canvas.width;
  CAMERA.height = canvas.height;
  CAMERA.maxX = Math.max(0, CONFIG.battlefield.width - CAMERA.width);
  CAMERA.maxY = Math.max(0, CONFIG.battlefield.height - CAMERA.height);
  CAMERA.edgeZone = Math.min(120, Math.min(CAMERA.width, CAMERA.height) * 0.12);
  CAMERA.pointerSensitivity = SETTINGS.pointerSensitivity;
  CAMERA.panSpeed = CAMERA.basePanSpeed * SETTINGS.panSpeedMultiplier;
}

function initializeGlobals({ canvas, minimapCanvas }) {
  CONFIG = createConfig(canvas, minimapCanvas);
  updateCameraBounds(canvas);
  Object.assign(GAME_STATE, createInitialGameState(CONFIG));
}

export {
  MAX_SELECTION,
  HUD_ALERT_DEFAULT_DURATION,
  MAX_WAVES,
  BOSS_GRACE_DURATION,
  EARLY_EASE_ROUNDS,
  EARLY_EASE_MIN,
  EARLY_EASE_STEP,
  PREP_WAVE_DURATION,
  SETTINGS,
  CAMERA,
  COMMAND_LIBRARY,
  COMMAND_TO_ELEMENT,
  HOTKEY_TO_COMMAND,
  GAME_STATE,
  CONFIG,
  DIFFICULTY_PRESETS,
  DOCKYARD_CAPACITY,
  initializeGlobals,
  updateCameraBounds,
  UNIT_LIBRARY,
};
