import {
  DOCKYARD_CAPACITY,
  getShipSize,
  getDockyardBuildCost,
  getTotalShipyardCapacity,
  getUsedShipyardCapacity,
  hasAvailableShipyardCapacity,
} from '../systems/shipyard.js';
import {
  getSharedUpgradeLevel,
  setSharedUpgradeLevel,
} from '../systems/sharedUpgrade.js';
import { WEAPON_TYPE_LABEL } from '../constants/weapons.js';
import {
  PROJECTILE_TYPES,
  PROJECTILE_DEFAULTS,
  DEFAULT_PROJECTILE_TYPE_BY_WEAPON,
} from '../constants/projectiles.js';
import { UNIT_LIBRARY, GAME_STATE, CONFIG } from './globals.js';
import { getTowerSprite } from './shipSprites.js';
import { setWaveStatus } from './status.js';

const ERA_ORDER = [
  '초기',
  '조선',
  '근대',
  '현대',
];

const RARITY_ORDER = ['common', 'rare', 'unique', 'legendary', 'mythic', 'primordial'];

const RARITY_LABEL = {
  common: '일반',
  rare: '레어',
  unique: '유니크',
  legendary: '전설',
  mythic: '신화',
  primordial: '태초',
};

const MAX_FUSION_TIER = 3;

const RARITY_CRIT_CHANCE = {
  common: 0.05,
  rare: 0.06,
  unique: 0.08,
  legendary: 0.1,
  mythic: 0.12,
  primordial: 0.14,
};

const FUSION_PROJECTILE_TYPE_BY_WEAPON = {
  bow: PROJECTILE_TYPES.PIERCING,
  ballista: PROJECTILE_TYPES.PIERCING,
  arquebus: PROJECTILE_TYPES.PIERCING,
  rifle: PROJECTILE_TYPES.PIERCING,
  cannon: PROJECTILE_TYPES.EXPLOSIVE,
  missile: PROJECTILE_TYPES.EXPLOSIVE,
  naval_gun: PROJECTILE_TYPES.EXPLOSIVE,
};

const combatCallbacks = {
  onSelectionChanged: null,
  onCommandLayoutChange: null,
  onHudUpdate: null,
};

/**
 * @typedef {Object} CombatCallbacks
 * @property {() => void} [onSelectionChanged]
 * @property {(force?: boolean) => void} [onCommandLayoutChange]
 * @property {() => void} [onHudUpdate]
 */

/**
 * Registers callbacks so the combat layer can notify other subsystems about UI changes.
 * @param {CombatCallbacks} callbacks
 */
function registerCombatCallbacks(callbacks) {
  combatCallbacks.onSelectionChanged = callbacks.onSelectionChanged || null;
  combatCallbacks.onCommandLayoutChange = callbacks.onCommandLayoutChange || null;
  combatCallbacks.onHudUpdate = callbacks.onHudUpdate || null;
}

function notifySelectionChanged() {
  if (typeof combatCallbacks.onSelectionChanged === 'function') {
    combatCallbacks.onSelectionChanged();
  }
}

function notifyCommandLayoutChange(force = false) {
  if (typeof combatCallbacks.onCommandLayoutChange === 'function') {
    combatCallbacks.onCommandLayoutChange(force);
  }
}

function notifyHudUpdate() {
  if (typeof combatCallbacks.onHudUpdate === 'function') {
    combatCallbacks.onHudUpdate();
  }
}

function getFusionTier(tower) {
  return tower?.fusionTier ?? 0;
}

function updateFusionScaling(tower) {
  const tier = getFusionTier(tower);
  if (typeof tower.baseDamageBase !== 'number') {
    tower.baseDamageBase = tower.baseDamage;
  }
  if (typeof tower.upgDamageBase !== 'number') {
    tower.upgDamageBase = tower.upgDamage;
  }
  const multiplier = Math.pow(2, tier);
  tower.baseDamage = (tower.baseDamageBase ?? tower.baseDamage) * multiplier;
  tower.upgDamage = (tower.upgDamageBase ?? tower.upgDamage) * multiplier;
}

