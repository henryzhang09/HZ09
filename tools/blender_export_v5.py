import bpy, json, hashlib, re, sys
from pathlib import Path

SOURCE_SHA="23d42ff2acf149e4cc0af666b3f80af2ed19909a"

GROUPS={
    "skeletal":{"collection":"1: Skeletal system","file":"skeletal_v5.glb","system":"skeletal","layer":"skeletal"},
    "muscular":{"collection":"4: Muscular system","file":"muscular_v5.glb","system":"muscular","layer":"muscular"},
    "attachments":{"collection":"2: Muscular insertions","file":"attachments_v5.glb","system":"muscular","layer":"attachments"},
    "cardiovascular":{"collection":"5: Cardiovascular system","file":"cardiovascular_v5.glb","system":"cardiovascular","layer":"cardiovascular"}
}

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

def strip_suffix(name):
    # Keep medically meaningful words; remove Blender-side side/export suffixes.
    return re.sub(r"\.(?:e\\d+)?[olr]+$","",name).replace("_"," ").strip()

def load_old_manifest(path):
    if not path or not Path(path).exists():
        return {},{}
    data=json.loads(Path(path).read_text(encoding="utf-8"))
    rows=data.get("organs",data if isinstance(data,list) else [])
    by_node={}
    by_source={}
    for row in rows:
        node=row.get("node")
        if node:
            by_node[node]=row
        source=row.get("source_name")
        if source:
            by_source[source]=row
    return by_node,by_source

def row_for(obj,meta,group):
    old=meta or {}
    collections=sorted({c.name for c in obj.users_collection})
    return {
        "organ_id":old.get("organ_id") or stable_id(obj.name),
        "name_en":old.get("name_en") or strip_suffix(obj.name),
        "ta2_latin":old.get("ta2_latin") or "",
        "qualifier":old.get("qualifier"),
        "node":obj.name,
        "source_name":obj.name,
        "system":group["system"],
        "layer":group["layer"],
        "mesh_file":group["file"],
        "path":old.get("path") or collections,
        "source_collections":collections,
        "metadata_status":"matched-anatria" if old else "source-name-only"
    }

def objects_for_collection(collection_name):
    return [o for o in bpy.data.objects if o.type=="MESH" and any(c.name==collection_name for c in o.users_collection)]

def prepare_for_export(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.hide_set(False)
        o.hide_viewport=False
        o.hide_render=False
        o.select_set(True)
        # Viewer owns materials. Removing source slots prevents unnecessary
        # embedded material data without touching geometry/modifiers.
        try:
            o.data.materials.clear()
        except Exception:
            pass

def export_glb(objects,path):
    prepare_for_export(objects)
    bpy.context.view_layer.objects.active=objects[0] if objects else None
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="NONE"
    )

args=parse_args(argv_after_dash())
out_dir=Path(args["out-dir"])
manifest_path=Path(args["manifest"])
old_manifest=args.get("old-manifest")
out_dir.mkdir(parents=True,exist_ok=True)
manifest_path.parent.mkdir(parents=True,exist_ok=True)

by_node,by_source=load_old_manifest(old_manifest)
rows=[]
stats={}

for key,group in GROUPS.items():
    objects=objects_for_collection(group["collection"])
    stats[key]={"objects":len(objects)}
    if not objects:
        print("WARNING no objects for",group["collection"])
        continue

    for obj in objects:
        old=by_node.get(obj.name) or by_source.get(obj.name)
        rows.append(row_for(obj,old,group))

    target=out_dir/group["file"]
    export_glb(objects,target)
    stats[key]["bytes"]=target.stat().st_size
    print("EXPORTED",key,len(objects),target,target.stat().st_size)

manifest={
    "schema_version":"5.0",
    "source":{
        "project":"Z-Anatomy/Models-of-human-anatomy",
        "commit":SOURCE_SHA,
        "derivation":"HZ09 v5 conservative topology repair + Blender GLB export",
        "geometry_generated_by_ai":False
    },
    "stats":stats,
    "organs":rows
}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
print("MANIFEST_ROWS",len(rows))
print("METADATA_MATCHED",sum(1 for r in rows if r["metadata_status"]=="matched-anatria"))
print("METADATA_SOURCE_ONLY",sum(1 for r in rows if r["metadata_status"]=="source-name-only"))
