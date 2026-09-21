import React,{Suspense,memo,useEffect,useMemo,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Canvas,useFrame,useThree}from"@react-three/fiber";
import{ContactShadows,OrbitControls,useGLTF}from"@react-three/drei";
import*as THREE from"three";
import"./styles.css";

const SOURCE_COMMIT="949ac80cc9763539afc48e60b5246132f00468db";
const BASE="https://raw.githubusercontent.com/Nurkan1/Anatria-3D/"+SOURCE_COMMIT+"/public/anatomy/";
const MANIFEST_URL=BASE+"manifest.json";
const SYSTEMS=[
  {id:"skeletal",zh:"骨骼",en:"Skeletal",file:"skeletal_male.glb"},
  {id:"muscular",zh:"肌肉",en:"Muscular",file:"muscular_male.glb"},
  {id:"cardiovascular",zh:"心血管",en:"Cardiovascular",file:"cardiovascular_male.glb"}
];
const SYSTEM_LABEL={skeletal:"Bone",muscular:"Muscle",cardiovascular:"Heart & vessels"};
const SYSTEM_BASE={skeletal:"#e2d8c3",muscular:"#9e3f45",cardiovascular:"#b0484a"};
const ROUGHNESS={skeletal:.78,muscular:.44,cardiovascular:.38};
const CYAN=new THREE.Color("#37d8e6");
const BLACK=new THREE.Color("#000000");
const VEIN=/\b(vena|venae|venous|vein|veins|sinus)\b/i;
const ARTERY=/\b(arteria|arteriae|arterial|artery|arteries|aorta|truncus)\b/i;
const CONNECTIVE=/\b(tendo|tendon|tendons|tendinis|aponeurosis|fascia|retinaculum|ligamentum|ligament|ligaments)\b/i;

function hash(text){
  let value=0x811c9dc5;
  for(let i=0;i<text.length;i+=1){value^=text.charCodeAt(i);value=Math.imul(value,0x01000193)}
  return value>>>0;
}
function spread(seed,shift){return(((seed>>>shift)&255)/128)-1}
function cardioKind(o){
  const n=(o.ta2_latin+" "+o.name_en).toLowerCase();
  if(VEIN.test(n))return"vein";
  if(ARTERY.test(n))return"artery";
  if(/heart|cardiac|atrium|ventricle|myocard|valv|coronary sulcus/i.test(n))return"heart";
  return"other";
}
function tissueColour(o){
  const n=o.ta2_latin+" "+o.name_en;
  let hex=SYSTEM_BASE[o.system]||"#b8b8b8";
  if(o.system==="cardiovascular"){
    if(VEIN.test(n))hex="#4a6ea8";
    else if(ARTERY.test(n))hex="#c0392f";
    else hex="#a63f42";
  }else if(o.system==="muscular"&&CONNECTIVE.test(n)){
    hex="#ded3bd";
  }
  const c=new THREE.Color(hex);
  if(o.system!=="cardiovascular"){
    const s=hash(o.organ_id),hsl={h:0,s:0,l:0};
    c.getHSL(hsl);
    c.setHSL(
      (hsl.h+spread(s,0)*.012+1)%1,
      Math.min(Math.max(hsl.s+spread(s,8)*.045,0),1),
      Math.min(Math.max(hsl.l+spread(s,16)*.05,.05),.95)
    );
  }
  return c;
}
function displayName(o){return o.qualifier?o.name_en+" · "+o.qualifier:o.name_en}

