import { elements } from '../ui/elements.js';
import { SETTINGS } from '../game/globals.js';
import { setBgmVolume } from '../game/youtubePlayer.js';
import { setSfxVolumePercent } from '../game/audio.js';
import { applyCameraSettings as applyCameraSettingsInternal } from './cameraController.js';

function updateSettingLabels() {
  if (elements.settingSensitivity && elements.settingSensitivityValue) {
    elements.settingSensitivityValue.textContent = Number(elements.settingSensitivity.value).toFixed(1);
  }
  if (elements.settingPanSpeed && elements.settingPanSpeedValue) {
    elements.settingPanSpeedValue.textContent = Number(elements.settingPanSpeed.value).toFixed(1);
  }
  if (elements.settingBgmVolume && elements.settingBgmVolumeValue) {
    elements.settingBgmVolumeValue.textContent = `${Math.round(Number(elements.settingBgmVolume.value) || 0)}`;
  }
  if (elements.settingSfxVolume && elements.settingSfxVolumeValue) {
    elements.settingSfxVolumeValue.textContent = `${Math.round(Number(elements.settingSfxVolume.value) || 0)}`;
  }
}

function syncSettingsUI() {
  if (elements.settingAutoFullscreen) {
    elements.settingAutoFullscreen.checked = SETTINGS.autoFullscreen;
  }
  if (elements.settingSensitivity) {
    elements.settingSensitivity.value = SETTINGS.pointerSensitivity.toFixed(1);
  }
  if (elements.settingPanSpeed) {
    elements.settingPanSpeed.value = SETTINGS.panSpeedMultiplier.toFixed(1);
  }
  if (elements.settingBgmVolume) {
    elements.settingBgmVolume.value = `${Math.round(SETTINGS.bgmVolume)}`;
  }
  if (elements.settingSfxVolume) {
    elements.settingSfxVolume.value = `${Math.round(SETTINGS.sfxVolume)}`;
  }
  updateSettingLabels();
}

function applySettingsFromUI({ onAutoFullscreenChange } = {}) {
  const prevAutoFullscreen = SETTINGS.autoFullscreen;
  if (elements.settingAutoFullscreen) {
    SETTINGS.autoFullscreen = !!elements.settingAutoFullscreen.checked;
  }
  if (elements.settingSensitivity) {
    SETTINGS.pointerSensitivity = parseFloat(elements.settingSensitivity.value) || SETTINGS.pointerSensitivity;
  }
  if (elements.settingPanSpeed) {
    SETTINGS.panSpeedMultiplier = parseFloat(elements.settingPanSpeed.value) || SETTINGS.panSpeedMultiplier;
  }
  if (elements.settingBgmVolume) {
    const v = Math.max(0, Math.min(100, Math.round(Number(elements.settingBgmVolume.value) || SETTINGS.bgmVolume)));
    SETTINGS.bgmVolume = v;
    setBgmVolume(v);
  }
  if (elements.settingSfxVolume) {
    const v = Math.max(0, Math.min(100, Math.round(Number(elements.settingSfxVolume.value) || SETTINGS.sfxVolume)));
    SETTINGS.sfxVolume = v;
    setSfxVolumePercent(v);
  }
  applyCameraSettingsInternal();
  if (SETTINGS.autoFullscreen !== prevAutoFullscreen) {
    onAutoFullscreenChange?.(SETTINGS.autoFullscreen);
  }
}

export { updateSettingLabels, syncSettingsUI, applySettingsFromUI };
