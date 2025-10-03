import { CONFIG } from '../game/globals.js';

export const WORLD = {
  width: 2400,
  height: 1200,
};

export function configureWorldGeometry() {
  CONFIG.battlefield.width = WORLD.width;
  CONFIG.battlefield.height = WORLD.height;

  CONFIG.grid.width = CONFIG.grid.cols * CONFIG.grid.cellSize;
  CONFIG.grid.height = CONFIG.grid.rows * CONFIG.grid.cellSize;
  CONFIG.grid.offsetX = Math.floor((WORLD.width - CONFIG.grid.width) / 2);
  CONFIG.grid.offsetY = Math.floor((WORLD.height - CONFIG.grid.height) / 2);

  const baseOrbitRadius = Math.min(CONFIG.grid.width, CONFIG.grid.height) * 0.42;
  const orbitScale = 0.96;
  CONFIG.orbit.radius = baseOrbitRadius * orbitScale;
  CONFIG.innerOrbitRadius = baseOrbitRadius * 0.9 * orbitScale;
  CONFIG.orbit.centerX = WORLD.width / 2;
  CONFIG.orbit.centerY = WORLD.height / 2;
}