const OrganMesh=memo(function OrganMesh({entry,organ,visible,opacity,selected,onSelect,registerBox}){
  const[hovered,setHovered]=useState(false);
  const base=useMemo(()=>tissueColour(organ),[organ]);
  const shown=useMemo(()=>{
    if(selected)return base.clone().lerp(CYAN,.42);
    if(hovered)return base.clone().lerp(CYAN,.16);
    return base;
  },[base,selected,hovered]);
  const ghost=opacity<.995;
  useEffect(()=>{registerBox(organ.organ_id,entry.box)},[registerBox,organ.organ_id,entry.box]);
  return <mesh
    geometry={entry.geometry}
    matrix={entry.matrix}
    matrixAutoUpdate={false}
    visible={visible}
    userData={{organId:organ.organ_id}}
    renderOrder={organ.system==="cardiovascular"?3:organ.system==="muscular"?2:1}
    onPointerOver={e=>{e.stopPropagation();setHovered(true);document.body.style.cursor="crosshair"}}
    onPointerOut={()=>{setHovered(false);document.body.style.cursor="default"}}
    onClick={e=>{e.stopPropagation();onSelect(organ.organ_id)}}
  >
    <meshStandardMaterial
      color={shown}
      emissive={selected?CYAN:BLACK}
      emissiveIntensity={selected?.14:0}
      roughness={ROUGHNESS[organ.system]??.55}
      metalness={.02}
      transparent={ghost}
      opacity={opacity}
      depthWrite={!ghost||opacity>.76}
      side={THREE.FrontSide}
    />
  </mesh>
});

function SystemModel({file,organs,enabled,opacity,selectedId,isolateId,cardioParts,onSelect,registerBox,onReady}){
  const url=BASE+file;
  const{nodes,scene}=useGLTF(url,true);
  const entries=useMemo(()=>{
    scene.updateMatrixWorld(true);
    const out=[];
    for(const organ of organs){
      const node=nodes[organ.node]??nodes[THREE.PropertyBinding.sanitizeNodeName(organ.node)];
      if(!(node instanceof THREE.Mesh))continue;
      node.updateWorldMatrix(true,false);
      const geometry=node.geometry;
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      const matrix=node.matrixWorld.clone();
      const box=geometry.boundingBox?geometry.boundingBox.clone().applyMatrix4(matrix):new THREE.Box3();
      out.push({organ,geometry,matrix,box});
    }
    return out;
  },[nodes,scene,organs]);
  useEffect(()=>{onReady(file,entries.length)},[file,entries.length,onReady]);
  return <group>
    {entries.map(entry=>{
      const o=entry.organ;
      const cardioVisible=o.system!=="cardiovascular"||cardioParts[cardioKind(o)]!==false;
      const visible=enabled&&cardioVisible&&(!isolateId||o.organ_id===isolateId);
      const op=(selectedId===o.organ_id)?1:opacity;
      return <OrganMesh key={o.organ_id} entry={entry} organ={o} visible={visible} opacity={op} selected={selectedId===o.organ_id} onSelect={onSelect} registerBox={registerBox}/>;
    })}
  </group>
}

function StudioLights(){
  const key=useRef(),fill=useRef(),rim=useRef();
  const forward=useRef(new THREE.Vector3());
  useFrame(({camera})=>{
    camera.getWorldDirection(forward.current);
    const f=forward.current.clone().normalize();
    const right=new THREE.Vector3().crossVectors(f,camera.up).normalize();
    const up=camera.up.clone().normalize();
    key.current?.position.copy(f.clone().multiplyScalar(-8).add(right.clone().multiplyScalar(-4)).add(up.clone().multiplyScalar(5)));
    fill.current?.position.copy(f.clone().multiplyScalar(-5).add(right.clone().multiplyScalar(5)).add(up.clone().multiplyScalar(2)));
    rim.current?.position.copy(f.clone().multiplyScalar(4).add(right.clone().multiplyScalar(2)).add(up.clone().multiplyScalar(6)));
  });
  return <>
    <hemisphereLight intensity={.42} color="#dbeef2" groundColor="#1b1110"/>
    <ambientLight intensity={.16}/>
    <directionalLight ref={key} intensity={2.15}/>
    <directionalLight ref={fill} intensity={.72} color="#b7d8ee"/>
    <directionalLight ref={rim} intensity={1.05} color="#a6e1ff"/>
    <directionalLight position={[0,-4,2]} intensity={.24} color="#ffd8c0"/>
  </>;
}

