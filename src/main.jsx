import React,{Suspense,memo,useCallback,useEffect,useMemo,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Canvas,useFrame,useThree}from"@react-three/fiber";
import{ContactShadows,OrbitControls,Outlines,useGLTF,useProgress}from"@react-three/drei";
import{EffectComposer,N8AO}from"@react-three/postprocessing";
import{RoomEnvironment}from"three/addons/environments/RoomEnvironment.js";
import*as THREE from"three";
import{
  cardioKind,
  displayName,
  effectiveOpacity,
  isConnective,
  lateralSignFromBoxes,
  pickFromStack,
  rankedSearch,
  stackFromIntersections,
  structureKind,
  tissueDepthBias,
  tissueFamily,
  viewDirection
}from"./anatomy.js";
import{colourVariation,qualityProfile,tissueVisual}from"./rendering.js";
import"./styles.css";

const APP_VERSION="4.0.0-rc.1";
const SOURCE_COMMIT="949ac80cc9763539afc48e60b5246132f00468db";
const BASE="https://raw.githubusercontent.com/Nurkan1/Anatria-3D/"+SOURCE_COMMIT+"/public/anatomy/";
const MANIFEST_URL=BASE+"manifest.json";
const SYSTEMS=[
  {id:"skeletal",zh:"骨骼",en:"Skeletal",file:"skeletal_male.glb"},
  {id:"muscular",zh:"肌肉",en:"Muscular",file:"muscular_male.glb"},
  {id:"cardiovascular",zh:"心血管",en:"Cardiovascular",file:"cardiovascular_male.glb"}
];
const SYSTEM_LABEL={skeletal:"Bone",muscular:"Muscle",cardiovascular:"Heart & vessels"};
const CYAN=new THREE.Color("#37d8e6");
const BLACK=new THREE.Color("#000000");
const NO_RAYCAST=()=>null;
const DEFAULT_RAYCAST=THREE.Mesh.prototype.raycast;

SYSTEMS.forEach(s=>useGLTF.preload(BASE+s.file,true));

