import { GAME_STATE } from '../../game/globals.js';
import { getProjectileStyle } from '../../game/projectileStyles.js';

const RARITY_COLOR = {
  common: '#8aa0b8',
  rare: '#5aa1e3',
  unique: '#9b59b6',
  legendary: '#f39c12',
  mythic: '#e74c3c',
  primordial: '#2ecc71',
};

const RARITY_FLOOR_STYLES = {
  common: { color: '#8aa0b8', alpha: 0.34, radius: 18, sparkle: 5, sparkleSize: 1.05, sparkleAlpha: 1.22, pulse: 0.018 },
  rare: { color: '#5aa1e3', alpha: 0.36, radius: 20, sparkle: 6, sparkleSize: 1.08, sparkleAlpha: 1.24, pulse: 0.022 },
  unique: { color: '#9b59b6', alpha: 0.4, radius: 22, sparkle: 7, sparkleSize: 1.12, sparkleAlpha: 1.27, pulse: 0.026 },
  legendary: { color: '#f39c12', alpha: 0.45, radius: 24, sparkle: 9, sparkleSize: 1.18, sparkleAlpha: 1.3, pulse: 0.032 },
  mythic: { color: '#e74c3c', alpha: 0.5, radius: 26, sparkle: 11, sparkleSize: 1.24, sparkleAlpha: 1.34, pulse: 0.038 },
  primordial: { color: '#2ecc71', alpha: 0.54, radius: 28, sparkle: 12, sparkleSize: 1.28, sparkleAlpha: 1.38, pulse: 0.044 },
};

const FUSION_AURA_STYLES = [
  null,
  {
    color: 'rgba(86, 186, 255, 0.82)',
    ringColor: 'rgba(86, 186, 255, 0.9)',
    radiusScale: 0.58,
    rayColor: 'rgba(142, 224, 255, 0.95)',
    rayCount: 3,
    particles: 6,
    particleScale: 0.55,
    pulse: 0.16,
    glow: 'rgba(86, 186, 255, 0.75)',
  },
  {
    color: 'rgba(166, 118, 255, 0.85)',
    ringColor: 'rgba(186, 148, 255, 0.95)',
    radiusScale: 0.62,
    rayColor: 'rgba(224, 206, 255, 0.9)',
    rayCount: 4,
    particles: 7,
    particleScale: 0.6,
    pulse: 0.19,
    glow: 'rgba(166, 118, 255, 0.8)',
  },
  {
    color: 'rgba(255, 198, 109, 0.88)',
    ringColor: 'rgba(255, 228, 163, 0.95)',
    radiusScale: 0.66,
    rayColor: 'rgba(255, 224, 182, 0.9)',
    rayCount: 5,
    particles: 8,
    particleScale: 0.62,
    pulse: 0.22,
    glow: 'rgba(255, 218, 141, 0.85)',
  },
  {
    color: 'rgba(255, 142, 198, 0.9)',
    ringColor: 'rgba(255, 184, 226, 0.95)',
    radiusScale: 0.7,
    rayColor: 'rgba(255, 210, 238, 0.9)',
    rayCount: 6,
    particles: 9,
    particleScale: 0.66,
    pulse: 0.26,
    glow: 'rgba(255, 176, 219, 0.88)',
  },
];

const FLOATERS_LIMIT = 120;
const HIT_BLIPS_LIMIT = 80;

const RARITY_TEXTURE_CACHE = new Map();
const FUSION_TEXTURE_CACHE = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    return { r, g, b, a: 1 };
  }
  if (normalized.length === 6) {
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return { r, g, b, a: 1 };
  }
  return null;
}

function parseRgb(color) {
  if (!color || typeof color !== 'string') return null;
  const match = color.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1]
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value));
  if (parts.length < 3) return null;
  const [r, g, b, a] = parts;
  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
    a: Number.isFinite(a) ? clamp(a, 0, 1) : 1,
  };
}

function withAlpha(color, alpha) {
  const safeAlpha = clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1);
  if (!color) return `rgba(255, 255, 255, ${safeAlpha})`;
  if (color.startsWith('rgba')) {
    const rgb = parseRgb(color);
    if (!rgb) return `rgba(255, 255, 255, ${safeAlpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
  }
  if (color.startsWith('rgb')) {
    const rgb = parseRgb(color);
    if (!rgb) return `rgba(255, 255, 255, ${safeAlpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
  }
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    if (!rgb) return `rgba(255, 255, 255, ${safeAlpha})`;
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
  }
  return color;
}

