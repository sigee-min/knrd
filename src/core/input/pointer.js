import { GAME_STATE, CAMERA } from '../../game/globals.js';
import { clamp, clampToInnerRing, orderSelectedTowers } from '../../game/combat.js';
import { updateCameraOverlay } from '../ui/hud.js';
import { renderCommandPanel } from '../../game/commands.js';
import { applyDragSelection, handleDoubleClickSelection } from '../../game/selection.js';

let canvas = null;
let battlefield = null;
let viewArea = null;

function setPointerTargets({ canvas: canvasEl, battlefieldEl }) {
  canvas = canvasEl;
  battlefield = battlefieldEl;
  viewArea = battlefieldEl?.closest('.view-area') || battlefieldEl?.parentElement || null;
}

function isWithinViewArea(clientX, clientY) {
  if (!viewArea) return false;
  const rect = viewArea.getBoundingClientRect();
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function getPointerPositions(event) {
  if (!canvas) return { screenX: 0, screenY: 0, worldX: 0, worldY: 0 };
  const rect = canvas.getBoundingClientRect();
  const logicalWidth = Number(canvas.logicalWidth) || rect.width;
  const logicalHeight = Number(canvas.logicalHeight) || rect.height;
  const scaleX = logicalWidth / rect.width;
  const scaleY = logicalHeight / rect.height;
  const screenX = (event.clientX - rect.left) * scaleX;
  const screenY = (event.clientY - rect.top) * scaleY;
  return {
    screenX,
    screenY,
    worldX: screenX + CAMERA.x,
    worldY: screenY + CAMERA.y,
  };
}

function updatePointerPosition(screenX, screenY, inside = true) {
  GAME_STATE.pointer.screenX = clamp(screenX, 0, CAMERA.width);
  GAME_STATE.pointer.screenY = clamp(screenY, 0, CAMERA.height);
  GAME_STATE.pointer.inside = inside;
  updateCameraOverlay();
}

function onCanvasMouseDown(event) {
  if (GAME_STATE.commandMode === 'boss') {
    GAME_STATE.commandMode = 'main';
    renderCommandPanel(true);
    return;
  }
  if (event.button !== 0) return;
  const positions = getPointerPositions(event);
  const insideView = isWithinViewArea(event.clientX, event.clientY);
  if (event.detail === 2) {
    GAME_STATE.dragSelecting = false;
    handleDoubleClickSelection(positions.worldX, positions.worldY);
    return;
  }
  if (event.detail > 2) return;
  GAME_STATE.dragSelecting = true;
  GAME_STATE.dragAdditive = event.shiftKey;
  GAME_STATE.dragToggle = event.ctrlKey || event.metaKey;
  GAME_STATE.dragStartScreen = { x: positions.screenX, y: positions.screenY };
  GAME_STATE.dragCurrentScreen = { x: positions.screenX, y: positions.screenY };
  GAME_STATE.dragStartWorld = { x: positions.worldX, y: positions.worldY };
  updatePointerPosition(positions.screenX, positions.screenY, insideView);
}

function onCanvasMouseMove(event) {
  const positions = getPointerPositions(event);
  const insideView = isWithinViewArea(event.clientX, event.clientY);
  updatePointerPosition(positions.screenX, positions.screenY, insideView);
  if (GAME_STATE.dragSelecting) {
    GAME_STATE.dragCurrentScreen = { x: positions.screenX, y: positions.screenY };
  }
}

function onCanvasMouseUp(event) {
  if (!GAME_STATE.dragSelecting) return;
  const positions = getPointerPositions(event);
  const insideView = isWithinViewArea(event.clientX, event.clientY);
  GAME_STATE.dragCurrentScreen = { x: positions.screenX, y: positions.screenY };
  GAME_STATE.dragSelecting = false;
  updatePointerPosition(positions.screenX, positions.screenY, insideView);
  applyDragSelection();
}

function onCanvasMouseEnter(event) {
  const positions = getPointerPositions(event);
  const insideView = isWithinViewArea(event.clientX, event.clientY);
  updatePointerPosition(positions.screenX, positions.screenY, insideView);
}

function onCanvasMouseLeave(event) {
  const positions = getPointerPositions(event);
  const insideView = event ? isWithinViewArea(event.clientX, event.clientY) : false;
  updatePointerPosition(positions.screenX, positions.screenY, insideView);
}

function onCanvasContextMenu(event) {
  event.preventDefault();
  if (GAME_STATE.scene !== 'game') return;
  if (GAME_STATE.selections.size === 0) return;
  const positions = getPointerPositions(event);
  const target = clampToInnerRing(positions.worldX, positions.worldY, 32);
  orderSelectedTowers(target);
}

function onGlobalContextMenu(event) {
  if (GAME_STATE.scene === 'game') {
    const appRoot = document.getElementById('app');
    if (!appRoot || appRoot.contains(event.target)) {
      event.preventDefault();
    }
  }
}

export {
  setPointerTargets,
  getPointerPositions,
  updatePointerPosition,
  onCanvasMouseDown,
  onCanvasMouseMove,
  onCanvasMouseUp,
  onCanvasMouseEnter,
  onCanvasMouseLeave,
  onCanvasContextMenu,
  onGlobalContextMenu,
};
