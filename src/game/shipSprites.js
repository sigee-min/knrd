const SPRITE_CACHE = new Map();
const ROTATED_CACHE = new Map();

// Fallback by rarity to existing generic boat icons
const RARITY_FALLBACK = {
  common: 'assets/svg/units/boat_common.svg',
  rare: 'assets/svg/units/boat_rare.svg',
  unique: 'assets/svg/units/boat_unique.svg',
  legendary: 'assets/svg/units/boat_legendary.svg',
  mythic: 'assets/svg/units/boat_mythic.svg',
  primordial: 'assets/svg/units/boat_primordial.svg',
};

// Specific ship art mapping by unit id
const VISUAL_SCALE = 1.7;

const SHIP_SPRITES = {
  // Ancient / early wooden boats
  raft: { asset: 'assets/svg/ships/ship_raft.svg', size: 28 },
  ferry: { asset: 'assets/svg/ships/ship_ferry.svg', size: 30 },
  sailboat: { asset: 'assets/svg/ships/ship_sail.svg', size: 32 },
  bowship: { asset: 'assets/svg/ships/ship_bow.svg', size: 34 },
  longbowship: { asset: 'assets/svg/ships/ship_bow.svg', size: 36 },

  // Three Kingdoms
  coastal_combat: { asset: 'assets/svg/ships/ship_ballista.svg', size: 32 },
  arrow_tower_ship: { asset: 'assets/svg/ships/ship_ballista.svg', size: 34 },
  ram_ship: { asset: 'assets/svg/ships/ship_ram.svg', size: 34 },
  flagship_three_kingdoms: { asset: 'assets/svg/ships/ship_flagship.svg', size: 38 },

  // Goryeo cannon ships
  reinforced_wood: { asset: 'assets/svg/ships/ship_cannon_early.svg', size: 32 },
  early_cannon: { asset: 'assets/svg/ships/ship_cannon_early.svg', size: 34 },
  heavy_cannon: { asset: 'assets/svg/ships/ship_cannon_heavy.svg', size: 36 },
  shield_ship: { asset: 'assets/svg/ships/ship_shield.svg', size: 36 },

  // Joseon iconic
  panokseon: { asset: 'assets/svg/ships/ship_panokseon.svg', size: 42 },
  turtle_ship: { asset: 'assets/svg/ships/ship_turtle.svg', size: 46 },
  hyup_ship: { asset: 'assets/svg/ships/ship_hyup.svg', size: 34 },
  large_oar: { asset: 'assets/svg/ships/ship_oar.svg', size: 36 },
  improved_cannon: { asset: 'assets/svg/ships/ship_cannon_improved.svg', size: 38 },
  raider: { asset: 'assets/svg/ships/ship_raider.svg', size: 34 },
  hwacha_ship: { asset: 'assets/svg/ships/ship_panokseon.svg', size: 42 },

  // Imperial/early modern
  steam_trader: { asset: 'assets/svg/ships/ship_steam.svg', size: 36 },
  armored_cruiser: { asset: 'assets/svg/ships/ship_ff.svg', size: 40 },
  yangmu: { asset: 'assets/svg/ships/ship_ff.svg', size: 36 },
  kwangmu: { asset: 'assets/svg/ships/ship_ff.svg', size: 38 },
  torpedo_boat: { asset: 'assets/svg/ships/ship_torpedo.svg', size: 30 },

  // Early ROKN
  pc701_baekdusan: { asset: 'assets/svg/ships/ship_pohang.svg', size: 34 },
  yms_minesweeper: { asset: 'assets/svg/ships/ship_mhc.svg', size: 32 },
  donghae_pc: { asset: 'assets/svg/ships/ship_pohang.svg', size: 34 },
  landing_craft: { asset: 'assets/svg/ships/ship_landing.svg', size: 40 },
  patrol_boat: { asset: 'assets/svg/ships/ship_patrol.svg', size: 32 },
  fast_attack: { asset: 'assets/svg/ships/ship_fast.svg', size: 32 },

  // Patrol / missile boats
  pkm: { asset: 'assets/svg/ships/ship_pkm.svg', size: 32 },
  pkx_a: { asset: 'assets/svg/ships/ship_pkx.svg', size: 34 },
  pkx_b: { asset: 'assets/svg/ships/ship_pkx.svg', size: 34 },

  // Frigates / corvettes
  pohang_pcc: { asset: 'assets/svg/ships/ship_pohang.svg', size: 36 },
  ulsan_ff: { asset: 'assets/svg/ships/ship_ff.svg', size: 38 },
  incheon_ffg: { asset: 'assets/svg/ships/ship_ff.svg', size: 40 },
  daegu_ffg: { asset: 'assets/svg/ships/ship_ff.svg', size: 42 },
  frigate: { asset: 'assets/svg/ships/ship_ff.svg', size: 40 },

  // Destroyers
  kdx1: { asset: 'assets/svg/ships/ship_kdx.svg', size: 44 },
  kdx2: { asset: 'assets/svg/ships/ship_kdx.svg', size: 46 },
  kdx3: { asset: 'assets/svg/ships/ship_kdx3.svg', size: 48 },
  kddx: { asset: 'assets/svg/ships/ship_kddx.svg', size: 48 },
  future_aegis: { asset: 'assets/svg/ships/ship_future_aegis.svg', size: 50 },

  // Amphibious / logistics
  dokdo_lph: { asset: 'assets/svg/ships/ship_dokdo.svg', size: 56 },
  cheonwangbong_lst: { asset: 'assets/svg/ships/ship_lst.svg', size: 50 },

  // Mine warfare
  yangyang_mhc: { asset: 'assets/svg/ships/ship_mhc.svg', size: 34 },
  wonsan_mls: { asset: 'assets/svg/ships/ship_mls.svg', size: 36 },

  // Submarines
  jangbogo_kss1: { asset: 'assets/svg/ships/ship_sub.svg', size: 40 },
  sonwoneil_kss2: { asset: 'assets/svg/ships/ship_sub.svg', size: 42 },
  dosan_ahn_changho_kss3: { asset: 'assets/svg/ships/ship_sub.svg', size: 44 },
  jangbogo3: { asset: 'assets/svg/ships/ship_sub.svg', size: 46 },
  // Newly added units mapping
  war_rowboat: { asset: 'assets/svg/ships/ship_war_rowboat.svg', size: 32 },
  ballista_raft: { asset: 'assets/svg/ships/ship_ballista_raft.svg', size: 34 },
  royal_courier: { asset: 'assets/svg/ships/ship_royal_courier.svg', size: 36 },
  oared_combatant: { asset: 'assets/svg/ships/ship_oared_combatant.svg', size: 32 },
  repeating_crossbow_ship: { asset: 'assets/svg/ships/ship_repeating_crossbow.svg', size: 34 },
  tower_ship: { asset: 'assets/svg/ships/ship_tower_ship.svg', size: 36 },
  fireship_three_kingdoms: { asset: 'assets/svg/ships/ship_fireship_3k.svg', size: 34 },
  goryeo_row: { asset: 'assets/svg/ships/ship_goryeo_row.svg', size: 32 },
  improved_goryeo_cannon: { asset: 'assets/svg/ships/ship_goryeo_cannon2.svg', size: 34 },
  armored_gunboat_goryeo: { asset: 'assets/svg/ships/ship_armored_gunboat_goryeo.svg', size: 36 },
  fire_attack_goryeo: { asset: 'assets/svg/ships/ship_goryeo_fireship.svg', size: 34 },
  seonjang_ship: { asset: 'assets/svg/ships/ship_seonjang.svg', size: 34 },
  early_panok_variant: { asset: 'assets/svg/ships/ship_panok_early.svg', size: 38 },
  great_panokseon: { asset: 'assets/svg/ships/ship_panok_great.svg', size: 44 },
  fast_raider: { asset: 'assets/svg/ships/ship_fast_raider.svg', size: 36 },
  turtle_ship_variant: { asset: 'assets/svg/ships/ship_turtle_variant.svg', size: 48 },
  protected_cruiser: { asset: 'assets/svg/ships/ship_protected_cruiser.svg', size: 40 },
  coastal_patrol_unique: { asset: 'assets/svg/ships/ship_coastal_patrol.svg', size: 32 },
  loan_destroyer: { asset: 'assets/svg/ships/ship_loan_destroyer.svg', size: 42 },
  ffx_iii: { asset: 'assets/svg/ships/ship_ffx3.svg', size: 46 },
  cvx: { asset: 'assets/svg/ships/ship_cvx.svg', size: 58 },
  stealth_ddx: { asset: 'assets/svg/ships/ship_stealth_ddx.svg', size: 50 },
};