function tissueColour(organ){
  const profile=tissueVisual(organ);
  const c=new THREE.Color(profile.hex);
  const drift=colourVariation(organ);
  if(drift.h||drift.s||drift.l){
    const hsl={h:0,s:0,l:0};
    c.getHSL(hsl);
    c.setHSL(
      (hsl.h+drift.h+1)%1,
      Math.min(Math.max(hsl.s+drift.s,0),1),
      Math.min(Math.max(hsl.l+drift.l,.04),.96)
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

function SceneEnvironment(){
  const{gl,scene}=useThree();
  useEffect(()=>{
    const pmrem=new THREE.PMREMGenerator(gl);
    const room=new RoomEnvironment();
    const texture=pmrem.fromScene(room,.04).texture;
    scene.environment=texture;
    return()=>{
      if(scene.environment===texture)scene.environment=null;
      texture.dispose();
      pmrem.dispose();
    };
  },[gl,scene]);
  return null;
}

const OrganMesh=memo(function OrganMesh({
  entry,organ,visible,layerOpacity,connectiveMode,selected,isolated,
  onPick,onIsolate,onHover,onHide,registerBox
}){
  const materialRef=useRef(null);
  const profile=useMemo(()=>tissueVisual(organ),[organ]);
  const base=useMemo(()=>tissueColour(organ),[organ]);
  const shown=useMemo(()=>selected&&!isolated?base.clone().lerp(CYAN,.34):base,[base,selected,isolated]);
  const naturalOpacity=effectiveOpacity(organ,layerOpacity,connectiveMode);
  const opacity=isolated?1:selected?Math.max(naturalOpacity,.68):naturalOpacity;
  const ghosted=opacity<.995;
  const depthBias=tissueDepthBias(organ);
  const family=tissueFamily(organ);

  useEffect(()=>{registerBox(organ.organ_id,entry.box)},[registerBox,organ.organ_id,entry.box]);
  useEffect(()=>{
    if(materialRef.current)materialRef.current.needsUpdate=true;
  },[ghosted]);

  const idsFrom=e=>stackFromIntersections(e.intersections,12);
  const userData=useMemo(()=>({organId:organ.organ_id}),[organ.organ_id]);

  return <mesh
    geometry={entry.geometry}
    matrix={entry.matrix}
    matrixAutoUpdate={false}
    visible={visible}
    userData={userData}
    raycast={visible?DEFAULT_RAYCAST:NO_RAYCAST}
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
    <meshPhysicalMaterial
      ref={materialRef}
      color={shown}
      emissive={selected?CYAN:BLACK}
      emissiveIntensity={selected?(isolated?.035:.085):0}
      roughness={profile.roughness}
      metalness={profile.metalness}
      clearcoat={profile.clearcoat}
      clearcoatRoughness={profile.clearcoatRoughness}
      sheen={profile.sheen}
      sheenColor={profile.sheenHex}
      sheenRoughness={profile.sheenRoughness}
      envMapIntensity={family==="muscle"?.72:.86}
      transparent={ghosted}
      opacity={opacity}
      depthWrite={!ghosted}
      polygonOffset={depthBias!==0}
      polygonOffsetFactor={depthBias}
      polygonOffsetUnits={depthBias}
      side={THREE.FrontSide}
    />
    {selected&&<Outlines thickness={1.25} screenspace color="#69e8ef" transparent opacity={.48}/>}
  </mesh>;
});

const SystemModel=memo(function SystemModel({
  file,organs,enabled,opacity,selectedId,isolateId,contextMode,cardioParts,connectiveMode,hiddenIds,
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
      const connectiveAllowed=connectiveMode!=="hide"||!isConnective(o)||o.organ_id===selectedId||o.organ_id===isolateId;
      const contextVisible=!isolateId||o.organ_id===isolateId||(contextMode&&o.system==="skeletal");
      const systemEnabled=enabled||(contextMode&&Boolean(isolateId)&&o.system==="skeletal");
      const visible=systemEnabled&&cardioVisible&&connectiveAllowed&&!hidden.has(o.organ_id)&&contextVisible;
      const contextOpacity=contextMode&&isolateId&&o.system==="skeletal"&&o.organ_id!==isolateId?.18:opacity;
      return <OrganMesh
        key={o.organ_id}
        entry={entry}
        organ={o}
        visible={visible}
        layerOpacity={contextOpacity}
        connectiveMode={connectiveMode}
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
    <hemisphereLight intensity={.32} color="#d8ebee" groundColor="#16100f"/>
    <ambientLight intensity={.09}/>
    <directionalLight ref={key} intensity={1.85}/>
    <directionalLight ref={fill} intensity={.58} color="#b9d8e9"/>
    <directionalLight ref={rim} intensity={.88} color="#9ed7ee"/>
    <directionalLight position={[0,-4,2]} intensity={.18} color="#ffd9c5"/>
  </>;
}

function RenderEffects({mode}){
  const q=qualityProfile(mode);
  if(!q.ao)return null;
  return <EffectComposer multisampling={mode==="quality"?4:0}>
    <N8AO
      aoRadius={.038}
      distanceFalloff={1}
      intensity={1.85}
      quality={q.aoQuality}
      aoSamples={q.aoSamples}
      denoiseSamples={q.denoiseSamples}
      denoiseRadius={10}
      halfRes={q.halfRes}
      depthAwareUpsampling
    />
  </EffectComposer>;
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
  manifest,layers,opacities,selectedId,isolateId,contextMode,cardioParts,connectiveMode,hiddenIds,renderQuality,
  onPick,onIsolate,onHover,onHide,onClearSelection,focusRequest,viewRequest,onLoaded,onCanvasReady
}){
  const controlsRef=useRef();
  const boxesRef=useRef(new Map());
  const q=qualityProfile(renderQuality);
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
    dpr={[1,q.dprMax]}
    gl={{antialias:true,powerPreference:"high-performance",preserveDrawingBuffer:true,alpha:true}}
    onPointerMissed={onClearSelection}
    onCreated={({gl})=>{
      gl.outputColorSpace=THREE.SRGBColorSpace;
      gl.toneMapping=THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure=1.06;
      gl.setClearColor("#071217",0);
      onCanvasReady(gl.domElement);
    }}
  >
    <SceneEnvironment/>
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
        contextMode={contextMode}
        cardioParts={cardioParts}
        connectiveMode={connectiveMode}
        hiddenIds={hiddenIds}
        onPick={onPick}
        onIsolate={onIsolate}
        onHover={onHover}
        onHide={onHide}
        registerBox={registerBox}
        onReady={onLoaded}
      />)}
      <ContactShadows frames={1} position={[0,-.015,0]} opacity={.18} scale={3.3} blur={2.8} far={2.5} resolution={renderQuality==="quality"?1024:640}/>
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
    <RenderEffects mode={renderQuality}/>
  </Canvas>;
});

function App(){
  const[manifest,setManifest]=useState(null);
  const[error,setError]=useState("");
  const[selectedId,setSelectedId]=useState(null);
  const[isolateId,setIsolateId]=useState(null);
  const[contextMode,setContextMode]=useState(false);
  const[query,setQuery]=useState("");
  const[focusRequest,setFocusRequest]=useState(null);
  const[viewRequest,setViewRequest]=useState(null);
  const[layers,setLayers]=useState({skeletal:true,muscular:true,cardiovascular:true});
  const[opacities,setOpacities]=useState({skeletal:.92,muscular:1,cardiovascular:1});
  const[cardioParts,setCardioParts]=useState({artery:true,vein:true,heart:true,other:true});
  const[connectiveMode,setConnectiveMode]=useState("natural");
  const[smartMuscle,setSmartMuscle]=useState(true);
  const[renderQuality,setRenderQuality]=useState("quality");
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
  const chooseFromStack=useCallback(ids=>pickFromStack(ids,organMap,{smartMuscle,opacities,connectiveMode}),[organMap,smartMuscle,opacities,connectiveMode]);

  const pick=useCallback(ids=>{
    const id=chooseFromStack(ids);
    if(!id)return;
    setStackIds(ids);setSelectedId(id);setRightOpen(true);
  },[chooseFromStack]);

  const isolateStack=useCallback(ids=>{
    const id=chooseFromStack(ids);
    if(!id)return;
    setStackIds(ids);setSelectedId(id);setIsolateId(id);setContextMode(false);
    setFocusRequest({id,seq:Date.now()});setRightOpen(true);
  },[chooseFromStack]);

  const hideStack=useCallback(ids=>{
    const id=chooseFromStack(ids);
    if(!id)return;
    setHiddenIds(prev=>prev.includes(id)?prev:[...prev,id]);
    setStackIds(ids);
    if(selectedId===id)setSelectedId(null);
    if(isolateId===id){setIsolateId(null);setContextMode(false)}
  },[chooseFromStack,selectedId,isolateId]);

  const hoverStack=useCallback((ids,x,y)=>{
    const id=chooseFromStack(ids);
    if(!id){setHover(null);return}
    setHover(prev=>prev&&prev.id===id&&Math.abs(prev.x-x)<2&&Math.abs(prev.y-y)<2?prev:{id,x,y});
  },[chooseFromStack]);

  const clearSelection=useCallback(()=>{setSelectedId(null);setStackIds([])},[]);
  const select=(id,focus=false)=>{
    setSelectedId(id);setStackIds([id]);
    if(focus)setFocusRequest({id,seq:Date.now()});
    setRightOpen(true);
  };
  const isolate=id=>{
    if(!id)return;
    setSelectedId(id);setIsolateId(id);setContextMode(false);
    setFocusRequest({id,seq:Date.now()});
  };
  const contextStudy=id=>{
    if(!id)return;
    setSelectedId(id);setIsolateId(id);setContextMode(true);
    setFocusRequest({id,seq:Date.now()});
  };
  const showAll=()=>{setIsolateId(null);setContextMode(false)};
  const hideSelected=()=>{
    if(!selectedId)return;
    setHiddenIds(prev=>prev.includes(selectedId)?prev:[...prev,selectedId]);
    setSelectedId(null);setIsolateId(null);setContextMode(false);
  };
  const undoHide=()=>setHiddenIds(prev=>prev.slice(0,-1));
  const restoreHidden=()=>setHiddenIds([]);
  const requestView=(kind,view)=>setViewRequest({kind,view,seq:Date.now()});
  const handleLoaded=useCallback((file,count)=>setLoaded(prev=>prev[file]===count?prev:{...prev,[file]:count}),[]);
  const handleCanvasReady=useCallback(canvas=>{canvasRef.current=canvas},[]);
  const loadedCount=Object.keys(loaded).length;

  const applyPreset=name=>{
    showAll();
    if(name==="combined"){
      setLayers({skeletal:true,muscular:true,cardiovascular:true});
      setOpacities({skeletal:.92,muscular:1,cardiovascular:1});
      setConnectiveMode("natural");
    }
    if(name==="muscle"){
      setLayers({skeletal:true,muscular:true,cardiovascular:false});
      setOpacities({skeletal:.34,muscular:1,cardiovascular:1});
      setConnectiveMode("natural");
    }
    if(name==="attachments"){
      setLayers({skeletal:true,muscular:true,cardiovascular:false});
      setOpacities({skeletal:.62,muscular:1,cardiovascular:1});
      setConnectiveMode("natural");
    }
    if(name==="dissection"){
      setLayers({skeletal:true,muscular:true,cardiovascular:false});
      setOpacities({skeletal:.22,muscular:1,cardiovascular:1});
      setConnectiveMode("hide");
    }
    if(name==="angio"){
      setLayers({skeletal:true,muscular:true,cardiovascular:true});
      setOpacities({skeletal:.14,muscular:.10,cardiovascular:1});
      setConnectiveMode("hide");
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
      if(k==="escape"){showAll();setSelectedId(null);setStackIds([])}
      else if(k==="f"&&selectedId)setFocusRequest({id:selectedId,seq:Date.now()});
      else if(k==="i"&&selectedId)isolate(selectedId);
      else if(k==="c"&&selectedId)contextStudy(selectedId);
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
      <button className="resetButton" onClick={()=>{setSelectedId(null);showAll();setHiddenIds([]);setStackIds([]);requestView("fit")}}>Reset</button>
    </header>

    {drawerOpen&&<button className="drawerBackdrop" aria-label="Close panels" onClick={()=>{setLeftOpen(false);setRightOpen(false)}}/>}

    <aside className="left">
      <div className="asideTop"><div><small>VIEW PRESETS</small><h2>显示模式</h2></div><button className="drawerClose" onClick={()=>setLeftOpen(false)}>×</button></div>
      <div className="presets six">
        <button onClick={()=>applyPreset("combined")}>Combined</button>
        <button onClick={()=>applyPreset("muscle")}>Muscle study</button>
        <button onClick={()=>applyPreset("attachments")}>Attachments</button>
        <button onClick={()=>applyPreset("dissection")}>Dissection</button>
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
          <div className="toolLine"><span>筋膜 / 肌腱</span><em>{counts.connective}</em></div>
          <div className="segmented">
            {[["natural","Natural"],["ghost","Ghost"],["hide","Hide"]].map(([id,label])=><button className={connectiveMode===id?"on":""} key={id} onClick={()=>setConnectiveMode(id)}>{label}</button>)}
          </div>
          <label><input type="checkbox" checked={smartMuscle} onChange={e=>setSmartMuscle(e.target.checked)}/><span>Smart muscle pick</span><em>推荐</em></label>
        </div>}
        {s.id==="cardiovascular"&&<div className="subfilters">
          {[["artery","动脉"],["vein","静脉"],["heart","心脏"]].map(([id,label])=><button className={cardioParts[id]?"on":""} key={id} onClick={()=>setCardioParts(v=>({...v,[id]:!v[id]}))}>{label}</button>)}
        </div>}
      </div>)}

      <div className="renderCard">
        <div className="toolLine"><span>RENDER QUALITY</span><em>{renderQuality}</em></div>
        <div className="segmented">
          {[["performance","Fast"],["balanced","Balanced"],["quality","Quality"]].map(([id,label])=><button className={renderQuality===id?"on":""} key={id} onClick={()=>setRenderQuality(id)}>{label}</button>)}
        </div>
        <p>Quality 开启环境光照与屏幕空间 AO，增强肌腹、肌腱、骨性标志之间的深度分离。</p>
      </div>

      <div className="interactionCard">
        <small>INTERACTION</small>
        <p><b>单击</b>识别　<b>双击</b>隔离　<b>右键</b>剥离</p>
        <p><b>Context</b>保留骨架作为肌肉附着参照。</p>
        <p>Smart pick 会穿过半透明筋膜，优先选择其下的真实肌腹。</p>
      </div>

      <div className="dataCard"><b>数据与命名</b><p>男性 atlas 为 Z‑Anatomy / BodyParts3D 衍生网格；TA2 Latin + clinical English。筋膜薄片采用独立透明度和深度偏移，避免与肌腹共面时发生 z-fighting。</p><dl><div><dt>Male atlas</dt><dd>3,478 structures</dd></div><div><dt>Mesh reduction</dt><dd>No polygon reduction*</dd></div><div><dt>License</dt><dd>CC BY-SA 4.0</dd></div></dl><p className="tiny">* 上游 GLB 使用 Draco 量化压缩。</p></div>
    </aside>

    <main onPointerLeave={()=>setHover(null)}>
      <div className="search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search pectoral fascia / pectoralis major / tendon / femur / aorta / TA2 Latin…"/>{query&&<div className="results">{results.map(o=><button key={o.organ_id} onClick={()=>{select(o.organ_id,true);setQuery("")}}><b>{displayName(o)}</b><span>{o.ta2_latin} · {structureKind(o)}</span></button>)}{!results.length&&<p>No matching structure</p>}</div>}</div>

      <div className="viewer">
        {manifest&&!error?<AtlasErrorBoundary><Viewer
          manifest={manifest}
          layers={layers}
          opacities={opacities}
          selectedId={selectedId}
          isolateId={isolateId}
          contextMode={contextMode}
          cardioParts={cardioParts}
          connectiveMode={connectiveMode}
          hiddenIds={hiddenIds}
          renderQuality={renderQuality}
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
          <button className={isolateId===selected.organ_id&&!contextMode?"on":""} onClick={()=>isolateId===selected.organ_id&&!contextMode?showAll():isolate(selected.organ_id)}>Isolate</button>
          <button className={isolateId===selected.organ_id&&contextMode?"on":""} onClick={()=>isolateId===selected.organ_id&&contextMode?showAll():contextStudy(selected.organ_id)}>Context</button>
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
      <div className="hud">Click identify · Double-click isolate · Right-click peel · C context · A/P/L/R/S views · F focus · I isolate · H hide</div>
    </main>

    <aside className="right">
      <div className="asideTop"><div><small>STRUCTURE INSPECTOR</small><h2>结构信息</h2></div><button className="drawerClose" onClick={()=>setRightOpen(false)}>×</button></div>
      {selected?<section className="inspect">
        <div className="systemBadge">{structureKind(selected)}</div>
        <h3>{displayName(selected)}</h3>
        <p className="latin">{selected.ta2_latin}</p>
        <code>{selected.organ_id}</code>
        <div className="actions five">
          <button onClick={()=>setFocusRequest({id:selected.organ_id,seq:Date.now()})}>Focus</button>
          <button className={isolateId===selected.organ_id&&!contextMode?"on":""} onClick={()=>isolate(selected.organ_id)}>Isolate</button>
          <button className={isolateId===selected.organ_id&&contextMode?"on":""} onClick={()=>contextStudy(selected.organ_id)}>Context</button>
          <button onClick={hideSelected}>Peel</button>
          <button onClick={showAll}>All</button>
        </div>
        <div className="meta">
          <p><span>System</span><b>{selected.system}</b></p>
          <p><span>Type</span><b>{structureKind(selected)}</b></p>
          <p><span>Tissue</span><b>{tissueFamily(selected)}</b></p>
          <p><span>Mesh</span><b>{selected.mesh_file}</b></p>
        </div>
        {selected.path?.length>0&&<div className="path"><span>Anatomical hierarchy</span>{selected.path.map((p,i)=><div key={i}>{p}</div>)}</div>}
      </section>:<div className="empty"><div className="targetIcon">＋</div><b>Select a structure</b><span>点击模型、双击隔离，或搜索具体骨骼、肌肉、筋膜、肌腱、动脉和静脉。</span></div>}

      {stack.length>1&&<section className="depthStack"><div className="panelHeading"><span>DEPTH STACK</span><b>光标射线下的结构</b></div>{stack.map((o,i)=><button className={o.organ_id===selectedId?"on":""} key={o.organ_id} onClick={()=>select(o.organ_id,false)}><i>{i+1}</i><span><b>{displayName(o)}</b><em>{structureKind(o)}</em></span></button>)}</section>}

      <section className="hiddenPanel">
        <div><span>Hidden / peeled</span><b>{hiddenIds.length}</b></div>
        <div className="hiddenActions"><button disabled={!hiddenIds.length} onClick={undoHide}>Undo last</button><button disabled={!hiddenIds.length} onClick={restoreHidden}>Restore all</button></div>
      </section>

      <div className="scope"><b>研究/教学可视化边界</b><p>网格与专业命名来自开放解剖数据。v4 改进渲染，不补画源数据不存在的结构；因此视觉完整度仍受 Z‑Anatomy / BodyParts3D 原始几何覆盖限制。</p></div>
    </aside>

    <footer><span>BodyParts3D → Z‑Anatomy → Anatria3D GLB adaptations · male assets CC BY‑SA 4.0 · source pinned {SOURCE_COMMIT.slice(0,8)}</span><span>v{APP_VERSION}</span></footer>
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);

if("serviceWorker"in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register(import.meta.env.BASE_URL+"sw.js").catch(error=>{
      console.warn("[atlas] service worker registration failed",error);
    });
  });
}
