import {LotteryError} from "./lottery.ts";
import {validPoint,object,str} from "./gallery.ts";
import type {Point,RouteResult} from "./gallery.ts";
export const MAP_USER_AGENT="MaiMaiCollabGallery/1.0 (+https://maimai-collab-gallery.hippocampuss.chatgpt.site)";
export function routeUrl(from:Point,to:Point,mode:"walking"|"cycling"):string {
  if(!validPoint(from)||!validPoint(to))throw new LotteryError("INVALID_POINT","请选择有效的起终点。",400);
  if(mode!=="walking"&&mode!=="cycling")throw new LotteryError("INVALID_MODE","请选择步行或骑行。",400);
  if(Math.abs(from.lat-to.lat)>1||Math.abs(from.lng-to.lng)>1.5)throw new LotteryError("TOO_FAR","请选附近门店；本应用只规划约100公里范围内的步行或骑行路线。",400);
  return `https://routing.openstreetmap.de/routed-${mode==="walking"?"foot":"bike"}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true&alternatives=false&generate_hints=false`;
}
const DIRECTIONS:Record<string,string>={left:"左转",right:"右转",straight:"直行","slight left":"向左前方","slight right":"向右前方","sharp left":"向左急转","sharp right":"向右急转",uturn:"掉头"};
export function parseRoute(payload:unknown,mode:"walking"|"cycling"):RouteResult {
  const data=object(payload),route=object(Array.isArray(data.routes)?data.routes[0]:null);
  if(data.code!=="Ok"||typeof route.distance!=="number"||typeof route.duration!=="number"||!Number.isFinite(route.distance)||!Number.isFinite(route.duration)||route.distance<0||route.duration<0)throw new LotteryError("NO_ROUTE","没有找到可通行路线。请检查起终点位置，或尝试另一种出行方式。",404);
  const geometry=object(route.geometry),coordinates=Array.isArray(geometry.coordinates)?geometry.coordinates:[];
  if(coordinates.length<2||coordinates.length>40000||coordinates.some(c=>!Array.isArray(c)||!validPoint({lng:c[0],lat:c[1]})))throw new LotteryError("BAD_ROUTE","路线数据暂时无法读取，请稍后重试。");
  const waypoints=Array.isArray(data.waypoints)?data.waypoints.map(object):[];
  const steps:Array<{text:string;distance:number}>=[];
  for(const raw of Array.isArray(route.legs)?route.legs:[])for(const item of Array.isArray(object(raw).steps)?object(raw).steps as unknown[]:[]){
    const s=object(item),m=object(s.maneuver);let text=m.type==="depart"?"出发":m.type==="arrive"?"到达门店附近":m.type==="roundabout"?`经过环岛${m.exit?`，从第${m.exit}个出口离开`:""}`:DIRECTIONS[str(m.modifier)]||"沿路继续";
    if(str(s.name))text+=` · ${str(s.name)}`;steps.push({text,distance:Number(s.distance)||0});
  }
  return {mode,distance:route.distance,duration:route.duration,coordinates:coordinates as [number,number][],steps,
    startSnap:Number(waypoints[0]?.distance)||0,endSnap:Number(waypoints[1]?.distance)||0,provider:"FOSSGIS / OSRM · OpenStreetMap"};
}
export async function mapJson(url:string,fetcher:typeof fetch=fetch):Promise<unknown>{
  const r=await fetcher(url,{headers:{"User-Agent":MAP_USER_AGENT,Accept:"application/json"},redirect:"manual",signal:AbortSignal.timeout(18000)});
  if(!r.ok){await r.body?.cancel();throw new LotteryError("MAP_UNAVAILABLE","免费地图服务暂时繁忙，请稍后重试。",503);}
  const reader=r.body?.getReader();if(!reader)throw new Error();let length=0,text="";const decoder=new TextDecoder();
  try{while(true){const b=await reader.read();if(b.done)break;length+=b.value.length;if(length>3_000_000)throw new Error();text+=decoder.decode(b.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function placesFromPhoton(payload:unknown){
  const features=object(payload).features; if(!Array.isArray(features))return [];
  return features.map(object).map(f=>{
    const p=object(f.properties),g=object(f.geometry),coords=Array.isArray(g.coordinates)?g.coordinates:[];
    const city=/^(上海|北京|天津|重庆)/.test(str(p.state))?str(p.state):str(p.city);
    return {id:`${str(p.osm_type)}-${str(p.osm_id)}`,name:str(p.name)||str(p.street),address:[p.state,p.city,p.district,p.street,p.housenumber].map(str).filter(Boolean).join(" "),point:{lng:Number(coords[0]),lat:Number(coords[1])},kind:str(p.osm_value),city,street:str(p.street),houseNumber:str(p.housenumber)};
  }).filter(p=>validPoint(p.point)&&p.point.lng>=73&&p.point.lng<=135&&p.point.lat>=18&&p.point.lat<=54).slice(0,6);
}