function resolveRgba(color) {
  if (!color || typeof color !== 'string') return null;
  const normalized = color.trim().toLowerCase();
  if (normalized === 'transparent') return { r: 255, g: 255, b: 255, a: 0 };
  if (normalized.startsWith('rgba') || normalized.startsWith('rgb')) {
    return parseRgb(normalized);
  }
  if (normalized.startsWith('#')) {
    return hexToRgb(normalized);
  }
  return null;
}

function brightenColor(color, amount = 0.45) {
  const rgba = resolveRgba(color);
  if (!rgba) return color || '#ffffff';
  const ratio = clamp(amount, 0, 1);
  const r = Math.round(rgba.r + (255 - rgba.r) * ratio);
  const g = Math.round(rgba.g + (255 - rgba.g) * ratio);
  const b = Math.round(rgba.b + (255 - rgba.b) * ratio);
  const alpha = rgba.a ?? 1;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenColor(color, amount = 0.4) {
  const rgba = resolveRgba(color);
  if (!rgba) return color || 'rgba(0, 0, 0, 1)';
  const ratio = clamp(amount, 0, 1);
  const r = Math.round(rgba.r * (1 - ratio));
  const g = Math.round(rgba.g * (1 - ratio));
  const b = Math.round(rgba.b * (1 - ratio));
  const alpha = rgba.a ?? 1;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function easeOutCubic(t) {
  const clamped = clamp(t, 0, 1);
  const inv = 1 - clamped;
  return 1 - inv * inv * inv;
}

function createCanvas(size) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(size, size);
  }
  if (typeof document !== 'undefined' && document?.createElement) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    return canvas;
  }
  return { width: size, height: size, getContext: () => null };
}

