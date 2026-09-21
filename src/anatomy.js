export const VEIN=/\b(vena|venae|venous|vein|veins|sinus)\b/i;
export const ARTERY=/\b(arteria|arteriae|arterial|artery|arteries|aorta|truncus)\b/i;
export const CONNECTIVE=/\b(tendo|tendon|tendons|tendinis|aponeurosis|fascia|fascial|retinaculum|retinacula|ligamentum|ligament|ligaments|raphe|septum intermusculare)\b/i;

export function searchableName(organ){
  return [organ?.name_en,organ?.ta2_latin,organ?.qualifier,...(organ?.path||[])].filter(Boolean).join(" ");
}

export function isConnective(organ){
  return organ?.system==="muscular"&&CONNECTIVE.test(searchableName(organ));
}

export function cardioKind(organ){
  if(organ?.system!=="cardiovascular")return null;
  const n=searchableName(organ);
  if(VEIN.test(n))return"vein";
  if(ARTERY.test(n))return"artery";
  if(/\b(heart|cardiac|atrium|atrial|ventricle|ventricular|myocard|endocard|epicard|valv|valve)\b/i.test(n))return"heart";
  return"other";
}

export function structureKind(organ){
  if(!organ)return"Structure";
  if(organ.system==="muscular")return isConnective(organ)?"Fascia / tendon":"Skeletal muscle";
  if(organ.system==="skeletal")return"Bone";
  if(organ.system==="cardiovascular"){
    const kind=cardioKind(organ);
    if(kind==="artery")return"Artery";
    if(kind==="vein")return"Vein";
    if(kind==="heart")return"Heart";
    return"Cardiovascular";
  }
  return organ.system||"Structure";
}

export function displayName(organ){
  if(!organ)return"";
  return organ.qualifier?organ.name_en+" · "+organ.qualifier:organ.name_en;
}

export function stackFromIntersections(intersections,max=12){
  const seen=new Set();
  const ids=[];
  for(const hit of intersections||[]){
    const id=hit?.object?.userData?.organId;
    if(typeof id!=="string"||seen.has(id))continue;
    seen.add(id);
    ids.push(id);
    if(ids.length>=max)break;
  }
  return ids;
}

export function pickFromStack(ids,organMap,options={}){
  const {smartMuscle=true,opacities={}}=options;
  const candidates=(ids||[]).map(id=>organMap?.get?.(id)).filter(Boolean);
  if(!candidates.length)return null;

  const solid=candidates.find(o=>(opacities[o.system]??1)>=0.5)??candidates[0];

  if(smartMuscle&&solid.system==="muscular"&&isConnective(solid)){
    const underlyingMuscle=candidates.find(o=>o.system==="muscular"&&!isConnective(o));
    if(underlyingMuscle)return underlyingMuscle.organ_id;
  }
  return solid.organ_id;
}

export function rankedSearch(organs,query,limit=80){
  const q=(query||"").trim().toLowerCase();
  if(!q)return[];
  const scored=[];
  for(const o of organs||[]){
    const en=(o.name_en||"").toLowerCase();
    const latin=(o.ta2_latin||"").toLowerCase();
    const qual=(o.qualifier||"").toLowerCase();
    const path=(o.path||[]).join(" ").toLowerCase();
    const id=(o.organ_id||"").toLowerCase();
    let score=Infinity;
    if(en===q||latin===q||id===q)score=0;
    else if(en.startsWith(q))score=1;
    else if(latin.startsWith(q))score=2;
    else if(qual.startsWith(q))score=3;
    else if(en.includes(q))score=4;
    else if(latin.includes(q))score=5;
    else if(path.includes(q))score=6;
    else if(id.includes(q))score=7;
    if(Number.isFinite(score))scored.push({o,score});
  }
  return scored.sort((a,b)=>a.score-b.score||a.o.name_en.localeCompare(b.o.name_en)).slice(0,limit).map(x=>x.o);
}

export function viewDirection(view,leftSign=1){
  if(view==="anterior")return[0,0,1];
  if(view==="posterior")return[0,0,-1];
  if(view==="left")return[leftSign,0,0];
  if(view==="right")return[-leftSign,0,0];
  if(view==="superior")return[0,1,0.001];
  return[0,0,1];
}

export function lateralSignFromBoxes(ids,boxes){
  let votes=0;
  for(const id of ids||[]){
    if(!id.endsWith("_l"))continue;
    const l=boxes.get(id),r=boxes.get(id.slice(0,-2)+"_r");
    if(!l||!r)continue;
    const lx=(l.min.x+l.max.x)/2,rx=(r.min.x+r.max.x)/2;
    if(lx>rx)votes++;
    else if(lx<rx)votes--;
  }
  return votes>=0?1:-1;
}
