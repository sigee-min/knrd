import {
  GAME_STATE,
  CAMERA,
  CONFIG,
} from '../../game/globals.js';
import { WORLD } from '../world.js';
import { getTowerSprite } from '../../game/shipSprites.js';
import { getEnemySprite } from '../../game/enemySprites.js';
import { getBossSprite } from '../../game/bossSprites.js';
import { getProjectileStyle } from '../../game/projectileStyles.js';
import { computeEnemyVelocity } from '../gameplay/loop.js';
import {
  renderHitBlips,
  renderFloaters,
  renderRarityFloor,
  renderFusionAura,
  RARITY_COLOR,
  withAlpha,
  lightenColor,
  darkenColor,
} from './effects.js';
import { TOWER_HEADING_OFFSET, ENEMY_HEADING_OFFSET } from '../constants/gameplay.js';

function renderGrid(ctx) {
  ctx.strokeStyle = '#1d2638';
  ctx.lineWidth = 1;
  const startCol = Math.max(0, Math.floor((CAMERA.x - CONFIG.grid.offsetX) / CONFIG.grid.cellSize));
  const endCol = Math.min(
    CONFIG.grid.cols,
    Math.ceil((CAMERA.x + CAMERA.width - CONFIG.grid.offsetX) / CONFIG.grid.cellSize)
  );
  const startRow = Math.max(0, Math.floor((CAMERA.y - CONFIG.grid.offsetY) / CONFIG.grid.cellSize));
  const endRow = Math.min(
    CONFIG.grid.rows,
    Math.ceil((CAMERA.y + CAMERA.height - CONFIG.grid.offsetY) / CONFIG.grid.cellSize)
  );

  for (let col = startCol; col <= endCol; col += 1) {
    const worldX = CONFIG.grid.offsetX + col * CONFIG.grid.cellSize + 0.5;
    const screenX = worldX - CAMERA.x;
    ctx.beginPath();
    ctx.moveTo(screenX, CONFIG.grid.offsetY - CAMERA.y);
    ctx.lineTo(screenX, CONFIG.grid.offsetY + CONFIG.grid.height - CAMERA.y);
    ctx.stroke();
  }
  for (let row = startRow; row <= endRow; row += 1) {
    const worldY = CONFIG.grid.offsetY + row * CONFIG.grid.cellSize + 0.5;
    const screenY = worldY - CAMERA.y;
    ctx.beginPath();
    ctx.moveTo(CONFIG.grid.offsetX - CAMERA.x, screenY);
    ctx.lineTo(CONFIG.grid.offsetX + CONFIG.grid.width - CAMERA.x, screenY);
    ctx.stroke();
  }
}

function renderInnerRing(ctx) {
  const centerX = CONFIG.orbit.centerX - CAMERA.x;
  const centerY = CONFIG.orbit.centerY - CAMERA.y;
  const outerHalf = CONFIG.orbit.radius;
  const innerHalf = CONFIG.innerOrbitRadius;
  ctx.save();
  ctx.setLineDash([10, 12]);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(255, 170, 90, 0.5)';
  ctx.strokeRect(centerX - outerHalf, centerY - outerHalf, outerHalf * 2, outerHalf * 2);
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(72, 168, 255, 0.85)';
  ctx.strokeRect(centerX - innerHalf, centerY - innerHalf, innerHalf * 2, innerHalf * 2);
  ctx.restore();
}

function renderSelectionBox(ctx) {
  if (!GAME_STATE.dragSelecting) return;
  const start = GAME_STATE.dragStartScreen;
  const current = GAME_STATE.dragCurrentScreen;
  const minX = Math.min(start.x, current.x);
  const minY = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  if (width < 3 && height < 3) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(55, 160, 242, 0.9)';
  ctx.fillStyle = 'rgba(55, 160, 242, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minX, minY, width, height);
  ctx.setLineDash([]);
  ctx.fillRect(minX, minY, width, height);
  ctx.restore();
}

