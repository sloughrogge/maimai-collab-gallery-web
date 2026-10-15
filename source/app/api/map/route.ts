import {env} from "cloudflare:workers";
import {failure,headers,readInput} from "../../../lib/http.ts";
import {LotteryError} from "../../../lib/lottery.ts";
import {mapJson,placesFromPhoton} from "../../../lib/maps.ts";
import {validPoint} from "../../../lib/gallery.ts";
export const dynamic="force-dynamic";
async function limit(){
  if(!env.DB)throw new LotteryError("MAP_CONFIG","街道识别暂时不可用，请手动填写城市和地标。",503);
  const now=Date.now();
  const row=await env.DB.prepare("INSERT INTO service_limits (name,next_at) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET next_at=excluded.next_at WHERE service_limits.next_at <= ? RETURNING name").bind("photon",now+1200,now).first();
  if(!row)throw new LotteryError("MAP_RATE_LIMIT","街道识别正在处理上一条请求，请稍等两秒再试。",429,2);
}
export async function POST(request:Request,allowedOrigins?:ReadonlySet<string>){try{
  const input=await readInput(request,2048,allowedOrigins);
  if(input.action!=="reverse")throw new LotteryError("INVALID_REQUEST","不支持此地图查询。请使用门店卡片中的地图找店。",400);
  if(!validPoint(input.point))throw new LotteryError("INVALID_POINT","请使用浏览器定位，或直接填写城市和公共地标查店。",400);
  const url=new URL("https://photon.komoot.io/reverse");url.searchParams.set("lat",String(input.point.lat));url.searchParams.set("lon",String(input.point.lng));url.searchParams.set("limit","1");
  await limit();return Response.json({ok:true,places:placesFromPhoton(await mapJson(url.toString()))},{headers});
}catch(e){return failure(e);}}