function applyFusionBonuses(tower) {
  const tier = getFusionTier(tower);
  const weaponType = tower.weaponType;
  if (!tower.projectileType) {
    tower.projectileType = DEFAULT_PROJECTILE_TYPE_BY_WEAPON[weaponType] || PROJECTILE_TYPES.NORMAL;
  }
  const desiredType = FUSION_PROJECTILE_TYPE_BY_WEAPON[weaponType]
    || DEFAULT_PROJECTILE_TYPE_BY_WEAPON[weaponType]
    || (tier >= 2 ? PROJECTILE_TYPES.PIERCING : tower.projectileType);

  if (tier >= 2 && desiredType) {
    tower.projectileType = desiredType;
  }

  if (tier > 0) {
    tower.size = 1;
  }

  const baseExplosion = tower.explosionRadiusBase ?? tower.explosionRadius ?? PROJECTILE_DEFAULTS.explosionRadius;
  if (tower.projectileType === PROJECTILE_TYPES.EXPLOSIVE) {
    if (!tower.explosionRadiusBase) {
      tower.explosionRadiusBase = PROJECTILE_DEFAULTS.explosionRadius;
    }
    const multiplier = tier >= 2 ? 1 + 0.35 * (tier - 1) : 1;
    tower.explosionRadius = baseExplosion * multiplier;
  } else {
    tower.explosionRadius = tier >= 2 ? baseExplosion : (tower.explosionRadiusBase ?? tower.explosionRadius);
  }

  if (tower.projectileType === PROJECTILE_TYPES.PIERCING) {
    tower.projectileRadiusBonus = tier >= 2 ? 2 + (tier - 1) * 1.5 : 0;
  } else {
    tower.projectileRadiusBonus = 0;
  }
}

function removeTowerFromGame(tower) {
  const idx = GAME_STATE.towers.indexOf(tower);
  if (idx !== -1) {
    GAME_STATE.towers.splice(idx, 1);
  }
  if (GAME_STATE.selectedEnemy === tower.id) {
    GAME_STATE.selectedEnemy = null;
  }
  GAME_STATE.selections.delete(tower.id);
}

function fuseTowerGroup(base, others) {
  const currentTier = getFusionTier(base);
  if (currentTier >= MAX_FUSION_TIER) return false;
  const all = [base, ...others];
  const avgX = all.reduce((sum, tower) => sum + tower.x, 0) / all.length;
  const avgY = all.reduce((sum, tower) => sum + tower.y, 0) / all.length;
  for (const other of others) {
    removeTowerFromGame(other);
  }
  const clamped = clampToInnerRing(avgX, avgY, 32);
  base.x = base.targetX = clamped.x;
  base.y = base.targetY = clamped.y;
  base.moving = false;
  base.fusionTier = currentTier + 1;
  base.size = 1;
  base.hp = base.maxHp ?? 100;
  updateFusionScaling(base);
  applyFusionBonuses(base);
  setWaveStatus(`${base.name} 융합! 티어 ${base.fusionTier}`, { duration: 1800 });
  return true;
}

