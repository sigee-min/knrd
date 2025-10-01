import { elements } from '../ui/elements.js';
import { WEAPON_TYPE_LABEL } from '../constants/weapons.js';
import {
  GAME_STATE,
  CAMERA,
  CONFIG,
  MAX_SELECTION,
} from './globals.js';
import { computeTowerDamage, RARITY_ORDER, RARITY_LABEL, lcgRandom } from './combat.js';
import { setWaveStatus } from './status.js';
import { getEnemySprite } from './enemySprites.js';
import { getBossSprite } from './bossSprites.js';
import { getTowerSprite } from './shipSprites.js';

const selectionCallbacks = {
  onCommandPanelRefresh: null,
};

/**
 * @typedef {Object} SelectionCallbacks
 * @property {() => void} [onCommandPanelRefresh]
 */

/**
 * Registers callbacks for the selection subsystem.
 * @param {SelectionCallbacks} callbacks
 */
function registerSelectionCallbacks(callbacks) {
  selectionCallbacks.onCommandPanelRefresh = callbacks.onCommandPanelRefresh || null;
}

function notifyCommandPanelRefresh() {
  if (typeof selectionCallbacks.onCommandPanelRefresh === 'function') {
    selectionCallbacks.onCommandPanelRefresh();
  }
}

function limitSelectionIds(ids) {
  if (ids.length <= MAX_SELECTION) return ids;
  const pool = ids.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(lcgRandom() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }
  return pool.slice(0, MAX_SELECTION);
}

function areSelectionSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function updateTowerSelection(ids, options = {}) {
  const { additive = false, toggle = false } = options;
  const targetIds = Array.isArray(ids) ? ids : [ids];
  let next = new Set(GAME_STATE.selections);
  if (toggle) {
    for (const id of targetIds) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
  } else if (additive) {
    for (const id of targetIds) {
      next.add(id);
    }
  } else {
    next = new Set(targetIds);
  }
  const limited = limitSelectionIds([...next]);
  const normalized = new Set(limited);
  const changed = !areSelectionSetsEqual(normalized, GAME_STATE.selections);
  if (changed) {
    GAME_STATE.selections = normalized;
    GAME_STATE.selectedEnemy = null;
    updateSelectionInfo();
  }
  return { changed, selection: normalized };
}

function findTowerById(id) {
  return GAME_STATE.towers.find((tower) => tower.id === id) || null;
}