function CameraDirector({controlsRef,boxesRef,focusRequest,resetKey}){
  const{camera}=useThree();
  const desired=useRef(null);
  useEffect(()=>{
    const c=controlsRef.current;
    if(!c||!focusRequest?.id)return;
    const box=boxesRef.current.get(focusRequest.id);
    if(!box||box.isEmpty())return;
    const centre=box.getCenter(new THREE.Vector3());
    const size=box.getSize(new THREE.Vector3());
    const radius=Math.max(size.x,size.y,size.z,.008)*.5;
    const direction=camera.position.clone().sub(c.target).normalize();
    const dist=Math.max(radius*5.2,.12);
    desired.current={target:centre,position:centre.clone().add(direction.multiplyScalar(dist))};
  },[focusRequest,camera,controlsRef,boxesRef]);
  useEffect(()=>{
    const c=controlsRef.current;if(!c)return;
    desired.current={target:new THREE.Vector3(0,.91,0),position:new THREE.Vector3(0,.93,3.35)};
  },[resetKey,controlsRef]);
  useFrame((_,delta)=>{
    const c=controlsRef.current,d=desired.current;
    if(!c||!d)return;
    const a=1-Math.pow(.004,delta);
    c.target.lerp(d.target,a);
    camera.position.lerp(d.position,a);
    c.update();
    if(c.target.distanceToSquared(d.target)<1e-8&&camera.position.distanceToSquared(d.position)<1e-8){
      c.target.copy(d.target);camera.position.copy(d.position);c.update();desired.current=null;
    }
  });
  return null;
}

function Viewer({manifest,layers,opacities,selectedId,isolateId,cardioParts,onSelect,focusRequest,resetKey,onLoaded}){
  const controlsRef=useRef();
  const boxesRef=useRef(new Map());
  const byFile=useMemo(()=>{
    const m=new Map();
    for(const o of manifest.organs){
      if(!SYSTEMS.some(s=>s.id===o.system))continue;
      if(!m.has(o.mesh_file))m.set(o.mesh_file,[]);
      m.get(o.mesh_file).push(o);
    }
    return m;
  },[manifest]);
  const registerBox=(id,box)=>boxesRef.current.set(id,box);
  return <Canvas
    camera={{position:[0,.93,3.35],fov:29,near:.001,far:100}}
    dpr={[1,2]}
    gl={{antialias:true,powerPreference:"high-performance"}}
    onCreated={({gl})=>{
      gl.outputColorSpace=THREE.SRGBColorSpace;
      gl.toneMapping=THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure=1.13;
      gl.setClearColor("#071217",0);
    }}
  >
    <StudioLights/>
    <Suspense fallback={null}>
      {SYSTEMS.map(s=><SystemModel
        key={s.id}
        file={s.file}
        organs={byFile.get(s.file)||[]}
        enabled={layers[s.id]}
        opacity={opacities[s.id]}
        selectedId={selectedId}
        isolateId={isolateId}
        cardioParts={cardioParts}
        onSelect={onSelect}
        registerBox={registerBox}
        onReady={onLoaded}
      />)}
      <ContactShadows position={[0,-.015,0]} opacity={.24} scale={3.3} blur={2.6} far={2.5} resolution={1024}/>
    </Suspense>
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={.075}
      zoomToCursor
      screenSpacePanning
      minDistance={.08}
      maxDistance={8}
      target={[0,.91,0]}
    />
    <CameraDirector controlsRef={controlsRef} boxesRef={boxesRef} focusRequest={focusRequest} resetKey={resetKey}/>
  </Canvas>
}