function rotateImage180(image) {
  try {
    const w = image.naturalWidth || image.width || 0;
    const h = image.naturalHeight || image.height || 0;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI);
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    return canvas;
  } catch (_) {
    return null;
  }
}

function getTowerSprite(tower) {
  const entry = SHIP_SPRITES[tower.unitId] || null;
  const asset = entry?.asset || RARITY_FALLBACK[tower.rarity] || RARITY_FALLBACK.common;
  // Return rotated asset for all ships
  let img = ROTATED_CACHE.get(asset);
  if (!img) {
    let base = SPRITE_CACHE.get(asset);
    if (!base && typeof Image !== 'undefined') {
      base = new Image();
      base.src = asset;
      SPRITE_CACHE.set(asset, base);
    }
    if (base && base.complete && base.naturalWidth > 0) {
      const rotated = rotateImage180(base);
      if (rotated) {
        ROTATED_CACHE.set(asset, rotated);
        img = rotated;
      }
    } else if (base) {
      // Defer rotation until image loads
      base.addEventListener('load', () => {
        const rotated = rotateImage180(base);
        if (rotated) ROTATED_CACHE.set(asset, rotated);
      }, { once: true });
      img = base; // temporary fallback: unrotated until cache populated
    }
  }
  const baseSize = entry?.size ?? 36;
  const fusionScale = 1 + (tower.fusionTier ?? 0) * 0.1;
  const size = Math.round(baseSize * fusionScale * VISUAL_SCALE);
  return { image: img, size, asset };
}

export { getTowerSprite };
