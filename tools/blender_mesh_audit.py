import bpy, bmesh, json, math, sys
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

def text_blob(obj):
    parts=[obj.name]
    for c in obj.users_collection:
        parts.append(c.name)
    return " ".join(parts).lower()

def region_hits(obj,regions):
    text=text_blob(obj)
    hits=[]
    for region,terms in regions.items():
        if any(term.lower() in text for term in terms):
            hits.append(region)
    return hits

def bbox_diag(mesh):
    if not mesh.vertices:
        return 0.0
    xs=[v.co.x for v in mesh.vertices]
    ys=[v.co.y for v in mesh.vertices]
    zs=[v.co.z for v in mesh.vertices]
    return Vector((max(xs)-min(xs),max(ys)-min(ys),max(zs)-min(zs))).length

def count_components(bm,limit=250000):
    if len(bm.verts)>limit:
        return None
    unseen=set(bm.verts)
    count=0
    while unseen:
        count+=1
        stack=[unseen.pop()]
        while stack:
            v=stack.pop()
            for e in v.link_edges:
                ov=e.other_vert(v)
                if ov in unseen:
                    unseen.remove(ov)
                    stack.append(ov)
    return count

def boundary_loops(bm):
    boundary=[e for e in bm.edges if e.is_boundary]
    remaining=set(boundary)
    loops=[]
    while remaining:
        start=remaining.pop()
        loop=[start]
        current=start
        current_v=start.verts[1]
        prev_v=start.verts[0]
        guard=0
        while guard<10000:
            guard+=1
            candidates=[e for e in current_v.link_edges if e in remaining and e.is_boundary]
            if not candidates:
                break
            nxt=candidates[0]
            remaining.remove(nxt)
            loop.append(nxt)
            nv=nxt.other_vert(current_v)
            prev_v,current_v=current_v,nv
            current=nxt
            if current_v in start.verts:
                break
        loops.append(loop)
    return loops

def audit_object(obj,detailed=False):
    mesh=obj.data
    bm=bmesh.new()
    bm.from_mesh(mesh)
    diag=max(bbox_diag(mesh),1e-12)
    area_eps=(diag*diag)*1e-12
    merge_dist=diag*1e-7

    loose=sum(1 for v in bm.verts if not v.link_edges)
    boundary=sum(1 for e in bm.edges if e.is_boundary)
    non_manifold=sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)
    degenerate=sum(1 for f in bm.faces if f.calc_area()<=area_eps)
    components=count_components(bm) if detailed else None

    doubles=None
    if detailed and len(bm.verts)<=180000:
        try:
            res=bmesh.ops.find_doubles(bm,verts=list(bm.verts),dist=merge_dist)
            doubles=len(res.get("targetmap",{}))
        except Exception:
            doubles=None

    hole_stats=None
    if detailed and boundary:
        loops=boundary_loops(bm)
        sizes=[]
        for loop in loops:
            perimeter=sum((e.verts[0].co-e.verts[1].co).length for e in loop)
            sizes.append({"edges":len(loop),"perimeter":perimeter,"relative_perimeter":perimeter/diag if diag else None})
        hole_stats={
            "loop_count":len(loops),
            "small_candidate_loops":sum(1 for x in sizes if x["edges"]<=6 and x["relative_perimeter"] is not None and x["relative_perimeter"]<=0.003),
            "largest_relative_perimeter":max([x["relative_perimeter"] for x in sizes if x["relative_perimeter"] is not None],default=0)
        }

    bm.free()
    return {
        "name":obj.name,
        "collections":[c.name for c in obj.users_collection],
        "vertices":len(mesh.vertices),
        "edges":len(mesh.edges),
        "faces":len(mesh.polygons),
        "bbox_diag":diag,
        "loose_vertices":loose,
        "boundary_edges":boundary,
        "non_manifold_edges":non_manifold,
        "degenerate_faces":degenerate,
        "components":components,
        "near_duplicate_vertices":doubles,
        "holes":hole_stats
    }

args=parse_args(argv_after_dash())
regions=load_regions(args["regions"])
output=Path(args["output"])
output.parent.mkdir(parents=True,exist_ok=True)

mesh_objects=[o for o in bpy.data.objects if o.type=="MESH"]
report={
    "blend_file":bpy.data.filepath,
    "object_count":len(mesh_objects),
    "objects":[],
    "summary":{}
}

priority=[]
for obj in mesh_objects:
    hits=region_hits(obj,regions)
    detailed=bool(hits)
    row=audit_object(obj,detailed=detailed)
    row["regions"]=hits
    report["objects"].append(row)
    if hits:
        priority.append(row)

def s(rows,key):
    vals=[r.get(key) for r in rows if isinstance(r.get(key),(int,float))]
    return sum(vals)

report["summary"]={
    "mesh_objects":len(mesh_objects),
    "priority_objects":len(priority),
    "vertices_total":s(report["objects"],"vertices"),
    "faces_total":s(report["objects"],"faces"),
    "priority_boundary_edges":s(priority,"boundary_edges"),
    "priority_non_manifold_edges":s(priority,"non_manifold_edges"),
    "priority_degenerate_faces":s(priority,"degenerate_faces"),
    "priority_loose_vertices":s(priority,"loose_vertices")
}

with output.open("w",encoding="utf-8") as f:
    json.dump(report,f,ensure_ascii=False,indent=2)

print("AUDIT_SUMMARY="+json.dumps(report["summary"],ensure_ascii=False))
print("PRIORITY_OBJECTS="+str(len(priority)))
for row in sorted(priority,key=lambda r:(r["non_manifold_edges"]+r["boundary_edges"]+r["degenerate_faces"]),reverse=True)[:30]:
    print("ISSUE",row["name"],row["regions"],"boundary",row["boundary_edges"],"nonmanifold",row["non_manifold_edges"],"degenerate",row["degenerate_faces"],"loose",row["loose_vertices"])
