import { withMcp } from "../../../lib/mcp.ts";
import { failure,getToken,headers,readInput,textField } from "../../../lib/http.ts";
import { normalizeCalendar,normalizeStores,matchOffers,object,str } from "../../../lib/gallery.ts";
import type {Availability} from "../../../lib/gallery.ts";
import { LotteryError } from "../../../lib/lottery.ts";
export const dynamic="force-dynamic";
export async function POST(request:Request,allowedOrigins?:ReadonlySet<string>):Promise<Response> {
  try {
    const input=await readInput(request,16384,allowedOrigins),token=getToken(request);
    if(!["calendar","nearby","availability","detail"].includes(String(input.action)))throw new LotteryError("INVALID_REQUEST","不支持此查询。",400);
    const result=await withMcp(token,async client=>{
      if(input.action==="calendar")return {activities:normalizeCalendar(await client.call("campaign-calendar"))};
      if(input.action==="nearby") {
        const city=textField(input.city,40),keyword=textField(input.keyword,100);
        const stores=normalizeStores(await client.call("query-nearby-stores",{searchType:2,beType:1,city,keyword}));
        return {stores};
      }
      if(input.action==="availability") {
        const activityId=textField(input.activityId,80);
        const activity=normalizeCalendar(await client.call("campaign-calendar")).find(a=>a.id===activityId);
        if(!activity)throw new LotteryError("ACTIVITY_CHANGED","活动信息已更新，请刷新活动列表。",409);
        if(!Array.isArray(input.stores)||!input.stores.length||input.stores.length>6)throw new LotteryError("INVALID_REQUEST","每次最多查询6家门店。",400);
        const availability:Availability[]=[];
        for(const raw of input.stores){
          const s=object(raw),storeId=textField(s.id,40),beCode=str(s.beCode).slice(0,60);
          try {
            const menu=await client.call("query-meals",{storeCode:storeId,beCode,orderType:1,beType:1});
            const meals=object(object(menu).data).meals;
            if(!activity.keywords.length||!meals||typeof meals!=="object"||Array.isArray(meals))throw new LotteryError("NO_MENU","未取得可比对的菜单。");
            const offers=matchOffers(menu,activity);
            availability.push({storeId,status:offers.length?"listed":"not-listed",offers,checkedAt:new Date().toISOString(),message:offers.length?"当前到店菜单列出相关商品；加购条件以活动说明和结算为准。":"当前到店菜单未检出匹配商品，不能据此判定活动不参加或已售罄。"});
          } catch {availability.push({storeId,status:"unknown",offers:[],checkedAt:new Date().toISOString(),message:"本次未能取得该店菜单，请重试或向门店确认。"});}
        }
        return {availability};
      }
      if(input.action==="detail"){
        const data=object(object(await client.call("query-meal-detail",{storeCode:textField(input.storeId,40),beCode:str(input.beCode),code:textField(input.code,60),orderType:1,beType:1})).data);
        return {detail:{name:str(data.name),price:str(data.price),code:str(data.code),rounds:data.rounds||[]}};
      }
      throw new LotteryError("INVALID_REQUEST","不支持此查询。",400);
    });
    return Response.json({ok:true,...result,checkedAt:new Date().toISOString()},{headers});
  }catch(e){return failure(e);}
}
export function GET(){return Response.json({ok:false,error:{message:"请从应用连接后查询。"}},{status:405,headers:{...headers,Allow:"POST"}});}
