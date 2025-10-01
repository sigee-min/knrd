import { elements } from '../ui/elements.js';
import {
  COMMAND_LIBRARY,
  COMMAND_TO_ELEMENT,
  HOTKEY_TO_COMMAND,
  GAME_STATE,
} from './globals.js';
import {
  DOCKYARD_CAPACITY,
  getTotalShipyardCapacity,
  getUsedShipyardCapacity,
  getDockyardBuildCost,
  hasAvailableShipyardCapacity,
} from '../systems/shipyard.js';
import {
  registerCombatCallbacks,
  getRollCost,
  getTierUpgradeCost,
  getEnhanceCost,
  executeRoll,
  executeUpgrade,
  attemptEraUpgrade,
  buildDockyard,
  executeSell,
  canSellTower,
  getSellValue,
  executeFusion,
  canFuseTower,
} from './combat.js';
import {
  registerSelectionCallbacks,
  selectAllTowers,
} from './selection.js';
import { setWaveStatus } from './status.js';

let currentCommandLayoutSignature = '';

const commandCallbacks = {
  onHudUpdate: null,
  onSelectionChanged: null,
  onCloseSettings: null,
  onOpenSettings: null,
  onGuideToggle: null,
};

/**
 * @typedef {Object} CommandCallbacks
 * @property {() => void} [onHudUpdate]
 * @property {() => void} [onSelectionChanged]
 * @property {(save?: boolean, targetScene?: string) => void} [onCloseSettings]
 * @property {(scene: string, options?: Record<string, unknown>) => void} [onOpenSettings]
 * @property {() => void} [onGuideToggle]
 */

/**
 * Registers callbacks for cross-module communication.
 * @param {CommandCallbacks} callbacks
 */
function registerCommandCallbacks(callbacks) {
  commandCallbacks.onHudUpdate = callbacks.onHudUpdate || null;
  commandCallbacks.onSelectionChanged = callbacks.onSelectionChanged || null;
  commandCallbacks.onCloseSettings = callbacks.onCloseSettings || null;
  commandCallbacks.onOpenSettings = callbacks.onOpenSettings || null;
  commandCallbacks.onGuideToggle = callbacks.onGuideToggle || null;
}

registerCombatCallbacks({
  onCommandLayoutChange: (force) => renderCommandPanel(force),
  onHudUpdate: () => commandCallbacks.onHudUpdate?.(),
  onSelectionChanged: () => commandCallbacks.onSelectionChanged?.(),
});

registerSelectionCallbacks({
  onCommandPanelRefresh: () => renderCommandPanel(),
});

function getCommandLayout() {
  if (!elements.commandGrid) return [];
  if (GAME_STATE.scene !== 'game') {
    return ['roll', 'era', 'speed'];
  }
  const selectionCount = GAME_STATE.selections.size;
  if (selectionCount === 0) {
    return ['roll', 'dockyard', 'era', 'speed', 'boss'];
  }
  return ['upgrade', 'fusion', 'era', 'guide', 'sell', 'boss'];
}

