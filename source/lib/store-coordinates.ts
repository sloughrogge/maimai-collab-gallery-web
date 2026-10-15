import type {McpClient} from "./mcp.ts";
import type {Store} from "./gallery.ts";
import {object,str,validPoint} from "./gallery.ts";

type Evidence={checkedAt:string;city:string;productCount:number;nearby:{id:string;name:string;address:string}[];products:{id:string;name:string}[];lookups:{product:string;city:string;stores:number;withCoordinates:number;matches:string[];coordinateFields:string[];candidates:unknown[];rowKeys:string[]}[];errors:string[]};
let latest:Evidence|null=null;
export function coordinateEvidence(){return latest;}
/** Join only the SAME official store code. Theme participation is not stock evidence. */
export async function enrichCoordinates(client:McpClient,stores:Store[],city:string):Promise<Store[]>{
 const evidence:Evidence={checkedAt:new Date().toISOString(),city,productCount:0,nearby:stores.map(s=>({id:s.id,name:s.name,address:s.address})),products:[],lookups:[],errors:[]};latest=evidence;
 const result=stores.map(s=>({...s}));
 try{
  const catalog=object(await client.call("mall-points-products",{catRuleIds:"1>6>20,1>6>21,1>6>22,1>6>25,1>6>34,1>6>40"})).data;
  const products=(Array.isArray(catalog)?catalog:[]).map(object).filter(p=>Number.isSafeInteger(Number(p.spuId))&&Number(p.spuId)>0&&p.status!==4);
  evidence.productCount=products.length;evidence.products=products.map(p=>({id:str(p.spuId),name:str(p.spuName)}));
  const normalize=(s:string)=>s.replace(/市$/u,"").trim();

  const ordered=[...products].sort((a,b)=>Number(/奇妙生日派对/.test(str(b.spuName)))-Number(/奇妙生日派对/.test(str(a.spuName))));
  for(const product of ordered.slice(0,3)){
   try{
    const cities=object(await client.call("query-party-city",{spuId:product.spuId})).data;
    const selected=(Array.isArray(cities)?cities:[]).map(object).find(c=>normalize(str(c.name))===normalize(city));
    if(!selected)continue;
    const variants=[{spuId:product.spuId,label:str(product.spuName)}];
    for(const variant of variants){
    let data:unknown;
    try{data=object(await client.call("query-party-store",{...(variant.spuId===undefined?{}:{spuId:variant.spuId}),code:str(selected.code),latitude:selected.latitude,longitude:selected.longitude})).data;}catch(e){evidence.errors.push(str(object(e).code)||"CITY_DIRECTORY_FAILED");continue;}
    const rows=(Array.isArray(data)?data:[]).map(object);
    const lookup={product:variant.label,city:str(selected.name),stores:rows.length,withCoordinates:0,matches:[] as string[],coordinateFields:[] as string[],rowKeys:Object.keys(rows[0]||{}),candidates:rows.filter(r=>/合川|桂箐|桂平|长兴园|漕河泾/.test(str(r.name)+str(r.address))).map(r=>({code:r.code,name:r.name,address:r.address,latitude:r.latitude,longitude:r.longitude}))};
    for(const row of rows){
     const point={lat:Number(row.latitude),lng:Number(row.longitude)};
     if(!validPoint(point)||!point.lat||!point.lng)continue;
     lookup.withCoordinates++;
     for(const key of Object.keys(row).filter(k=>/coord|lat|lon|crs|map/i.test(k)))if(!lookup.coordinateFields.includes(key))lookup.coordinateFields.push(key);
     const same=result.find(s=>s.id===str(row.code));
     if(same&&!same.point){same.point=point;same.coordinateSystem=str(row.coordinateSystem)||str(row.coordType)||null;lookup.matches.push(same.name);}
    }
    evidence.lookups.push(lookup);
    if(result.every(s=>s.point))break;
    }
    if(result.every(s=>s.point))break;
   }catch(e){evidence.errors.push(str(object(e).code)||"COORDINATE_LOOKUP_FAILED");}
  }
 }catch(e){evidence.errors.push(str(object(e).code)||"CATALOG_LOOKUP_FAILED");}
 return result;
}
