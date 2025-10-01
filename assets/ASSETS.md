# Assets Directory Guide

This folder holds all game visuals. All image assets are SVG and organized under a single root `assets/svg` with subfolders by purpose. Keep new assets in this structure and update `assets/manifest.json` accordingly.

## Structure
- svg/
  - ui/ — UI frames and command card icons
  - icons/ — small HUD icons
  - cursors/ — pointer graphics
  - overlays/ — selection rings, HP bars, range helpers
  - units/ — player unit silhouettes by rarity
  - enemies/ — enemy silhouettes
  - bosses/ — boss silhouettes

## Naming & Sizing
- Snake case names, category prefixes where helpful (e.g., `cmd_*`, `icon_*`).
- Typical sizes (viewBox):
  - UI buttons: 72×72
  - Cursors: 24×24
  - HUD icons: 24×24
  - Units/Enemies: 64×32, Bosses: 96×48
  - Minimap frame: 140×140
  - Overlays: scalable shapes without absolute sizes

## Palette (recommended)
- UI base: `#0f1115`, `#1a1f2b`, lines `#2a3242`, focus `#37a0f2`
- Rarity colors: Common `#8aa0b8`, Rare `#5aa1e3`, Unique `#9b59b6`, Legendary `#f39c12`, Mythic `#e74c3c`, Primordial `#2ecc71`
- Enemies: `#c85f85`, Boss: `#d35400`

## Export Guidelines
- Inline paths only (no external CSS). Keep minimal metadata.
- Use strokes/fills aligned to palette for consistency.
- Maintain consistent corner radii and line weights with existing assets.

## Updating the Manifest
When adding or renaming assets, reflect changes in `assets/manifest.json` so the game can reference assets by key rather than path.
