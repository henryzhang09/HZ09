# Changelog

## 4.0.0 — 2026-09-21

### Rendering
- Replaced uniform StandardMaterial rendering with tissue-aware PhysicalMaterial profiles.
- Added distinct visual properties for skeletal muscle, fascia, tendon, aponeurosis, retinaculum, ligament, bone, artery, vein, and myocardium.
- Added PMREM studio environment lighting.
- Added optional N8AO screen-space ambient occlusion.
- Added stable muscle/bone colour variation to separate adjacent anatomical structures.
- Added connective-tissue depth bias to reduce z-fighting where fascial sheets sit directly on muscle.
- Broad fascia now renders semitransparently rather than as an opaque cream shell.
- Added selected-structure outlines without sacrificing the underlying surface shading.

### Study workflow
- Added Natural / Ghost / Hide connective-tissue modes.
- Added Attachments and Dissection presets.
- Added Context Study to retain a translucent skeleton around an isolated muscle or connective structure.
- Preserved Smart Muscle Pick, depth-stack inspection, peel/hide, isolation, search, and standard anatomical viewpoints.

### Performance and reliability
- Added Performance / Balanced / Quality renderer profiles.
- Added device-aware initial renderer quality.
- Persisted renderer/connective preferences locally.
- Added a service worker cache for pinned anatomy assets.
- Added asset-host preconnect hints.
- Expanded automated tests to connective subtype classification, transparency/depth-bias rules, picking behavior, search ranking, and renderer profiles.
- v4 development is validated on a release branch before merging to production.

### Data integrity
- No missing anatomy is generated or inferred.
- The viewer explicitly distinguishes improvements in rendering from limitations in source-geometry coverage.

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
