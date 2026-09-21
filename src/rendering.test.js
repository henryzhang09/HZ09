import test from"node:test";
import assert from"node:assert/strict";
import{qualityProfile,tissueVisual}from"./rendering.js";

const muscle={organ_id:"m",name_en:"Deltoid muscle",ta2_latin:"Musculus deltoideus",system:"muscular",path:[]};
const fascia={organ_id:"f",name_en:"Pectoral fascia",ta2_latin:"Fascia pectoralis",system:"muscular",path:[]};
const artery={organ_id:"a",name_en:"Axillary artery",ta2_latin:"Arteria axillaris",system:"cardiovascular",path:[]};

test("muscle rendering remains rougher than vessel rendering",()=>{
  assert.ok(tissueVisual(muscle).roughness>tissueVisual(artery).roughness);
});

test("fascia gets its own pearly connective profile",()=>{
  const v=tissueVisual(fascia);
  assert.equal(v.family,"fascia");
  assert.ok(v.sheen>0);
  assert.ok(v.clearcoat>=0);
});

test("quality profiles step up AO and DPR",()=>{
  const low=qualityProfile("performance");
  const high=qualityProfile("quality");
  assert.equal(low.ao,false);
  assert.equal(high.ao,true);
  assert.ok(high.dprMax>low.dprMax);
  assert.ok(high.aoSamples>low.aoSamples);
});
