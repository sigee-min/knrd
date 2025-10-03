import { GAME_STATE, CONFIG } from '../../game/globals.js';

const CELL_SIZE = 96;

function ensureBuckets() {
  if (!GAME_STATE._collisionBuckets) {
    GAME_STATE._collisionBuckets = new Map();
  }
  return GAME_STATE._collisionBuckets;
}

function clearBuckets() {
  const buckets = ensureBuckets();
  buckets.clear();
}

function bucketKey(col, row) {
  return `${col}:${row}`;
}

function registerEntityForBuckets(entity) {
  const buckets = ensureBuckets();
  const radius = entity.size ?? 12;
  const minX = entity.x - radius;
  const maxX = entity.x + radius;
  const minY = entity.y - radius;
  const maxY = entity.y + radius;
  const minCol = Math.floor(minX / CELL_SIZE);
  const maxCol = Math.floor(maxX / CELL_SIZE);
  const minRow = Math.floor(minY / CELL_SIZE);
  const maxRow = Math.floor(maxY / CELL_SIZE);
  for (let col = minCol; col <= maxCol; col += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const key = bucketKey(col, row);
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(entity);
    }
  }
}

function populateEnemyBuckets() {
  clearBuckets();
  for (const enemy of GAME_STATE.enemies) {
    if (enemy.hp > 0) {
      registerEntityForBuckets(enemy);
    }
  }
}

function getCollisionBuckets(projectile) {
  const buckets = ensureBuckets();
  if (buckets.size === 0) {
    populateEnemyBuckets();
  }
  const radius = projectile.radius ?? 6;
  const minX = projectile.x - radius;
  const maxX = projectile.x + radius;
  const minY = projectile.y - radius;
  const maxY = projectile.y + radius;
  const minCol = Math.floor(minX / CELL_SIZE);
  const maxCol = Math.floor(maxX / CELL_SIZE);
  const minRow = Math.floor(minY / CELL_SIZE);
  const maxRow = Math.floor(maxY / CELL_SIZE);
  const results = new Set();
  for (let col = minCol; col <= maxCol; col += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      const list = buckets.get(bucketKey(col, row));
      if (!list) continue;
      for (const enemy of list) {
        results.add(enemy);
      }
    }
  }
  return results;
}

function invalidateBuckets() {
  if (GAME_STATE._collisionBuckets) {
    GAME_STATE._collisionBuckets.clear();
  }
}

export { getCollisionBuckets, registerEntityForBuckets, populateEnemyBuckets, invalidateBuckets };
