import test from"node:test";
import assert from"node:assert/strict";
import{
  cardioKind,connectiveSubtype,effectiveOpacity,isConnective,pickFromStack,
  rankedSearch,stackFromIntersections,structureKind,tissueBaseOpacity,tissueDepthBias,tissueFamily
}from"./anatomy.js";

const muscle={organ_id:"m1",name_en:"Gluteus medius",ta2_latin:"Musculus gluteus medius",system:"muscular",path:["Muscles of hip"]};
const fascia={organ_id:"f1",name_en:"Fascia lata",ta2_latin:"Fascia lata",system:"muscular",path:["Fascia"]};
const tendon={organ_id:"t1",name_en:"Calcaneal tendon",ta2_latin:"Tendo calcaneus",system:"muscular",path:["Tendons"]};
const aponeurosis={organ_id:"ap1",name_en:"Palmar aponeurosis",ta2_latin:"Aponeurosis palmaris",system:"muscular",path:["Aponeuroses"]};
const ligament={organ_id:"l1",name_en:"Inguinal ligament",ta2_latin:"Ligamentum inguinale",system:"muscular",path:["Ligaments"]};
const artery={organ_id:"a1",name_en:"Femoral artery",ta2_latin:"Arteria femoralis",system:"cardiovascular",path:["Systemic arteries"]};
const vein={organ_id:"v1",name_en:"Femoral vein",ta2_latin:"Vena femoralis",system:"cardiovascular",path:["Systemic veins"]};

test("classifies connective subtypes without classifying muscle belly",()=>{
  assert.equal(connectiveSubtype(fascia),"fascia");
  assert.equal(connectiveSubtype(tendon),"tendon");
  assert.equal(connectiveSubtype(aponeurosis),"aponeurosis");
  assert.equal(connectiveSubtype(ligament),"ligament");
  assert.equal(isConnective(muscle),false);
  assert.equal(structureKind(fascia),"Fascia");
  assert.equal(structureKind(tendon),"Tendon");
  assert.equal(structureKind(muscle),"Skeletal muscle");
});

test("classifies arteries and veins",()=>{
  assert.equal(cardioKind(artery),"artery");
  assert.equal(cardioKind(vein),"vein");
  assert.equal(tissueFamily(artery),"artery");
  assert.equal(tissueFamily(vein),"vein");
});

test("connective tissue keeps subtype-specific transparency and depth bias",()=>{
  assert.equal(tissueBaseOpacity(fascia),.42);
  assert.equal(tissueBaseOpacity(tendon),.92);
  assert.equal(tissueBaseOpacity(aponeurosis),.68);
  assert.equal(tissueDepthBias(fascia),-1);
  assert.equal(tissueDepthBias(muscle),0);
  assert.equal(effectiveOpacity(fascia,1,"ghost"),.21);
  assert.equal(effectiveOpacity(fascia,1,"hide"),0);
});

test("deduplicates ray intersections in depth order",()=>{
  const hits=[
    {object:{userData:{organId:"f1"}}},
    {object:{userData:{organId:"f1"}}},
    {object:{userData:{organId:"m1"}}}
  ];
  assert.deepEqual(stackFromIntersections(hits),["f1","m1"]);
});

test("smart muscle pick passes through superficial fascia",()=>{
  const map=new Map([[fascia.organ_id,fascia],[muscle.organ_id,muscle]]);
  assert.equal(pickFromStack(["f1","m1"],map,{smartMuscle:true,opacities:{muscular:1},connectiveMode:"natural"}),"m1");
  assert.equal(pickFromStack(["f1","m1"],map,{smartMuscle:false,opacities:{muscular:1},connectiveMode:"natural"}),"f1");
});

test("opaque tendon remains directly pickable when smart muscle has no belly behind it",()=>{
  const map=new Map([[tendon.organ_id,tendon]]);
  assert.equal(pickFromStack(["t1"],map,{smartMuscle:true,opacities:{muscular:1}}),"t1");
});

test("ghosted muscle layer yields to solid vessel",()=>{
  const map=new Map([[muscle.organ_id,muscle],[artery.organ_id,artery]]);
  assert.equal(pickFromStack(["m1","a1"],map,{smartMuscle:true,opacities:{muscular:.12,cardiovascular:1}}),"a1");
});

test("search prioritizes exact clinical English",()=>{
  const result=rankedSearch([vein,artery],"Femoral artery");
  assert.equal(result[0].organ_id,"a1");
});
