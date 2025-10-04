import { elements } from '../../ui/elements.js';
import { playSound } from '../../game/audio.js';

function wireOverlayButtons({ setScene, closeSettings, setDifficulty, updateDifficultyUI, hideGameOverOverlay, setWaveStatus, continueInfiniteMode }) {
  elements.playButton?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    elements.difficultyOverlay?.classList.remove('hidden');
    updateDifficultyUI();
  });
  elements.settingsButton?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    setScene('settings');
  });
  elements.exitButton?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    setWaveStatus('브라우저 탭을 닫으면 게임이 종료됩니다.', { duration: 2800 });
  });
  elements.settingsBackButton?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    closeSettings(true);
  });
  elements.settingsToLobbyButton?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    closeSettings(true, 'lobby');
  });
  elements.difficultyBackButton?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    elements.difficultyOverlay?.classList.add('hidden');
  });
  if (Array.isArray(elements.difficultyButtons)) {
    elements.difficultyButtons.forEach((button) => {
      button.addEventListener('click', () => {
        playSound('ui_click', { volume: 0.6, throttleMs: 80 });
        const { difficulty } = button.dataset || {};
        if (!difficulty) return;
        setDifficulty(difficulty, { silent: true });
        const fromPicker = !!(elements.difficultyOverlay && !elements.difficultyOverlay.classList.contains('hidden'));
        if (fromPicker) {
          elements.difficultyOverlay.classList.add('hidden');
          setScene('game', { reset: true });
        } else {
          updateDifficultyUI();
        }
      });
    });
  }
  elements.gameOverRetry?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    hideGameOverOverlay();
    setScene('game', { reset: true });
  });
  elements.gameOverLobby?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    hideGameOverOverlay();
    setScene('lobby');
  });
  elements.gameOverContinue?.addEventListener('click', () => {
    playSound('ui_click', { volume: 0.6, throttleMs: 80 });
    hideGameOverOverlay();
    continueInfiniteMode?.();
  });
}

function wireMusicControls({ onToggle, onNext }) {
  elements.youtubeBtnPlay?.addEventListener('click', onToggle);
  elements.youtubeBtnNext?.addEventListener('click', onNext);
}

function wireSettingInputs({ updateSettingLabels, applySettingsFromUI }) {
  elements.settingSensitivity?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });
  elements.settingPanSpeed?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });
  elements.settingBgmVolume?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });
  elements.settingSfxVolume?.addEventListener('input', () => {
    updateSettingLabels();
    applySettingsFromUI();
  });

  const tabs = elements.settingsTabs || [];
  const sections = elements.settingsSections || [];
  if (tabs.length === 0 || sections.length === 0) return;

  const activateTab = (targetId) => {
    if (!targetId) return;
    tabs.forEach((tab) => {
      const isActive = tab.dataset.tab === targetId;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      tab.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    sections.forEach((section) => {
      const match = section.dataset.category === targetId;
      section.classList.toggle('hidden', !match);
      section.setAttribute('aria-hidden', match ? 'false' : 'true');
    });
  };

  const defaultTab = tabs.find((tab) => tab.classList.contains('active'))?.dataset.tab
    || tabs[0]?.dataset.tab;
  if (defaultTab) {
    activateTab(defaultTab);
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const { tab: tabId } = tab.dataset || {};
      if (!tabId) return;
      playSound('ui_click', { volume: 0.6, throttleMs: 80 });
      activateTab(tabId);
    });
  });
}

export { wireOverlayButtons, wireMusicControls, wireSettingInputs };
