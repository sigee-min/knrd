const BOSS_SPRITE_CACHE = new Map();

const BOSS_SPRITES = {
  boss_ancient_galley: { asset: 'assets/svg/bosses/boss_ancient.svg', size: 64 },
  boss_atakebune: { asset: 'assets/svg/bosses/boss_joseon.svg', size: 70 },
  boss_armored_cruiser: { asset: 'assets/svg/bosses/boss_empire.svg', size: 76 },
  boss_missile_leader: { asset: 'assets/svg/bosses/boss_modern.svg', size: 72 },
};

function getBossSprite(enemy) {
  const key = enemy.bossKey || 'boss_ancient_galley';
  const entry = BOSS_SPRITES[key] || null;
  if (!entry) return { image: null, size: enemy.size || 48 };
  let img = BOSS_SPRITE_CACHE.get(entry.asset);
  if (!img && typeof Image !== 'undefined') {
    img = new Image();
    img.src = entry.asset;
    BOSS_SPRITE_CACHE.set(entry.asset, img);
  }
  return { image: img, size: entry.size };
}

export { getBossSprite };