function getRarityTexture(style) {
  const key = `${style.color}|${style.alpha}|${style.sparkle}|${style.sparkleSize}|${style.sparkleAlpha}`;
  if (RARITY_TEXTURE_CACHE.has(key)) {
    return RARITY_TEXTURE_CACHE.get(key);
  }

  const size = 256;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    RARITY_TEXTURE_CACHE.set(key, canvas);
    return canvas;
  }

  const center = size / 2;
  const baseAlpha = style.alpha ?? 0.4;
  const gradient = ctx.createRadialGradient(center, center * 1.05, size * 0.12, center, center * 1.05, size * 0.48);
  gradient.addColorStop(0, withAlpha('#ffffff', clamp(baseAlpha + 0.35, 0, 1)));
  gradient.addColorStop(0.35, withAlpha(style.color, clamp(baseAlpha + 0.18, 0, 1)));
  gradient.addColorStop(0.78, withAlpha(style.color, clamp(baseAlpha * 0.45, 0, 1)));
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(center, center * 1.05, size * 0.48, size * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  const sparkles = Math.max(0, Math.floor(style.sparkle ?? 0));
  if (sparkles > 0) {
    const sparkleRadius = (style.sparkleSize ?? 1.1) * size * 0.035;
    const sparkleColor = withAlpha('#ffffff', clamp((style.sparkleAlpha ?? 1.2) * baseAlpha, 0, 1));
    for (let i = 0; i < sparkles; i += 1) {
      const angle = (i / sparkles) * Math.PI * 2;
      const wobble = Math.sin(i * 1.7) * size * 0.04;
      const radius = size * 0.34 + wobble;
      const sx = center + Math.cos(angle) * radius;
      const sy = center * 1.05 + Math.sin(angle) * radius * 0.45;
      ctx.fillStyle = sparkleColor;
      ctx.beginPath();
      ctx.ellipse(sx, sy, sparkleRadius, sparkleRadius * 0.45, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  RARITY_TEXTURE_CACHE.set(key, canvas);
  return canvas;
}

function getFusionTexture(style) {
  const key = `${style.color}|${style.ringColor}|${style.glow}|${style.rayColor}`;
  if (FUSION_TEXTURE_CACHE.has(key)) {
    return FUSION_TEXTURE_CACHE.get(key);
  }

  const size = 256;
  const canvas = createCanvas(size);
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    FUSION_TEXTURE_CACHE.set(key, canvas);
    return canvas;
  }

  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, size * 0.1, center, center, size * 0.48);
  gradient.addColorStop(0, withAlpha('#ffffff', 0.9));
  gradient.addColorStop(0.4, withAlpha(style.color, 0.6));
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, size * 0.48, 0, Math.PI * 2);
  ctx.fill();

  if (style.glow) {
    ctx.strokeStyle = withAlpha(style.glow, 0.8);
    ctx.lineWidth = size * 0.03;
    ctx.beginPath();
    ctx.arc(center, center, size * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  }

  FUSION_TEXTURE_CACHE.set(key, canvas);
  return canvas;
}

function spawnDamageFloater(x, y, rawValue, style = {}) {
  if (!Array.isArray(GAME_STATE.floaters)) {
    GAME_STATE.floaters = [];
  }

  const effectiveStyle = style && typeof style === 'object' ? style : {};
  const baseStyle = effectiveStyle.damageColor ? effectiveStyle : getProjectileStyle(effectiveStyle.weaponType);
  const sourceColor = baseStyle?.damageColor || effectiveStyle.color || '#fff7d6';
  const baseOutline = effectiveStyle.outline || baseStyle?.damageOutline || '#10161f';
  const color = brightenColor(sourceColor, 0.55);
  const highlight = effectiveStyle.highlightColor || brightenColor(sourceColor, 0.85);
  const outline = effectiveStyle.outline
    ? baseOutline
    : brightenColor(baseOutline, 0.18);
  const glow = effectiveStyle.damageGlow || highlight;
  const font = baseStyle?.damageFont || effectiveStyle.damageFont || '700 24px "Noto Sans KR", system-ui, sans-serif';

  const amount = Number.isFinite(rawValue) ? Math.round(Math.abs(rawValue)) : rawValue;
  const defaultPrefix = effectiveStyle.prefix ?? (rawValue >= 0 ? '-' : '+');
  const defaultText = typeof amount === 'number' ? `${defaultPrefix}${amount}` : `${amount}`;
  const textValue = effectiveStyle.damageText ?? defaultText;

  const floater = {
    x,
    y,
    vx: effectiveStyle.vx ?? (Math.random() - 0.5) * 12,
    vy: effectiveStyle.vy ?? (-34 - Math.random() * 12),
    gravity: effectiveStyle.gravity ?? 28,
    ttl: effectiveStyle.ttl ?? 1.4,
    age: 0,
    text: textValue,
    color,
    outline,
    glow,
    font,
    highlight,
    highlightAlpha: effectiveStyle.highlightAlpha ?? 0.85,
    strokeWidth: effectiveStyle.strokeWidth ?? 2.8,
    fadeTail: effectiveStyle.fadeTail ?? 0.35,
    popScale: effectiveStyle.popScale ?? 0.16,
    ramp: effectiveStyle.ramp ?? 0.1,
    wobble: effectiveStyle.wobble ?? 0,
    wobbleSpeed: effectiveStyle.wobbleSpeed ?? 0,
    wobbleOffset: Math.random() * Math.PI * 2,
    shadowBlur: effectiveStyle.shadowBlur ?? 6,
    outlineAlpha: effectiveStyle.outlineAlpha ?? 0.82,
    fillAlpha: effectiveStyle.fillAlpha ?? 1,
    visibilityPower: effectiveStyle.visibilityPower ?? 0.65,
  };

  if (effectiveStyle.crit) {
    const critSource = effectiveStyle.critColor || '#ffe07b';
    floater.color = brightenColor(critSource, 0.3);
    floater.highlight = effectiveStyle.critHighlight || brightenColor(critSource, 0.75);
    floater.highlightAlpha = effectiveStyle.critHighlightAlpha ?? 0.95;
    floater.glow = effectiveStyle.critGlow ?? floater.highlight;
    floater.strokeWidth = effectiveStyle.critStrokeWidth ?? 3.4;
    floater.popScale += 0.12;
    floater.ttl += 0.25;
    const critValue = typeof amount === 'number' ? amount : String(textValue).replace(/[^0-9]/g, '');
    floater.text = effectiveStyle.critText || `CRIT ${critValue}`;
    floater.shadowBlur = effectiveStyle.critShadowBlur ?? Math.max(floater.shadowBlur, 10);
    floater.outlineAlpha = effectiveStyle.critOutlineAlpha ?? Math.min(1, floater.outlineAlpha + 0.1);
    floater.visibilityPower = effectiveStyle.critVisibilityPower ?? 0.55;
  }

  GAME_STATE.floaters.push(floater);
  while (GAME_STATE.floaters.length > FLOATERS_LIMIT) {
    GAME_STATE.floaters.shift();
  }
  return floater;
}

function spawnHitBlip(x, y, style = {}) {
  if (!Array.isArray(GAME_STATE.hitBlips)) {
    GAME_STATE.hitBlips = [];
  }

  const baseStyle = style && typeof style === 'object' && (style.hitColor || style.color)
    ? style
    : getProjectileStyle(style?.weaponType);

  const radius = baseStyle?.hitRadius || style.hitRadius || 28;
  const blip = {
    x,
    y,
    radius,
    color: baseStyle?.hitColor || style.color || 'rgba(255, 255, 255, 0.6)',
    outline: style.outline || 'rgba(255, 255, 255, 0.92)',
    sparkColor: style.sparkColor || baseStyle?.hitColor || 'rgba(255, 255, 220, 0.95)',
    sparkCount: style.sparkCount ?? Math.max(3, Math.round(radius / 6)),
    sparkSeed: Math.random() * Math.PI * 2,
    ttl: style.ttl ?? 0.42,
    age: 0,
    pulse: style.pulse ?? 0.2,
    ringWidth: style.ringWidth ?? Math.max(2, radius * 0.12),
    opacity: style.opacity ?? 1,
  };

  GAME_STATE.hitBlips.push(blip);
  while (GAME_STATE.hitBlips.length > HIT_BLIPS_LIMIT) {
    GAME_STATE.hitBlips.shift();
  }
  return blip;
}

function updateFloaters(delta) {
  if (!Array.isArray(GAME_STATE.floaters) || GAME_STATE.floaters.length === 0) return;
  const dt = delta * (GAME_STATE.speedMultiplier || 1);
  for (let i = GAME_STATE.floaters.length - 1; i >= 0; i -= 1) {
    const floater = GAME_STATE.floaters[i];
    floater.age += dt;
    floater.x += (floater.vx ?? 0) * dt;
    floater.y += (floater.vy ?? 0) * dt;
    floater.vy += (floater.gravity ?? 0) * dt;
    if (floater.age >= floater.ttl) {
      GAME_STATE.floaters.splice(i, 1);
    }
  }
}

function updateHitBlips(delta) {
  if (!Array.isArray(GAME_STATE.hitBlips) || GAME_STATE.hitBlips.length === 0) return;
  const dt = delta * (GAME_STATE.speedMultiplier || 1);
  for (let i = GAME_STATE.hitBlips.length - 1; i >= 0; i -= 1) {
    const blip = GAME_STATE.hitBlips[i];
    blip.age += dt;
    if (blip.age >= blip.ttl) {
      GAME_STATE.hitBlips.splice(i, 1);
    }
  }
}

function renderFloaters(ctx, camera) {
  if (!ctx || !camera) return;
  if (!Array.isArray(GAME_STATE.floaters) || GAME_STATE.floaters.length === 0) return;

  for (const floater of GAME_STATE.floaters) {
    const life = floater.ttl > 0 ? clamp(floater.age / floater.ttl, 0, 1) : 1;
    const appear = floater.ramp > 0 ? clamp(floater.age / floater.ramp, 0, 1) : 1;
    const fadeTail = clamp(floater.fadeTail ?? 0.35, 0.05, 0.9);
    const fade = life > 1 - fadeTail ? clamp((1 - life) / fadeTail, 0, 1) : 1;
    const rawVisibility = clamp(appear * fade, 0, 1);
    const visibilityPower = clamp(floater.visibilityPower ?? 1, 0.35, 1.4);
    const visibility = rawVisibility ** visibilityPower;
    if (visibility <= 0) continue;

    const screenX = floater.x - camera.x;
    const screenY = floater.y - camera.y;

    const wobble = (floater.wobble || 0) * Math.sin((floater.age + floater.wobbleOffset) * (floater.wobbleSpeed || 6));
    const scale = 1 + (floater.popScale || 0) * (1 - easeOutCubic(life));

    ctx.save();
    ctx.translate(screenX, screenY - life * 36);
    ctx.rotate(wobble);
    ctx.scale(scale, scale);
    ctx.globalAlpha = visibility;

    ctx.font = floater.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.shadowColor = withAlpha(floater.glow, Math.min(1, visibility * 0.95));
    ctx.shadowBlur = floater.shadowBlur ?? 18;

    if (floater.highlight) {
      const highlightAlpha = clamp(floater.highlightAlpha ?? 0.85, 0.05, 1);
      ctx.fillStyle = withAlpha(
        floater.highlight,
        Math.min(1, visibility * highlightAlpha),
      );
      ctx.fillText(floater.text, 0, 0);
    }

    ctx.fillStyle = withAlpha(floater.color, Math.min(1, visibility * (floater.fillAlpha ?? 1)));
    ctx.fillText(floater.text, 0, 0);

    if (floater.strokeWidth > 0) {
      ctx.lineWidth = floater.strokeWidth;
      ctx.strokeStyle = withAlpha(floater.outline, Math.min(1, visibility * (floater.outlineAlpha ?? 1)));
      ctx.strokeText(floater.text, 0, 0);
    }

    ctx.restore();
  }
}

function renderHitBlips(ctx, camera) {
  if (!ctx || !camera) return;
  if (!Array.isArray(GAME_STATE.hitBlips) || GAME_STATE.hitBlips.length === 0) return;

  for (const blip of GAME_STATE.hitBlips) {
    const life = blip.ttl > 0 ? clamp(blip.age / blip.ttl, 0, 1) : 1;
    const eased = easeOutCubic(life);
    const alpha = clamp(1 - life, 0, 1) * (blip.opacity ?? 1);
    if (alpha <= 0) continue;

    const radius = blip.radius * (0.75 + eased * 0.35);
    const innerRadius = radius * 0.55;
    const screenX = blip.x - camera.x;
    const screenY = blip.y - camera.y;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = withAlpha(blip.color, clamp(0.55 * alpha, 0, 1));
    ctx.beginPath();
    ctx.arc(screenX, screenY, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = blip.ringWidth ?? Math.max(2, radius * 0.1);
    ctx.strokeStyle = withAlpha(blip.outline || blip.color, clamp(0.9 * alpha, 0, 1));
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();

    const sparks = Math.max(0, blip.sparkCount || 0);
    if (sparks > 0) {
      ctx.lineWidth = Math.max(1.4, radius * 0.06);
      ctx.lineCap = 'round';
      ctx.strokeStyle = withAlpha(blip.sparkColor || blip.color, clamp(0.85 * alpha, 0, 1));
      const base = radius * 0.6;
      const length = radius * 1.1;
      for (let i = 0; i < sparks; i += 1) {
        const angle = blip.sparkSeed + (i / sparks) * Math.PI * 2;
        const wobble = Math.sin(blip.age * 6 + i) * radius * 0.2;
        const sx = screenX + Math.cos(angle) * (base + wobble * 0.4);
        const sy = screenY + Math.sin(angle) * (base + wobble * 0.4);
        const ex = screenX + Math.cos(angle) * (length + wobble);
        const ey = screenY + Math.sin(angle) * (length + wobble);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

function renderRarityFloor(ctx, tower, screenX, screenY, time) {
  const style = RARITY_FLOOR_STYLES[tower.rarity];
  if (!style) return;

  const colliderRadius = tower.colliderRadius ?? 18;
  const colliderScale = colliderRadius / 18;
  const radius = Math.max(15, (style.radius ?? 20) * colliderScale * 0.85);
  const alpha = style.alpha ?? 0.36;
  const pulse = (style.pulse ?? 0.02) * Math.sin(time * 3.6 + tower.id * 0.3);
  const offsetY = colliderRadius * 0.22 + 6;
  const baseY = screenY + offsetY;

  const texture = getRarityTexture(style);
  const texHalf = texture.width / 2;
  const baseScale = radius / texHalf;

  ctx.save();
  ctx.globalAlpha = clamp(alpha + pulse, 0, 1);
  ctx.translate(screenX, baseY);
  ctx.scale(baseScale, baseScale * 0.6);
  ctx.drawImage(texture, -texHalf, -texHalf);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = clamp((alpha + 0.1) * 0.85, 0, 1);
  ctx.strokeStyle = withAlpha(style.color, (alpha + 0.06) * 0.9);
  ctx.lineWidth = Math.max(1, radius * 0.08);
  ctx.beginPath();
  ctx.arc(screenX, baseY, radius * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function renderFusionAura(ctx, tower, screenX, screenY, time) {
  const tier = tower.fusionTier ?? 0;
  if (tier <= 0) return;
  const style = FUSION_AURA_STYLES[Math.min(FUSION_AURA_STYLES.length - 1, tier)];
  if (!style) return;

  const colliderRadius = tower.colliderRadius ?? 18;
  const baseRadius = colliderRadius * (0.95 + tier * 0.07);
  const haloRadius = baseRadius * (style.radiusScale ?? 0.6);
  const verticalOffset = Math.min(18, colliderRadius * 0.28 + 5);
  const pulse = 0.75 + (style.pulse ?? 0.18) * Math.sin(time * 3.4 + tower.id * 0.4);

  ctx.save();
  ctx.translate(0, verticalOffset);
  const prevComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';

  const texture = getFusionTexture(style);
  const texHalf = texture.width / 2;
  const baseScale = haloRadius / texHalf;
  const scale = baseScale * (1 + (pulse - 0.75) * 0.4);

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.scale(scale, scale);
  ctx.globalAlpha = clamp(0.9 + pulse * 0.1, 0, 1);
  ctx.drawImage(texture, -texHalf, -texHalf);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = clamp(style.ringColor ? 0.8 : 0.6, 0, 1);
  ctx.strokeStyle = withAlpha(style.ringColor || style.color, 0.92);
  ctx.lineWidth = Math.max(1.4, haloRadius * 0.22);
  ctx.beginPath();
  ctx.arc(screenX, screenY, haloRadius * (0.78 + 0.18 * pulse), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const rayCount = style.rayCount ?? 4;
  if (rayCount > 0) {
    const rayColor = style.rayColor || withAlpha(style.color, 0.85);
    const raySpeed = style.raySpeed ?? 2.4;
    const rayThickness = Math.max(1, haloRadius * 0.12);
    for (let i = 0; i < rayCount; i += 1) {
      const angle = time * raySpeed + tower.id * 0.3 + (i / rayCount) * Math.PI * 2;
      const inner = haloRadius * 0.35;
      const outer = haloRadius * (0.95 + 0.25 * pulse);
      const wobble = Math.sin(time * 1.8 + i) * haloRadius * 0.12;
      const sx = screenX + Math.cos(angle) * inner;
      const sy = screenY + Math.sin(angle) * inner;
      const ex = screenX + Math.cos(angle) * (outer + wobble);
      const ey = screenY + Math.sin(angle) * (outer + wobble);
      ctx.strokeStyle = withAlpha(rayColor, clamp(0.65 + pulse * 0.25, 0, 1));
      ctx.lineWidth = rayThickness;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }

  const particles = style.particles ?? 6;
  if (particles > 0) {
    ctx.globalAlpha = 0.85;
    const particleRadius = Math.max(2.5, haloRadius * (style.particleScale ?? 0.6) * 0.14);
    for (let i = 0; i < particles; i += 1) {
      const angle = (i / particles) * Math.PI * 2 + time * 0.6 + tower.id * 0.2;
      const dist = haloRadius * (0.45 + 0.18 * Math.sin(time * 2.1 + i));
      const px = screenX + Math.cos(angle) * dist;
      const py = screenY + Math.sin(angle) * dist * 0.72;
      ctx.fillStyle = withAlpha(style.color, 0.78 + 0.18 * Math.sin(time * 2 + i));
      ctx.beginPath();
      ctx.ellipse(px, py, particleRadius, particleRadius * 0.55, angle, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = prevComposite;
  ctx.restore();
}

export {
  RARITY_COLOR,
  spawnDamageFloater,
  spawnHitBlip,
  updateFloaters,
  updateHitBlips,
  renderHitBlips,
  renderFloaters,
  renderRarityFloor,
  renderFusionAura,
};
