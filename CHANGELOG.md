# Changelog

## 3.0.0 — 2026-09-21

### Interaction
- Added smart muscle selection through superficial fascia/tendon.
- Added depth-stack inspection for overlapping structures.
- Added single-click identification, double-click isolation, and right-click peel/hide.
- Added hover labels with clinical English and TA2 Latin.
- Added undo/restore for peeled structures.
- Added standard anatomical camera views and fit-to-model.
- Added keyboard controls for focus, isolate, peel, and anatomical views.

### Anatomy layers
- Added independent fascia/tendon visibility within the muscular system.
- Added artery, vein, and heart subfilters.
- Added dedicated Combined, Muscle Study, Angiography, and Skeleton presets.
- Retained per-system opacity controls.

### Viewer
- Added PNG export and fullscreen mode.
- Added responsive layer/inspector drawers instead of hiding controls on narrow viewports.
- Improved tissue-specific rendering and selection presentation.
- Added load progress and render error handling.

### Quality
- Added pure-function tests for structure classification, ray depth order, smart muscle picking, ghost-layer picking, and search ranking.
- GitHub Pages deployment now requires tests and a successful production build.
- Pinned the upstream anatomy asset revision and documented provenance/licensing.

## 2.0.0 — 2026-09-21

- Replaced the initial lightweight browser atlas with higher-detail Z-Anatomy-derived skeletal, muscular, and cardiovascular GLB assets.
- Added per-structure professional nomenclature and layer controls.

## 1.0.0 — 2026-09-21

- Initial interactive prototype.