function resolveFusionForUnit(unitId, preferredTower = null) {
  let survivor = preferredTower && GAME_STATE.towers.includes(preferredTower) ? preferredTower : null;
  let changed = false;
  fusionLoop: while (true) {
    const groups = new Map();
    for (const tower of GAME_STATE.towers) {
      if (tower.unitId !== unitId) continue;
      const tier = getFusionTier(tower);
      if (tier >= MAX_FUSION_TIER) continue;
      const key = `${tier}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tower);
    }
    let fused = false;
    for (const list of groups.values()) {
      if (list.length < 3) continue;
      list.sort((a, b) => b.id - a.id);
      const base = list[0];
      const others = list.slice(1, 3);
      if (fuseTowerGroup(base, others)) {
        survivor = base;
        changed = true;
        fused = true;
        break;
      }
    }
    if (!fused) {
      break fusionLoop;
    }
  }
  if (!survivor && preferredTower && GAME_STATE.towers.includes(preferredTower)) {
    survivor = preferredTower;
  }
  return { survivor, changed };
}

function canFuseTower(tower) {
  if (!tower) return false;
  const tier = getFusionTier(tower);
  if (tier >= MAX_FUSION_TIER) return false;
  const candidates = GAME_STATE.towers.filter((other) =>
    other.unitId === tower.unitId
    && getFusionTier(other) === tier
  );
  return candidates.length >= 3;
}

function executeFusion(targetIds = null) {
  const ids = Array.isArray(targetIds) && targetIds.length > 0
    ? targetIds
    : Array.from(GAME_STATE.selections);
  if (ids.length === 0) {
    setWaveStatus('선택된 유닛 없음');
    return false;
  }
  const towers = ids
    .map((id) => GAME_STATE.towers.find((tower) => tower.id === id))
    .filter((tower) => !!tower);
  if (towers.length === 0) {
    setWaveStatus('유효한 유닛이 없습니다');
    return false;
  }
  const processed = new Set();
  let fused = false;
  let survivor = null;
  for (const tower of towers) {
    const key = `${tower.unitId}:${getFusionTier(tower)}`;
    if (processed.has(key)) continue;
    processed.add(key);
    if (!canFuseTower(tower)) continue;
    const result = resolveFusionForUnit(tower.unitId, tower);
    if (result.changed) {
      fused = true;
      if (result.survivor && GAME_STATE.towers.includes(result.survivor)) {
        survivor = result.survivor;
      }
    }
  }
  if (!fused) {
    setWaveStatus('융합할 수 있는 유닛이 없습니다');
    return false;
  }
  GAME_STATE.selections.clear();
  GAME_STATE.selectedEnemy = null;
  if (survivor && GAME_STATE.towers.includes(survivor)) {
    GAME_STATE.selections.add(survivor.id);
  }
  notifySelectionChanged();
  notifyHudUpdate();
  notifyCommandLayoutChange(true);
  return true;
}

function nextId() {
  return GAME_STATE.nextEntityId++;
}

function lcgRandom() {
  GAME_STATE.rngSeed = (GAME_STATE.rngSeed * 1664525 + 1013904223) >>> 0;
  return GAME_STATE.rngSeed / 0xffffffff;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampToInnerRing(x, y, margin = 28) {
  const cx = CONFIG.orbit.centerX;
  const cy = CONFIG.orbit.centerY;
  const halfSize = Math.max(0, CONFIG.innerOrbitRadius - margin);
  if (halfSize <= 0) {
    return { x: cx, y: cy };
  }
  const dx = x - cx;
  const dy = y - cy;
  const maxComponent = Math.max(Math.abs(dx), Math.abs(dy));
  if (maxComponent <= halfSize) {
    return { x, y };
  }
  if (maxComponent === 0) {
    return { x: cx, y: cy };
  }
  const factor = halfSize / maxComponent;
  return {
    x: cx + dx * factor,
    y: cy + dy * factor,
  };
}

function gridToWorld(col, row) {
  return {
    x: CONFIG.grid.offsetX + col * CONFIG.grid.cellSize + CONFIG.grid.cellSize / 2,
    y: CONFIG.grid.offsetY + row * CONFIG.grid.cellSize + CONFIG.grid.cellSize / 2,
  };
}

function chooseRarity() {
  const roll = lcgRandom();
  let accum = 0;
  for (const entry of CONFIG.rng.rarity) {
    accum += entry.chance;
    if (roll < accum) {
      return entry.tier;
    }
  }
  return 'common';
}

function getAvailableUnitsByRarity(rarity) {
  const eras = ERA_ORDER.slice(0, GAME_STATE.eraIndex + 1);
  const units = [];
  for (const era of eras) {
    const list = UNIT_LIBRARY[era] || [];
    for (const unit of list) {
      if (unit.rarity === rarity) {
        units.push({ ...unit, era });
      }
    }
  }
  return units;
}

function drawUnitDefinition(rarity) {
  let rarityIndex = RARITY_ORDER.indexOf(rarity);
  if (rarityIndex === -1) rarityIndex = 0;
  for (let i = rarityIndex; i >= 0; i -= 1) {
    const candidates = getAvailableUnitsByRarity(RARITY_ORDER[i]);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(lcgRandom() * candidates.length)];
      return pick;
    }
  }
  const fallback = UNIT_LIBRARY['초기'][0];
  return { ...fallback, era: '초기' };
}

function computeTowerDamage(tower) {
  return tower.baseDamage + tower.upgDamage * tower.upgradeLevel;
}

function createTower(definition, spawn) {
  let spawnX;
  let spawnY;
  if (spawn && typeof spawn.x === 'number' && typeof spawn.y === 'number') {
    spawnX = spawn.x;
    spawnY = spawn.y;
  } else if (spawn && typeof spawn.col === 'number' && typeof spawn.row === 'number') {
    const position = gridToWorld(spawn.col, spawn.row);
    spawnX = position.x;
    spawnY = position.y;
  } else {
    spawnX = CONFIG.orbit.centerX;
    spawnY = CONFIG.orbit.centerY;
  }
  const clamped = clampToInnerRing(spawnX, spawnY, 32);
  const tierIndex = RARITY_ORDER.indexOf(definition.rarity);
  const weaponType = definition.weaponType || null;
  const projectileType = definition.projectileType
    || (weaponType ? DEFAULT_PROJECTILE_TYPE_BY_WEAPON[weaponType] : null)
    || PROJECTILE_TYPES.NORMAL;
  const explosionRadiusBase = definition.explosionRadius
    ?? (projectileType === PROJECTILE_TYPES.EXPLOSIVE ? PROJECTILE_DEFAULTS.explosionRadius : null);
  const critChance = typeof definition.critChance === 'number'
    ? definition.critChance
    : (RARITY_CRIT_CHANCE[definition.rarity] ?? 0.05);
  const initialSharedLevel = getSharedUpgradeLevel(weaponType, definition.era, tierIndex);
  const tower = {
    id: nextId(),
    name: definition.name,
    unitId: definition.id,
    era: definition.era,
    rarity: definition.rarity,
    col: Math.round((clamped.x - CONFIG.grid.offsetX) / CONFIG.grid.cellSize),
    row: Math.round((clamped.y - CONFIG.grid.offsetY) / CONFIG.grid.cellSize),
    x: clamped.x,
    y: clamped.y,
    targetX: clamped.x,
    targetY: clamped.y,
    moveSpeed: 160,
    moving: false,
    baseDamage: definition.baseDamage,
    fireRate: definition.fireRate,
    range: definition.range,
    projectileSpeed: definition.projectileSpeed,
    upgDamage: definition.upgDamage,
    baseDamageBase: definition.baseDamage,
    upgDamageBase: definition.upgDamage,
    tierIndex,
    upgradeLevel: initialSharedLevel,
    weaponType,
    projectileType,
    explosionRadius: explosionRadiusBase,
    explosionRadiusBase,
    projectileRadiusBonus: 0,
    fusionTier: definition.fusionTier ?? 0,
    critChance,
    size: (typeof definition.size === 'number')
      ? definition.size
      : getShipSize(definition.rarity),
    cooldown: 0,
    maxHp: 100,
    hp: 100,
  };
  // Compute collider and selection radii based on sprite size for proportional footprint
  applyFootprintFromSprite(tower);
  updateFusionScaling(tower);
  applyFusionBonuses(tower);
  GAME_STATE.towers.push(tower);
  GAME_STATE.selections.clear();
  GAME_STATE.selectedEnemy = null;
  GAME_STATE.selections.add(tower.id);
  notifySelectionChanged();
  notifyHudUpdate();
  return tower;
}

function getRollCost() {
  const step = Math.floor((GAME_STATE.round - 1) / CONFIG.economy.rollCostRamp);
  return CONFIG.economy.baseRollCost + step * CONFIG.economy.rollCostStep;
}

function executeRoll() {
  const cost = getRollCost();
  if (GAME_STATE.gold < cost) {
    setWaveStatus('골드 부족');
    return false;
  }
  if (!hasAvailableShipyardCapacity(GAME_STATE.towers, GAME_STATE.dockyards)) {
    setWaveStatus('조선소 용량 부족');
    return false;
  }
  const rarity = chooseRarity();
  const definition = drawUnitDefinition(rarity);
  const jitterAngle = lcgRandom() * Math.PI * 2;
  const jitterRadius = 18 + lcgRandom() * 12;
  const spawn = clampToInnerRing(
    CONFIG.orbit.centerX + Math.cos(jitterAngle) * jitterRadius,
    CONFIG.orbit.centerY + Math.sin(jitterAngle) * jitterRadius,
    32
  );
  createTower(definition, spawn);
  GAME_STATE.gold -= cost;
  setWaveStatus(`${definition.era} ${RARITY_LABEL[definition.rarity]} ${definition.name} 배치`);
  notifyHudUpdate();
  return true;
}

function getTierUpgradeCost(tower) {
  if (tower.tierIndex >= RARITY_ORDER.length - 1) {
    return Infinity;
  }
  return CONFIG.economy.tierCosts[tower.tierIndex];
}

function getEnhanceCost(tower) {
  const sharedLevel = getSharedUpgradeLevel(tower.weaponType, tower.era, tower.tierIndex);
  return CONFIG.economy.upgradeBaseCost + sharedLevel * CONFIG.economy.upgradeStep;
}

function upgradeTowerTier(tower) {
  // Era upgrade: keep rarity, evolve to same-rarity unit from the next era (random, bias-respecting).
  const currentEraIdx = Math.max(0, ERA_ORDER.indexOf(tower.era));
  if (currentEraIdx >= ERA_ORDER.length - 1) {
    setWaveStatus('최종 시대입니다');
    return false;
  }
  const cost = getTierUpgradeCost(tower);
  if (GAME_STATE.gold < cost) {
    setWaveStatus('골드 부족');
    return false;
  }
  const rarity = tower.rarity;
  const targetEra = ERA_ORDER[currentEraIdx + 1];
  const sameEra = ERA_ORDER[currentEraIdx];

  // Candidate pool: next era, same rarity
  let candidates = (UNIT_LIBRARY[targetEra] || [])
    .filter((u) => u.rarity === rarity)
    .map((u) => ({ ...u, era: targetEra }));

  // Evolution bias removed: keep candidate pool purely by era/rarity.

  // Fallback: same era, same rarity
  if (candidates.length === 0) {
    candidates = (UNIT_LIBRARY[sameEra] || [])
      .filter((u) => u.rarity === rarity)
      .map((u) => ({ ...u, era: sameEra }));
  }

  // Final fallback: drawer constrained by rarity (may consider unlocked eras)
  const definition = candidates.length > 0
    ? candidates[Math.floor(lcgRandom() * candidates.length)]
    : drawUnitDefinition(rarity);

  GAME_STATE.gold -= cost;
  tower.rarity = definition.rarity; // unchanged rarity
  tower.tierIndex = RARITY_ORDER.indexOf(definition.rarity);
  tower.name = definition.name;
  tower.unitId = definition.id;
  tower.era = definition.era;
  tower.baseDamage = definition.baseDamage;
  tower.fireRate = definition.fireRate;
  tower.range = definition.range;
  tower.projectileSpeed = definition.projectileSpeed;
  tower.upgDamage = definition.upgDamage;
  tower.baseDamageBase = definition.baseDamage;
  tower.upgDamageBase = definition.upgDamage;
  tower.size = getShipSize(tower.rarity);
  if (typeof definition.size === 'number') {
    tower.size = definition.size;
  }
  tower.weaponType = definition.weaponType || tower.weaponType || null;
  const resolvedWeaponType = tower.weaponType;
  tower.projectileType = definition.projectileType
    || (resolvedWeaponType ? DEFAULT_PROJECTILE_TYPE_BY_WEAPON[resolvedWeaponType] : null)
    || tower.projectileType
    || PROJECTILE_TYPES.NORMAL;
  tower.explosionRadiusBase = definition.explosionRadius ?? tower.explosionRadiusBase ?? null;
  tower.explosionRadius = definition.explosionRadius ?? tower.explosionRadiusBase ?? tower.explosionRadius;
  tower.critChance = typeof definition.critChance === 'number'
    ? definition.critChance
    : (RARITY_CRIT_CHANCE[tower.rarity] ?? tower.critChance ?? 0.05);
  const sharedLevel = getSharedUpgradeLevel(tower.weaponType, tower.era, tower.tierIndex);
  tower.upgradeLevel = sharedLevel;
  tower.cooldown = 0;
  applyFootprintFromSprite(tower);
  updateFusionScaling(tower);
  applyFusionBonuses(tower);
  setWaveStatus(`시대 업! ${definition.era} ${RARITY_LABEL[definition.rarity]} ${definition.name}`);
  GAME_STATE.selections.clear();
  GAME_STATE.selectedEnemy = null;
  GAME_STATE.selections.add(tower.id);
  notifySelectionChanged();
  notifyHudUpdate();
  return true;
}

// Derive collider/selection radii from current sprite size so that larger historical ships have larger footprints
function applyFootprintFromSprite(tower) {
  try {
    const sprite = getTowerSprite(tower);
    const base = Math.max(16, sprite?.size || 36);
    // Collider trimmed to half the previous footprint
    tower.colliderRadius = Math.round(base * 0.25);
    // Selection ring scaled down similarly for tighter highlighting
    tower.selectionRadius = Math.round(base * 0.35);
  } catch (_) {
    tower.colliderRadius = tower.colliderRadius ?? 12;
    tower.selectionRadius = tower.selectionRadius ?? 16;
  }
}

function enhanceTower(tower) {
  const cost = getEnhanceCost(tower);
  if (GAME_STATE.gold < cost) {
    setWaveStatus('골드 부족');
    return false;
  }
  GAME_STATE.gold -= cost;
  const currentLevel = getSharedUpgradeLevel(tower.weaponType, tower.era, tower.tierIndex);
  const newLevel = currentLevel + 1;
  const affected = setSharedUpgradeLevel(GAME_STATE, tower.weaponType, tower.era, tower.tierIndex, newLevel);
  const rarityLabel = RARITY_LABEL[tower.rarity] || tower.rarity;
  const weaponLabel = tower.weaponType ? ` · 무기 ${WEAPON_TYPE_LABEL[tower.weaponType] || tower.weaponType}` : '';
  setWaveStatus(`${tower.era} ${rarityLabel} 강화 +${newLevel} (${affected}척)${weaponLabel}`);
  notifySelectionChanged();
  notifyHudUpdate();
  return true;
}

function executeUpgrade(targetId = null) {
  let tower = null;
  if (targetId != null) {
    tower = GAME_STATE.towers.find((t) => t.id === targetId);
  } else {
    const selection = Array.from(GAME_STATE.selections);
    if (selection.length === 0) {
      setWaveStatus('선택된 유닛 없음');
      return false;
    }
    tower = GAME_STATE.towers.find((t) => t.id === selection[0]);
  }
  if (!tower) {
    setWaveStatus('유효하지 않은 유닛');
    return false;
  }

  const upgraded = upgradeTowerTier(tower);
  if (!upgraded) {
    return enhanceTower(tower);
  }
  return true;
}

function attemptEraUpgrade() {
  if (GAME_STATE.pendingEraUpgrades <= 0) {
    setWaveStatus('시대 업그레이드 불가');
    return false;
  }
  if (GAME_STATE.eraIndex >= ERA_ORDER.length - 1) {
    setWaveStatus('최종 시대 도달');
    return false;
  }
  GAME_STATE.pendingEraUpgrades -= 1;
  GAME_STATE.eraIndex += 1;
  setWaveStatus(`시대 상승: ${ERA_ORDER[GAME_STATE.eraIndex]}`);
  notifyCommandLayoutChange();
  notifyHudUpdate();
  return true;
}

function buildDockyard() {
  const cost = getDockyardBuildCost(GAME_STATE.dockyards);
  if (GAME_STATE.gold < cost) {
    setWaveStatus('조선소 증설 골드 부족');
    return false;
  }
  GAME_STATE.gold -= cost;
  GAME_STATE.dockyards += 1;
  setWaveStatus(`조선소 증설 완료 (총 ${GAME_STATE.dockyards}개) - ${cost}G`);
  notifyCommandLayoutChange(true);
  notifyHudUpdate();
  return true;
}

const RARITY_SELL_VALUE = {
  common: 3,
  rare: 6,
  unique: 20,
  legendary: 0,
  mythic: 0,
  primordial: 0,
};

function getSellValue(tower) {
  return RARITY_SELL_VALUE[tower.rarity] ?? 0;
}

function canSellTower(tower) {
  return getSellValue(tower) > 0;
}

function executeSell(targetIds = null) {
  const ids = Array.isArray(targetIds) && targetIds.length > 0
    ? targetIds
    : Array.from(GAME_STATE.selections);
  if (ids.length === 0) {
    setWaveStatus('선택된 유닛 없음');
    return false;
  }
  const targetSet = new Set(ids);
  const soldIds = new Set();
  const unsellable = [];
  let goldGain = 0;
  const remaining = [];
  for (const tower of GAME_STATE.towers) {
    if (!targetSet.has(tower.id)) {
      remaining.push(tower);
      continue;
    }
    const value = getSellValue(tower);
    if (value <= 0) {
      unsellable.push(tower);
      remaining.push(tower);
      continue;
    }
    goldGain += value;
    soldIds.add(tower.id);
  }
  if (soldIds.size > 0) {
    GAME_STATE.towers = remaining;
    GAME_STATE.gold += goldGain;
    for (const id of soldIds) {
      GAME_STATE.selections.delete(id);
    }
    if (GAME_STATE.selections.size === 0) {
      GAME_STATE.selectedEnemy = null;
    }
    notifySelectionChanged();
    notifyCommandLayoutChange();
    const unsellNote = unsellable.length > 0 ? ` · 전설 ${unsellable.length}척 제외` : '';
    setWaveStatus(`판매 ${soldIds.size}척 +${goldGain}G${unsellNote}`);
    notifyHudUpdate();
    return true;
  }
  if (unsellable.length > 0) {
    setWaveStatus('전설 이상은 판매할 수 없습니다');
  } else {
    setWaveStatus('판매할 유닛 없음');
  }
  return false;
}

function setTowerTarget(tower, x, y) {
  const clamped = clampToInnerRing(x, y, 32);
  tower.targetX = clamped.x;
  tower.targetY = clamped.y;
  tower.moving = true;
}

function orderSelectedTowers(targetWorld) {
  const ids = Array.from(GAME_STATE.selections);
  if (ids.length === 0) return;
  const spacing = 36;
  const circleStep = Math.max(6, ids.length);
  ids.forEach((id, index) => {
    const tower = GAME_STATE.towers.find((t) => t.id === id);
    if (!tower) return;
    let offsetX = 0;
    let offsetY = 0;
    if (ids.length > 1) {
      const ringIndex = Math.floor(index / circleStep);
      const angle = ((index % circleStep) / circleStep) * Math.PI * 2;
      const radius = spacing + ringIndex * spacing * 0.7;
      offsetX = Math.cos(angle) * radius;
      offsetY = Math.sin(angle) * radius;
    }
    setTowerTarget(tower, targetWorld.x + offsetX, targetWorld.y + offsetY);
  });
}

function getDockyardUsage() {
  return {
    used: getUsedShipyardCapacity(GAME_STATE.towers),
    total: getTotalShipyardCapacity(GAME_STATE.dockyards),
  };
}

export {
  ERA_ORDER,
  RARITY_ORDER,
  RARITY_LABEL,
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
  getDockyardUsage,
  canFuseTower,
  executeFusion,
  computeTowerDamage,
  orderSelectedTowers,
  clamp,
  clampToInnerRing,
  lcgRandom,
  nextId,
};
