import bpy
import hashlib
import json
import re
import sys
from pathlib import Path

SOURCE_SHA="23d42ff2acf149e4cc0af666b3f80af2ed19909a"

GROUPS={
    "skeletal":{
        "collection":"1: Skeletal system",
        "file":"skeletal_v5.glb",
        "system":"skeletal",
        "layer":"skeletal",
    },
    "muscular":{
        "collection":"4: Muscular system",
        "file":"muscular_v5.glb",
        "system":"muscular",
        "layer":"muscular",
    },
    "attachments":{
        "collection":"2: Muscular insertions",
        "file":"attachments_v5.glb",
        "system":"muscular",
        "layer":"attachments",
    },
    "cardiovascular":{
        "collection":"5: Cardiovascular system",
        "file":"cardiovascular_v5.glb",
        "system":"cardiovascular",
        "layer":"cardiovascular",
    },
}

# MESH is obvious, but CURVE is essential: much of the Z-Anatomy vascular
# tree is stored as bevelled curves. SURFACE is retained for the same reason:
# it can evaluate to legitimate anatomical polygons.
GEOMETRY_TYPES={"MESH","CURVE","SURFACE"}
HEADING_SUFFIX=".g"


def argv_after_dash():
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--")+1:]


def parse_args(items):
    out={}
    i=0
    while i<len(items):
        if items[i].startswith("--") and i+1<len(items):
            out[items[i][2:]]=items[i+1]
            i+=2
        else:
            i+=1
    return out


def stable_id(name):
    return "zsrc_"+hashlib.sha1(name.encode("utf-8")).hexdigest()[:16]


def side_qualifier(name):
    lower=name.lower()
    if lower.endswith(".l"):
        return "left"
    if lower.endswith(".r"):
        return "right"
    return None


def strip_suffix(name):
    # Z-Anatomy uses a final .l/.r for laterality and a few internal one-letter
    # suffixes. Only strip the final Blender-side suffix; preserve anatomy words.
    return re.sub(r"\.(?:e\d+)?[olr]$","",name,flags=re.IGNORECASE).replace("_"," ").strip()


def is_heading(name):
    # Z-Anatomy stores system/section headings as real extruded mesh geometry.
    # They are labels, not anatomy. Exporting them creates giant floating words.
    return name.lower().endswith(HEADING_SUFFIX)


def heading_name(name):
    return re.sub(r"^\d+:\s*","",name).rstrip("'")


def load_old_manifest(path):
    if not path or not Path(path).exists():
        return {},{}
    data=json.loads(Path(path).read_text(encoding="utf-8"))
    rows=data.get("organs",data if isinstance(data,list) else [])
    by_node={}
    by_source={}
    for row in rows:
        node=row.get("node")
        source=row.get("source_name")
        if node:
            by_node[node]=row
        if source:
            by_source[source]=row
    return by_node,by_source


def build_collection_index():
    # Map both exact collection names and full ancestry paths. Exact names are
    # convenient for our pinned Z-Anatomy source; paths disambiguate if a future
    # source reuses a collection name.
    parents={}
    for parent in bpy.data.collections:
        for child in parent.children:
            parents.setdefault(child.name,[]).append(parent)

    by_name={}
    by_path={}
    for collection in bpy.data.collections:
        by_name.setdefault(collection.name,[]).append(collection)
        parts=[collection.name]
        current=collection
        seen=set()
        while current.name in parents and len(parents[current.name])==1:
            parent=parents[current.name][0]
            if parent.name in seen:
                break
            seen.add(parent.name)
            parts.append(parent.name)
            current=parent
        by_path["/".join(reversed(parts))]=collection
    return by_name,by_path


def resolve_collection(name,by_name,by_path):
    if name in by_path:
        return by_path[name]
    matches=by_name.get(name,[])
    if len(matches)==1:
        return matches[0]
    if not matches:
        raise SystemExit("Collection not found: "+repr(name))
    raise SystemExit("Collection name is ambiguous: "+repr(name))


def gather_geometry(collection):
    # Most-specific anatomical collection path wins when an object is linked to
    # multiple nested collections.
    best={}

    def walk(node,trail):
        for obj in node.objects:
            if obj.type not in GEOMETRY_TYPES or is_heading(obj.name):
                continue
            claimed=best.get(obj.name)
            if claimed is None or len(trail)>len(claimed[1]):
                best[obj.name]=(obj,list(trail))
        for child in node.children:
            walk(child,[*trail,child.name])

    walk(collection,[])
    root=heading_name(collection.name)
    return {obj:(trail or [root]) for obj,trail in best.values()}


def ensure_gltf_addon():
    try:
        import addon_utils
        enabled,loaded=addon_utils.check("io_scene_gltf2")
        if not(enabled and loaded):
            addon_utils.enable("io_scene_gltf2",default_set=True,persistent=True)
    except Exception as exc:
        print("WARNING glTF addon enable check:",exc)

    if not hasattr(bpy.ops.export_scene,"gltf"):
        raise SystemExit("Blender glTF exporter is unavailable.")


