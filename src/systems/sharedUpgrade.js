const SHARED_UPGRADE_LEVELS = new Map();

function getSharedUpgradeKey(weaponType, era, tierIndex) {
  if (weaponType) {
    return `weapon:${weaponType}`;
  }
  return `era:${era}|tier:${tierIndex}`;
}

function getSharedUpgradeLevel(weaponType, era, tierIndex) {
  const key = getSharedUpgradeKey(weaponType, era, tierIndex);
  return SHARED_UPGRADE_LEVELS.get(key) ?? 0;
}

function applySharedUpgradeLevel(gameState, weaponType, era, tierIndex, level) {
  const key = getSharedUpgradeKey(weaponType, era, tierIndex);
  let affected = 0;
  for (const tower of gameState.towers) {
    if (getSharedUpgradeKey(tower.weaponType, tower.era, tower.tierIndex) === key) {
      tower.upgradeLevel = level;
      affected += 1;
    }
  }
  return affected;
}

function setSharedUpgradeLevel(gameState, weaponType, era, tierIndex, level) {
  const normalized = Math.max(0, level);
  const key = getSharedUpgradeKey(weaponType, era, tierIndex);
  SHARED_UPGRADE_LEVELS.set(key, normalized);
  return applySharedUpgradeLevel(gameState, weaponType, era, tierIndex, normalized);
}

function resetSharedUpgradeLevels() {
  SHARED_UPGRADE_LEVELS.clear();
}

export {
  getSharedUpgradeKey,
  getSharedUpgradeLevel,
  setSharedUpgradeLevel,
  resetSharedUpgradeLevels,
};
