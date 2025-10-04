const PROJECTILE_STYLE_MAP = {
  default: {
    asset: 'assets/svg/projectiles/projectile_default.svg',
    color: '#ecf0f1',
    trail: 'rgba(236, 240, 241, 0.35)',
    hitColor: 'rgba(236, 240, 241, 0.55)',
    damageColor: '#f9d776',
    damageOutline: 'rgba(10, 14, 22, 0.85)',
    size: 18,
    hitRadius: 26,
    damageFont: 'bold 16px system-ui, sans-serif',
    collisionRadius: 4.5,
  },
  bow: {
    asset: 'assets/svg/projectiles/projectile_bow.svg',
    color: '#6fe0a8',
    trail: 'rgba(111, 224, 168, 0.45)',
    hitColor: 'rgba(111, 224, 168, 0.55)',
    damageColor: '#b7ffd7',
    damageOutline: 'rgba(8, 28, 20, 0.9)',
    size: 18,
    hitRadius: 24,
    damageFont: 'bold 16px system-ui, sans-serif',
    collisionRadius: 4.2,
  },
  ballista: {
    asset: 'assets/svg/projectiles/projectile_ballista.svg',
    color: '#b388ff',
    trail: 'rgba(179, 136, 255, 0.45)',
    hitColor: 'rgba(179, 136, 255, 0.6)',
    damageColor: '#ebd7ff',
    damageOutline: 'rgba(23, 8, 38, 0.85)',
    size: 20,
    hitRadius: 30,
    damageFont: 'bold 17px system-ui, sans-serif',
    collisionRadius: 5,
  },
  arquebus: {
    asset: 'assets/svg/projectiles/projectile_arquebus.svg',
    color: '#ffbf66',
    trail: 'rgba(255, 191, 102, 0.45)',
    hitColor: 'rgba(247, 177, 89, 0.55)',
    damageColor: '#ffe3ba',
    damageOutline: 'rgba(48, 22, 5, 0.85)',
    size: 16,
    hitRadius: 22,
    damageFont: 'bold 16px system-ui, sans-serif',
    collisionRadius: 4.1,
  },
  cannon: {
    asset: 'assets/svg/projectiles/projectile_cannon.svg',
    color: '#5c5c5c',
    trail: 'rgba(255, 179, 71, 0.4)',
    hitColor: 'rgba(255, 179, 71, 0.6)',
    damageColor: '#ffd79a',
    damageOutline: 'rgba(34, 20, 4, 0.9)',
    size: 22,
    hitRadius: 34,
    damageFont: 'bold 18px system-ui, sans-serif',
    collisionRadius: 5.6,
    explosionRadius: 96,
  },
  rifle: {
    asset: 'assets/svg/projectiles/projectile_rifle.svg',
    color: '#4db6e2',
    trail: 'rgba(77, 182, 226, 0.5)',
    hitColor: 'rgba(77, 182, 226, 0.55)',
    damageColor: '#c6f0ff',
    damageOutline: 'rgba(8, 24, 35, 0.85)',
    size: 16,
    hitRadius: 22,
    damageFont: 'bold 16px system-ui, sans-serif',
    collisionRadius: 4,
  },
  naval_gun: {
    asset: 'assets/svg/projectiles/projectile_naval_gun.svg',
    color: '#367bc3',
    trail: 'rgba(54, 123, 195, 0.5)',
    hitColor: 'rgba(54, 123, 195, 0.6)',
    damageColor: '#aed6ff',
    damageOutline: 'rgba(6, 18, 32, 0.85)',
    size: 20,
    hitRadius: 30,
    damageFont: 'bold 17px system-ui, sans-serif',
    collisionRadius: 5.2,
    explosionRadius: 110,
  },
  missile: {
    asset: 'assets/svg/projectiles/projectile_missile.svg',
    color: '#ff6b6b',
    trail: 'rgba(255, 107, 107, 0.55)',
    hitColor: 'rgba(255, 128, 128, 0.65)',
    damageColor: '#ffc4bd',
    damageOutline: 'rgba(36, 6, 6, 0.9)',
    size: 22,
    hitRadius: 36,
    damageFont: 'bold 18px system-ui, sans-serif',
    collisionRadius: 6,
    explosionRadius: 140,
  },
};

const spriteCache = new Map();

function primeProjectileSpriteAsset(asset) {
  if (!asset || typeof Image === 'undefined') return null;
  let img = spriteCache.get(asset);
  if (!img) {
    img = new Image();
    img.src = asset;
    spriteCache.set(asset, img);
  }
  return img;
}

function getAllProjectileSpriteAssets() {
  const assets = new Set();
  Object.values(PROJECTILE_STYLE_MAP).forEach((entry) => {
    if (entry?.asset) assets.add(entry.asset);
  });
  return Array.from(assets);
}

function getProjectileStyle(weaponType) {
  const key = weaponType && PROJECTILE_STYLE_MAP[weaponType] ? weaponType : 'default';
  const style = PROJECTILE_STYLE_MAP[key];
  style.weaponType = key;
  if (!style.image) {
    const img = primeProjectileSpriteAsset(style.asset);
    if (img) {
      style.image = img;
    } else if (spriteCache.has(style.asset)) {
      style.image = spriteCache.get(style.asset);
    }
  }
  return style;
}

export { getProjectileStyle, getAllProjectileSpriteAssets, primeProjectileSpriteAsset };