function updateSelectionInfo() {
  const container = elements.selectionInfo;
  if (!container) return;
  notifyCommandPanelRefresh();
  const setContent = (html) => {
    container.innerHTML = html;
  };
  const selection = Array.from(GAME_STATE.selections);
  const enemyId = GAME_STATE.selectedEnemy;
  if (selection.length === 0) {
    if (enemyId != null) {
      const enemy = GAME_STATE.enemies.find((e) => e.id === enemyId);
      if (!enemy) {
        GAME_STATE.selectedEnemy = null;
        setContent('<p class="placeholder">유닛 또는 적을 선택하세요.</p>');
        return;
      }
      const patternLabelMap = { boss: '보스', split: '분열', spiral: '나선', sprint: '광속', standard: '표준' };
      const baseName = enemy.type === 'boss' ? '보스' : (enemy.displayName || `${patternLabelMap[enemy.pattern] || enemy.pattern} 적`);
      const eraTag = enemy.era ? ` · ${enemy.era}` : '';
      const label = `${baseName}${eraTag}`;
      const hp = Math.max(0, enemy.hp);
      const maxHp = Math.max(hp, enemy.maxHp || hp);
      const hpPct = maxHp > 0 ? Math.min(100, (hp / maxHp) * 100) : 0;
      const defense = enemy.defense ?? 0;
      const enemySprite = getEnemySprite(enemy);
      const enemyIcon = enemySprite.asset || (enemy.type === 'boss'
        ? getBossSprite(enemy).asset
        : 'assets/svg/icons/icon_alert.svg');
      const reward = enemy.reward ?? 0;
      const stats = [
        { icon: 'assets/svg/icons/icon_health.svg', label: '체력', value: `${Math.round(hp)} / ${Math.round(maxHp)} (${hpPct.toFixed(0)}%)` },
        { icon: 'assets/svg/icons/icon_attack.svg', label: '방어', value: defense.toFixed(1) },
        { icon: 'assets/svg/icons/icon_range.svg', label: '궤도 반경', value: Math.round(enemy.radius ?? 0) },
        { icon: 'assets/svg/icons/icon_timer.svg', label: '각속도', value: `${(enemy.angularSpeed || 0).toFixed(2)}` },
        { icon: 'assets/svg/icons/icon_gold.svg', label: '보상', value: `${reward}G` },
      ];
      const statsHtml = stats
        .map(
          (row) => `
            <div class="stat-row">
              <img src="${row.icon}" alt="${row.label}" />
              <span>${row.label}</span>
              <strong>${row.value}</strong>
            </div>
          `
        )
        .join('');
      const html = `
        <div class="unit-detail enemy-focus">
          <div class="unit-summary-header">
            <div class="unit-avatar">
              <img src="${enemyIcon}" alt="${label}" />
            </div>
            <div class="unit-meta">
              <strong>${label}</strong>
              <span>패턴: ${patternLabelMap[enemy.pattern] || enemy.pattern}</span>
              ${enemy.era ? `<span>시대: ${enemy.era}</span>` : ''}
              <span>남은 체력 ${Math.round(hp)} / ${Math.round(maxHp)}</span>
            </div>
          </div>
          <div class="unit-stats">${statsHtml}</div>
        </div>
      `;
      setContent(html);
      return;
    }
    setContent('<p class="placeholder">유닛 또는 적을 선택하세요.</p>');
    return;
  }
  GAME_STATE.selectedEnemy = null;
  if (selection.length === 1) {
    const tower = findTowerById(selection[0]);
    if (!tower) {
      setContent('<p class="placeholder">유닛 또는 적을 선택하세요.</p>');
      return;
    }
    const sprite = getTowerSprite(tower);
    const avatarSrc = sprite.asset || `assets/svg/units/boat_${tower.rarity}.svg`;
    const rarityLabel = RARITY_LABEL[tower.rarity] || tower.rarity;
    const weaponLabel = tower.weaponType ? (WEAPON_TYPE_LABEL[tower.weaponType] || tower.weaponType) : '무기 미지정';
    const damage = computeTowerDamage(tower);
    const dps = tower.fireRate > 0 ? damage / tower.fireRate : damage;
    const hpPct = tower.maxHp ? Math.round((tower.hp / tower.maxHp) * 100) : 100;
    const attacksPerSecond = tower.fireRate > 0 ? (1 / tower.fireRate).toFixed(2) : '즉시';
    const attackSummary = `공격력 ${damage.toFixed(1)} · 공격 속도 ${tower.fireRate.toFixed(2)}s · 공격 횟수 ${attacksPerSecond}/s · 사거리 ${tower.range}`;
    const statRows = [
      { icon: 'assets/svg/icons/icon_health.svg', label: '체력', value: `${hpPct}%` },
      { icon: 'assets/svg/icons/icon_attack.svg', label: '공격', value: `${damage.toFixed(1)} (DPS ${dps.toFixed(1)})` },
      { icon: 'assets/svg/icons/icon_range.svg', label: '사거리', value: `${tower.range}` },
      { icon: 'assets/svg/icons/icon_firerate.svg', label: '연사 속도', value: `${tower.fireRate.toFixed(2)}s` },
      { icon: 'assets/svg/icons/icon_attack.svg', label: '치명타', value: `${((tower.critChance ?? 0) * 100).toFixed(1)}%` },
      { icon: 'assets/svg/icons/icon_projectile.svg', label: '투사체 속도', value: `${tower.projectileSpeed}` },
      { icon: 'assets/svg/icons/icon_attack.svg', label: '강화', value: `+${tower.upgradeLevel}` },
    ];
    const statsHtml = statRows
      .map(
        (row) => `
          <div class="stat-row">
            <img src="${row.icon}" alt="${row.label}" />
            <span>${row.label}</span>
            <strong>${row.value}</strong>
          </div>
        `
      )
      .join('');
    const fusionTier = tower.fusionTier ?? 0;
    const html = `
      <div class="unit-detail">
        <div class="unit-summary-header">
          <div class="unit-avatar">
            <img src="${avatarSrc}" alt="${tower.name}" />
          </div>
          <div class="unit-meta">
            <strong>${tower.name}</strong>
            <span>[${tower.era}] · ${rarityLabel} · 티어 ${tower.tierIndex + 1}/${RARITY_ORDER.length}</span>
            <span>융합 티어 ${fusionTier}</span>
            <span>무기: ${weaponLabel}</span>
            <div class="attack-summary">
              <img src="assets/svg/icons/icon_attack.svg" alt="공격 정보" class="attack-icon" />
              <div class="attack-tooltip">${attackSummary}</div>
            </div>
          </div>
        </div>
        <div class="unit-stats">${statsHtml}</div>
      </div>
    `;
    setContent(html);
    return;
  }

  const towers = GAME_STATE.towers.filter((t) => GAME_STATE.selections.has(t.id));
  if (towers.length === 0) {
    setContent('<p class="placeholder">유닛 또는 적을 선택하세요.</p>');
    return;
  }
  const summary = towers.reduce(
    (acc, tower) => {
      const dmg = computeTowerDamage(tower);
      acc.damage += dmg;
      acc.range += tower.range;
      acc.fireRate += tower.fireRate;
      acc.hpPct += tower.maxHp ? (tower.hp / tower.maxHp) * 100 : 100;
      acc.crit += tower.critChance ?? 0;
      acc.count += 1;
      acc.byEra[tower.era] = (acc.byEra[tower.era] || 0) + 1;
      acc.byRarity[tower.rarity] = (acc.byRarity[tower.rarity] || 0) + 1;
      const weaponKey = tower.weaponType || '기타';
      acc.byWeapon[weaponKey] = (acc.byWeapon[weaponKey] || 0) + 1;
      return acc;
    },
    { damage: 0, range: 0, fireRate: 0, hpPct: 0, crit: 0, count: 0, byEra: {}, byRarity: {}, byWeapon: {} }
  );
  const avgRange = summary.range / summary.count;
  const avgFireRate = summary.fireRate / summary.count;
  const avgHp = summary.hpPct / summary.count;
  const avgCrit = summary.crit / summary.count;
  const eraSummary = Object.entries(summary.byEra)
    .map(([era, count]) => `${era} ${count}`)
    .join(', ');
  const raritySummary = Object.entries(summary.byRarity)
    .map(([rarity, count]) => `${RARITY_LABEL[rarity] || rarity} ${count}`)
    .join(', ');
  const weaponSummary = Object.entries(summary.byWeapon)
    .map(([weapon, count]) => `${WEAPON_TYPE_LABEL[weapon] || weapon} ${count}`)
    .join(', ');

  const cards = towers.map((tower) => {
    const rarity = RARITY_LABEL[tower.rarity] || tower.rarity;
    const fusionTier = tower.fusionTier ?? 0;
    const sprite = getTowerSprite(tower);
    const avatarSrc = sprite.asset || `assets/svg/units/boat_${tower.rarity}.svg`;
    return `
      <article class="unit-card unit-card--mini" data-unit-id="${tower.id}">
        <img class="unit-card__avatar" src="${avatarSrc}" alt="${tower.name}" />
        <span class="unit-card__era">${tower.era}</span>
        <strong class="unit-card__name">${tower.name}</strong>
        <span class="unit-card__tags">
          <span class="rarity-badge rarity-${tower.rarity}">${rarity}</span>
          <span class="unit-card__fusion">융합 ${fusionTier}</span>
        </span>
      </article>
    `;
  }).join('');

  const footer = `
    <div class="selection-footer">
      <div>총 ${summary.count}척 · 총 공격력 ${summary.damage.toFixed(1)}</div>
      <div>평균 체력 ${avgHp.toFixed(0)}% · 평균 사거리 ${avgRange.toFixed(0)} · 평균 연사 ${avgFireRate.toFixed(2)}s</div>
      <div>평균 치명타 확률 ${(avgCrit * 100).toFixed(1)}%</div>
      <div>시대: ${eraSummary || '-'} · 등급: ${raritySummary || '-'}</div>
      <div>무기: ${weaponSummary || '-'}</div>
    </div>
  `;

  const html = `
    <div class="multi-selection">
      <div class="multi-selection__grid">${cards}</div>
      ${footer}
    </div>
  `;
  setContent(html);
  bindSelectionCardEvents(container);
}

