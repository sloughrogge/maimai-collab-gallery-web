"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowUpRight,Check,Copy,LocateFixed,MapPin,Search,X,LoaderCircle,RefreshCw,ChevronLeft,ChevronRight,Star} from "lucide-react";
import {storeNavigation} from "../lib/store-navigation";
import {locateBrowser} from "../lib/browser-location";
import type {Activity,Availability,Store} from "../lib/gallery";
const apiOrigin=import.meta.env.VITE_API_ORIGIN||"";
type Place={name:string;city?:string;street?:string};
type View="collection"|"stores"|"help";
type Busy="login"|"calendar"|"stores"|"availability"|"location"|null;
const statusText={announced:"活动公告",upcoming:"即将开始",started:"已开售",ended:"已结束"};
const availabilityText={listed:"有相关商品","not-listed":"未检出",closed:"当前未营业",unknown:"待确认"};
export default function Gallery(){
 const [view,setView]=useState<View>("collection"),[storePage,setStorePage]=useState(1),[activityPage,setActivityPage]=useState(1);
 const token=useRef("");const expiresAt=useRef(0);const loginInput=useRef<HTMLInputElement>(null);const generation=useRef(0);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [connected,setConnected]=useState(false),[login,setLogin]=useState(false),[activities,setActivities]=useState<Activity[]>([]),[selected,setSelected]=useState<string|null>(null),[activityFilter,setActivityFilter]=useState("all");
 const [busy,setBusy]=useState<Busy>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[checkedAt,setCheckedAt]=useState("");
 const [city,setCity]=useState(""),[keyword,setKeyword]=useState(""),[stores,setStores]=useState<Store[]>([]),[chosenStore,setChosenStore]=useState<string|null>(null),[availability,setAvailability]=useState<Record<string,Availability>>({});
 const [searchCity,setSearchCity]=useState(""),[searchedPlace,setSearchedPlace]=useState("");
 const [locationHint,setLocationHint]=useState(""),[locationError,setLocationError]=useState("");
 const [onlyListed,setOnlyListed]=useState(false),[copiedStore,setCopiedStore]=useState<string|null>(null),[copyFallback,setCopyFallback]=useState<string|null>(null);
 const activityRef=useRef(selected);activityRef.current=selected;
 const locationVersion=useRef(0),storeVersion=useRef(0),busyVersion=useRef(0),copyVersion=useRef(0);
 const modalRef=useRef<HTMLElement>(null),returnFocus=useRef<HTMLElement|null>(null);
 function openLogin(){returnFocus.current=document.activeElement as HTMLElement;setLogin(true);}
 function startBusy(value:Busy){const task=++busyVersion.current;setBusy(value);return task;}
 function finishBusy(task:number){if(task===busyVersion.current)setBusy(null);}
 const dialogOpen=login||!!chosenStore;
 useEffect(()=>{
  if(!dialogOpen)return;
  const previous=returnFocus.current,overflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  (login?loginInput.current:modalRef.current?.querySelector<HTMLButtonElement>("button"))?.focus();
  function onKey(event:KeyboardEvent){
   if(event.key==="Escape"&&busy!=="login"){setLogin(false);setChosenStore(null);return;}
   if(event.key!=="Tab")return;
   const nodes=Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea,summary')||[]);
   if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
  document.addEventListener("keydown",onKey);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",onKey);requestAnimationFrame(()=>{if(previous?.isConnected&&!previous.closest("[inert]"))previous.focus();else if(!document.querySelector('[role="dialog"]'))document.getElementById("workspace-title")?.focus();});};
 },[dialogOpen,login,busy==="login"]);
 function navigate(next:View){setView(next);setChosenStore(null);setNotice("");setError("");requestAnimationFrame(()=>document.getElementById("workspace-title")?.focus());}
 function changeFilter(next:string){setActivityFilter(next);setActivityPage(1);const list=activities.filter(a=>next==="all"||(next==="upcoming"?a.status==="upcoming":a.status!=="upcoming"&&a.status!=="ended"));if(list.length&&!list.some(a=>a.id===selected))selectActivity(list[0]);}
 const activity=activities.find(a=>a.id===selected)??null;
 const visibleActivities=activities.filter(a=>activityFilter==="all"||(activityFilter==="upcoming"?a.status==="upcoming":a.status!=="upcoming"&&a.status!=="ended"));
 const visibleStores=stores.filter(s=>!onlyListed||availability[s.id]?.status==="listed");
 const storePages=Math.max(1,Math.ceil(visibleStores.length/3)),currentStorePage=Math.min(storePage,storePages);
 const pagedStores=visibleStores.slice((currentStorePage-1)*3,currentStorePage*3);
 const activityPages=Math.max(1,Math.ceil(visibleActivities.length/4)),currentActivityPage=Math.min(activityPage,activityPages);
 const pagedActivities=visibleActivities.slice((currentActivityPage-1)*4,currentActivityPage*4);
 const detailStore=stores.find(s=>s.id===chosenStore),detailResult=detailStore?availability[detailStore.id]:undefined,detailNavigation=detailStore?storeNavigation(detailStore,searchCity):null;
 function logout(){setView("collection");setStorePage(1);setActivityPage(1);setActivityFilter("all");generation.current++;locationVersion.current++;storeVersion.current++;busyVersion.current++;copyVersion.current++;token.current="";expiresAt.current=0;if(timer.current)clearTimeout(timer.current);setConnected(false);setActivities([]);setSelected(null);setStores([]);setChosenStore(null);setAvailability({});setSearchCity("");setSearchedPlace("");setCity("");setKeyword("");setOnlyListed(false);setCopiedStore(null);setCopyFallback(null);setLocationError("");setLocationHint("");setLogin(false);setBusy(null);setError("");setNotice("");}
 useEffect(()=>{if(!connected)return;timer.current=setTimeout(logout,Math.max(0,expiresAt.current-Date.now()));return()=>{if(timer.current)clearTimeout(timer.current);};},[connected]);
 async function api(path:string,data:unknown,auth=false){if(auth&&expiresAt.current>0&&Date.now()>=expiresAt.current){logout();throw new Error("本次连接已满30分钟，请重新连接麦当劳。");}const r=await fetch(`${apiOrigin}${path}`,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:`Bearer ${token.current}`}:{})},body:JSON.stringify(data),cache:"no-store",credentials:apiOrigin?"omit":"same-origin"});const d=await r.json() as {ok:boolean;error?:{message:string};activities:Activity[];stores:Store[];availability:Availability[];places:Place[];checkedAt:string};if(!r.ok||!d.ok){if(auth&&r.status===401&&connected){logout();}throw new Error(d.error?.message||"查询未完成，请稍后重试。");}return d;}
 async function connect(event:React.FormEvent){event.preventDefault();const value=loginInput.current?.value.trim()||"";if(loginInput.current)loginInput.current.value="";if(!value)return;token.current=value;expiresAt.current=Date.now()+30*60*1000;const g=++generation.current;const task=startBusy("login");setError("");try{const d=await api("/api/mcd",{action:"calendar"},true);if(g!==generation.current)return;setActivities(d.activities);setSelected(d.activities.find((a:Activity)=>a.kind==="徽章")?.id||d.activities[0]?.id||null);setConnected(true);setLogin(false);setCheckedAt(d.checkedAt);setNotice("");}catch(e){if(g===generation.current){token.current="";expiresAt.current=0;setError((e as Error).message);}}finally{finishBusy(task);}}
 async function refresh(){const g=generation.current;const task=startBusy("calendar");setError("");try{const d=await api("/api/mcd",{action:"calendar"},true);if(g!==generation.current)return;setActivities(d.activities);setCheckedAt(d.checkedAt);if(!d.activities.some((a:Activity)=>a.id===selected))setSelected(d.activities[0]?.id||null);setAvailability({});setOnlyListed(false);setStorePage(1);}catch(e){if(g===generation.current)setError((e as Error).message);}finally{finishBusy(task);}}
 function selectActivity(a:Activity){setStorePage(1);activityRef.current=a.id;setSelected(a.id);setAvailability({});setOnlyListed(false);setError("");}
 async function searchStores(event:React.FormEvent){
  event.preventDefault();if(!connected){openLogin();return;}
  const g=generation.current,seq=++storeVersion.current,task=startBusy("stores"),queryCity=city.trim(),queryKeyword=keyword.trim();
  locationVersion.current++;copyVersion.current++;setError("");setNotice("");setLocationError("");setAvailability({});setStores([]);setChosenStore(null);setOnlyListed(false);setCopiedStore(null);setCopyFallback(null);setSearchCity("");setSearchedPlace("");setStorePage(1);
  try{const d=await api("/api/mcd",{action:"nearby",city:queryCity,keyword:queryKeyword},true);if(g!==generation.current||seq!==storeVersion.current)return;
   setStores(d.stores);setSearchCity(queryCity);setSearchedPlace(queryKeyword);
   setNotice("");
  }catch(e){if(g===generation.current&&seq===storeVersion.current)setError((e as Error).message);}finally{finishBusy(task);}
 }
 async function checkStores(targets:Store[]){
  if(!activity||!targets.length)return;const g=generation.current,a=activity.id,seq=storeVersion.current,task=startBusy("availability");setError("");
  try{const d=await api("/api/mcd",{action:"availability",activityId:a,stores:targets.slice(0,6).map(s=>({id:s.id,beCode:s.beCode}))},true);
   if(g!==generation.current||a!==activityRef.current||seq!==storeVersion.current)return;
   setAvailability(old=>({...old,...Object.fromEntries(d.availability.map((v:Availability)=>[v.storeId,v]))}));
  }catch(e){if(g===generation.current&&a===activityRef.current&&seq===storeVersion.current)setError((e as Error).message);}finally{finishBusy(task);}
 }
 function chooseStore(s:Store){returnFocus.current=document.activeElement as HTMLElement;setChosenStore(s.id);setError("");setNotice("");if(activity)void checkStores([s]);}
 function editLocation(field:"city"|"keyword",value:string){
  locationVersion.current++;setLocationError("");setLocationHint("");
  if(busy==="location"){busyVersion.current++;setBusy(null);}
  if(field==="city")setCity(value);else setKeyword(value);
 }
 async function copyAddress(s:Store){
  const data=storeNavigation(s,searchCity);if(!data)return;
  const seq=++copyVersion.current;setCopiedStore(null);setCopyFallback(null);
  try{await navigator.clipboard.writeText(data.text);if(seq===copyVersion.current)setCopiedStore(s.id);}
  catch{if(seq===copyVersion.current)setCopyFallback(s.id);}
 }
 async function locate(){
  const g=generation.current,seq=++locationVersion.current,task=startBusy("location");setLocationError("");setLocationHint("正在定位…");
  const current=()=>g===generation.current&&seq===locationVersion.current;
  try{
   const located=await locateBrowser(navigator.geolocation,window.isSecureContext,navigator.permissions);if(!current())return;
   setLocationHint("正在识别街道…");
   try{const d=await api("/api/map",{action:"reverse",point:located.point});if(!current())return;const p=d.places[0];
    if(p?.city&&(p.street||p.name)){setCity(p.city);setKeyword(p.street||p.name);setLocationHint("已填写城市和街道。");}
    else{setLocationHint("");setLocationError("已取得位置，但未能识别完整的城市和街道。请手动填写附近地标，仍可正常查店。");}
   }catch{if(current()){setLocationHint("");setLocationError("已取得位置，但街道识别暂时不可用。请手动填写城市和附近地标，仍可正常查店。");}}
  }catch(e){if(current()){setLocationHint("");setLocationError(`${(e as Error).message} 手动填写后仍可正常查店。`);}}
  finally{finishBusy(task);}
 }
 return <div className="gallery-app">
 <header className="topbar" inert={dialogOpen}><button className="brand" onClick={()=>navigate("collection")} aria-label="麦麦联名馆首页"><span className="brand-mark" aria-hidden="true">麦</span>麦麦联名馆</button><div className="header-actions"><button className="account-button" onClick={()=>connected?logout():openLogin()}>{connected?"已连接 · 退出":"连接账户"}</button><a className="github-star" href="https://github.com/sloughrogge/maimai-collab-gallery-web" target="_blank" rel="noopener noreferrer" aria-label="在 GitHub 给麦麦联名馆点个 Star（新窗口打开）" title="喜欢这个项目？去 GitHub 点个 Star"><Star size={15} aria-hidden="true"/><span className="github-label">GitHub · 点个 </span><span>Star</span></a></div></header>
 <nav className="primary-nav" aria-label="功能导航" inert={dialogOpen}><div>{([["collection","联名活动"],["stores","门店查询"],["help","帮助"]] as const).map(([id,label])=><button key={id} className={view===id?"active":""} aria-current={view===id?"page":undefined} onClick={()=>navigate(id)}>{label}</button>)}</div></nav>
 <main className="workspace" inert={dialogOpen}>
  <div className="workspace-heading"><h1 id="workspace-title" tabIndex={-1}>{view==="collection"?"联名活动":view==="stores"?"门店查询":"帮助"}</h1>{connected&&view==="collection"&&<button className="text-button" onClick={refresh} disabled={!!busy}><RefreshCw size={15} className={busy==="calendar"?"spin":""}/>刷新</button>}</div>
  {error&&<div className="banner error" role="alert"><span>{error}</span><button onClick={()=>setError("")} aria-label="关闭提示"><X size={16}/></button></div>}
  {notice&&<div className="banner notice" role="status"><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="关闭通知"><X size={16}/></button></div>}

  {view==="collection"&&<section aria-label="联名活动面板">
   {!connected?<div className="connection-panel"><p>连接账户后查看当前活动。</p><button className="button primary" onClick={openLogin}>连接麦当劳</button><button className="text-button" onClick={()=>navigate("help")}>获取 Token</button></div>:<>
    <div className="collection-toolbar"><div className="segmented" aria-label="活动筛选">{[["all","全部"],["current","已开售 / 公告"],["upcoming","即将开始"]].map(([id,label])=><button key={id} className={activityFilter===id?"active":""} aria-pressed={activityFilter===id} onClick={()=>changeFilter(id)}>{label}</button>)}</div><span>{visibleActivities.length} 项</span></div>
    {visibleActivities.length&&activity?<div className="collection-browser"><aside className="activity-directory" aria-label="活动目录"><div className="activity-choices">{pagedActivities.map(a=><button key={a.id} className={`activity-choice ${selected===a.id?"active":""}`} aria-pressed={selected===a.id} onClick={()=>selectActivity(a)}><span>{a.title}</span><ChevronRight size={15}/></button>)}</div>{activityPages>1&&<div className="directory-pages"><button aria-label="上一页活动" disabled={currentActivityPage===1} onClick={()=>setActivityPage(currentActivityPage-1)}><ChevronLeft size={16}/></button><span>{currentActivityPage} / {activityPages}</span><button aria-label="下一页活动" disabled={currentActivityPage===activityPages} onClick={()=>setActivityPage(currentActivityPage+1)}><ChevronRight size={16}/></button></div>}</aside>
     <article className="activity-feature" aria-label={activity.title} key={activity.id}><h2>{activity.title}</h2><div className={`feature-main ${activity.images[0]?"":"no-poster"}`}>{activity.images[0]&&<a className="feature-poster" href={activity.images[0]} target="_blank" rel="noopener noreferrer" aria-label="查看活动海报"><img src={activity.images[0]} alt={activity.title} referrerPolicy="no-referrer"/></a>}<div className="feature-copy"><dl className="activity-specs"><div><dt>状态</dt><dd>{statusText[activity.status]}</dd></div><div><dt>购买条件</dt><dd>{activity.purchase}</dd></div></dl><button className="button primary" onClick={()=>navigate("stores")}>查询门店</button></div></div><details className="activity-description"><summary>活动说明 <ChevronRight size={15}/></summary><p className="official-copy">{activity.body}</p><small>更新：{checkedAt?new Date(checkedAt).toLocaleString("zh-CN",{hour12:false}):"—"}</small></details></article>
    </div>:<div className="empty-panel"><p>暂无符合条件的活动。</p><button className="text-button" onClick={()=>changeFilter("all")}>查看全部</button></div>}
   </>}
  </section>}

  {view==="stores"&&<section aria-label="附近门店面板">
   <div className="context-bar"><span>联名</span><strong>{activity?.title||"未选择"}</strong><button className="text-button" onClick={()=>navigate("collection")}>{activity?"更换":"选择联名"}</button></div>
   <div className="location-panel"><form onSubmit={searchStores} className="location-form"><label><span>城市</span><input required aria-label="城市" placeholder="上海" value={city} onChange={e=>editLocation("city",e.target.value)} maxLength={40}/></label><label className="keyword-field"><span>商圈 / 地标</span><input required aria-label="公共地标" placeholder="漕河泾开发区" value={keyword} onChange={e=>editLocation("keyword",e.target.value)} maxLength={100}/></label><button className="button primary" disabled={!!busy}><Search size={16}/>{busy==="stores"?"查询中":"查询"}</button><button type="button" className="text-button locate-button" disabled={!!busy} onClick={locate} title="定位用于向Photon识别附近街道"><LocateFixed size={16}/>定位</button></form>{locationHint&&<p className="location-hint" role="status">{locationHint}</p>}{locationError&&<details className="location-error"><summary>定位不可用，请手动输入。<span>查看原因</span></summary><p>{locationError}</p></details>}</div>
   <div className="store-panel"><div className="store-actions"><span className="result-count">{stores.length?`${visibleStores.length} 家门店`:"门店"}</span><button className="text-button" disabled={!stores.length||!activity||!!busy} onClick={()=>checkStores(stores.slice(0,6))}>{busy==="availability"?<LoaderCircle size={14} className="spin"/>:<RefreshCw size={14}/>}批量查商品</button><label><input type="checkbox" checked={onlyListed} onChange={e=>{setOnlyListed(e.target.checked);setStorePage(1);}}/>仅有相关商品</label></div>
    <div className="store-table-head" aria-hidden="true"><span>门店 / 地址</span><span>查询结果</span><span>操作</span></div>
    <div className="store-rows">{pagedStores.map(s=><article className="store-row" key={s.id} aria-label={s.name}><div className="store-summary"><h2>{s.name}</h2><p>{s.address||"地址未提供"}</p></div><span className={`stock ${availability[s.id]?.status||"unknown"}`}>{availabilityText[availability[s.id]?.status||"unknown"]}</span><button className="button outline small" disabled={!activity||!!busy} onClick={()=>chooseStore(s)}>查看商品</button></article>)}{!pagedStores.length&&<div className="store-empty"><p>{onlyListed?"未找到相关商品。":searchedPlace?"未找到门店，请更换地点。":"输入城市和地标查询门店。"}</p>{onlyListed&&<button className="text-button" onClick={()=>{setOnlyListed(false);setStorePage(1);}}>查看全部</button>}</div>}</div>
    {!!visibleStores.length&&<div className="pagination" aria-label="门店翻页"><span>{searchCity} · {searchedPlace}</span><div><button className="button outline small" aria-label="上一页门店" disabled={currentStorePage===1} onClick={()=>setStorePage(currentStorePage-1)}><ChevronLeft size={16}/></button><b aria-live="polite">{currentStorePage} / {storePages}</b><button className="button outline small" aria-label="下一页门店" disabled={currentStorePage===storePages} onClick={()=>setStorePage(currentStorePage+1)}><ChevronRight size={16}/></button></div></div>}
   </div>
  </section>}

  {view==="help"&&<section className="help-faq" aria-label="使用帮助面板"><details><summary>如何获取 Token？<ChevronRight size={15}/></summary><ol><li>在<a href="https://open.mcd.cn/mcp" target="_blank" rel="noopener noreferrer">麦当劳开放平台</a>登录。</li><li>控制台 → 激活 → 复制 Token。</li><li>回到本站，点击“连接账户”粘贴。</li></ol><button className="button primary" onClick={()=>connected?navigate("collection"):openLogin()}>{connected?"查看活动":"连接账户"}</button></details><details><summary>Token 会保存吗？<ChevronRight size={15}/></summary><p>只在当前页面会话内存中使用，刷新、退出或30分钟后清除。查询由本站后端转发给麦当劳官方，不写入浏览器存储。</p></details><details><summary>定位失败怎么办？<ChevronRight size={15}/></summary><p>直接填写城市和地标。定位仅是快捷入口，点击后会向 Photon 发送坐标以识别街道。</p></details><details><summary>查到商品就代表有货吗？<ChevronRight size={15}/></summary><p>不代表实时库存。价格和加购条件以官方结算、门店为准；未检出也不代表售罄。</p></details><details><summary>地图会获取哪些信息？<ChevronRight size={15}/></summary><p>高德仅收到城市、店名和地址，不附带 Token 或你的精确位置。核对门店后再导航；也可复制地址到其他地图。</p></details></section>}
  <footer className="app-footer"><span>独立项目 · 非麦当劳官网</span><button className="text-button" onClick={()=>navigate("help")}>帮助与数据说明</button></footer>
 </main>

 {login&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&busy!=="login")setLogin(false);}}><section ref={modalRef} className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title"><button className="modal-close" disabled={busy==="login"} onClick={()=>setLogin(false)} aria-label="关闭连接窗口"><X size={20}/></button><h2 id="login-title">连接麦当劳</h2><ol className="login-steps"><li><a href="https://open.mcd.cn/mcp" target="_blank" rel="noopener noreferrer">打开麦当劳官网 <ArrowUpRight size={13}/></a>并登录。</li><li>控制台 → 激活 → 复制 Token。</li></ol><form onSubmit={connect}><label htmlFor="mcd-token">麦当劳 MCP Token</label><input id="mcd-token" ref={loginInput} type="password" autoComplete="off" spellCheck={false} required placeholder="在此粘贴 Token"/><button className="button primary" disabled={!!busy}>{busy==="login"?<><LoaderCircle size={16} className="spin"/>连接中</>:"连接"}</button></form>{error&&<p className="inline-error" role="alert">{error}</p>}<p className="session-note">仅本次会话使用，30分钟后清除。</p><details className="credential-note"><summary>凭据使用说明 <ChevronRight size={14}/></summary><p>凭据经本站后端转发至麦当劳官方，不写入浏览器存储。刷新或退出即清除。当前只查询活动和菜单。</p></details></section></div>}
 {detailStore&&!login&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setChosenStore(null);}}><section ref={modalRef} className="store-dialog" role="dialog" aria-modal="true" aria-labelledby="store-detail-title"><div className="detail-header"><button className="modal-close" onClick={()=>setChosenStore(null)} aria-label="关闭商品详情"><X size={20}/></button><h2 id="store-detail-title">{detailStore.name}</h2><p>{detailStore.address||"地址未提供"}</p></div><div className="detail-content"><div className="detail-collab"><strong>{activity?.title}</strong><button className="text-button" disabled={!!busy} onClick={()=>checkStores([detailStore])} aria-label="刷新这家门店菜单"><RefreshCw size={15}/></button></div>{busy==="availability"?<div className="detail-loading" role="status"><LoaderCircle size={20} className="spin"/>查询中…</div>:<><span className={`stock ${detailResult?.status||"unknown"}`}>{availabilityText[detailResult?.status||"unknown"]}</span>{detailResult?.offers.map(o=><div className="offer-line" key={o.code}><span>{o.name}</span><b>{o.price!==null?`¥${o.price}`:"价格待确认"}</b></div>)}{detailResult&&<details className="query-details"><summary>查询详情 <ChevronRight size={14}/></summary><p>{detailResult.message}</p><small>{new Date(detailResult.checkedAt).toLocaleString("zh-CN",{hour12:false})}</small><p>{detailStore.open===false?"当前未营业":detailStore.hours||"营业时间以门店为准"}</p></details>}</>}{error&&<p className="inline-error" role="alert">{error}</p>}<p className="detail-disclaimer">菜单不代表实时库存，以门店为准。</p>{copyFallback===detailStore.id&&detailNavigation&&<div className="copy-fallback"><label htmlFor="copy-store-address">请选中文字复制：</label><textarea id="copy-store-address" readOnly value={detailNavigation.text} onFocus={e=>e.currentTarget.select()} rows={3}/></div>}</div><div className="detail-bottom">{detailNavigation&&<a className="button primary" href={detailNavigation.url} target="_blank" rel="noopener noreferrer" aria-label={`地图找店：${detailStore.name}`}><MapPin size={16}/>地图找店</a>}<button className="button outline" disabled={!detailNavigation} aria-label={copiedStore===detailStore.id?"地址已复制":"复制地址"} onClick={()=>void copyAddress(detailStore)}>{copiedStore===detailStore.id?<Check size={15}/>:<Copy size={15}/>}<span role="status">{copiedStore===detailStore.id?"已复制":"复制地址"}</span></button></div></section></div>}
 {busy&&busy!=="login"&&!detailStore&&<div className="loading-toast" role="status"><LoaderCircle size={16} className="spin"/>{busy==="location"?"定位中…":"查询中…"}</div>}
 </div>;
}