function refreshCommandStates() {
  const selectionCount = GAME_STATE.selections.size;
  const selection = selectionCount > 0 ? Array.from(GAME_STATE.selections) : [];
  const towers = selection
    .map((id) => GAME_STATE.towers.find((t) => t.id === id))
    .filter((tower) => !!tower);
  const usedCapacity = getUsedShipyardCapacity(GAME_STATE.towers);
  const totalCapacity = getTotalShipyardCapacity(GAME_STATE.dockyards);
  const hasCapacity = hasAvailableShipyardCapacity(GAME_STATE.towers, GAME_STATE.dockyards);
  const rollButton = COMMAND_TO_ELEMENT.roll;
  if (rollButton) {
    rollButton.disabled = GAME_STATE.scene !== 'game' || !hasCapacity;
    const cost = getRollCost();
    const hint = COMMAND_LIBRARY.roll.hint ? `${COMMAND_LIBRARY.roll.hint}\n` : '';
    const capacityLine = `조선소 ${usedCapacity}/${totalCapacity}`;
    const lockedLine = hasCapacity ? '' : '\n조선소 용량이 부족합니다';
    rollButton.title = `${hint}필요 골드 ${cost}G\n${capacityLine}${lockedLine}`;
  }
  const upgradeButton = COMMAND_TO_ELEMENT.upgrade;
  if (upgradeButton) {
    upgradeButton.disabled = towers.length === 0;
    let status = towers.length === 0 ? '유닛 선택 필요' : '';
    if (towers.length > 0) {
      const enhanceCost = getEnhanceCost(towers[0]);
      status = `강화 ${enhanceCost}G`;
    }
    if (towers.length > 1) {
      const costs = towers.map((tower) => getEnhanceCost(tower)).filter((cost) => Number.isFinite(cost));
      const minCost = costs.length > 0 ? Math.min(...costs) : 0;
      const maxCost = costs.length > 0 ? Math.max(...costs) : 0;
      const canTierUpgrade = towers.some((tower) => {
        const tierCost = getTierUpgradeCost(tower);
        return Number.isFinite(tierCost) && tierCost !== Infinity;
      });
      if (costs.length > 0) {
        if (minCost === maxCost) {
          status = `선택 ${towers.length}척 강화 · 필요 ${minCost}G (각각)`;
        } else {
          status = `선택 ${towers.length}척 강화 · 필요 ${minCost}~${maxCost}G`;
        }
      }
      if (canTierUpgrade) {
        status = `${status ? `${status} · ` : ''}일부 유닛은 티어 업 가능 (개별 선택 필요)`;
      }
    }
    const baseHint = COMMAND_LIBRARY.upgrade.hint ? `\n${COMMAND_LIBRARY.upgrade.hint}` : '';
    upgradeButton.title = status ? `${status}${baseHint}` : COMMAND_LIBRARY.upgrade.hint || '';
    const labelEl = upgradeButton.querySelector('.command-label');
    if (labelEl) {
      labelEl.textContent = COMMAND_LIBRARY.upgrade.label;
    }
  }
  const fusionButton = COMMAND_TO_ELEMENT.fusion;
  if (fusionButton) {
    const seenKeys = new Set();
    let fuseable = 0;
    for (const tower of towers) {
      if (!tower) continue;
      const key = `${tower.unitId}:${tower.fusionTier ?? 0}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      if (canFuseTower(tower)) {
        fuseable += 1;
      }
    }
    fusionButton.disabled = fuseable === 0;
    fusionButton.classList.toggle('ready', fuseable > 0);
    const labelEl = fusionButton.querySelector('.command-label');
    if (labelEl) {
      labelEl.textContent = COMMAND_LIBRARY.fusion.label;
    }
    const hintParts = [];
    if (COMMAND_LIBRARY.fusion.hint) {
      hintParts.push(COMMAND_LIBRARY.fusion.hint);
    }
    hintParts.push(fuseable > 0 ? `융합 가능 ${fuseable}종` : '융합 조건을 만족하는 유닛이 없습니다');
    fusionButton.title = hintParts.join('\n');
  }
  const eraButton = COMMAND_TO_ELEMENT.era;
  if (eraButton) {
    const available = GAME_STATE.pendingEraUpgrades > 0;
    eraButton.disabled = !available;
    eraButton.classList.toggle('ready', available);
    const baseHint = COMMAND_LIBRARY.era.hint || '시대 업 포인트 사용';
    eraButton.title = available ? `남은 시대 업 ${GAME_STATE.pendingEraUpgrades}개\n${baseHint}` : `${baseHint}\n시대 업 포인트 필요`;
    const labelEl = eraButton.querySelector('.command-label');
    if (labelEl) {
      labelEl.textContent = COMMAND_LIBRARY.era.label;
    }
  }
  const guideButton = COMMAND_TO_ELEMENT.guide;
  if (guideButton) {
    guideButton.classList.toggle('active', GAME_STATE.showGuide);
    const baseHint = COMMAND_LIBRARY.guide.hint || '';
    guideButton.title = GAME_STATE.showGuide ? `배치 가이드 ON\n${baseHint}` : baseHint;
  }
  const dockyardButton = COMMAND_TO_ELEMENT.dockyard;
  if (dockyardButton) {
    const dockyardCost = getDockyardBuildCost(GAME_STATE.dockyards);
    const affordable = GAME_STATE.gold >= dockyardCost;
    dockyardButton.disabled = !affordable;
    const labelEl = dockyardButton.querySelector('.command-label');
    if (labelEl) {
      labelEl.textContent = `조선소 +${DOCKYARD_CAPACITY}`;
    }
    const hintParts = [`필요 골드 ${dockyardCost}G`, `현재 ${usedCapacity}/${totalCapacity}`];
    if (!affordable) {
      hintParts.push('골드 부족');
    }
    const baseHint = COMMAND_LIBRARY.dockyard.hint ? `\n${COMMAND_LIBRARY.dockyard.hint}` : '';
    dockyardButton.title = `${hintParts.join('\n')}${baseHint}`;
  }
  const sellButton = COMMAND_TO_ELEMENT.sell;
  if (sellButton) {
    const sellable = towers.filter((tower) => canSellTower(tower));
    const unsellable = towers.filter((tower) => !canSellTower(tower));
    const totalValue = sellable.reduce((sum, tower) => sum + getSellValue(tower), 0);
    sellButton.disabled = sellable.length === 0;
    const labelEl = sellButton.querySelector('.command-label');
    if (labelEl) {
      labelEl.textContent = sellable.length > 0 ? COMMAND_LIBRARY.sell.label : '판매 불가';
    }
    const baseHint = COMMAND_LIBRARY.sell.hint ? `\n${COMMAND_LIBRARY.sell.hint}` : '';
    if (sellable.length > 0) {
      const sellLine = `판매 가능 ${sellable.length}척 · 환급 ${totalValue}G`;
      const unsellLine = unsellable.length > 0 ? `\n전설 이상 ${unsellable.length}척은 판매 불가` : '';
      sellButton.title = `${sellLine}${unsellLine}${baseHint}`;
    } else if (unsellable.length > 0) {
      sellButton.title = `전설 이상은 판매할 수 없습니다${baseHint}`;
    } else {
      sellButton.title = `판매할 유닛 없음${baseHint}`;
    }
  }
  const speedButton = COMMAND_TO_ELEMENT.speed;
  if (speedButton) {
    const isFast = GAME_STATE.speedMultiplier === 2;
    speedButton.classList.toggle('active', isFast);
    const label = speedButton.querySelector('.command-label');
    if (label) {
      label.textContent = isFast ? '속도 ×2' : '속도 ×1';
    }
    const baseHint = '전투 속도 토글';
    speedButton.title = `${baseHint}\n현재 배속 x${GAME_STATE.speedMultiplier}`;
  }
  const cancelButton = COMMAND_TO_ELEMENT.cancel;
  if (cancelButton) {
    const hasPending = GAME_STATE.pendingCommands.length > 0;
    cancelButton.disabled = !hasPending;
    const status = hasPending ? '예약된 명령 취소' : '취소할 항목 없음';
    const baseHint = COMMAND_LIBRARY.cancel.hint ? `\n${COMMAND_LIBRARY.cancel.hint}` : '';
    cancelButton.title = `${status}${baseHint}`;
  }
}

function renderCommandPanel(force = false) {
  const grid = elements.commandGrid;
  if (!grid) return;
  // Boss summon submenu rendering
  if (GAME_STATE.commandMode === 'boss') {
    const fragment = document.createDocumentFragment();
    const list = Array.isArray(GAME_STATE.bossSummons) ? GAME_STATE.bossSummons : [];
    list.forEach((entry, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'command-button';
      btn.dataset.command = 'summonBoss';
      btn.dataset.bossKey = entry.key;
      const hotkey = i < 9 ? `Digit${i + 1}` : '';
      const ready = !!entry.unlocked && (entry.cooldownRemaining ?? 0) <= 0;
      const cd = Math.max(0, Math.ceil(entry.cooldownRemaining ?? 0));
      const stateLabel = !entry.unlocked ? '잠금' : ready ? '소환 가능' : `${cd}s`;
      btn.disabled = !ready;
      const hpText = entry.hp != null ? `${entry.hp}` : '?';
      const essenceText = entry.essence != null ? `${entry.essence}` : '1';
      const rewardText = entry.reward != null ? `${entry.reward}G + 정수 ${essenceText}` : `정수 ${essenceText}`;
      const head = entry.unlocked ? (ready ? '보스 소환 가능' : '재사용 대기 중') : '해금 필요';
      btn.title = `${head}\n쿨타임: ${cd}s\nHP: ${hpText}\n보상: ${rewardText}`;
      btn.innerHTML = `
        <span class="command-icon"><img src="${entry.icon}" alt="${entry.name}" /></span>
        <span class="command-label">${entry.name}</span>
        <span class="command-hotkey">${i + 1}</span>
      `;
      fragment.appendChild(btn);
    });
    // back button
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'command-button';
    backBtn.dataset.command = 'back';
    backBtn.innerHTML = `
      <span class="command-icon"><img src="assets/svg/cursors/cursor_cancel.svg" alt="Back" /></span>
      <span class="command-label">되돌리기</span>
      <span class="command-hotkey">Back</span>
    `;
    fragment.appendChild(backBtn);
    grid.replaceChildren(fragment);
    return;
  }
  const layout = getCommandLayout();
  const signature = layout.join(',');
  if (!force && signature === currentCommandLayoutSignature) {
    refreshCommandStates();
    return;
  }
  currentCommandLayoutSignature = signature;
  Object.keys(COMMAND_TO_ELEMENT).forEach((key) => {
    delete COMMAND_TO_ELEMENT[key];
  });
  const fragment = document.createDocumentFragment();
  for (const commandId of layout) {
    const definition = COMMAND_LIBRARY[commandId];
    if (!definition) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.command = commandId;
    button.className = 'command-button';
    if (definition.hint) {
      button.title = definition.hint;
    }
    button.innerHTML = `
      <span class="command-icon"><img src="${definition.icon}" alt="${definition.label}" /></span>
      <span class="command-label">${definition.label}</span>
      <span class="command-hotkey">${definition.hotkey}</span>
    `;
    fragment.appendChild(button);
    COMMAND_TO_ELEMENT[commandId] = button;
  }
  grid.replaceChildren(fragment);
  refreshCommandStates();
}

function ensureHudUpdate() {
  commandCallbacks.onHudUpdate?.();
}

function ensureSelectionUpdate() {
  commandCallbacks.onSelectionChanged?.();
}

/**
 * Queues or executes a command triggered by UI or hotkeys.
 * @param {string} command
 * @param {{shift?: boolean}} [options]
 */
function handleCommand(command, options = {}) {
  const { shift = false, bossKey = null } = options;
  const gameOnly = new Set(['roll', 'upgrade', 'fusion', 'dockyard', 'sell', 'era', 'speed', 'cancel', 'guide', 'selectAll', 'options', 'pause']);
  if (GAME_STATE.scene !== 'game' && gameOnly.has(command)) {
    return;
  }
  switch (command) {
    case 'boss':
      GAME_STATE.commandMode = 'boss';
      renderCommandPanel(true);
      setWaveStatus('소환할 보스를 선택하세요');
      break;
    case 'back':
      GAME_STATE.commandMode = 'main';
      renderCommandPanel(true);
      setWaveStatus('메인 명령으로 돌아감');
      break;
    case 'summonBoss': {
      if (!bossKey) return;
      const list = Array.isArray(GAME_STATE.bossSummons) ? GAME_STATE.bossSummons : [];
      const entry = list.find((e) => e.key === bossKey);
      if (!entry || !entry.unlocked) {
        setWaveStatus('소환 불가: 잠금');
        break;
      }
      if ((entry.cooldownRemaining ?? 0) > 0) {
        setWaveStatus('소환 대기 중');
        break;
      }
      GAME_STATE.pendingCommands.push({ type: 'summonBoss', bossKey });
      GAME_STATE.commandMode = 'main';
      renderCommandPanel(true);
      break;
    }
    case 'roll':
      if (shift) {
        const repeat = 5;
        for (let i = 0; i < repeat; i += 1) {
          GAME_STATE.pendingCommands.push({ type: 'roll' });
        }
        setWaveStatus(`건조 ${repeat}회 예약`);
      } else {
        GAME_STATE.pendingCommands.push({ type: 'roll' });
        setWaveStatus('건조 명령');
      }
      break;
    case 'upgrade':
      if (shift) {
        const targets = Array.from(GAME_STATE.selections);
        if (targets.length === 0) {
          setWaveStatus('선택된 유닛 없음');
        } else {
          for (const id of targets) {
            GAME_STATE.pendingCommands.push({ type: 'upgrade', targetId: id });
          }
          setWaveStatus(`업그레이드 ${targets.length}회 예약`);
        }
      } else {
        GAME_STATE.pendingCommands.push({ type: 'upgrade' });
        setWaveStatus('업그레이드 명령');
      }
      break;
    case 'fusion': {
      const targets = Array.from(GAME_STATE.selections);
      if (targets.length === 0) {
        setWaveStatus('선택된 유닛 없음');
        break;
      }
      GAME_STATE.pendingCommands.push({ type: 'fusion', targetIds: targets });
      setWaveStatus('융합 명령');
      break;
    }
    case 'dockyard': {
      const repeat = shift ? 3 : 1;
      for (let i = 0; i < repeat; i += 1) {
        GAME_STATE.pendingCommands.push({ type: 'dockyard' });
      }
      setWaveStatus(`조선소 증설 ${repeat}회 예약`);
      break;
    }
    case 'sell': {
      const targets = Array.from(GAME_STATE.selections);
      if (targets.length === 0) {
        setWaveStatus('선택된 유닛 없음');
        break;
      }
      const targetIds = shift ? targets : [targets[0]];
      GAME_STATE.pendingCommands.push({ type: 'sell', targetIds });
      break;
    }
    case 'era':
      if (shift) {
        const available = GAME_STATE.pendingEraUpgrades;
        const repeat = available > 0 ? available : 1;
        for (let i = 0; i < repeat; i += 1) {
          GAME_STATE.pendingCommands.push({ type: 'era' });
        }
        setWaveStatus(available > 0 ? '시대 업그레이드 모두 적용' : '시대 업 시도');
      } else {
        GAME_STATE.pendingCommands.push({ type: 'era' });
        setWaveStatus('시대 업 시도');
      }
      break;
    case 'speed':
      GAME_STATE.speedMultiplier = GAME_STATE.speedMultiplier === 1 ? 2 : 1;
      setWaveStatus(GAME_STATE.speedMultiplier === 2 ? '속도 ×2' : '속도 정상');
      ensureHudUpdate();
      break;
    case 'cancel':
      GAME_STATE.pendingCommands = [];
      GAME_STATE.selections.clear();
      GAME_STATE.selectedEnemy = null;
      ensureSelectionUpdate();
      setWaveStatus('명령 취소');
      break;
    case 'guide':
      GAME_STATE.showGuide = !GAME_STATE.showGuide;
      refreshCommandStates();
      setWaveStatus(GAME_STATE.showGuide ? '배치 가이드 ON' : '배치 가이드 OFF');
      commandCallbacks.onGuideToggle?.();
      break;
    case 'selectAll':
      selectAllTowers();
      break;
    case 'options':
      GAME_STATE.interestEnabled = !GAME_STATE.interestEnabled;
      if (COMMAND_TO_ELEMENT.options) {
        COMMAND_TO_ELEMENT.options.classList.toggle('active', !GAME_STATE.interestEnabled);
      }
      setWaveStatus(GAME_STATE.interestEnabled ? '이자 활성화' : '이자 비활성화');
      ensureHudUpdate();
      break;
    case 'pause':
      GAME_STATE.paused = !GAME_STATE.paused;
      GAME_STATE.lastFrame = performance.now();
      setWaveStatus(GAME_STATE.paused ? '일시 정지' : '전투 재개', {
        persistent: GAME_STATE.paused,
      });
      ensureHudUpdate();
      break;
    case 'toggleSettings':
      if (GAME_STATE.scene === 'settings') {
        commandCallbacks.onCloseSettings?.(true);
      } else if (GAME_STATE.scene === 'game' || GAME_STATE.scene === 'lobby') {
        commandCallbacks.onOpenSettings?.('settings');
      }
      break;
    default:
      break;
  }
}

/**
 * Executes any queued commands until the queue is empty.
 */
function processCommands() {
  while (GAME_STATE.pendingCommands.length > 0) {
    const command = GAME_STATE.pendingCommands.shift();
    switch (command.type) {
      case 'roll':
        if (!executeRoll()) {
          GAME_STATE.pendingCommands = [];
        }
        break;
      case 'upgrade':
        if (!executeUpgrade(command.targetId ?? null)) {
          GAME_STATE.pendingCommands = [];
        }
        break;
      case 'era':
        if (!attemptEraUpgrade()) {
          GAME_STATE.pendingCommands = [];
        }
        break;
      case 'fusion':
        if (!executeFusion(command.targetIds ?? null)) {
          GAME_STATE.pendingCommands = [];
        }
        break;
      case 'dockyard':
        if (!buildDockyard()) {
          GAME_STATE.pendingCommands = [];
        }
        break;
      case 'sell':
        executeSell(command.targetIds ?? null);
        break;
      case 'summonBoss':
        GAME_STATE.nextSummonBossKey = command.bossKey;
        break;
      default:
        break;
    }
  }
}

function onCommandClick(event) {
  const button = event.target.closest('button[data-command]');
  if (!button || button.disabled) return;
  const command = button.dataset.command;
  if (!command) return;
  const bossKey = button.dataset.bossKey || null;
  handleCommand(command, { shift: event.shiftKey, bossKey });
}

function onCommandKeyDown(event) {
  // Boss menu digit shortcuts and escape
  if (GAME_STATE.commandMode === 'boss') {
    if (event.code.startsWith('Digit')) {
      const idx = Number(event.code.replace('Digit', '')) - 1;
      const list = Array.isArray(GAME_STATE.bossSummons) ? GAME_STATE.bossSummons : [];
      const entry = list[idx];
      if (entry && entry.unlocked && (entry.cooldownRemaining ?? 0) <= 0) {
        handleCommand('summonBoss', { bossKey: entry.key });
        return true;
      }
      return false;
    }
    if (event.code === 'Escape' || event.code === 'Backspace') {
      handleCommand('back');
      return true;
    }
  }
  const command = HOTKEY_TO_COMMAND[event.code];
  if (!command) return false;
  const el = COMMAND_TO_ELEMENT[command];
  if (el) {
    if (!el.disabled) {
      el.classList.add('active');
      handleCommand(command, { shift: event.shiftKey });
      return true;
    }
    return false;
  }
  handleCommand(command, { shift: event.shiftKey });
  return true;
}

function onCommandKeyUp(event) {
  const command = HOTKEY_TO_COMMAND[event.code];
  if (!command) return;
  const el = COMMAND_TO_ELEMENT[command];
  if (el) {
    el.classList.remove('active');
  }
}

export {
  registerCommandCallbacks,
  getCommandLayout,
  refreshCommandStates,
  renderCommandPanel,
  handleCommand,
  processCommands,
  onCommandClick,
  onCommandKeyDown,
  onCommandKeyUp,
};