function selectAllTowers() {
  if (GAME_STATE.towers.length === 0) {
    setWaveStatus('선택할 유닛 없음');
    return;
  }
  const ids = limitSelectionIds(GAME_STATE.towers.map((tower) => tower.id));
  GAME_STATE.selections = new Set(ids);
  GAME_STATE.selectedEnemy = null;
  updateSelectionInfo();
  if (ids.length < MAX_SELECTION) {
    setWaveStatus(`전체 선택 (${ids.length}척)`);
  }
}

function selectTowerAtWorldPosition(position, options = {}) {
  let closest = null;
  let bestDist = Infinity;
  for (const tower of GAME_STATE.towers) {
    const dx = tower.x - position.x;
    const dy = tower.y - position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 40 && dist < bestDist) {
      bestDist = dist;
      closest = tower;
    }
  }
  if (!closest) return false;
  updateTowerSelection([closest.id], options);
  return true;
}

function selectEnemyAtWorldPosition(position) {
  let closest = null;
  let bestDist = Infinity;
  for (const enemy of GAME_STATE.enemies) {
    const dx = enemy.x - position.x;
    const dy = enemy.y - position.y;
    const dist = Math.hypot(dx, dy);
    const hitRadius = (enemy.size || 12) + 14;
    if (dist <= hitRadius && dist < bestDist) {
      bestDist = dist;
      closest = enemy;
    }
  }
  if (!closest) return false;
  GAME_STATE.selections.clear();
  GAME_STATE.selectedEnemy = closest.id;
  updateSelectionInfo();
  return true;
}

