import {
  GAME_STATE,
  CONFIG,
  CAMERA,
  PREP_WAVE_DURATION,
  MAX_WAVES,
  SETTINGS,
  EARLY_EASE_ROUNDS,
  EARLY_EASE_MIN,
  EARLY_EASE_STEP,
} from '../../game/globals.js';
import { ENEMY_LIBRARY } from '../../data/enemyLibrary.js';
import { getEnemySprite } from '../../game/enemySprites.js';
import { getBossSprite } from '../../game/bossSprites.js';
import { getTowerSprite } from '../../game/shipSprites.js';
import { updateSelectionInfo } from '../../game/selection.js';
import { renderCommandPanel } from '../../game/commands.js';
import { setWaveStatus } from '../../game/status.js';
import { playSound } from '../../game/audio.js';
import { pauseBgm } from '../../game/youtubePlayer.js';
import { buildGameOverStats, showGameOverOverlay } from '../../game/overlay.js';
import {
  clamp,
  clampToInnerRing,
  ERA_ORDER,
  lcgRandom,
  nextId,
  resetUnitPoolCache,
} from '../../game/combat.js';
import { getProjectileStyle } from '../../game/projectileStyles.js';
import { PROJECTILE_TYPES, PROJECTILE_DEFAULTS } from '../../constants/projectiles.js';
import { spawnDamageFloater, spawnHitBlip } from '../../core/render/effects.js';
import { getCollisionBuckets, populateEnemyBuckets, invalidateBuckets } from './spatialBuckets.js';
import { updateHUD } from '../../core/ui/hud.js';
import { moveAngleTowards } from '../math/angle.js';

const FIRE_SOUND_BY_WEAPON = {
  bow: { key: 'fire_arrow', volume: 0.1, throttleMs: 24 },
  ballista: { key: 'fire_arrow', volume: 0.2, throttleMs: 30 },
  arquebus: { key: 'fire_gun', volume: 0.38, throttleMs: 28 },
  rifle: { key: 'fire_gun', volume: 0.42, throttleMs: 24 },
  cannon: { key: 'fire_cannon', volume: 0.55, throttleMs: 70 },
  naval_gun: { key: 'fire_cannon', volume: 0.62, throttleMs: 80 },
  missile: { key: 'fire_cannon', volume: 0.6, throttleMs: 120 },
};


export function getEarlyWaveEase(round) {
  if (round <= EARLY_EASE_ROUNDS) {
    const eased = EARLY_EASE_MIN + (round - 1) * EARLY_EASE_STEP;
    return Math.min(1, Math.max(EARLY_EASE_MIN, eased));
  }
  return 1;
}

export function rollDamage(baseDamage) {
  const variance = 0.9 + lcgRandom() * 0.2;
  return baseDamage * variance;
}

