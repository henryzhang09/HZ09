# HZ09 Anatomy Atlas 3D

Interactive 3D anatomy viewer focused on skeletal, muscular, connective-tissue, and cardiovascular anatomy.

## Current release

**v4.0.0**

The viewer is designed around professional anatomical nomenclature and high-detail open geometry rather than AI-generated anatomy.

### v4 rendering

- Tissue-aware physical materials for muscle, bone, fascia, tendon, aponeurosis, ligaments, arteries, veins, and myocardium
- Environment reflections through a PMREM studio environment
- Screen-space ambient occlusion in Balanced / Quality modes
- Stable per-structure colour variation to keep adjacent muscle bellies readable
- Connective-tissue transparency by subtype rather than treating every muscular-system mesh as opaque red
- Polygon depth bias for fascia/tendon sheets that sit almost coplanar with muscle, reducing z-fighting and blotchy fascia/muscle boundaries
- Selected-structure outlines that preserve surface shading instead of flattening the selected anatomy with emissive colour

### Anatomy study modes

- **Combined** — bone, muscle, vessels
- **Muscle Study** — full muscle with subdued bone
- **Attachments** — muscle plus stronger skeletal context and natural connective tissue
- **Dissection** — hides connective sheets to expose muscle bellies
- **Angiography** — vessels solid with skeletal/muscular ghost context
- **Skeleton** — bone only

Connective tissue can be shown as **Natural / Ghost / Hide**. Natural mode keeps broad fascia translucent while tendons and ligaments remain substantially more opaque.

### Interaction

- Single click: identify a structure
- Double click: isolate a structure
- Right click: peel/hide the selected surface structure
- Smart muscle pick: resolves superficial fascia to the underlying muscle belly when appropriate
- Context Study: selected structure plus skeletal reference for attachment orientation
- Depth stack: exposes multiple structures intersected by the same viewing ray
- Search: clinical English, Terminologia Anatomica 2 Latin, hierarchy, and anatomy IDs
- Standard anatomical camera views: anterior, posterior, left, right, superior
- Independent artery / vein / heart visibility
- PNG viewport export and fullscreen mode
- Responsive layer and inspector drawers for smaller screens

### Performance

- Performance / Balanced / Quality renderer profiles
- Initial quality adapts to coarse-pointer / lower-memory / narrow-screen devices
- Render-quality and connective-view preferences persist locally
- Pinned GLB anatomy assets are cached by a service worker after the first successful load
- Anatomy asset host is preconnected during page startup

### Quality gates

Pre-release branches and production deployments run:
1. anatomy and rendering unit tests
2. Vite production build
3. GitHub Pages deployment only after the production branch passes

## Anatomy data

The male atlas used by this site contains **3,478 structures** across the full source atlas. This application currently renders the skeletal, muscular, and cardiovascular system assets.

The male mesh assets and manifest are adapted from Z-Anatomy / BodyParts3D via the open Anatria3D asset pipeline. See [ATTRIBUTION.md](ATTRIBUTION.md).

Professional labels are retained as **Terminologia Anatomica 2 Latin + clinical English**. The site does not present machine-translated Chinese anatomical terminology as authoritative.

## Accuracy boundary

Rendering can improve the visual relationship between existing structures, but it cannot honestly create anatomy absent from the source geometry. v4 therefore does **not** synthesize missing fascial, tendinous, neurovascular, or attachment geometry. Source-coverage limitations are documented instead of being visually invented.

This is a research and teaching visualization interface. It is **not a medical device** and is not intended for diagnosis, radiology segmentation, surgical navigation, or patient-specific clinical decisions.

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

The GitHub Pages build uses the project base path `/HZ09/`.