function findTowerAtPosition(position) {
  let closest = null;
  let bestDist = Infinity;
  for (const tower of GAME_STATE.towers) {
    const dx = tower.x - position.x;
    const dy = tower.y - position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 40 && dist < bestDist) {
      bestDist = dist;
      closest = tower;
    }
  }
  return closest;
}

function findMatchingTowers(reference) {
  const matches = GAME_STATE.towers
    .filter((tower) =>
      tower.era === reference.era &&
      tower.rarity === reference.rarity &&
      tower.name === reference.name &&
      tower.tierIndex === reference.tierIndex &&
      tower.weaponType === reference.weaponType &&
      (tower.fusionTier ?? 0) === (reference.fusionTier ?? 0)
    )
    .map((tower) => ({ tower, distSq: (tower.x - reference.x) ** 2 + (tower.y - reference.y) ** 2 }));
  matches.sort((a, b) => a.distSq - b.distSq);
  return matches.slice(0, MAX_SELECTION).map((entry) => entry.tower.id);
}

function handleDoubleClickSelection(worldX, worldY) {
  if (selectEnemyAtWorldPosition({ x: worldX, y: worldY })) {
    return;
  }
  const tower = findTowerAtPosition({ x: worldX, y: worldY });
  if (!tower) {
    return;
  }
  const matches = findMatchingTowers(tower);
  GAME_STATE.selectedEnemy = null;
  GAME_STATE.selections = new Set(matches);
  updateSelectionInfo();
  if (matches.length < MAX_SELECTION) {
    const weaponLabel = tower.weaponType ? `${WEAPON_TYPE_LABEL[tower.weaponType] || tower.weaponType} ` : '';
    setWaveStatus(`${weaponLabel}${tower.name} ${matches.length}척 선택`);
  }
}