function renderTowers(ctx) {
  const showGuide = GAME_STATE.showGuide;
  const selections = GAME_STATE.selections || new Set();
  const hasSelection = selections.size > 0;
  for (const tower of GAME_STATE.towers) {
    const screenX = tower.x - CAMERA.x;
    const screenY = tower.y - CAMERA.y;
    if (screenX < -24 || screenX > CAMERA.width + 24) continue;
    if (screenY < -24 || screenY > CAMERA.height + 24) continue;
    if (showGuide) {
      const isSelected = selections.has(tower.id);
      if (!hasSelection || isSelected) {
        const rangeRadius = Math.max(12, tower.range || 0);
        if (rangeRadius > 0) {
          const rarityColor = RARITY_COLOR[tower.rarity] || '#5aa1e3';
          const ringColor = lightenColor(rarityColor, 0.25);
          const fillColor = withAlpha(ringColor, 0.08);
          ctx.save();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = withAlpha(ringColor, 0.85);
          ctx.fillStyle = fillColor;
          ctx.beginPath();
          ctx.arc(screenX, screenY, rangeRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([8, 6]);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = withAlpha(darkenColor(ringColor, 0.35), 0.9);
          ctx.beginPath();
          ctx.arc(screenX, screenY, rangeRadius * 0.72, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    renderRarityFloor(ctx, tower, screenX, screenY, GAME_STATE.time ?? 0);
    renderFusionAura(ctx, tower, screenX, screenY, GAME_STATE.time ?? 0);
    const sprite = getTowerSprite(tower);
    const size = sprite.size ?? 36;
    if (sprite.image && sprite.image.complete && sprite.image.naturalWidth > 0) {
      ctx.save();
      ctx.translate(screenX, screenY);
      const drawAngle = typeof tower.heading === 'number'
        ? tower.heading
        : Math.atan2(CONFIG.orbit.centerY - tower.y, CONFIG.orbit.centerX - tower.x);
      ctx.rotate(drawAngle + TOWER_HEADING_OFFSET);
      ctx.drawImage(sprite.image, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.fillStyle = RARITY_COLOR[tower.rarity] || '#ffffff';
      ctx.beginPath();
      const fallbackR = Math.max(10, Math.round(size * 0.35));
      ctx.arc(screenX, screenY, fallbackR, 0, Math.PI * 2);
      ctx.fill();
    }
    if (selections.has(tower.id)) {
      ctx.strokeStyle = '#37a0f2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const selR = Math.max(12, tower.selectionRadius ?? Math.round(size * 0.35));
      ctx.arc(screenX, screenY, selR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function renderEnemies(ctx) {
  for (const enemy of GAME_STATE.enemies) {
    const screenX = enemy.x - CAMERA.x;
    const screenY = enemy.y - CAMERA.y;
    if (screenX < -enemy.size || screenX > CAMERA.width + enemy.size) continue;
    if (screenY < -enemy.size || screenY > CAMERA.height + enemy.size) continue;
    const velocity = computeEnemyVelocity(enemy);
    const computedHeading = Math.atan2(velocity.vy, velocity.vx);
    const heading = Number.isFinite(enemy.heading) ? enemy.heading
      : Number.isFinite(computedHeading) ? computedHeading : 0;
    if (enemy.type !== 'boss') {
      const sprite = getEnemySprite(enemy);
      if (sprite.image && sprite.image.complete && sprite.image.naturalWidth > 0) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(heading + ENEMY_HEADING_OFFSET);
        const sz = sprite.size || enemy.size * 1.7;
        ctx.drawImage(sprite.image, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else {
        const visualRadius = enemy.size * 1.7;
        ctx.fillStyle = enemy.fill || '#c85f85';
        ctx.beginPath();
        ctx.arc(screenX, screenY, visualRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const sprite = getBossSprite(enemy);
      const eraAura = {
        '초기': '#d4aa70',
        '조선': '#6b7b4a',
        '근대': '#3f5a7a',
        '현대': '#c85f85',
      }[enemy.era] || '#d35400';
      const t = (GAME_STATE.time - (enemy.spawnAt || GAME_STATE.time));
      const pulse = 1 + 0.06 * Math.sin(t * 3.2);
      const auraR = enemy.size * 1.6 * pulse;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = eraAura;
      ctx.beginPath();
      ctx.arc(screenX, screenY, auraR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (sprite.image && sprite.image.complete && sprite.image.naturalWidth > 0) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(heading + ENEMY_HEADING_OFFSET);
        const sz = sprite.size || enemy.size * 1.7;
        ctx.drawImage(sprite.image, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      } else {
        ctx.fillStyle = '#d35400';
        ctx.beginPath();
        ctx.arc(screenX, screenY, enemy.size * 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const hpPercent = Math.max(0, enemy.hp / enemy.maxHp);
    if (enemy.type === 'boss') {
      const w = 56;
      const h = 6;
      const x = screenX - w / 2;
      const y = screenY - enemy.size - 14;
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(x, y, w * hpPercent, h);
      ctx.strokeStyle = '#0e141e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    } else {
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(screenX - 16, screenY - enemy.size - 10, 32, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(screenX - 16, screenY - enemy.size - 10, 32 * hpPercent, 4);
    }
  }
}

function renderProjectiles(ctx) {
  for (const projectile of GAME_STATE.projectiles) {
    const style = projectile.style || getProjectileStyle(projectile.weaponType);
    const screenX = projectile.x - CAMERA.x;
    const screenY = projectile.y - CAMERA.y;
    if (screenX < -projectile.radius || screenX > CAMERA.width + projectile.radius) continue;
    if (screenY < -projectile.radius || screenY > CAMERA.height + projectile.radius) continue;
    const angle = Math.atan2(projectile.vy, projectile.vx);
    if (style?.trail) {
      ctx.save();
      ctx.strokeStyle = style.trail;
      ctx.lineWidth = Math.max(1.4, projectile.radius * 0.55);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX - projectile.vx * 0.06, screenY - projectile.vy * 0.06);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);
    const size = style?.size ?? projectile.radius * 2;
    if (style?.image && style.image.complete && style.image.naturalWidth > 0) {
      ctx.drawImage(style.image, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = style?.color || '#ecf0f1';
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.4, size * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function renderScene(ctx) {
  renderGrid(ctx);
  renderInnerRing(ctx);
  renderTowers(ctx);
  renderEnemies(ctx);
  renderProjectiles(ctx);
  renderFloaters(ctx, CAMERA);
  renderHitBlips(ctx, CAMERA);
  renderSelectionBox(ctx);
}

function renderMinimap(ctx, minimapCanvas) {
  const canvasWidth = minimapCanvas?.logicalWidth || minimapCanvas.width;
  const canvasHeight = minimapCanvas?.logicalHeight || minimapCanvas.height;
  ctx.fillStyle = '#0f121b';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.strokeStyle = '#2a3242';
  ctx.strokeRect(0.5, 0.5, canvasWidth - 1, canvasHeight - 1);

  const scaleX = canvasWidth / WORLD.width;
  const scaleY = canvasHeight / WORLD.height;

  if (GAME_STATE.minimapBossAlert > 0) {
    const pulse = 0.4 + 0.3 * Math.sin(performance.now() / 100);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(211, 84, 0, ${pulse.toFixed(2)})`;
    ctx.strokeRect(1.5, 1.5, canvasWidth - 3, canvasHeight - 3);
    ctx.restore();
  }

  ctx.fillStyle = '#37a0f2';
  for (const tower of GAME_STATE.towers) {
    ctx.fillRect(tower.x * scaleX - 2, tower.y * scaleY - 2, 4, 4);
  }

  for (const enemy of GAME_STATE.enemies) {
    ctx.fillStyle = enemy.type === 'boss' ? '#d35400' : '#c85f85';
    ctx.fillRect(enemy.x * scaleX - 2, enemy.y * scaleY - 2, 4, 4);
  }

  ctx.strokeStyle = '#37a0f2';
  ctx.lineWidth = 1;
  const camWidth = Math.min(CAMERA.width, WORLD.width);
  const camHeight = Math.min(CAMERA.height, WORLD.height);
  const camX = Math.max(0, Math.min(CAMERA.x, WORLD.width - camWidth));
  const camY = Math.max(0, Math.min(CAMERA.y, WORLD.height - camHeight));
  ctx.strokeRect(
    camX * scaleX + 0.5,
    camY * scaleY + 0.5,
    camWidth * scaleX,
    camHeight * scaleY
  );
}

export { renderScene, renderMinimap };
