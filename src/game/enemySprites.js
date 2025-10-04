const ENEMY_SPRITE_CACHE = new Map();

const ENEMY_SPRITES = {
  // 초기
  raider_longboat: { asset: 'assets/svg/enemies/enemy_longboat.svg', size: 20 },
  fireship: { asset: 'assets/svg/enemies/enemy_fireship.svg', size: 18 },
  oared_assault: { asset: 'assets/svg/enemies/enemy_oared.svg', size: 18 },
  // 조선
  kobaya: { asset: 'assets/svg/enemies/enemy_kobaya.svg', size: 18 },
  sekibune: { asset: 'assets/svg/enemies/enemy_sekibune.svg', size: 20 },
  fireship_joseon: { asset: 'assets/svg/enemies/enemy_fireship.svg', size: 18 },
  // 근대
  gunboat: { asset: 'assets/svg/enemies/enemy_gunboat.svg', size: 20 },
  torpedo_boat_enemy: { asset: 'assets/svg/enemies/enemy_torpedo.svg', size: 16 },
  armored_cruiser_enemy: { asset: 'assets/svg/enemies/enemy_cruiser.svg', size: 22 },
  // 현대
  nk_missile_boat: { asset: 'assets/svg/enemies/enemy_missile_boat.svg', size: 18 },
  nk_gun_boat: { asset: 'assets/svg/enemies/enemy_gun_boat.svg', size: 18 },
  midget_sub: { asset: 'assets/svg/enemies/enemy_midget_sub.svg', size: 20 },
};

function primeEnemySpriteAsset(asset) {
  if (!asset || typeof Image === 'undefined') return null;
  let img = ENEMY_SPRITE_CACHE.get(asset);
  if (!img) {
    img = new Image();
    img.src = asset;
    ENEMY_SPRITE_CACHE.set(asset, img);
  }
  return img;
}

function getAllEnemySpriteAssets() {
  const assets = new Set();
  Object.values(ENEMY_SPRITES).forEach((entry) => {
    if (entry?.asset) assets.add(entry.asset);
  });
  return Array.from(assets);
}

function getEnemySprite(enemy) {
  const key = enemy.archetype;
  const entry = ENEMY_SPRITES[key] || null;
  if (!entry) return { image: null, size: enemy.size || 12 };
  let img = ENEMY_SPRITE_CACHE.get(entry.asset);
  if (!img) {
    img = primeEnemySpriteAsset(entry.asset);
  }
  const baseSize = entry?.size ?? enemy.size ?? 16;
  const VISUAL_SCALE = 1.7;
  return { image: img, size: Math.round(baseSize * VISUAL_SCALE), asset: entry?.asset };
}

export { getEnemySprite, getAllEnemySpriteAssets, primeEnemySpriteAsset };
