import{tissueFamily}from"./anatomy.js";

const BASE={
  bone:{hex:"#e2d8c3",roughness:.72,metalness:.01,clearcoat:.03,clearcoatRoughness:.8,sheen:.04,sheenHex:"#fff4dc",sheenRoughness:.9},
  muscle:{hex:"#963d43",roughness:.48,metalness:.015,clearcoat:.08,clearcoatRoughness:.5,sheen:.28,sheenHex:"#8e2930",sheenRoughness:.75},
  attachment:{hex:"#d7a24a",roughness:.42,metalness:.0,clearcoat:.14,clearcoatRoughness:.42,sheen:.18,sheenHex:"#ffe0a0",sheenRoughness:.68},
  fascia:{hex:"#d9d2c3",roughness:.66,metalness:.0,clearcoat:.06,clearcoatRoughness:.65,sheen:.16,sheenHex:"#f0e7d7",sheenRoughness:.82},
  tendon:{hex:"#e4d7bd",roughness:.50,metalness:.0,clearcoat:.10,clearcoatRoughness:.55,sheen:.12,sheenHex:"#fff6df",sheenRoughness:.76},
  aponeurosis:{hex:"#dfd4c2",roughness:.58,metalness:.0,clearcoat:.08,clearcoatRoughness:.6,sheen:.14,sheenHex:"#f7eedc",sheenRoughness:.8},
  retinaculum:{hex:"#d8cbb2",roughness:.54,metalness:.0,clearcoat:.07,clearcoatRoughness:.6,sheen:.11,sheenHex:"#f1e6cf",sheenRoughness:.8},
  ligament:{hex:"#d4c7ae",roughness:.56,metalness:.0,clearcoat:.07,clearcoatRoughness:.62,sheen:.10,sheenHex:"#eee2cb",sheenRoughness:.82},
  artery:{hex:"#b63832",roughness:.34,metalness:.0,clearcoat:.20,clearcoatRoughness:.32,sheen:.12,sheenHex:"#f06a5f",sheenRoughness:.55},
  vein:{hex:"#486fa6",roughness:.36,metalness:.0,clearcoat:.18,clearcoatRoughness:.34,sheen:.10,sheenHex:"#7896c4",sheenRoughness:.58},
  heart:{hex:"#993b40",roughness:.40,metalness:.0,clearcoat:.12,clearcoatRoughness:.42,sheen:.20,sheenHex:"#cf5f66",sheenRoughness:.62},
  cardiovascular:{hex:"#a34347",roughness:.38,metalness:.0,clearcoat:.16,clearcoatRoughness:.38,sheen:.12,sheenHex:"#d86569",sheenRoughness:.58},
  other:{hex:"#b8b8b8",roughness:.55,metalness:.0,clearcoat:.04,clearcoatRoughness:.7,sheen:.05,sheenHex:"#d9d9d9",sheenRoughness:.85}
};

function hash(text){
  let value=0x811c9dc5;
  for(let i=0;i<text.length;i+=1){value^=text.charCodeAt(i);value=Math.imul(value,0x01000193)}
  return value>>>0;
}
function spread(seed,shift){return(((seed>>>shift)&255)/128)-1}

export function tissueVisual(organ){
  const family=tissueFamily(organ);
  const base=BASE[family]||BASE.other;
  return{family,...base};
}

export function colourVariation(organ){
  const family=tissueFamily(organ);
  if(!["muscle","bone","attachment"].includes(family))return{h:0,s:0,l:0};
  const seed=hash(organ?.organ_id||family);
  return{
    h:spread(seed,0)*.014,
    s:spread(seed,8)*.055,
    l:spread(seed,16)*.06
  };
}

export function qualityProfile(mode){
  if(mode==="performance")return{dprMax:1.25,ao:false,aoQuality:"performance",aoSamples:8,denoiseSamples:2,halfRes:true};
  if(mode==="balanced")return{dprMax:1.65,ao:true,aoQuality:"performance",aoSamples:12,denoiseSamples:4,halfRes:true};
  return{dprMax:2,ao:true,aoQuality:"medium",aoSamples:16,denoiseSamples:6,halfRes:true};
}
