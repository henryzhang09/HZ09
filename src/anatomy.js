export const VEIN=/\b(vena|venae|venous|vein|veins|sinus)\b/i;
export const ARTERY=/\b(arteria|arteriae|arterial|artery|arteries|aorta|truncus)\b/i;
export const TENDON=/\b(tendo|tendon|tendons|tendinis)\b/i;
export const APONEUROSIS=/\b(aponeurosis|aponeurotic)\b/i;
export const FASCIA=/\b(fascia|fascial|septum intermusculare|intermuscular septum|raphe)\b/i;
export const RETINACULUM=/\b(retinaculum|retinacula)\b/i;
export const LIGAMENT=/\b(ligamentum|ligament|ligaments|ligamenta)\b/i;
export const CONNECTIVE=/\b(tendo|tendon|tendons|tendinis|aponeurosis|aponeurotic|fascia|fascial|retinaculum|retinacula|ligamentum|ligament|ligaments|ligamenta|raphe|septum intermusculare|intermuscular septum)\b/i;

export function searchableName(organ){
  return [organ?.name_en,organ?.ta2_latin,organ?.qualifier,...(organ?.path||[])].filter(Boolean).join(" ");
}

export function connectiveSubtype(organ){
  if(organ?.layer==="attachments")return null;
  if(organ?.system!=="muscular")return null;
  const n=searchableName(organ);
  if(TENDON.test(n))return"tendon";
  if(APONEUROSIS.test(n))return"aponeurosis";
  if(RETINACULUM.test(n))return"retinaculum";
  if(LIGAMENT.test(n))return"ligament";
  if(FASCIA.test(n))return"fascia";
  return null;
}

export function isConnective(organ){
  return connectiveSubtype(organ)!==null;
}

export function cardioKind(organ){
  if(organ?.system!=="cardiovascular")return null;
  const n=searchableName(organ);
  if(VEIN.test(n))return"vein";
  if(ARTERY.test(n))return"artery";
  if(/\b(heart|cardiac|atrium|atrial|ventricle|ventricular|myocard|endocard|epicard|valv|valve)\b/i.test(n))return"heart";
  return"other";
}

export function tissueFamily(organ){
  if(!organ)return"other";
  if(organ.layer==="attachments"||(organ.path||[]).includes("Muscular insertions"))return"attachment";
  const connective=connectiveSubtype(organ);
  if(connective)return connective;
  if(organ.system==="cardiovascular"){
    const c=cardioKind(organ);
    if(c)return c;
  }
  if(organ.system==="skeletal")return"bone";
  if(organ.system==="muscular")return"muscle";
  return organ.system||"other";
}

export function structureKind(organ){
  const family=tissueFamily(organ);
  const labels={
    tendon:"Tendon",
    aponeurosis:"Aponeurosis",
    fascia:"Fascia",
    retinaculum:"Retinaculum",
    ligament:"Ligament",
    muscle:"Skeletal muscle",
    attachment:"Muscle attachment area",
    bone:"Bone",
    artery:"Artery",
    vein:"Vein",
    heart:"Heart",
    other:"Structure",
    cardiovascular:"Cardiovascular"
  };
  return labels[family]||family;
}

export function tissueBaseOpacity(organ){
  switch(tissueFamily(organ)){
    // Broad fascial sheets sit directly on muscle. Treating them as solid makes
    // the muscle layer look missing; translucency preserves both tissues.
    case"fascia":return .42;
    case"aponeurosis":return .68;
    case"retinaculum":return .82;
    case"tendon":return .92;
    case"ligament":return .92;
    case"attachment":return .86;
    default:return 1;
  }
}

export function tissueDepthBias(organ){
  const family=tissueFamily(organ);
  return["fascia","aponeurosis","retinaculum","tendon","ligament"].includes(family)?-1:0;
}

export function effectiveOpacity(organ,layerOpacity=1,connectiveMode="natural"){
  let tissue=tissueBaseOpacity(organ);
  const connective=isConnective(organ);
  if(connectiveMode==="hide"&&connective)return 0;
  if(connectiveMode==="ghost"&&connective)tissue*=.5;
  return Math.min(1,Math.max(0,layerOpacity*tissue));
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

export function opacityFor(organ,opacities={}){
  return opacities[organ?.layer]??opacities[organ?.system]??1;
}

export function pickFromStack(ids,organMap,options={}){
  const {smartMuscle=true,opacities={},connectiveMode="natural"}=options;
  const candidates=(ids||[]).map(id=>organMap?.get?.(id)).filter(Boolean);
  if(!candidates.length)return null;

  // Deliberate layer ghosting should click through. Intrinsic fascia
  // translucency should not make fascia impossible to inspect when Smart Pick
  // is switched off.
  const layerPickable=candidates.filter(o=>opacityFor(o,opacities)>=.5);
  const first=layerPickable[0]??candidates[0];

  if(connectiveMode==="hide"&&isConnective(first)){
    const next=candidates.find(o=>!isConnective(o)&&opacityFor(o,opacities)>=.5);
    if(next)return next.organ_id;
  }

  if(smartMuscle&&first.system==="muscular"&&first.layer!=="attachments"&&isConnective(first)){
    const underlyingMuscle=candidates.find(o=>o.system==="muscular"&&o.layer!=="attachments"&&!isConnective(o)&&opacityFor(o,opacities)>=.5);
    if(underlyingMuscle)return underlyingMuscle.organ_id;
  }

  return first.organ_id;
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
  if(view==="superior")return[0,1,.001];
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
