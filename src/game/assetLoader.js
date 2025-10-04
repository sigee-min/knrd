import { getAllShipSpriteAssets, primeShipSpriteAsset } from './shipSprites.js';
import { getAllEnemySpriteAssets, primeEnemySpriteAsset } from './enemySprites.js';
import { getAllBossSpriteAssets, primeBossSpriteAsset } from './bossSprites.js';
import { getAllProjectileSpriteAssets, primeProjectileSpriteAsset } from './projectileStyles.js';
import { preloadAudioAssets } from './audio.js';

function loadImageAsset(asset, primeFn, assetType, notify) {
  if (!asset || typeof Image === 'undefined') {
    const result = { asset, assetType, status: 'skipped' };
    notify?.(result);
    return Promise.resolve(result);
  }
  const img = primeFn(asset);
  if (!img) {
    const result = { asset, assetType, status: 'skipped' };
    notify?.(result);
    return Promise.resolve(result);
  }
  if (img.complete && img.naturalWidth > 0) {
    const result = { asset, assetType, status: 'cached' };
    notify?.(result);
    return Promise.resolve(result);
  }
  return new Promise((resolve) => {
    let resolved = false;
    const cleanup = () => {
      img.removeEventListener('load', onLoad);
      img.removeEventListener('error', onError);
    };
    const onLoad = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      const result = { asset, assetType, status: 'loaded' };
      notify?.(result);
      resolve(result);
    };
    const onError = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      const result = { asset, assetType, status: 'error' };
      notify?.(result);
      resolve(result);
    };
    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
    // If the image finished between prime and listener attachment, check once more.
    if (img.complete && img.naturalWidth > 0 && !resolved) {
      onLoad();
    }
  });
}

function preloadImageGroup(assets, primeFn, assetType, notify) {
  if (!Array.isArray(assets) || assets.length === 0) return [];
  const unique = Array.from(new Set(assets.filter(Boolean)));
  return unique.map((asset) => loadImageAsset(asset, primeFn, assetType, notify));
}

async function preloadImageAssets(notify) {
  const shipPromises = preloadImageGroup(getAllShipSpriteAssets(), primeShipSpriteAsset, 'ship', notify);
  const enemyPromises = preloadImageGroup(getAllEnemySpriteAssets(), primeEnemySpriteAsset, 'enemy', notify);
  const bossPromises = preloadImageGroup(getAllBossSpriteAssets(), primeBossSpriteAsset, 'boss', notify);
  const projectilePromises = preloadImageGroup(getAllProjectileSpriteAssets(), primeProjectileSpriteAsset, 'projectile', notify);
  const results = await Promise.all([
    ...shipPromises,
    ...enemyPromises,
    ...bossPromises,
    ...projectilePromises,
  ]);
  return results;
}

async function preloadAudio(notify) {
  const results = await preloadAudioAssets();
  if (Array.isArray(results)) {
    results.forEach((result) => {
      notify?.({ ...result, type: 'audio' });
    });
  }
  return results;
}

async function preloadCoreAssets(options = {}) {
  const { onProgress } = options;
  const imageResultsPromise = preloadImageAssets((result) => {
    if (typeof onProgress === 'function') {
      onProgress({ type: 'image', ...result });
    }
  });
  const audioResultsPromise = preloadAudio((result) => {
    if (typeof onProgress === 'function') {
      onProgress(result);
    }
  });
  const [imageResults, audioResults] = await Promise.all([imageResultsPromise, audioResultsPromise]);
  return { images: imageResults, audio: audioResults };
}

export { preloadCoreAssets };
