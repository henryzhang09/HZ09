import bpy, bmesh, json, sys
from pathlib import Path
from mathutils import Vector

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

def load_regions(path):
    with open(path,"r",encoding="utf-8") as f:
        return json.load(f)

def blob(obj):
    return " ".join([obj.name]+[c.name for c in obj.users_collection]).lower()

def region_hits(obj,regions):
    t=blob(obj)
    return [region for region,terms in regions.items() if any(term.lower() in t for term in terms)]

def bbox_diag_from_bmesh(bm):
    if not bm.verts:
        return 0.0
    xs=[v.co.x for v in bm.verts]
    ys=[v.co.y for v in bm.verts]
    zs=[v.co.z for v in bm.verts]
    return Vector((max(xs)-min(xs),max(ys)-min(ys),max(zs)-min(zs))).length

def boundary_loops(bm):
    boundary=[e for e in bm.edges if e.is_boundary]
    remaining=set(boundary)
    loops=[]
    while remaining:
        start=remaining.pop()
        loop=[start]
        current_v=start.verts[1]
        guard=0
        while guard<10000:
            guard+=1
            candidates=[e for e in current_v.link_edges if e in remaining and e.is_boundary]
            if not candidates:
                break
            nxt=candidates[0]
            remaining.remove(nxt)
            loop.append(nxt)
            current_v=nxt.other_vert(current_v)
            if current_v in start.verts:
                break
        loops.append(loop)
    return loops

def metrics(bm,diag):
    eps=(diag*diag)*1e-12
    return {
        "vertices":len(bm.verts),
        "edges":len(bm.edges),
        "faces":len(bm.faces),
        "loose_vertices":sum(1 for v in bm.verts if not v.link_edges),
        "boundary_edges":sum(1 for e in bm.edges if e.is_boundary),
        "non_manifold_edges":sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary),
        "degenerate_faces":sum(1 for f in bm.faces if f.calc_area()<=eps),
    }

def conservative_repair(obj):
    mesh=obj.data
    bm=bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    diag=max(bbox_diag_from_bmesh(bm),1e-12)
    merge_dist=max(diag*1e-7,1e-10)
    degenerate_dist=max(diag*1e-10,1e-12)
    before=metrics(bm,diag)

    changes={
        "merged_vertices":0,
        "deleted_loose_vertices":0,
        "filled_small_holes":0,
        "recalculated_normals":False,
        "dissolved_degenerate":True
    }

    # 1) Merge only nearly coincident vertices inside the SAME anatomical object.
    pre_v=len(bm.verts)
    try:
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=merge_dist)
    except Exception:
        pass
    bm.verts.ensure_lookup_table()
    changes["merged_vertices"]=max(0,pre_v-len(bm.verts))

    # 2) Remove zero-length/near-zero degeneracy without remeshing.
    try:
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=degenerate_dist)
    except Exception:
        changes["dissolved_degenerate"]=False

    # 3) Remove isolated vertices only. Never delete connected components.
    loose=[v for v in bm.verts if not v.link_edges]
    changes["deleted_loose_vertices"]=len(loose)
    if loose:
        bmesh.ops.delete(bm,geom=loose,context="VERTS")

    bm.normal_update()

    # 4) Fill only tiny boundary loops:
    #    <= 6 edges AND perimeter <= 0.3% of the object's bounding-box diagonal.
    #    This is intentionally conservative; large anatomical openings are retained.
    loops=boundary_loops(bm)
    for loop in loops:
        perimeter=sum((e.verts[0].co-e.verts[1].co).length for e in loop)
        if len(loop)<=6 and perimeter<=diag*0.003:
            try:
                result=bmesh.ops.holes_fill(bm,edges=loop,sides=6)
                if result.get("faces"):
                    changes["filled_small_holes"]+=1
            except Exception:
                pass

    # 5) Recalculate face normals only after topological edits.
    try:
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        changes["recalculated_normals"]=True
    except Exception:
        pass

    bm.normal_update()
    after=metrics(bm,diag)
    bm.to_mesh(mesh)
    mesh.update()
    bm.free()

    return before,after,changes

args=parse_args(argv_after_dash())
regions=load_regions(args["regions"])
output_blend=Path(args["output"])
report_path=Path(args["report"])
output_blend.parent.mkdir(parents=True,exist_ok=True)
report_path.parent.mkdir(parents=True,exist_ok=True)

rows=[]
for obj in [o for o in bpy.data.objects if o.type=="MESH"]:
    hits=region_hits(obj,regions)
    if not hits:
        continue
    before,after,changes=conservative_repair(obj)
    rows.append({
        "name":obj.name,
        "regions":hits,
        "before":before,
        "after":after,
        "changes":changes
    })

summary={
    "objects_considered":len(rows),
    "objects_modified":sum(1 for r in rows if any([
        r["changes"]["merged_vertices"],
        r["changes"]["deleted_loose_vertices"],
        r["changes"]["filled_small_holes"],
        r["before"]["degenerate_faces"]!=r["after"]["degenerate_faces"]
    ])),
    "merged_vertices":sum(r["changes"]["merged_vertices"] for r in rows),
    "deleted_loose_vertices":sum(r["changes"]["deleted_loose_vertices"] for r in rows),
    "filled_small_holes":sum(r["changes"]["filled_small_holes"] for r in rows),
    "boundary_edges_before":sum(r["before"]["boundary_edges"] for r in rows),
    "boundary_edges_after":sum(r["after"]["boundary_edges"] for r in rows),
    "non_manifold_before":sum(r["before"]["non_manifold_edges"] for r in rows),
    "non_manifold_after":sum(r["after"]["non_manifold_edges"] for r in rows),
    "degenerate_before":sum(r["before"]["degenerate_faces"] for r in rows),
    "degenerate_after":sum(r["after"]["degenerate_faces"] for r in rows)
}

with report_path.open("w",encoding="utf-8") as f:
    json.dump({"summary":summary,"objects":rows},f,ensure_ascii=False,indent=2)

bpy.ops.wm.save_as_mainfile(filepath=str(output_blend))

print("REPAIR_SUMMARY="+json.dumps(summary,ensure_ascii=False))
for row in rows:
    c=row["changes"]
    if c["merged_vertices"] or c["deleted_loose_vertices"] or c["filled_small_holes"] or row["before"]["degenerate_faces"]!=row["after"]["degenerate_faces"]:
        print("REPAIRED",row["name"],row["regions"],c,"before",row["before"],"after",row["after"])