function applyDragSelection() {
  const worldPos = {
    x: GAME_STATE.dragCurrentScreen.x + CAMERA.x,
    y: GAME_STATE.dragCurrentScreen.y + CAMERA.y,
  };
  const rect = {
    minX: Math.min(GAME_STATE.dragStartWorld.x, worldPos.x),
    maxX: Math.max(GAME_STATE.dragStartWorld.x, worldPos.x),
    minY: Math.min(GAME_STATE.dragStartWorld.y, worldPos.y),
    maxY: Math.max(GAME_STATE.dragStartWorld.y, worldPos.y),
  };
  const additive = !!GAME_STATE.dragAdditive;
  const toggle = !!GAME_STATE.dragToggle;

  const towersInRect = GAME_STATE.towers.filter(
    (tower) => tower.x >= rect.minX && tower.x <= rect.maxX && tower.y >= rect.minY && tower.y <= rect.maxY
  );

  if (towersInRect.length > 0) {
    const ids = towersInRect.map((tower) => tower.id);
    updateTowerSelection(ids, { additive, toggle });
    return;
  }

  const enemiesInRect = GAME_STATE.enemies
    .filter((enemy) => {
      const size = enemy.size ?? 12;
      return (
        enemy.x + size >= rect.minX
        && enemy.x - size <= rect.maxX
        && enemy.y + size >= rect.minY
        && enemy.y - size <= rect.maxY
      );
    });

  if (enemiesInRect.length > 0) {
    const centerX = (rect.minX + rect.maxX) / 2;
    const centerY = (rect.minY + rect.maxY) / 2;
    enemiesInRect.sort((a, b) => {
      const da = (a.x - centerX) ** 2 + (a.y - centerY) ** 2;
      const db = (b.x - centerX) ** 2 + (b.y - centerY) ** 2;
      return da - db;
    });
    const chosen = enemiesInRect[0];
    if (selectEnemyAtWorldPosition({ x: chosen.x, y: chosen.y })) {
      return;
    }
  }

  if (selectTowerAtWorldPosition(worldPos, { additive, toggle })) {
    return;
  }
  if (!selectEnemyAtWorldPosition(worldPos)) {
    if (!additive && !toggle && (GAME_STATE.selectedEnemy != null || GAME_STATE.selections.size > 0)) {
      GAME_STATE.selectedEnemy = null;
      GAME_STATE.selections.clear();
      updateSelectionInfo();
    }
  }
}

function bindSelectionCardEvents(container) {
  const cards = container.querySelectorAll('[data-unit-id]');
  if (cards.length === 0) return;
  cards.forEach((card) => {
    card.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const { unitId } = event.currentTarget.dataset;
      if (!unitId) return;
      const numericId = Number(unitId);
      const targetId = Number.isNaN(numericId) ? unitId : numericId;
      updateTowerSelection([targetId]);
    });
  });
}

export {
  registerSelectionCallbacks,
  limitSelectionIds,
  updateSelectionInfo,
  selectAllTowers,
  selectTowerAtWorldPosition,
  selectEnemyAtWorldPosition,
  applyDragSelection,
  handleDoubleClickSelection,
  findTowerAtPosition,
  findMatchingTowers,
};
