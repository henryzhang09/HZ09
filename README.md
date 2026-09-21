# HZ09 Anatomy Atlas 3D

Interactive 3D anatomy viewer focused on skeletal, muscular, and cardiovascular anatomy.

## Current release

**v3.0.0**

The viewer is designed around professional anatomical nomenclature and high-detail open geometry rather than AI-generated anatomy.

### Interaction

- Single click: identify a structure
- Double click: isolate a structure
- Right click: peel/hide the selected surface structure
- Smart muscle pick: passes through superficial fascia/tendon to the underlying muscle belly when appropriate
- Depth stack: exposes multiple structures intersected by the same viewing ray
- Search: clinical English, Terminologia Anatomica 2 Latin, hierarchy, and anatomy IDs
- Standard anatomical camera views: anterior, posterior, left, right, superior
- Layer opacity and dedicated skeletal / muscular / vascular presets
- Independent artery / vein / heart visibility
- Independent fascia / tendon visibility
- PNG viewport export and fullscreen mode
- Responsive layer and inspector drawers for smaller screens

### Quality gates

GitHub Pages deployment runs:
1. anatomy interaction unit tests
2. Vite production build
3. Pages artifact deployment

## Anatomy data

The male atlas used by this site contains **3,478 structures** across the full source atlas. This application currently renders the skeletal, muscular, and cardiovascular system assets.

The male mesh assets and manifest are adapted from Z-Anatomy / BodyParts3D via the open Anatria3D asset pipeline. See [ATTRIBUTION.md](ATTRIBUTION.md).

Professional labels are retained as **Terminologia Anatomica 2 Latin + clinical English**. The site does not present machine-translated Chinese anatomical terminology as authoritative.

## Scope

This is a research and teaching visualization interface. It is **not a medical device** and is not intended for diagnosis, radiology segmentation, surgical navigation, or patient-specific clinical decisions.

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

The GitHub Pages build uses the project base path `/HZ09/`.
