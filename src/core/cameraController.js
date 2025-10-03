import { GAME_STATE, CAMERA, SETTINGS } from '../game/globals.js';
import { clamp } from '../game/combat.js';
import { WORLD } from './world.js';

export const EDGE_PAN_VERTICAL_FACTOR = 0.5;

export function applyCameraSettings() {
  CAMERA.pointerSensitivity = SETTINGS.pointerSensitivity;
  CAMERA.panSpeed = CAMERA.basePanSpeed * SETTINGS.panSpeedMultiplier;
  CAMERA.minX = 0;
  CAMERA.minY = 0;
  CAMERA.maxX = Math.max(0, WORLD.width - CAMERA.width);
  CAMERA.maxY = Math.max(0, WORLD.height - CAMERA.height);
  CAMERA.edgeZone = Math.min(120, Math.min(CAMERA.width, CAMERA.height) * 0.12);
}

export function centerCamera() {
  CAMERA.x = clamp((WORLD.width - CAMERA.width) / 2, CAMERA.minX, CAMERA.maxX);
  CAMERA.y = clamp((WORLD.height - CAMERA.height) / 2, CAMERA.minY, CAMERA.maxY);
}

export function panCamera(dx, dy) {
  if (!dx && !dy) return false;
  const nextX = clamp(CAMERA.x + dx, CAMERA.minX, CAMERA.maxX);
  const nextY = clamp(CAMERA.y + dy, CAMERA.minY, CAMERA.maxY);
  if (nextX === CAMERA.x && nextY === CAMERA.y) return false;
  CAMERA.x = nextX;
  CAMERA.y = nextY;
  return true;
}

export function handleCameraKey(code, isDown) {
  const input = GAME_STATE.cameraInput;
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
    case 'Numpad8':
      input.up = isDown;
      break;
    case 'KeyS':
    case 'ArrowDown':
    case 'Numpad2':
      input.down = isDown;
      break;
    case 'KeyA':
    case 'ArrowLeft':
    case 'Numpad4':
      input.left = isDown;
      break;
    case 'KeyD':
    case 'ArrowRight':
    case 'Numpad6':
      input.right = isDown;
      break;
    default:
      break;
  }
}

export function updateCameraKeyboard(delta) {
  const { cameraInput } = GAME_STATE;
  if (!cameraInput) return { dx: 0, dy: 0 };
  const speed = CAMERA.panSpeed * delta * GAME_STATE.speedMultiplier;
  let dx = 0;
  let dy = 0;
  if (cameraInput.left) dx -= 1;
  if (cameraInput.right) dx += 1;
  if (cameraInput.up) dy -= 1;
  if (cameraInput.down) dy += 1;
  if (!dx && !dy) return { dx: 0, dy: 0 };
  const len = Math.hypot(dx, dy) || 1;
  return {
    dx: (dx / len) * speed,
    dy: (dy / len) * speed,
  };
}

export function updateCameraEdgePan(delta) {
  if (!GAME_STATE.pointer.inside) return { dx: 0, dy: 0 };
  const zone = CAMERA.edgeZone || 60;
  let dx = 0;
  let dy = 0;
  if (GAME_STATE.pointer.screenX < zone) dx -= 1;
  else if (GAME_STATE.pointer.screenX > CAMERA.width - zone) dx += 1;
  const verticalZone = Math.max(8, zone * EDGE_PAN_VERTICAL_FACTOR);
  if (GAME_STATE.pointer.screenY < verticalZone) dy -= 1;
  else if (GAME_STATE.pointer.screenY > CAMERA.height - verticalZone) dy += 1;

  if (!dx && !dy) return { dx: 0, dy: 0 };
  const length = Math.hypot(dx, dy) || 1;
  const speed = CAMERA.panSpeed * delta * GAME_STATE.speedMultiplier;
  return {
    dx: (dx / length) * speed,
    dy: (dy / length) * speed,
  };
}
