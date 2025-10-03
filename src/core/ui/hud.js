import { elements } from '../../ui/elements.js';
import {
  GAME_STATE,
  CONFIG,
  SETTINGS,
  DIFFICULTY_PRESETS,
  MAX_WAVES,
  PREP_WAVE_DURATION,
  CAMERA,
} from '../../game/globals.js';
import { getRollCost, getDockyardUsage, ERA_ORDER } from '../../game/combat.js';
import { refreshCommandStates } from '../../game/commands.js';
import { isGameOverOverlayVisible } from '../../game/overlay.js';

const HUD_CACHE = {
  gold: null,
  essence: null,
  round: null,
  eraIndex: null,
  bossCountdown: null,
  isBossWave: null,
  speedMultiplier: null,
  paused: null,
  waveActive: null,
  difficultyId: null,
  goldWarning: null,
  goldReady: null,
  roundHighlight: null,
  bossCritical: null,
  dockUsed: null,
  dockTotal: null,
  dockOver: null,
  chipDifficulty: '',
  chipSpeed: '',
  chipBoss: '',
};

const WAVE_INFO_STATE = {
  markup: '',
  hidden: true,
  bossClass: null,
  urgentClass: null,
  scene: null,
  timerSpan: null,
  timerLine: '',
};

function updateWaveInfo() {
  const waveInfoEl = elements.waveInfo;
  if (!waveInfoEl) return;

  const scene = GAME_STATE.scene;

  if (scene !== 'game') {
    if (!waveInfoEl.classList.contains('hidden')) waveInfoEl.classList.add('hidden');
    const context = scene === 'settings'
      ? '설정을 조정한 뒤 돌아가기를 누르세요.'
      : '플레이 버튼을 눌러 방어를 시작하세요.';
    const infoLabel = scene === 'settings' ? '설정' : '로비';
    const roundInfo = scene === 'settings'
      ? `라운드 ${GAME_STATE.round} 진행 중`
      : '라운드 1 준비 완료';
    const markup = `
      <div class="title-row">
        <span>${infoLabel}</span>
        <span>&nbsp;</span>
      </div>
      <div class="wave-metrics">
        <span>${context}</span>
        <span>감도 ${SETTINGS.pointerSensitivity.toFixed(1)} · 속도 ${SETTINGS.panSpeedMultiplier.toFixed(1)}</span>
        <span>${roundInfo}</span>
      </div>
      <div class="wave-progress">
        <span style="width:0%"></span>
      </div>
    `;
    if (markup !== WAVE_INFO_STATE.markup) {
      waveInfoEl.innerHTML = markup;
      WAVE_INFO_STATE.markup = markup;
    }
    WAVE_INFO_STATE.hidden = true;
    WAVE_INFO_STATE.scene = scene;
    WAVE_INFO_STATE.bossClass = null;
    WAVE_INFO_STATE.urgentClass = null;
    WAVE_INFO_STATE.timerSpan = null;
    WAVE_INFO_STATE.timerLine = '';
    return;
  }

  if (WAVE_INFO_STATE.hidden) {
    waveInfoEl.classList.remove('hidden');
    WAVE_INFO_STATE.hidden = false;
  }

  if (isGameOverOverlayVisible()) {
    if (!waveInfoEl.classList.contains('hidden')) {
      waveInfoEl.classList.add('hidden');
      WAVE_INFO_STATE.hidden = true;
    }
    return;
  }

  const waveNumber = Math.min(GAME_STATE.round, MAX_WAVES);
  const isPrepWave = GAME_STATE.round === 0;
  const isFinalWave = !isPrepWave && waveNumber === MAX_WAVES;
  const gameCleared = !GAME_STATE.running && !GAME_STATE.waveActive && isFinalWave;

  let markup;
  let timerLine = null;

  if (gameCleared) {
    const { used: usedCapacity, total: totalCapacity } = getDockyardUsage();
    markup = `
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
  } else {
    const difficultyPreset = DIFFICULTY_PRESETS[GAME_STATE.difficulty] || DIFFICULTY_PRESETS.normal;
    const difficultyLabel = difficultyPreset.label;
    const bossWave = GAME_STATE.isBossWave;
    const waveTypeLeft = isPrepWave
      ? '<strong class="em">준비 라운드</strong> · 함대를 준비하세요'
      : `웨이브 <strong class="em">${waveNumber}</strong>/<strong class="muted">${MAX_WAVES}</strong> · <strong class="em">${difficultyLabel}</strong>${bossWave ? ' · <span class="boss">보스</span>' : ''}`;
    let progress = 0;
    let statusLine = '';
    const timerRemain = Math.max(0, Math.floor(GAME_STATE.waveTimer));
    const spawnTarget = GAME_STATE.spawnTarget || 0;

    if (GAME_STATE.waveActive) {
      if (isPrepWave) {
        const elapsed = Math.max(0, PREP_WAVE_DURATION - GAME_STATE.waveTimer);
        progress = PREP_WAVE_DURATION > 0 ? Math.min(1, elapsed / PREP_WAVE_DURATION) : 1;
        statusLine = `준비 시간 ${timerRemain}s · Q: 건조 · W: 강화 · B: 조선소`;
      } else if (bossWave) {
        if (GAME_STATE.bossSpawned) {
          progress = 1;
          statusLine = '보스 전투 진행 중';
        } else {
          progress = Math.min(1, CONFIG.wave.bossSpawnDelay === 0 ? 1 : GAME_STATE.bossSpawnTimer / CONFIG.wave.bossSpawnDelay);
          const remain = Math.max(0, CONFIG.wave.bossSpawnDelay - GAME_STATE.bossSpawnTimer);
          statusLine = `보스 등장까지 <strong class="em">${remain.toFixed(1)}</strong>초`;
        }
      } else {
        const effectiveTarget = spawnTarget || 1;
        progress = Math.min(1, GAME_STATE.spawnedThisWave / effectiveTarget);
        const spawnRate = CONFIG.wave.spawnDuration > 0 ? (effectiveTarget / CONFIG.wave.spawnDuration) : 0;
        statusLine = `<strong class="em">${GAME_STATE.spawnedThisWave}</strong>/<strong>${effectiveTarget}</strong> 스폰 · <strong class="em">${spawnRate.toFixed(1)}</strong>/s`;
      }
    } else {
      progress = 0;
      statusLine = isPrepWave ? '준비 중' : '다음 웨이브 준비 중';
    }

    timerLine = GAME_STATE.paused ? '정지 중' : `남은 <strong class="em">${timerRemain}</strong>초`;
    const progressPercent = Math.round(progress * 100);
    const enemyInfo = `적 활동 <strong class="em">${GAME_STATE.enemies.length}</strong>/<strong>${CONFIG.wave.defeatThreshold}</strong>`;
    const speedInfo = `속도 <strong class="em">${GAME_STATE.paused ? '정지' : `x${GAME_STATE.speedMultiplier}`}</strong>`;

    markup = `
      <div class="title-row">
        <span>${waveTypeLeft}</span>
        <span>${timerLine}</span>
      </div>
      <div class="wave-metrics">
        <span>${statusLine}</span>
        <span>${enemyInfo}</span>
        <span>${speedInfo}</span>
      </div>
      <div class="wave-progress">
        <span style="width:${progressPercent}%"></span>
      </div>
    `;
  }

  if (markup !== WAVE_INFO_STATE.markup) {
    waveInfoEl.innerHTML = markup;
    WAVE_INFO_STATE.markup = markup;
    WAVE_INFO_STATE.timerSpan = timerLine ? waveInfoEl.querySelector('.title-row span:last-child') : null;
    WAVE_INFO_STATE.timerLine = timerLine ?? '';
  }

  if (timerLine) {
    const timerSpan = WAVE_INFO_STATE.timerSpan || waveInfoEl.querySelector('.title-row span:last-child');
    if (timerSpan) {
      WAVE_INFO_STATE.timerSpan = timerSpan;
      if (timerLine !== WAVE_INFO_STATE.timerLine) {
        timerSpan.innerHTML = timerLine;
        WAVE_INFO_STATE.timerLine = timerLine;
      }
    }
  } else if (WAVE_INFO_STATE.timerSpan) {
    WAVE_INFO_STATE.timerSpan = null;
    WAVE_INFO_STATE.timerLine = '';
  }

  const bossClass = GAME_STATE.isBossWave;
  if (bossClass !== WAVE_INFO_STATE.bossClass) {
    waveInfoEl.classList.toggle('is-boss', bossClass);
    WAVE_INFO_STATE.bossClass = bossClass;
  }

  const urgentClass = !GAME_STATE.isBossWave && GAME_STATE.bossCountdown <= 2;
  if (urgentClass !== WAVE_INFO_STATE.urgentClass) {
    waveInfoEl.classList.toggle('is-urgent', urgentClass);
    WAVE_INFO_STATE.urgentClass = urgentClass;
  }
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


function updateHUD() {
  updateWaveInfo();

  const gold = GAME_STATE.gold;
  const essence = GAME_STATE.essence ?? 0;
  const round = GAME_STATE.round;
  const eraIndex = GAME_STATE.eraIndex;
  const bossCountdown = GAME_STATE.bossCountdown;
  const isBossWave = GAME_STATE.isBossWave;
  const speedMultiplier = GAME_STATE.speedMultiplier;
  const paused = GAME_STATE.paused;
  const waveActive = GAME_STATE.waveActive;
  const difficultyId = GAME_STATE.difficulty;

  if (elements.gold && HUD_CACHE.gold !== gold) {
    elements.gold.textContent = gold.toLocaleString();
    HUD_CACHE.gold = gold;
  }
  if (elements.essence && HUD_CACHE.essence !== essence) {
    elements.essence.textContent = essence.toLocaleString();
    HUD_CACHE.essence = essence;
  }
  if (elements.round && HUD_CACHE.round !== round) {
    elements.round.textContent = round;
    HUD_CACHE.round = round;
  }
  if (elements.era && HUD_CACHE.eraIndex !== eraIndex) {
    elements.era.textContent = ERA_ORDER[eraIndex];
    HUD_CACHE.eraIndex = eraIndex;
  }
  if (elements.bossCountdown && (HUD_CACHE.bossCountdown !== bossCountdown || HUD_CACHE.isBossWave !== isBossWave)) {
    elements.bossCountdown.textContent = isBossWave ? '보스' : bossCountdown;
    HUD_CACHE.bossCountdown = bossCountdown;
  }

  const difficultyPreset = DIFFICULTY_PRESETS[difficultyId] || DIFFICULTY_PRESETS.normal;
  if (elements.chipDifficulty && HUD_CACHE.chipDifficulty !== difficultyPreset.label) {
    elements.chipDifficulty.textContent = difficultyPreset.label;
    HUD_CACHE.chipDifficulty = difficultyPreset.label;
  }
  const speedLabel = paused ? '정지' : `x${speedMultiplier}`;
  if (elements.chipSpeed && HUD_CACHE.chipSpeed !== speedLabel) {
    elements.chipSpeed.textContent = speedLabel;
    HUD_CACHE.chipSpeed = speedLabel;
  }
  const remaining = Math.max(0, (bossCountdown ?? 1) - 1);
  const chipBossLabel = isBossWave ? '보스 웨이브' : (remaining <= 0 ? '다음 웨이브' : `${remaining} 웨이브`);
  if (elements.chipBoss && HUD_CACHE.chipBoss !== chipBossLabel) {
    elements.chipBoss.textContent = chipBossLabel;
    HUD_CACHE.chipBoss = chipBossLabel;
  }

  const rollCost = getRollCost();
  const goldBadge = elements.gold?.closest?.('.resource');
  if (goldBadge) {
    const warn = gold < rollCost;
    const ready = gold >= rollCost;
    if (HUD_CACHE.goldWarning !== warn) {
      goldBadge.classList.toggle('is-warning', warn);
      HUD_CACHE.goldWarning = warn;
    }
    if (HUD_CACHE.goldReady !== ready) {
      goldBadge.classList.toggle('is-ready', ready);
      HUD_CACHE.goldReady = ready;
    }
  }

  const roundBadge = elements.round?.closest?.('.resource');
  if (roundBadge && HUD_CACHE.roundHighlight !== waveActive) {
    roundBadge.classList.toggle('is-highlight', waveActive);
    HUD_CACHE.roundHighlight = waveActive;
  }

  const bossBadge = elements.bossCountdown?.closest?.('.resource');
  const bossCritical = isBossWave || (bossCountdown ?? 0) <= 2;
  if (bossBadge && HUD_CACHE.bossCritical !== bossCritical) {
    bossBadge.classList.toggle('is-critical', bossCritical);
    HUD_CACHE.bossCritical = bossCritical;
  }

  if (elements.dockyardUsage) {
    const { used, total } = getDockyardUsage();
    if (HUD_CACHE.dockUsed !== used || HUD_CACHE.dockTotal !== total) {
      elements.dockyardUsage.textContent = `${used}/${total}`;
      HUD_CACHE.dockUsed = used;
      HUD_CACHE.dockTotal = total;
    }
    const over = used > total;
    if (HUD_CACHE.dockOver !== over) {
      elements.dockyardUsage.classList.toggle('over-capacity', over);
      const dockyardContainer = elements.dockyardUsage.closest('.shipyard-display');
      if (dockyardContainer) {
        dockyardContainer.classList.toggle('over-capacity', over);
      }
      HUD_CACHE.dockOver = over;
    }
    const dockyardContainer = elements.dockyardUsage.closest('.shipyard-display');
    if (dockyardContainer) {
      const title = `조선소 ${GAME_STATE.dockyards}개 · 용량 ${total} · 사용 ${used}`;
      if (dockyardContainer.title !== title) {
        dockyardContainer.title = title;
      }
    }
  }

  HUD_CACHE.isBossWave = isBossWave;
  HUD_CACHE.speedMultiplier = speedMultiplier;
  HUD_CACHE.paused = paused;
  HUD_CACHE.waveActive = waveActive;
  HUD_CACHE.difficultyId = difficultyId;
}


export { updateHUD, updateWaveInfo, updateCameraOverlay };
