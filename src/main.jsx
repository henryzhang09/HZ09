import React,{Suspense,memo,useCallback,useEffect,useMemo,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Canvas,useFrame,useThree}from"@react-three/fiber";
import{ContactShadows,OrbitControls,useGLTF,useProgress}from"@react-three/drei";
import*as THREE from"three";
import{
  cardioKind,
  displayName,
  isConnective,
  lateralSignFromBoxes,
  pickFromStack,
  rankedSearch,
  stackFromIntersections,
  structureKind,
  viewDirection
}from"./anatomy.js";
import"./styles.css";

const APP_VERSION="3.0.0";
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

SYSTEMS.forEach(s=>useGLTF.preload(BASE+s.file,true));

function hash(text){
  let value=0x811c9dc5;
  for(let i=0;i<text.length;i+=1){value^=text.charCodeAt(i);value=Math.imul(value,0x01000193)}
  return value>>>0;
}
function spread(seed,shift){return(((seed>>>shift)&255)/128)-1}
function tissueColour(o){
  let hex=SYSTEM_BASE[o.system]||"#b8b8b8";
  const kind=structureKind(o);
  if(kind==="Vein")hex="#4a6ea8";
  else if(kind==="Artery")hex="#c0392f";
  else if(kind==="Heart")hex="#a63f42";
  else if(kind==="Fascia / tendon")hex="#ded3bd";
  const c=new THREE.Color(hex);
  if(o.system!=="cardiovascular"&&kind!=="Fascia / tendon"){
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

class AtlasErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null}}
  static getDerivedStateFromError(error){return{error}}
  componentDidCatch(error,info){console.error("[atlas]",error,info)}
  render(){
    if(this.state.error)return <div className="fatal"><b>3D atlas failed to render</b><span>{this.state.error?.message||String(this.state.error)}</span><button onClick={()=>location.reload()}>Reload viewer</button></div>;
    return this.props.children;
  }
}

const OrganMesh=memo(function OrganMesh({
  entry,organ,visible,opacity,selected,isolated,onPick,onIsolate,onHover,onHide,registerBox
}){
  const base=useMemo(()=>tissueColour(organ),[organ]);
  const shown=useMemo(()=>selected&&!isolated?base.clone().lerp(CYAN,.38):base,[base,selected,isolated]);
  const ghost=opacity<.995;
  useEffect(()=>{registerBox(organ.organ_id,entry.box)},[registerBox,organ.organ_id,entry.box]);

  const idsFrom=e=>stackFromIntersections(e.intersections,12);
  return <mesh
    geometry={entry.geometry}
    matrix={entry.matrix}
    matrixAutoUpdate={false}
    visible={visible}
    userData={{organId:organ.organ_id}}
    renderOrder={organ.system==="cardiovascular"?3:organ.system==="muscular"?2:1}
    onPointerMove={e=>{
      e.stopPropagation();
      const n=e.nativeEvent;
      onHover(idsFrom(e),n.offsetX??n.clientX,n.offsetY??n.clientY);
    }}
    onClick={e=>{e.stopPropagation();onPick(idsFrom(e))}}
    onDoubleClick={e=>{e.stopPropagation();onIsolate(idsFrom(e))}}
    onContextMenu={e=>{
      e.stopPropagation();
      e.nativeEvent?.preventDefault?.();
      onHide(idsFrom(e));
    }}
  >
    <meshStandardMaterial
      color={shown}
      emissive={selected?CYAN:BLACK}
      emissiveIntensity={selected?(isolated?.05:.12):0}
      roughness={ROUGHNESS[organ.system]??.55}
      metalness={.02}
      transparent={ghost}
      opacity={opacity}
      depthWrite={!ghost||opacity>.76}
      side={THREE.FrontSide}
    />
  </mesh>;
});

