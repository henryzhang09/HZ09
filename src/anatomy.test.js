import test from"node:test";
import assert from"node:assert/strict";
import{cardioKind,isConnective,pickFromStack,rankedSearch,stackFromIntersections,structureKind}from"./anatomy.js";

const muscle={organ_id:"m1",name_en:"Gluteus medius",ta2_latin:"Musculus gluteus medius",system:"muscular",path:["Muscles of hip"]};
const fascia={organ_id:"f1",name_en:"Fascia lata",ta2_latin:"Fascia lata",system:"muscular",path:["Fascia"]};
const artery={organ_id:"a1",name_en:"Femoral artery",ta2_latin:"Arteria femoralis",system:"cardiovascular",path:["Systemic arteries"]};
const vein={organ_id:"v1",name_en:"Femoral vein",ta2_latin:"Vena femoralis",system:"cardiovascular",path:["Systemic veins"]};

test("classifies connective tissue without classifying muscle belly",()=>{
  assert.equal(isConnective(fascia),true);
  assert.equal(isConnective(muscle),false);
  assert.equal(structureKind(fascia),"Fascia / tendon");
  assert.equal(structureKind(muscle),"Skeletal muscle");
});

test("classifies arteries and veins",()=>{
  assert.equal(cardioKind(artery),"artery");
  assert.equal(cardioKind(vein),"vein");
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
  assert.equal(pickFromStack(["f1","m1"],map,{smartMuscle:true,opacities:{muscular:1}}),"m1");
  assert.equal(pickFromStack(["f1","m1"],map,{smartMuscle:false,opacities:{muscular:1}}),"f1");
});

test("ghosted muscle layer yields to solid vessel",()=>{
  const map=new Map([[muscle.organ_id,muscle],[artery.organ_id,artery]]);
  assert.equal(pickFromStack(["m1","a1"],map,{smartMuscle:true,opacities:{muscular:.12,cardiovascular:1}}),"a1");
});

test("search prioritizes exact clinical English",()=>{
  const result=rankedSearch([vein,artery],"Femoral artery");
  assert.equal(result[0].organ_id,"a1");
});
