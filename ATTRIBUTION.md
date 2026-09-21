# Anatomy data attribution

## Male atlas used by this site

The male anatomy assets loaded by HZ09 Anatomy Atlas 3D are sourced from the open Anatria3D anatomy asset set, pinned to upstream commit:

`949ac80cc9763539afc48e60b5246132f00468db`

Attribution chain:

1. **BodyParts3D** — Database Center for Life Science (DBCLS), Japan. Original material licensed under Creative Commons Attribution-ShareAlike 2.1 Japan.
2. **Z-Anatomy** — libre 3D atlas derived from BodyParts3D. Licensed under Creative Commons Attribution-ShareAlike 4.0 International.
3. **Anatria3D adaptations** — GLB exports of the Z-Anatomy meshes with Blender modifiers baked, Draco quantisation/compression, viewer materials removed, stable structure identifiers added, and anatomical hierarchy exported from the Z-Anatomy collection structure.

The male `*_male.glb` files and `manifest.json` are licensed under **CC BY-SA 4.0**.

Upstream documentation states that the GLB export uses Draco quantisation but does **not** apply polygon reduction beyond that quantisation step.

## Nomenclature

The manifest carries professional nomenclature based on Terminologia Anatomica 2, with Latin and clinical English labels. The upstream asset pipeline documents corrections to known errors in the source TA2 table.

HZ09 Anatomy Atlas 3D does not claim machine-translated local-language anatomy labels as authoritative.

## Application scope

The anatomy assets are open educational/research data. The web viewer is not a diagnostic or surgical-planning product.