const SystemModel=memo(function SystemModel({
  file,organs,enabled,opacity,selectedId,isolateId,cardioParts,connectiveVisible,hiddenIds,
  onPick,onIsolate,onHover,onHide,registerBox,onReady
}){
  const url=BASE+file;
  const{nodes,scene}=useGLTF(url,true);
  const hidden=useMemo(()=>new Set(hiddenIds),[hiddenIds]);

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
      const cvKind=cardioKind(o);
      const cardioVisible=o.system!=="cardiovascular"||cardioParts[cvKind]!==false;
      const connectiveAllowed=o.system!=="muscular"||connectiveVisible||!isConnective(o)||o.organ_id===selectedId||o.organ_id===isolateId;
      const visible=enabled&&cardioVisible&&connectiveAllowed&&!hidden.has(o.organ_id)&&(!isolateId||o.organ_id===isolateId);
      const op=o.organ_id===selectedId?1:opacity;
      return <OrganMesh
        key={o.organ_id}
        entry={entry}
        organ={o}
        visible={visible}
        opacity={op}
        selected={selectedId===o.organ_id}
        isolated={isolateId===o.organ_id}
        onPick={onPick}
        onIsolate={onIsolate}
        onHover={onHover}
        onHide={onHide}
        registerBox={registerBox}
      />;
    })}
  </group>;
});

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
    <ambientLight intensity={.15}/>
    <directionalLight ref={key} intensity={2.15}/>
    <directionalLight ref={fill} intensity={.72} color="#b7d8ee"/>
    <directionalLight ref={rim} intensity={1.05} color="#a6e1ff"/>
    <directionalLight position={[0,-4,2]} intensity={.24} color="#ffd8c0"/>
  </>;
}

function unionBoxes(boxes,ids){
  const result=new THREE.Box3();
  let found=false;
  if(ids?.length){
    for(const id of ids){
      const b=boxes.get(id);
      if(!b)continue;
      result.union(b);found=true;
    }
  }else{
    for(const b of boxes.values()){result.union(b);found=true}
  }
  return found?result:null;
}

function CameraDirector({controlsRef,boxesRef,focusRequest,viewRequest,isolateId,allIds}){
  const{camera,invalidate}=useThree();
  const desired=useRef(null);

  const frame=useCallback((box,direction=null)=>{
    const c=controlsRef.current;if(!c||!box||box.isEmpty())return;
    const centre=box.getCenter(new THREE.Vector3());
    const size=box.getSize(new THREE.Vector3());
    const radius=Math.max(size.x,size.y,size.z,.008)*.5;
    const distance=Math.max((radius*2.35)/Math.tan((camera.fov*Math.PI)/360),.12);
    const dir=direction?new THREE.Vector3(...direction).normalize():camera.position.clone().sub(c.target).normalize();
    desired.current={target:centre,position:centre.clone().add(dir.multiplyScalar(distance))};
    invalidate();
  },[camera,controlsRef,invalidate]);

  useEffect(()=>{
    if(!focusRequest?.id)return;
    frame(boxesRef.current.get(focusRequest.id));
  },[focusRequest,frame,boxesRef]);

  useEffect(()=>{
    if(!viewRequest)return;
    const box=isolateId?boxesRef.current.get(isolateId):unionBoxes(boxesRef.current);
    if(!box)return;
    if(viewRequest.kind==="fit")frame(box);
    else{
      const sign=lateralSignFromBoxes(allIds,boxesRef.current);
      frame(box,viewDirection(viewRequest.view,sign));
    }
  },[viewRequest,isolateId,allIds,frame,boxesRef]);

  useFrame((_,delta)=>{
    const c=controlsRef.current,d=desired.current;
    if(!c||!d)return;
    const a=1-Math.pow(.004,delta);
    c.target.lerp(d.target,a);
    camera.position.lerp(d.position,a);
    c.update();
    if(c.target.distanceToSquared(d.target)<1e-8&&camera.position.distanceToSquared(d.position)<1e-8){
      c.target.copy(d.target);camera.position.copy(d.position);c.update();desired.current=null;
    }else invalidate();
  });
  return null;
}