def evaluate_to_clean_scene(source_map):
    # Bake modifiers/curves into ordinary meshes in a fresh staging scene.
    # This keeps annotation/helper state, drivers, source materials and Blender
    # scene baggage out of the browser assets.
    depsgraph=bpy.context.evaluated_depsgraph_get()
    scene=bpy.data.scenes.new("hz09_v5_export")
    exported=[]
    skipped=[]
    renamed_sources=[]

    for source_name,(obj,trail) in source_map.items():
        try:
            evaluated=obj.evaluated_get(depsgraph)
            mesh=bpy.data.meshes.new_from_object(evaluated)
        except Exception as exc:
            skipped.append({"name":source_name,"reason":"evaluation-error","error":str(exc)})
            continue

        if mesh is None or len(mesh.polygons)==0:
            skipped.append({"name":source_name,"reason":"no-evaluated-polygons"})
            if mesh is not None:
                bpy.data.meshes.remove(mesh)
            continue

        mesh.materials.clear()

        # Free the exact source name before creating the staging copy. glTF node
        # names are later joined to metadata; Blender's automatic ".001" suffix
        # would break that relation.
        original=obj.name
        placeholder="#hzsrc"+str(len(renamed_sources))
        obj.name=placeholder
        renamed_sources.append((obj,original))

        copy=bpy.data.objects.new(original,mesh)
        copy.matrix_world=obj.matrix_world.copy()
        scene.collection.objects.link(copy)

        if copy.name!=original:
            raise SystemExit("Node name collision: wanted %r, got %r"%(original,copy.name))

        exported.append({
            "name":original,
            "path":trail,
            "polygons":len(mesh.polygons),
            "vertices":len(mesh.vertices),
            "source_type":obj.type,
        })

    return scene,exported,skipped,renamed_sources


def cleanup_staging_scene(scene,renamed_sources):
    # Remove staging objects/meshes first, then restore source names.
    for obj in list(scene.objects):
        data=obj.data
        bpy.data.objects.remove(obj,do_unlink=True)
        if data and getattr(data,"users",0)==0:
            try:
                bpy.data.meshes.remove(data)
            except Exception:
                pass
    bpy.data.scenes.remove(scene)
    for obj,original in renamed_sources:
        obj.name=original


def export_group(source_map,target):
    ensure_gltf_addon()
    scene,exported,skipped,renamed_sources=evaluate_to_clean_scene(source_map)
    if not exported:
        cleanup_staging_scene(scene,renamed_sources)
        raise SystemExit("No evaluated geometry found for "+str(target))

    previous_scene=bpy.context.window.scene
    bpy.context.window.scene=scene
    try:
        bpy.ops.export_scene.gltf(
            filepath=str(target),
            export_format="GLB",
            use_selection=False,
            use_active_scene=True,
            export_apply=False,
            export_yup=True,
            export_materials="NONE",
            export_normals=True,
            export_texcoords=False,
            export_cameras=False,
            export_lights=False,
            export_extras=False,
            export_animations=False,
        )
    finally:
        bpy.context.window.scene=previous_scene
        cleanup_staging_scene(scene,renamed_sources)

    return exported,skipped


def row_for(entry,meta,group):
    name=entry["name"]
    old=meta or {}
    qualifier=old.get("qualifier")
    if not qualifier:
        qualifier=side_qualifier(name)
    return {
        "organ_id":old.get("organ_id") or stable_id(name),
        "name_en":old.get("name_en") or strip_suffix(name),
        "ta2_latin":old.get("ta2_latin") or "",
        "qualifier":qualifier,
        "node":name,
        "source_name":name,
        "system":group["system"],
        "layer":group["layer"],
        "mesh_file":group["file"],
        "path":old.get("path") or entry["path"],
        "source_collections":entry["path"],
        "source_type":entry["source_type"],
        "polygons":entry["polygons"],
        "metadata_status":"matched-anatria" if old else "source-name-only",
    }


args=parse_args(argv_after_dash())
out_dir=Path(args["out-dir"])
manifest_path=Path(args["manifest"])
old_manifest=args.get("old-manifest")
out_dir.mkdir(parents=True,exist_ok=True)
manifest_path.parent.mkdir(parents=True,exist_ok=True)

by_node,by_source=load_old_manifest(old_manifest)
by_name,by_path=build_collection_index()
rows=[]
stats={}
all_skipped={}

for key,group in GROUPS.items():
    collection=resolve_collection(group["collection"],by_name,by_path)
    source_map=gather_geometry(collection)
    target=out_dir/group["file"]

    exported,skipped=export_group(source_map,target)
    all_skipped[key]=skipped

    for entry in exported:
        old=by_node.get(entry["name"]) or by_source.get(entry["name"])
        rows.append(row_for(entry,old,group))

    stats[key]={
        "source_candidates":len(source_map),
        "objects":len(exported),
        "skipped":len(skipped),
        "bytes":target.stat().st_size,
        "polygons":sum(e["polygons"] for e in exported),
        "curves_baked":sum(1 for e in exported if e["source_type"]=="CURVE"),
        "surfaces_baked":sum(1 for e in exported if e["source_type"]=="SURFACE"),
    }
    print(
        "EXPORTED",key,
        "candidates",len(source_map),
        "objects",len(exported),
        "curves",stats[key]["curves_baked"],
        "skipped",len(skipped),
        "bytes",target.stat().st_size
    )

manifest={
    "schema_version":"5.1",
    "source":{
        "project":"Z-Anatomy/Models-of-human-anatomy",
        "commit":SOURCE_SHA,
        "derivation":"HZ09 v5 conservative topology repair + evaluated clean-scene GLB export",
        "geometry_generated_by_ai":False,
        "heading_meshes_excluded":True,
        "curve_geometry_baked":True,
    },
    "stats":stats,
    "skipped":all_skipped,
    "organs":rows,
}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")

print("MANIFEST_ROWS",len(rows))
print("METADATA_MATCHED",sum(1 for r in rows if r["metadata_status"]=="matched-anatria"))
print("METADATA_SOURCE_ONLY",sum(1 for r in rows if r["metadata_status"]=="source-name-only"))
print("HEADING_ROWS",sum(1 for r in rows if r["source_name"].lower().endswith(".g")))
