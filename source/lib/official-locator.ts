import transform from "coordtransform";
import {object,str,validPoint} from "./gallery.ts";
import type {Point} from "./gallery.ts";
import {MAP_USER_AGENT,mapJson,placesFromPhoton} from "./maps.ts";
import {LotteryError} from "./lottery.ts";

export type StoreIdentity={name:string;address:string};
type Restaurant=StoreIdentity&{city:string;point:Point};
export const LOCATOR_SOURCE="https://www.mcdonalds.com.cn/top/map";
const normalize=(value:string)=>value.normalize("NFKC").replace(/[\s，,、。·\-]/gu,"").toLowerCase();
const cityName=(value:string)=>normalize(value).replace(/市$/u,"");
// These are public restaurant records only. Never cache Tokens, queries or user locations.
const cache=new Map<string,{until:number;rows:Restaurant[]}>();
export function toGcj(point:Point):Point {const [lng,lat]=transform.wgs84togcj02(point.lng,point.lat);return {lng,lat};}
export function toWgs(point:Point):Point {
  // Iteratively invert the published transform rather than retaining its first-order offset.
  let [lng,lat]=transform.gcj02towgs84(point.lng,point.lat);
  for(let i=0;i<4;i++){const projected=transform.wgs84togcj02(lng,lat);lng-=projected[0]-point.lng;lat-=projected[1]-point.lat;}
  return {lng,lat};
}
export function parseRestaurants(payload:unknown):Restaurant[]{
  const data=object(payload).data;
  return (Array.isArray(data)?data:[]).slice(0,30).map(object).map(row=>({name:str(row.title),address:str(row.address),city:str(row.city),point:object(row.location) as Point})).filter(r=>r.name.startsWith("麦当劳")&&r.address&&validPoint(r.point)&&r.point.lng>=73&&r.point.lng<=135&&r.point.lat>=18&&r.point.lat<=54);
}
export function matchRestaurant(rows:Restaurant[],target:StoreIdentity,city:string):Restaurant|null {
  if(!target.name||!target.address||!city)return null;
  const matches=rows.filter(r=>cityName(r.city)===cityName(city)&&normalize(r.name)===normalize(target.name)&&normalize(r.address)===normalize(target.address));
  const unique=new Map(matches.map(r=>[`${r.point.lat},${r.point.lng}`,r]));
  return unique.size===1?[...unique.values()][0]:null;
}
export async function nearbyRestaurants(point:Point,fetcher:typeof fetch=fetch):Promise<Restaurant[]>{
  const gcj=toGcj(point);
  const response=await fetcher("https://www.mcdonalds.com.cn/ajaxs/search_by_point",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json","User-Agent":MAP_USER_AGENT,Referer:LOCATOR_SOURCE},body:new URLSearchParams({point:`${gcj.lat},${gcj.lng}`,type:""}),redirect:"manual",signal:AbortSignal.timeout(12000)});
  if(!response.ok){await response.body?.cancel();throw new LotteryError("LOCATOR_UNAVAILABLE","麦当劳官网地图暂时无法查询，请稍后重试。",503);}
  const reader=response.body?.getReader();if(!reader)throw new Error();let text="",size=0;const decoder=new TextDecoder();
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>500_000)throw new Error();text+=decoder.decode(part.value,{stream:true});}return parseRestaurants(JSON.parse(text+decoder.decode()));}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function locateOfficialStore(target:StoreIdentity,city:string,near:Point|null,limit:(service:string)=>Promise<void>){
  const finish=(row:Restaurant)=>({point:toWgs(row.point),coordinateSystem:"WGS84",source:LOCATOR_SOURCE,label:"麦当劳官网位置 · 名称及地址匹配",name:row.name,address:row.address});
  const now=Date.now();for(const [key,item] of cache)if(item.until<now)cache.delete(key);
  const cached=matchRestaurant([...cache.values()].flatMap(v=>v.rows),target,city);if(cached)return finish(cached);
  async function lookup(point:Point){
    await limit("mcd-locator");const rows=await nearbyRestaurants(point);
    // Keyed by official restaurant identity, not by the user's location.
    for(const row of rows)cache.set(`${row.city}|${row.name}|${row.address}`,{until:Date.now()+300_000,rows:[row]});
    while(cache.size>200)cache.delete(cache.keys().next().value!);
    return matchRestaurant(rows,target,city);
  }
  if(near){const match=await lookup(near);if(match)return finish(match);}
  // A street is only a search anchor. It is NEVER used as the store destination.
  const street=target.address.replace(/^.*开发区内/u,"").match(/([\p{Script=Han}]{2,14}(?:路|街|大道|巷))\s*\d/u)?.[1];
  if(!street)return null;
  await limit("photon");
  const url=new URL("https://photon.komoot.io/api/");url.searchParams.set("q",`${city} ${street}`);url.searchParams.set("limit","3");
  const anchors=placesFromPhoton(await mapJson(url.toString())).filter(p=>cityName(p.city)===cityName(city));
  for(const anchor of anchors.slice(0,3)){
    const match=await lookup(anchor.point);if(match)return finish(match);
  }
  return null;
}
