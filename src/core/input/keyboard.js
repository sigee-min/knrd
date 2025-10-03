import { GAME_STATE } from '../../game/globals.js';

let toggleFullscreenFn = () => Promise.resolve();
let resizeCallback = () => {};
let handleCameraKeyFn = () => false;
let onCommandKeyDownFn = () => false;
let onCommandKeyUpFn = () => {};

function configureKeyboardHandlers({
  toggleFullscreen,
  onResize,
  onCameraKey,
  onCommandKeyDown,
  onCommandKeyUp,
}) {
  toggleFullscreenFn = toggleFullscreen || (() => Promise.resolve());
  resizeCallback = typeof onResize === 'function' ? onResize : () => {};
  handleCameraKeyFn = typeof onCameraKey === 'function' ? onCameraKey : () => false;
  onCommandKeyDownFn = typeof onCommandKeyDown === 'function' ? onCommandKeyDown : () => false;
  onCommandKeyUpFn = typeof onCommandKeyUp === 'function' ? onCommandKeyUp : () => {};
}

function onKeyDown(event) {
  if ((event.code === 'Enter' && event.altKey) || event.code === 'F11') {
    event.preventDefault();
    void toggleFullscreenFn().then(() => resizeCallback());
    return;
  }
  if (GAME_STATE.scene === 'game' && handleCameraKeyFn(event.code, true)) {
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
      return;
    }
  }
  if (GAME_STATE.scene !== 'game' && event.code.startsWith('Arrow')) {
    event.preventDefault();
  }
  if (onCommandKeyDownFn(event)) {
    event.preventDefault();
  }
}

function onKeyUp(event) {
  if (event.code === 'F11') {
    event.preventDefault();
    return;
  }
  if (GAME_STATE.scene === 'game' && handleCameraKeyFn(event.code, false)) {
    if (event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
  }
  if (GAME_STATE.scene !== 'game' && event.code.startsWith('Arrow')) {
    event.preventDefault();
  }
  onCommandKeyUpFn(event);
}

export { configureKeyboardHandlers, onKeyDown, onKeyUp };