function App(){
  const[manifest,setManifest]=useState(null);
  const[error,setError]=useState("");
  const[selectedId,setSelectedId]=useState(null);
  const[isolateId,setIsolateId]=useState(null);
  const[query,setQuery]=useState("");
  const[focusRequest,setFocusRequest]=useState(null);
  const[resetKey,setResetKey]=useState(0);
  const[layers,setLayers]=useState({skeletal:true,muscular:true,cardiovascular:true});
  const[opacities,setOpacities]=useState({skeletal:.90,muscular:.72,cardiovascular:1});
  const[cardioParts,setCardioParts]=useState({artery:true,vein:true,heart:true,other:true});
  const[loaded,setLoaded]=useState({});
  useEffect(()=>{
    fetch(MANIFEST_URL).then(r=>{if(!r.ok)throw new Error("Manifest HTTP "+r.status);return r.json()}).then(setManifest).catch(e=>setError(e.message||"Manifest load failed"));
  },[]);
  const organs=useMemo(()=>manifest?manifest.organs.filter(o=>SYSTEMS.some(s=>s.id===o.system)):[],[manifest]);
  const organMap=useMemo(()=>new Map(organs.map(o=>[o.organ_id,o])),[organs]);
  const selected=selectedId?organMap.get(selectedId):null;
  const counts=useMemo(()=>{
    const c={skeletal:0,muscular:0,cardiovascular:0};
    for(const o of organs)if(c[o.system]!==undefined)c[o.system]++;
    return c;
  },[organs]);
  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();if(!q)return[];
    return organs.filter(o=>{
      const hay=[o.name_en,o.ta2_latin,o.qualifier,o.organ_id,...(o.path||[])].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    }).slice(0,80);
  },[query,organs]);
  const select=(id,focus=false)=>{
    setSelectedId(id);setIsolateId(null);
    if(focus)setFocusRequest({id,seq:Date.now()});
  };
  const applyPreset=(name)=>{
    if(name==="combined"){setLayers({skeletal:true,muscular:true,cardiovascular:true});setOpacities({skeletal:.90,muscular:.72,cardiovascular:1})}
    if(name==="muscle"){setLayers({skeletal:true,muscular:true,cardiovascular:false});setOpacities({skeletal:.92,muscular:1,cardiovascular:1})}
    if(name==="angio"){setLayers({skeletal:true,muscular:true,cardiovascular:true});setOpacities({skeletal:.18,muscular:.12,cardiovascular:1})}
    if(name==="bone"){setLayers({skeletal:true,muscular:false,cardiovascular:false});setOpacities({skeletal:1,muscular:1,cardiovascular:1})}
  };
  const handleLoaded=(file,count)=>setLoaded(prev=>prev[file]===count?prev:{...prev,[file]:count});
  const loadedCount=Object.keys(loaded).length;
  return <div className="app">
    <header>
      <div className="brand"><b>ANATOMY ATLAS 3D</b><span>Z‑ANATOMY · TA2 NOMENCLATURE · RESEARCH VIEWER</span></div>
      <div className="status"><i className={loadedCount===3?"ok":""}/>{error?"Load error":loadedCount===3?organs.length.toLocaleString()+" structures indexed":"Loading high-detail atlas "+loadedCount+"/3"}</div>
      <button onClick={()=>{setSelectedId(null);setIsolateId(null);setResetKey(v=>v+1)}}>Reset view</button>
    </header>

    <aside className="left">
      <small>VIEW PRESETS</small>
      <div className="presets">
        <button onClick={()=>applyPreset("combined")}>Combined</button>
        <button onClick={()=>applyPreset("muscle")}>Muscle</button>
        <button onClick={()=>applyPreset("angio")}>Angio</button>
        <button onClick={()=>applyPreset("bone")}>Skeleton</button>
      </div>
      <div className="sectionTitle"><small>SYSTEM LAYERS</small><h2>解剖分层</h2></div>
      {SYSTEMS.map(s=><div className={"layerCard "+(layers[s.id]?"active":"")} key={s.id}>
        <button className="layerHead" onClick={()=>setLayers(v=>({...v,[s.id]:!v[s.id]}))}>
          <span><b>{s.zh}</b><em>{s.en} · {counts[s.id]?.toLocaleString()||"—"}</em></span><i/>
        </button>
        <div className="opacityRow"><span>Opacity</span><input type="range" min="0.05" max="1" step="0.01" value={opacities[s.id]} onChange={e=>setOpacities(v=>({...v,[s.id]:Number(e.target.value)}))}/><b>{Math.round(opacities[s.id]*100)}%</b></div>
        {s.id==="cardiovascular"&&<div className="subfilters">
          {[["artery","动脉"],["vein","静脉"],["heart","心脏"]].map(([id,label])=><button className={cardioParts[id]?"on":""} key={id} onClick={()=>setCardioParts(v=>({...v,[id]:!v[id]}))}>{label}</button>)}
        </div>}
      </div>)}
      <div className="dataCard"><b>数据层已升级</b><p>不再使用上一版轻量化网格。当前直接调用完整度更高的 Z‑Anatomy 衍生系统 GLB，并按 TA2 元数据逐结构渲染。</p><dl><div><dt>Male atlas</dt><dd>3,478</dd></div><div><dt>Muscle asset</dt><dd>≈12 MB</dd></div><div><dt>Vascular asset</dt><dd>≈7.2 MB</dd></div></dl></div>
    </aside>

    <main>
      <div className="search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search deltoid / femur / aorta / vena cava / TA2 Latin…"/>{query&&<div className="results">{results.map(o=><button key={o.organ_id} onClick={()=>{select(o.organ_id,true);setQuery("")}}><b>{displayName(o)}</b><span>{o.ta2_latin} · {SYSTEM_LABEL[o.system]}</span></button>)}{!results.length&&<p>No matching structure</p>}</div>}</div>
      <div className="viewer">
        {manifest&&!error?<Viewer manifest={manifest} layers={layers} opacities={opacities} selectedId={selectedId} isolateId={isolateId} cardioParts={cardioParts} onSelect={select} focusRequest={focusRequest} resetKey={resetKey} onLoaded={handleLoaded}/>:<div className={"loading "+(error?"error":"")}>{error||"Loading TA2 anatomy manifest…"}</div>}
      </div>
      {manifest&&loadedCount<3&&!error&&<div className="loadingOverlay"><div className="spinner"/><b>Loading high-detail geometry</b><span>骨骼 / 肌肉 / 心血管 · 首次加载约 22 MB</span></div>}
      <div className="hud">Left drag rotate · Wheel zoom · Right drag pan · Click structure</div>
    </main>

    <aside className="right">
      <small>STRUCTURE INSPECTOR</small><h2>结构信息</h2>
      {selected?<section className="inspect">
        <div className="systemBadge">{SYSTEM_LABEL[selected.system]}</div>
        <h3>{displayName(selected)}</h3>
        <p className="latin">{selected.ta2_latin}</p>
        <code>{selected.organ_id}</code>
        <div className="actions">
          <button onClick={()=>setFocusRequest({id:selected.organ_id,seq:Date.now()})}>Focus</button>
          <button className={isolateId===selected.organ_id?"on":""} onClick={()=>setIsolateId(v=>v===selected.organ_id?null:selected.organ_id)}>Isolate</button>
          <button onClick={()=>setIsolateId(null)}>Show all</button>
        </div>
        <div className="meta">
          <p><span>System</span><b>{selected.system}</b></p>
          <p><span>Mesh file</span><b>{selected.mesh_file}</b></p>
        </div>
        {selected.path?.length>0&&<div className="path"><span>Anatomical hierarchy</span>{selected.path.map((p,i)=><div key={i}>{p}</div>)}</div>}
      </section>:<div className="empty"><div className="targetIcon">＋</div><b>Select a structure</b><span>点击模型或搜索具体骨骼、肌肉、动脉、静脉。</span></div>}
      <div className="scope"><b>科研级 ≠ 医疗器械</b><p>数据来自开放解剖 atlas，并保留专业命名和结构层级。用于研究展示与教学；不作为诊断、影像分割或术前导航。</p></div>
    </aside>

    <footer><span>Male atlas: Z‑Anatomy / BodyParts3D derivatives · CC BY‑SA · Viewer implementation adapted from open Anatria3D asset conventions</span><span>v2 · High-detail systems</span></footer>
  </div>
}
createRoot(document.getElementById("root")).render(<App/>);