export function dealDamage(enemy, rawAmount, style, hits = 1) {
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

export function projectAngleToSquare(angle, halfSize) {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const denom = Math.max(Math.abs(cos), Math.abs(sin)) || 1;
  const scale = halfSize / denom;
  return {
    x: cos * scale,
    y: sin * scale,
  };
}

export function getSpawnTargetForRound(round) {
  if (round <= 0) return 0;
  const base = CONFIG.wave.spawnCountBase ?? CONFIG.wave.spawnCount ?? 40;
  const growth = CONFIG.wave.spawnCountGrowth ?? 0;
  return Math.max(1, Math.floor(base + (round - 1) * growth));
}

export function getEnemyEraForRound(round) {
  if (round <= 10) return '초기';
  if (round <= 20) return '조선';
  if (round <= 30) return '근대';
  return '현대';
}

export function pickEnemyArchetype(round) {
  const era = getEnemyEraForRound(round);
  const list = ENEMY_LIBRARY[era] || [];
  if (list.length === 0) return null;
  const idx = Math.floor(lcgRandom() * list.length);
  return { era, def: list[idx] };
}

export function spawnEnemy() {
  const pattern = getCurrentPattern();
  const angle = lcgRandom() * Math.PI * 2;
  spawnEnemyWithPattern(pattern, angle, CONFIG.orbit.radius, 0);
}

export function spawnBoss() {
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
}

export function getBossEraForKey(key) {
  if (!key) return '초기';
  if (key.includes('ancient')) return '초기';
  if (key.includes('atakebune')) return '조선';
  if (key.includes('cruiser') || key.includes('armored')) return '근대';
  return '현대';
}

export function summonBossByKey(bossKey) {
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

export function scaleEnemyStats() {
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

export function scaleBossStats(roundOverride) {
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

export function computeBossRewardByLevel(level) {
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

export function ensureBossSummonUnlocked(key, name, icon, level) {
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

export function getCurrentPattern() {
  if (GAME_STATE.isBossWave) return 'boss';
  if (GAME_STATE.round % 9 === 0) return 'split';
  if (GAME_STATE.round % 6 === 0) return 'spiral';
  if (GAME_STATE.round % 4 === 0) return 'sprint';
  return 'standard';
}

export function getPatternLabel(pattern) {
  const labels = {
    boss: '보스',
    split: '분열',
    spiral: '나선',
    sprint: '광속',
    standard: '표준',
  };
  return labels[pattern] || pattern;
}

export function spawnEnemyWithPattern(pattern, angle, radius, childLevel) {
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

export function triggerBossAbility(boss) {
  const shots = 3;
  const baseAngle = boss.angle;
  for (let i = 0; i < shots; i += 1) {
    const offset = (i - (shots - 1) / 2) * 0.25;
    const spawnAngle = baseAngle + offset;
    spawnEnemyWithPattern('spiral', spawnAngle, boss.radius + 40, 1);
  }
  GAME_STATE.minimapBossAlert = 1.2;
}

export function updateEnemyPosition(enemy) {
  const halfSize = CONFIG.orbit.radius;
  const radius = clamp(Math.abs(enemy.radius), 0, halfSize);
  const coords = projectAngleToSquare(enemy.angle, radius);
  enemy.x = CONFIG.orbit.centerX + coords.x;
  enemy.y = CONFIG.orbit.centerY + coords.y;
}

export function updateEnemies(delta) {
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

export function updateTowers(delta) {
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
  populateEnemyBuckets();
}

export function resolveTowerCollisions() {
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

export function findTarget(tower) {
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

export function computeEnemyVelocity(enemy) {
  const angle = enemy.angle ?? 0;
  const radius = enemy.radius ?? 0;
  const angularSpeed = enemy.angularSpeed ?? 0;
  const radialSpeed = enemy.radialSpeed ?? 0;
  const speedMultiplier = GAME_STATE.speedMultiplier ?? 1;
  const vx = (-Math.sin(angle) * angularSpeed * radius + Math.cos(angle) * radialSpeed) * speedMultiplier;
  const vy = (Math.cos(angle) * angularSpeed * radius + Math.sin(angle) * radialSpeed) * speedMultiplier;
  return { vx, vy };
}

export function estimateProjectileLead(tower, target, projectileSpeed) {
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

export function fireProjectile(tower, target) {
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

  const soundDef = FIRE_SOUND_BY_WEAPON[tower.weaponType] || null;
  if (soundDef) {
    playSound(soundDef.key, { volume: soundDef.volume, throttleMs: soundDef.throttleMs });
  }
}

export function computeTowerDamage(tower) {
  return tower.baseDamage + tower.upgDamage * tower.upgradeLevel;
}

export function applyExplosiveSplash(projectile, impactEnemy, { crit = false } = {}) {
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

export function updateProjectiles(delta) {
  const effectiveDelta = delta * GAME_STATE.speedMultiplier;
  populateEnemyBuckets();
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
    const candidates = getCollisionBuckets(projectile);
    for (const enemy of candidates) {
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
      if (projectileType === PROJECTILE_TYPES.EXPLOSIVE) {
        playSound('explosion', { volume: 0.5, throttleMs: 60 });
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
  invalidateBuckets();
}

export function handleEnemyDeath(enemy) {
  playSound('hit', { volume: enemy.type === 'boss' ? 0.5 : 0.32, throttleMs: 45 });
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
      const waveBossKey = enemy.bossKey || (
        enemy.era === '초기' ? 'boss_ancient_galley' :
        enemy.era === '조선' ? 'boss_atakebune' :
        enemy.era === '근대' ? 'boss_armored_cruiser' :
        'boss_missile_leader'
      );
      if (waveBossKey) {
        GAME_STATE.lastWaveBossKey = waveBossKey;
        const bossName = enemy.displayName || enemy.name || `${enemy.era || ''} 보스`.trim();
        ensureBossSummonUnlocked(waveBossKey, bossName || '웨이브 보스', enemy.icon || 'assets/svg/icons/icon_boss.svg', level);
      }
      const prevEraIndex = clamp(GAME_STATE.eraIndex ?? 0, 0, ERA_ORDER.length - 1);
      if (prevEraIndex < ERA_ORDER.length - 1) {
        GAME_STATE.eraIndex = prevEraIndex + 1;
        resetUnitPoolCache();
        updateHUD();
        const nextEraName = ERA_ORDER[GAME_STATE.eraIndex];
        statusMessage = `${nextEraName} 시대 개막! 웨이브 보스 처치`;
      } else {
        statusMessage = '웨이브 보스 처치! 보상 획득';
      }
    }
    GAME_STATE.bossMustDie = false;
    GAME_STATE.bossGraceTimer = 0;
    setWaveStatus(statusMessage);
    renderCommandPanel();
  }
}

export function handleSpawning(delta) {
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
  const economy = CONFIG?.economy || {};
  const rate = Number(economy.interestRate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return 0;

  const threshold = Number.isFinite(economy.interestThreshold)
    ? Math.max(0, Math.floor(economy.interestThreshold))
    : 0;
  const minGain = Number.isFinite(economy.interestMinimum)
    ? Math.max(0, Math.floor(economy.interestMinimum))
    : 0;
  const maxGain = Number.isFinite(economy.interestCap)
    ? Math.max(0, Math.floor(economy.interestCap))
    : Number.POSITIVE_INFINITY;

  const currentGold = Math.floor(Math.max(0, GAME_STATE.gold ?? 0));
  if (currentGold < threshold) return 0;

  let interest = Math.floor(currentGold * rate);
  if (minGain > 0) interest = Math.max(interest, minGain);
  if (Number.isFinite(maxGain)) interest = Math.min(interest, maxGain);
  if (interest <= 0) return 0;

  GAME_STATE.gold += interest;
  GAME_STATE.lastInterestGain = interest;
  GAME_STATE.lastInterestAt = performance.now?.() ?? Date.now();
  updateHUD();
  renderCommandPanel();

  return interest;
}

export function endWave() {
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

export function startWave(initial = false) {
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
