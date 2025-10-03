import { elements } from '../ui/elements.js';
import { setWaveStatus } from '../game/status.js';
import { DIFFICULTY_PRESETS, GAME_STATE } from '../game/globals.js';

export function applyDifficultyPreset(key) {
  const preset = DIFFICULTY_PRESETS[key] || DIFFICULTY_PRESETS.normal;
  GAME_STATE.difficulty = preset.id;
  GAME_STATE.difficultyMultiplier = preset.hpMultiplier;
  return preset;
}

export function updateDifficultyUI() {
  const current = GAME_STATE.difficulty || 'normal';
  const preset = DIFFICULTY_PRESETS[current] || DIFFICULTY_PRESETS.normal;
  if (Array.isArray(elements.difficultyButtons)) {
    elements.difficultyButtons.forEach((button) => {
      if (!button) return;
      const { difficulty } = button.dataset || {};
      button.classList.toggle('is-active', difficulty === preset.id);
    });
  }
  if (elements.difficultyLabel) {
    elements.difficultyLabel.textContent = preset.label;
  }
  if (elements.difficultySummary) {
    const hpText = Math.round(preset.hpMultiplier * 100);
    const summary = preset.summary ? ` · ${preset.summary}` : '';
    elements.difficultySummary.textContent = `적 체력 ${hpText}%${summary}`;
  }
}

export function setDifficulty(key, { silent = false } = {}) {
  const preset = applyDifficultyPreset(key);
  updateDifficultyUI();
  if (!silent) {
    const hpText = Math.round(preset.hpMultiplier * 100);
    setWaveStatus(`난이도 설정: ${preset.label} (적 체력 ${hpText}%)`, { duration: 1600 });
  }
  return preset;
}
