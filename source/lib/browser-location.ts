import type {Point} from "./gallery";
type PermissionReader=Pick<Permissions,"query">;
async function failureMessage(code:number,permissions?:PermissionReader):Promise<string>{
 const messages:Record<number,string>={1:"定位权限未开启。请在浏览器地址栏的网站权限中允许定位，或使用公共地标搜索。",2:"设备暂时无法确定位置，请检查系统定位服务，或使用公共地标搜索。",3:"定位超时，请检查系统定位服务和网络，或使用公共地标搜索。"};
 const fallback=messages[code]||"未取得定位，请稍后重试或搜索公共地标。";
 if(!permissions||(code!==2&&code!==3))return fallback;
 try{
  const permission=await permissions.query({name:"geolocation"});
  if(permission.state==="denied")return messages[1];
  if(permission.state==="prompt")return `${code===2?"设备暂时无法确定位置。":"定位超时。"}浏览器显示定位权限仍需确认。请检查地址栏的位置请求，点击允许后重试；也可以使用公共地标搜索。`;
  if(permission.state==="granted")return code===2?"浏览器已允许定位，但设备暂时无法确定位置。请检查系统定位服务和网络，或使用公共地标搜索。":"浏览器已允许定位，但定位服务在12秒内没有返回位置，已超时。请检查系统定位服务和网络，或使用公共地标搜索。";
 }catch{/* Some browsers cannot query geolocation permission. Keep the original failure. */}
 return fallback;
}
export function locateBrowser(geolocation:Pick<Geolocation,"getCurrentPosition">|undefined,secure:boolean,permissions?:PermissionReader):Promise<{point:Point;accuracy:number}>{
 return new Promise((resolve,reject)=>{
  if(!secure){reject(new Error("定位需要 HTTPS 页面或本机 localhost。你也可以填写城市和公共地标查店。"));return;}
  if(!geolocation){reject(new Error("浏览器不支持定位，请填写城市和公共地标查店。"));return;}
  geolocation.getCurrentPosition(p=>resolve({point:{lat:p.coords.latitude,lng:p.coords.longitude},accuracy:p.coords.accuracy}),e=>{
   void failureMessage(e.code,permissions).then(message=>reject(new Error(message)));
  },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
 });
}