const Viewer=memo(function Viewer({
  manifest,layers,opacities,selectedId,isolateId,cardioParts,connectiveVisible,hiddenIds,
  onPick,onIsolate,onHover,onHide,onClearSelection,focusRequest,viewRequest,onLoaded,onCanvasReady
}){
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
  const allIds=useMemo(()=>[...byFile.values()].flat().map(o=>o.organ_id),[byFile]);
  const registerBox=useCallback((id,box)=>boxesRef.current.set(id,box),[]);

  return <Canvas
    frameloop="demand"
    camera={{position:[0,.93,3.35],fov:29,near:.001,far:100}}
    dpr={[1,1.8]}
    gl={{antialias:true,powerPreference:"high-performance",preserveDrawingBuffer:true}}
    onPointerMissed={onClearSelection}
    onCreated={({gl})=>{
      gl.outputColorSpace=THREE.SRGBColorSpace;
      gl.toneMapping=THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure=1.12;
      gl.setClearColor("#071217",0);
      onCanvasReady(gl.domElement);
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
        connectiveVisible={connectiveVisible}
        hiddenIds={hiddenIds}
        onPick={onPick}
        onIsolate={onIsolate}
        onHover={onHover}
        onHide={onHide}
        registerBox={registerBox}
        onReady={onLoaded}
      />)}
      <ContactShadows frames={1} position={[0,-.015,0]} opacity={.22} scale={3.3} blur={2.6} far={2.5} resolution={768}/>
    </Suspense>
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={.075}
      zoomToCursor
      screenSpacePanning
      minDistance={.055}
      maxDistance={8}
      target={[0,.91,0]}
    />
    <CameraDirector
      controlsRef={controlsRef}
      boxesRef={boxesRef}
      focusRequest={focusRequest}
      viewRequest={viewRequest}
      isolateId={isolateId}
      allIds={allIds}
    />
  </Canvas>;
});

