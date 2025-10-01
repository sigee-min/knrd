const PROJECTILE_TYPES = {
  NORMAL: 'normal',
  PIERCING: 'piercing',
  EXPLOSIVE: 'explosive',
};

const PROJECTILE_DEFAULTS = {
  explosionRadius: 72,
  splashMaxRatio: 0.8,
  splashMinRatio: 0.4,
};

const DEFAULT_PROJECTILE_TYPE_BY_WEAPON = {
  missile: PROJECTILE_TYPES.EXPLOSIVE,
  naval_gun: PROJECTILE_TYPES.EXPLOSIVE,
};

export {
  PROJECTILE_TYPES,
  PROJECTILE_DEFAULTS,
  DEFAULT_PROJECTILE_TYPE_BY_WEAPON,
};
