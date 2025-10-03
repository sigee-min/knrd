const DOCKYARD_CAPACITY = 8;

const SHIP_SIZE_BY_RARITY = {
  common: 1,
  rare: 2,
  unique: 4,
  legendary: 6,
  mythic: 8,
  primordial: 8,
};

function getShipSize(rarity) {
  return SHIP_SIZE_BY_RARITY[rarity] ?? 1;
}

function getDockyardBuildCost(dockyards) {
  return 2 + Math.max(0, dockyards - 1) * 8;
}

function getTotalShipyardCapacity(dockyards) {
  return dockyards * DOCKYARD_CAPACITY;
}

function getUsedShipyardCapacity(towers) {
  return towers.reduce((sum, tower) => sum + (tower.size ?? getShipSize(tower.rarity)), 0);
}

function hasAvailableShipyardCapacity(towers, dockyards) {
  return getUsedShipyardCapacity(towers) < getTotalShipyardCapacity(dockyards);
}

export {
  DOCKYARD_CAPACITY,
  getShipSize,
  getDockyardBuildCost,
  getTotalShipyardCapacity,
  getUsedShipyardCapacity,
  hasAvailableShipyardCapacity,
};