function App(){
  const[manifest,setManifest]=useState(null);
  const[error,setError]=useState("");
  const[selectedId,setSelectedId]=useState(null);
  const[isolateId,setIsolateId]=useState(null);
  const[query,setQuery]=useState("");
  const[focusRequest,setFocusRequest]=useState(null);
  const[viewRequest,setViewRequest]=useState(null);
  const[layers,setLayers]=useState({skeletal:true,muscular:true,cardiovascular:true});
  const[opacities,setOpacities]=useState({skeletal:.90,muscular:.76,cardiovascular:1});
  const[cardioParts,setCardioParts]=useState({artery:true,vein:true,heart:true,other:true});
  const[connectiveVisible,setConnectiveVisible]=useState(true);
  const[smartMuscle,setSmartMuscle]=useState(true);
  const[hiddenIds,setHiddenIds]=useState([]);
  const[stackIds,setStackIds]=useState([]);
  const[hover,setHover]=useState(null);
  const[loaded,setLoaded]=useState({});
  const[leftOpen,setLeftOpen]=useState(false);
  const[rightOpen,setRightOpen]=useState(false);
  const canvasRef=useRef(null);
  const{progress,active}=useProgress();

  useEffect(()=>{
    fetch(MANIFEST_URL)
      .then(r=>{if(!r.ok)throw new Error("Manifest HTTP "+r.status);return r.json()})
      .then(setManifest)
      .catch(e=>setError(e.message||"Manifest load failed"));
  },[]);

  const organs=useMemo(()=>manifest?manifest.organs.filter(o=>SYSTEMS.some(s=>s.id===o.system)):[],[manifest]);
  const organMap=useMemo(()=>new Map(organs.map(o=>[o.organ_id,o])),[organs]);
  const selected=selectedId?organMap.get(selectedId):null;
  const hovered=hover?.id?organMap.get(hover.id):null;
  const hiddenSet=useMemo(()=>new Set(hiddenIds),[hiddenIds]);

  const counts=useMemo(()=>{
    const c={skeletal:0,muscular:0,cardiovascular:0,connective:0};
    for(const o of organs){
      if(c[o.system]!==undefined)c[o.system]++;
      if(isConnective(o))c.connective++;
    }
    return c;
  },[organs]);
  const results=useMemo(()=>rankedSearch(organs,query,80),[query,organs]);

  const chooseFromStack=useCallback(ids=>pickFromStack(ids,organMap,{smartMuscle,opacities}),[organMap,smartMuscle,opacities]);

  const pick=useCallback(ids=>{
    const id=chooseFromStack(ids);
    if(!id)return;
    setStackIds(ids);
    setSelectedId(id);
    setRightOpen(true);
  },[chooseFromStack]);

  const isolateStack=useCallback(ids=>{
    const id=chooseFromStack(ids);
    if(!id)return;
    setStackIds(ids);
    setSelectedId(id);
    setIsolateId(id);
    setFocusRequest({id,seq:Date.now()});
    setRightOpen(true);
  },[chooseFromStack]);

  const hideStack=useCallback(ids=>{
    const id=chooseFromStack(ids);
    if(!id)return;
    setHiddenIds(prev=>prev.includes(id)?prev:[...prev,id]);
    setStackIds(ids);
    if(selectedId===id)setSelectedId(null);
    if(isolateId===id)setIsolateId(null);
  },[chooseFromStack,selectedId,isolateId]);

  const hoverStack=useCallback((ids,x,y)=>{
    const id=chooseFromStack(ids);
    if(!id){setHover(null);return}
    setHover(prev=>prev&&prev.id===id&&Math.abs(prev.x-x)<2&&Math.abs(prev.y-y)<2?prev:{id,x,y});
  },[chooseFromStack]);

  const clearSelection=useCallback(()=>{setSelectedId(null);setStackIds([])},[]);
  const select=(id,focus=false)=>{
    setSelectedId(id);
    setStackIds([id]);
    if(focus)setFocusRequest({id,seq:Date.now()});
    setRightOpen(true);
  };
  const isolate=id=>{
    if(!id)return;
    setSelectedId(id);
    setIsolateId(id);
    setFocusRequest({id,seq:Date.now()});
  };
  const showAll=()=>setIsolateId(null);
  const hideSelected=()=>{
    if(!selectedId)return;
    setHiddenIds(prev=>prev.includes(selectedId)?prev:[...prev,selectedId]);
    setSelectedId(null);setIsolateId(null);
  };
  const undoHide=()=>setHiddenIds(prev=>prev.slice(0,-1));
  const restoreHidden=()=>setHiddenIds([]);
  const requestView=(kind,view)=>setViewRequest({kind,view,seq:Date.now()});
  const handleLoaded=useCallback((file,count)=>setLoaded(prev=>prev[file]===count?prev:{...prev,[file]:count}),[]);
  const handleCanvasReady=useCallback(canvas=>{canvasRef.current=canvas},[]);
  const loadedCount=Object.keys(loaded).length;

  const applyPreset=name=>{
    setIsolateId(null);
    if(name==="combined"){
      setLayers({skeletal:true,muscular:true,cardiovascular:true});
      setOpacities({skeletal:.90,muscular:.76,cardiovascular:1});
      setConnectiveVisible(true);
    }
    if(name==="muscle"){
      setLayers({skeletal:true,muscular:true,cardiovascular:false});
      setOpacities({skeletal:.28,muscular:1,cardiovascular:1});
      setConnectiveVisible(false);
    }
    if(name==="angio"){
      setLayers({skeletal:true,muscular:true,cardiovascular:true});
      setOpacities({skeletal:.14,muscular:.10,cardiovascular:1});
      setConnectiveVisible(false);
    }
    if(name==="bone"){
      setLayers({skeletal:true,muscular:false,cardiovascular:false});
      setOpacities({skeletal:1,muscular:1,cardiovascular:1});
    }
  };

  const screenshot=()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const link=document.createElement("a");
    link.download="anatomy-atlas-"+new Date().toISOString().slice(0,10)+".png";
    link.href=canvas.toDataURL("image/png");
    link.click();
  };
  const fullscreen=()=>{
    const el=document.querySelector("main");
    if(!document.fullscreenElement)el?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  useEffect(()=>{
    const onKey=e=>{
      const tag=document.activeElement?.tagName;
      if(tag==="INPUT"||tag==="TEXTAREA")return;
      const k=e.key.toLowerCase();
      if(k==="escape"){setIsolateId(null);setSelectedId(null);setStackIds([])}
      else if(k==="f"&&selectedId)setFocusRequest({id:selectedId,seq:Date.now()});
      else if(k==="i"&&selectedId)isolate(selectedId);
      else if(k==="h"&&selectedId)hideSelected();
      else if(k==="0")requestView("fit");
      else if(["a","p","l","r","s"].includes(k)){
        const map={a:"anterior",p:"posterior",l:"left",r:"right",s:"superior"};
        requestView("orient",map[k]);
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[selectedId]);

  const stack=stackIds.map(id=>organMap.get(id)).filter(Boolean).filter(o=>!hiddenSet.has(o.organ_id)).slice(0,10);
  const drawerOpen=leftOpen||rightOpen;

  return <div className={"app "+(leftOpen?"leftOpen ":"")+(rightOpen?"rightOpen ":"")}>
    <header>
      <div className="brand"><b>ANATOMY ATLAS 3D</b><span>Z‑ANATOMY · TA2 NOMENCLATURE · RESEARCH VIEWER</span></div>
      <div className="status"><i className={loadedCount===3?"ok":""}/>{error?"Load error":loadedCount===3?organs.length.toLocaleString()+" structures indexed":"Loading atlas "+Math.round(progress||0)+"%"}</div>
      <div className="mobilePanelButtons"><button onClick={()=>{setLeftOpen(v=>!v);setRightOpen(false)}}>Layers</button><button onClick={()=>{setRightOpen(v=>!v);setLeftOpen(false)}}>Info</button></div>
      <button className="resetButton" onClick={()=>{setSelectedId(null);setIsolateId(null);setHiddenIds([]);setStackIds([]);requestView("fit")}}>Reset</button>
    </header>

    {drawerOpen&&<button className="drawerBackdrop" aria-label="Close panels" onClick={()=>{setLeftOpen(false);setRightOpen(false)}}/>}

    <aside className="left">
      <div className="asideTop"><div><small>VIEW PRESETS</small><h2>显示模式</h2></div><button className="drawerClose" onClick={()=>setLeftOpen(false)}>×</button></div>
      <div className="presets">
        <button onClick={()=>applyPreset("combined")}>Combined</button>
        <button onClick={()=>applyPreset("muscle")}>Muscle study</button>
        <button onClick={()=>applyPreset("angio")}>Angiography</button>
        <button onClick={()=>applyPreset("bone")}>Skeleton</button>
      </div>

      <div className="sectionTitle"><small>SYSTEM LAYERS</small><h2>解剖分层</h2></div>
      {SYSTEMS.map(s=><div className={"layerCard "+(layers[s.id]?"active":"")} key={s.id}>
        <button className="layerHead" onClick={()=>setLayers(v=>({...v,[s.id]:!v[s.id]}))}>
          <span><b>{s.zh}</b><em>{s.en} · {counts[s.id]?.toLocaleString()||"—"}</em></span><i/>
        </button>
        <div className="opacityRow"><span>Opacity</span><input aria-label={s.en+" opacity"} type="range" min=".05" max="1" step=".01" value={opacities[s.id]} onChange={e=>setOpacities(v=>({...v,[s.id]:Number(e.target.value)}))}/><b>{Math.round(opacities[s.id]*100)}%</b></div>
        {s.id==="muscular"&&<div className="muscleTools">
          <label><input type="checkbox" checked={connectiveVisible} onChange={e=>setConnectiveVisible(e.target.checked)}/><span>筋膜 / 肌腱</span><em>{counts.connective}</em></label>
          <label><input type="checkbox" checked={smartMuscle} onChange={e=>setSmartMuscle(e.target.checked)}/><span>Smart muscle pick</span><em>推荐</em></label>
        </div>}
        {s.id==="cardiovascular"&&<div className="subfilters">
          {[["artery","动脉"],["vein","静脉"],["heart","心脏"]].map(([id,label])=><button className={cardioParts[id]?"on":""} key={id} onClick={()=>setCardioParts(v=>({...v,[id]:!v[id]}))}>{label}</button>)}
        </div>}
      </div>)}

      <div className="interactionCard">
        <small>INTERACTION</small>
        <p><b>单击</b>识别结构　<b>双击</b>单独显示</p>
        <p><b>右键</b>逐层剥离　<b>滚轮</b>缩放</p>
        <p>Smart pick 会在表浅筋膜下优先选择真实肌腹；透明层会自动让位给深层实体。</p>
      </div>

      <div className="dataCard"><b>数据与命名</b><p>男性全身 atlas 采用 Z‑Anatomy / BodyParts3D 衍生网格；专业名称保留 TA2 Latin + clinical English。当前没有用机器翻译生成中文解剖名称。</p><dl><div><dt>Male atlas</dt><dd>3,478 structures</dd></div><div><dt>Mesh reduction</dt><dd>No polygon reduction*</dd></div><div><dt>License</dt><dd>CC BY-SA 4.0</dd></div></dl><p className="tiny">* 上游 GLB 使用 Draco 量化压缩；详见项目 attribution。</p></div>
    </aside>

    <main onPointerLeave={()=>setHover(null)}>
      <div className="search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search deltoid / gluteus medius / femur / aorta / vena cava / TA2 Latin…"/>{query&&<div className="results">{results.map(o=><button key={o.organ_id} onClick={()=>{select(o.organ_id,true);setQuery("")}}><b>{displayName(o)}</b><span>{o.ta2_latin} · {structureKind(o)}</span></button>)}{!results.length&&<p>No matching structure</p>}</div>}</div>

      <div className="viewer">
        {manifest&&!error?<AtlasErrorBoundary><Viewer
          manifest={manifest}
          layers={layers}
          opacities={opacities}
          selectedId={selectedId}
          isolateId={isolateId}
          cardioParts={cardioParts}
          connectiveVisible={connectiveVisible}
          hiddenIds={hiddenIds}
          onPick={pick}
          onIsolate={isolateStack}
          onHover={hoverStack}
          onHide={hideStack}
          onClearSelection={clearSelection}
          focusRequest={focusRequest}
          viewRequest={viewRequest}
          onLoaded={handleLoaded}
          onCanvasReady={handleCanvasReady}
        /></AtlasErrorBoundary>:<div className={"loading "+(error?"error":"")}>{error||"Loading TA2 anatomy manifest…"}</div>}
      </div>

      {selected&&<div className="selectionDock">
        <div className="selectionText">
          <span>{structureKind(selected)} · {SYSTEM_LABEL[selected.system]}</span>
          <b>{displayName(selected)}</b>
          <em>{selected.ta2_latin}</em>
        </div>
        <div className="selectionActions">
          <button onClick={()=>setFocusRequest({id:selected.organ_id,seq:Date.now()})}>Focus</button>
          <button className={isolateId===selected.organ_id?"on":""} onClick={()=>isolateId===selected.organ_id?showAll():isolate(selected.organ_id)}>{isolateId===selected.organ_id?"Show all":"Isolate"}</button>
          <button onClick={hideSelected}>Peel</button>
          <button className="close" onClick={()=>{setSelectedId(null);setStackIds([])}}>×</button>
        </div>
      </div>}

      {hovered&&<div className="hoverLabel" style={{left:hover.x+14,top:hover.y+14}}>
        <b>{displayName(hovered)}</b><span>{structureKind(hovered)} · {hovered.ta2_latin}</span>
      </div>}

      <div className="viewBar">
        <button title="Fit whole model (0)" onClick={()=>requestView("fit")}>FIT</button>
        {[["A","anterior"],["P","posterior"],["L","left"],["R","right"],["S","superior"]].map(([label,view])=><button key={view} title={view} onClick={()=>requestView("orient",view)}>{label}</button>)}
        <span/>
        <button title="Export current viewport as PNG" onClick={screenshot}>PNG</button>
        <button title="Fullscreen" onClick={fullscreen}>⛶</button>
      </div>

      {manifest&&(active||loadedCount<3)&&!error&&<div className="loadingOverlay"><div className="spinner"/><b>Loading high-detail geometry</b><span>{Math.round(progress||0)}% · 骨骼 / 肌肉 / 心血管</span></div>}
      <div className="hud">Click identify · Double-click isolate · Right-click peel · A/P/L/R/S views · F focus · I isolate · H hide</div>
    </main>

    <aside className="right">
      <div className="asideTop"><div><small>STRUCTURE INSPECTOR</small><h2>结构信息</h2></div><button className="drawerClose" onClick={()=>setRightOpen(false)}>×</button></div>
      {selected?<section className="inspect">
        <div className="systemBadge">{structureKind(selected)}</div>
        <h3>{displayName(selected)}</h3>
        <p className="latin">{selected.ta2_latin}</p>
        <code>{selected.organ_id}</code>
        <div className="actions four">
          <button onClick={()=>setFocusRequest({id:selected.organ_id,seq:Date.now()})}>Focus</button>
          <button className={isolateId===selected.organ_id?"on":""} onClick={()=>isolateId===selected.organ_id?showAll():isolate(selected.organ_id)}>Isolate</button>
          <button onClick={hideSelected}>Peel</button>
          <button onClick={showAll}>All</button>
        </div>
        <div className="meta">
          <p><span>System</span><b>{selected.system}</b></p>
          <p><span>Type</span><b>{structureKind(selected)}</b></p>
          <p><span>Mesh</span><b>{selected.mesh_file}</b></p>
          <p><span>TA2</span><b>professional nomenclature</b></p>
        </div>
        {selected.path?.length>0&&<div className="path"><span>Anatomical hierarchy</span>{selected.path.map((p,i)=><div key={i}>{p}</div>)}</div>}
      </section>:<div className="empty"><div className="targetIcon">＋</div><b>Select a structure</b><span>点击模型、双击隔离，或搜索具体骨骼、肌肉、动脉、静脉。</span></div>}

      {stack.length>1&&<section className="depthStack"><div className="panelHeading"><span>DEPTH STACK</span><b>光标射线下的结构</b></div>{stack.map((o,i)=><button className={o.organ_id===selectedId?"on":""} key={o.organ_id} onClick={()=>select(o.organ_id,false)}><i>{i+1}</i><span><b>{displayName(o)}</b><em>{structureKind(o)}</em></span></button>)}</section>}

      <section className="hiddenPanel">
        <div><span>Hidden / peeled</span><b>{hiddenIds.length}</b></div>
        <div className="hiddenActions"><button disabled={!hiddenIds.length} onClick={undoHide}>Undo last</button><button disabled={!hiddenIds.length} onClick={restoreHidden}>Restore all</button></div>
      </section>

      <div className="scope"><b>研究/教学可视化边界</b><p>网格和专业命名来自开放解剖数据，不是 AI 生成几何。该站点不是医疗器械，不用于诊断、影像分割、手术导航或个体患者决策。</p></div>
    </aside>

    <footer><span>BodyParts3D → Z‑Anatomy → Anatria3D GLB adaptations · male assets CC BY‑SA 4.0 · source pinned {SOURCE_COMMIT.slice(0,8)}</span><span>v{APP_VERSION}</span></footer>
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
