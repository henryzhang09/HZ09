import React,{useEffect,useMemo,useState}from"react";
import{createRoot}from"react-dom/client";
import{createOfficialHumanAtlas}from"@vixotic/vanatome-atlas";
import{VanatomeViewer,useVanatomeController}from"@vixotic/vanatome-react";
import"./styles.css";

const loader=createOfficialHumanAtlas({catalogUrl:"https://atlas.vanatome.vixotic.in/releases/1.4.0/catalog.json"});
const SYSTEMS=[
{id:"skeletal",zh:"骨骼",en:"Skeletal"},
{id:"muscular",zh:"肌肉",en:"Muscular"},
{id:"cardiovascular",zh:"心血管",en:"Cardiovascular"}
];

function App(){
 const[atlas,setAtlas]=useState(null),[err,setErr]=useState(""),[q,setQ]=useState(""),[mode,setMode]=useState("normal"),[ready,setReady]=useState(false),[progress,setProgress]=useState(0);
 const v=useVanatomeController(["skeletal","muscular","cardiovascular"]);
 useEffect(()=>{loader.loadProfile("full-body").then(({atlas})=>setAtlas(atlas)).catch(e=>setErr(e?.message||"Atlas failed to load"));},[]);
 const structures=atlas?.structures||[];
 const selected=useMemo(()=>structures.find(x=>x.id===v.selectedId)||null,[structures,v.selectedId]);
 const results=useMemo(()=>{const s=q.trim().toLowerCase();if(!s)return[];return structures.filter(x=>[x.name,x.id,x.system,x.layer,x.kind,...(x.aliases||[])].filter(Boolean).join(" ").toLowerCase().includes(s)).slice(0,60)},[q,structures]);
 return <div className="shell">
  <header><div className="brand"><b>ANATOMY ATLAS 3D</b><span>RESEARCH VIEWER · OPEN ANATOMY DATA</span></div><div className="status"><i className={ready?"ok":""}/>{ready?"3D atlas ready":atlas?"Loading geometry…":"Loading atlas…"} {progress>0&&progress<100?Math.round(progress)+"%":""}</div><button onClick={()=>{v.reset();setMode("normal");setQ("")}}>Reset</button></header>
  <aside className="left"><small>SYSTEM LAYERS</small><h2>系统分层</h2>{SYSTEMS.map(s=><button className={"layer "+(v.visibleLayers.includes(s.id)?"on":"")} onClick={()=>v.toggleLayer(s.id)} key={s.id}><span><b>{s.zh}</b><em>{s.en}</em></span><i/></button>)}<hr/><small>DISPLAY MODE</small><div className="modes">{["normal","xray","ghost"].map(x=><button className={mode===x?"on":""} onClick={()=>setMode(x)} key={x}>{x}</button>)}</div><div className="integrity"><b>数据完整性原则</b><p>模型几何不是 AI 生成。结构与命名来自 Z-Anatomy / BodyParts3D 衍生的 Vanatome atlas。</p></div><dl><div><dt>Curated entries</dt><dd>{atlas?structures.length:"—"}</dd></div><div><dt>Atlas</dt><dd>{atlas?.version||"1.4.0"}</dd></div></dl></aside>
  <main>
   <div className="search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索 femur / deltoid / artery / vein / anatomy ID…"/>{q&&<div className="results">{results.map(x=><button key={x.id} onClick={()=>{v.select(x.id);setQ("")}}><b>{x.name}</b><span>{x.system||x.layer||"structure"} · {x.id}</span></button>)}{!results.length&&<p>No matching structure</p>}</div>}</div>
   <div className="canvas">{!atlas&&!err?<div className="loading">Loading anatomical atlas…</div>:err?<div className="loading error">{err}</div>:<VanatomeViewer atlas={atlas} selectedId={v.selectedId} isolation={v.isolation} visibleLayers={v.visibleLayers} focusRequestKey={v.focusRequestKey} resetViewKey={v.resetViewKey} displayMode={mode} onSelect={v.select} onEscape={v.clear} onLoadProgress={({percentage})=>setProgress(percentage||0)} onReady={()=>setReady(true)} onError={e=>setErr(e?.message||"3D geometry failed to load")} enablePan focusPadding={1.25} style={{width:"100%",height:"100%"}}/>}</div>
   <div className="hud">Drag rotate · Wheel zoom · Right drag pan · Click select</div>
  </main>
  <aside className="right"><small>STRUCTURE INSPECTOR</small><h2>结构信息</h2>{selected?<section><h3>{selected.name}</h3><code>{selected.id}</code><div className="meta"><p><span>System</span><b>{selected.system||"—"}</b></p><p><span>Layer</span><b>{selected.layer||"—"}</b></p><p><span>Kind</span><b>{selected.kind||"structure"}</b></p></div><div className="actions"><button onClick={()=>v.focus(selected.id)}>Focus</button><button onClick={()=>v.isolate(selected.id,"selected")}>Isolate</button><button onClick={()=>v.isolate(selected.id,"parent-context")}>Context</button></div></section>:<div className="empty">点击 3D 结构或使用搜索框选择结构。</div>}<div className="scope"><b>科研使用边界</b><p>这是高细节研究/教学可视化界面，不是诊断或术前规划系统。当前 Web atlas 不是完整原始 Z-Anatomy 全量结构。</p></div></aside>
  <footer>Geometry: Z-Anatomy-derived / BodyParts3D · Viewer: Vanatome · Research visualization · Not for diagnosis</footer>
 </div>
}
createRoot(document.getElementById("root")).render(<App/>);
