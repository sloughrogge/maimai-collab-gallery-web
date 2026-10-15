import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeCalendar, normalizeStores, matchOffers, officialImage} from '../lib/gallery.ts';
import {routeUrl,parseRoute,placesFromPhoton,mapJson} from '../lib/maps.ts';
import {parseRestaurants,matchRestaurant,toWgs,toGcj,nearbyRestaurants} from '../lib/official-locator.ts';
import {withMcp} from '../lib/mcp.ts';
import {readInput,getToken,failure} from '../lib/http.ts';
import {storeNavigation} from '../lib/store-navigation.ts';

test('map search works without coordinates and encodes the exact store identity',()=>{
 const store={name:'麦当劳上海徐汇宜山路长兴园餐厅',address:'宜山路1397号5幢B栋111室商铺'};
 const link=storeNavigation(store,'上海');const url=new URL(link.url);
 assert.equal(url.origin,'https://uri.amap.com');assert.equal(url.pathname,'/search');
 assert.equal(url.searchParams.get('keyword'),store.name+' '+store.address);
 assert.equal(url.searchParams.get('city'),'上海');assert.equal(url.searchParams.get('callnative'),'1');
 assert.equal(link.text,['上海',store.name,store.address].join('\n'));
 const encoded=new URL(storeNavigation({name:'A&B #2?店',address:'街道 1/2号'},'上海').url);
 assert.equal(encoded.searchParams.get('keyword'),'A&B #2?店 街道 1/2号');
});
test('map links exclude account and precise-location data, and allow name-only stores',()=>{
 const link=storeNavigation({name:'测试门店',address:'',token:'private-sentinel',point:{lng:121.3,lat:31.2}},'上海');
 const url=new URL(link.url);assert.equal(url.searchParams.get('keyword'),'测试门店');
 assert.deepEqual([...url.searchParams.keys()].sort(),['callnative','city','keyword','src','view']);
 assert.ok(!link.url.includes('private-sentinel'));assert.ok(!link.text.includes('121.3'));
 assert.equal(storeNavigation({name:'   ',address:''},'上海'),null);
});

const fixture=JSON.parse(await readFile(new URL('./fixtures/calendar.json',import.meta.url),'utf8'));
const activities=normalizeCalendar(fixture,new Date('2026-10-15T04:00:00Z'));
test('representative calendar: badge, hat and scarf remain separate, with purchase conditions',()=>{
 const badge=activities.find(a=>a.kind==='徽章');
 const scarf=activities.find(a=>a.kind==='丝巾');
 const hat=activities.find(a=>a.kind==='棒球帽');
 assert.ok(badge&&scarf&&hat);
 assert.match(badge.purchase,/任意餐品消费加39.9元即可得/);
 assert.equal(badge.starts,'2026-10-15');assert.equal(badge.status,'started');
 assert.equal(scarf.starts,'2026-10-22');assert.equal(scarf.status,'upcoming');
 assert.match(scarf.body,/棒球帽&徽章/);assert.deepEqual(scarf.keywords,['丝巾']);
 assert.equal(hat.starts,'2026-10-08');
 assert.equal(activities.filter(a=>a.kind==='徽章').length,1);
 assert.ok(activities.every(a=>a.purchase!=='0'&&!a.purchase.includes('免费')));
 assert.ok(activities.every(a=>!a.title.includes('早餐两件套')));
});
test('calendar filters ended dates without treating promotion placements as launch dates',()=>{
 const payload={data:{dailyList:[{date:'2026-10-15',events:[{articleDto:{title:'限定联名',content:'经典联名回归\n10月8日开售\n活动至10月12日'}}]}]}};
 assert.equal(normalizeCalendar(payload,new Date('2026-10-15T00:00Z'))[0].status,'ended');
 assert.equal(normalizeCalendar({data:{dailyList:[]}}).length,0);
});
test('matching menu does not label other accessories or sold-out products as available',()=>{
 const menu={data:{meals:{badge:{name:'联名徽章',currentPrice:'39.9'},hat:{name:'联名棒球帽',currentPrice:'39.9'},sold:{name:'联名徽章套装',soldOut:true,currentPrice:'39.9'},unavailable:{name:'联名徽章盲盒',available:false},free:{name:'联名徽章赠品',currentPrice:0}}}};
 const matches=matchOffers(menu,activities.find(a=>a.kind==='徽章'));
 assert.deepEqual(matches.map(m=>m.code),['badge','free']);assert.equal(matches[1].price,'0');
 assert.deepEqual(matchOffers(menu,activities.find(a=>a.kind==='丝巾')),[]);
});
test('stores retain unknown coordinates as unknown, business closed is preserved',()=>{
 const stores=normalizeStores({data:[{storeCode:'1',beCode:'a',storeName:'测试店',businessStatus:false},{storeCode:'2',latitude:31.23,longitude:121.47,coordinateSystem:'WGS84'}]});
 assert.equal(stores[0].open,false);assert.equal(stores[0].point,null);
 assert.equal(stores[1].coordinateSystem,'WGS84');assert.deepEqual(stores[1].point,{lat:31.23,lng:121.47});
 assert.equal(officialImage('https://mcd.cn.evil.example/image.jpg'),null);
 assert.equal(officialImage('https://name:secret@mcd.cn/image.jpg'),null);
});
test('walking and cycling select separately prepared road networks',()=>{
 const from={lat:31.23,lng:121.47},to={lat:31.24,lng:121.48};
 assert.match(routeUrl(from,to,'walking'),/routed-foot\/route/);
 assert.match(routeUrl(from,to,'cycling'),/routed-bike\/route/);
 assert.throws(()=>routeUrl(from,{lat:40,lng:116},'walking'),{code:'TOO_FAR'});
 assert.throws(()=>routeUrl(from,to,'flying'),{code:'INVALID_MODE'});
 assert.throws(()=>routeUrl({lat:NaN,lng:121},to,'walking'),{code:'INVALID_POINT'});
});
test('route uses provider distance and time, rejects unavailable or corrupt route rather than substituting straight line',()=>{
 const payload={code:'Ok',routes:[{distance:1531.2,duration:1239.1,geometry:{coordinates:[[121.47,31.23],[121.48,31.24]]},legs:[{steps:[{name:'人民大道',distance:200,maneuver:{type:'turn',modifier:'left'}}]}]}],waypoints:[{distance:3},{distance:5}]};
 const r=parseRoute(payload,'walking');assert.equal(r.distance,1531.2);assert.equal(r.duration,1239.1);assert.equal(r.endSnap,5);assert.match(r.steps[0].text,/左转.*人民大道/);
 assert.throws(()=>parseRoute({code:'NoRoute'},'walking'),{code:'NO_ROUTE'});
 payload.routes[0].distance=NaN;assert.throws(()=>parseRoute(payload,'walking'),{code:'NO_ROUTE'});
 payload.routes[0].distance=1;payload.routes[0].geometry.coordinates=[[0,100],[0,1]];assert.throws(()=>parseRoute(payload,'walking'),{code:'BAD_ROUTE'});
});
test('Photon malformed or out-of-region candidates are filtered',()=>{
 const p=placesFromPhoton({features:[{properties:{name:'人民广场',osm_id:1,osm_type:'W'},geometry:{coordinates:[121.47,31.23]}},{properties:{},geometry:{coordinates:[0,0]}},{properties:{}}]});
 assert.equal(p.length,1);assert.equal(p[0].name,'人民广场');
});
test('map redirects fail before following another endpoint',async()=>{
 let count=0;
 await assert.rejects(mapJson('https://routing.openstreetmap.de/test',async(url,options)=>{count++;assert.equal(options.redirect,'manual');assert.equal(new Headers(options.headers).has('Authorization'),false);return new Response('',{status:302,headers:{Location:'https://other.example'}});}),{code:'MAP_UNAVAILABLE'});
 assert.equal(count,1);
});

const dummyToken='test-placeholder-not-a-real-token';
function mockMcp({sse=false,failTool=false,markdown=false}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  const body=JSON.parse(options.body),headers=new Headers(options.headers);calls.push(body);
  assert.equal(url,'https://mcp.mcd.cn');assert.equal(options.redirect,'manual');assert.equal(headers.get('Authorization'),`Bearer ${dummyToken}`);
  if(body.method!=='initialize'){assert.equal(headers.get('MCP-Protocol-Version'),'2025-03-26');assert.equal(headers.get('Mcp-Session-Id'),'fake-session');}
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  const result=body.method==='initialize'?{protocolVersion:'2025-03-26'}:body.method==='tools/list'?{tools:[{name:'campaign-calendar',inputSchema:{type:'object',properties:{}}},{name:'query-nearby-stores',inputSchema:{type:'object',properties:{searchType:{type:'string',enum:['2']},beType:{type:'integer'},city:{type:'string'},keyword:{type:'string'}},required:['searchType','beType','city','keyword']}}]}:failTool?{isError:true,content:[{type:'text',text:'private diagnostic'}]}:markdown?{content:[{type:'text',text:'# Original Response\n```json\n'+JSON.stringify(fixture)+'\n```'}]}:{structuredContent:fixture};
  const payload=JSON.stringify({jsonrpc:'2.0',id:body.id,result});
  if(!sse)return new Response(payload,{headers:{'content-type':'application/json','mcp-session-id':'fake-session'}});
  const bytes=new TextEncoder().encode('event: message\ndata: '+payload+'\n\n');
  // Split UTF-8 mid-character and deliberately leave the stream open.
  const split=bytes.findIndex(b=>b>=0xe0)+1;
  return new Response(new ReadableStream({start(c){c.enqueue(bytes.slice(0,split));c.enqueue(bytes.slice(split));}}),{headers:{'content-type':'text/event-stream','mcp-session-id':'fake-session'}});
 };
 return {fetcher,calls};
}
for(const options of [{},{sse:true},{markdown:true}])test('MCP handshake and Chinese calendar decoding '+JSON.stringify(options),async()=>{
 const {fetcher}=mockMcp(options);
 const data=await withMcp(dummyToken,c=>c.call('campaign-calendar'),{fetcher});
 assert.deepEqual(data,fixture);
});
test('MCP converts arguments according to the live schema and forbids writes',async()=>{
 const {fetcher,calls}=mockMcp();
 await withMcp(dummyToken,async c=>{
  await c.call('query-nearby-stores',{searchType:2,beType:'1',city:'上海',keyword:'人民广场',unrecognized:'ignored'});
  await assert.rejects(c.call('create-order',{}),{code:'FORBIDDEN_TOOL'});
 },{fetcher});
 assert.deepEqual(calls.find(c=>c.method==='tools/call').params.arguments,{searchType:'2',beType:1,city:'上海',keyword:'人民广场'});
 assert.equal(calls.filter(c=>c.method==='tools/call').length,1);
});
test('MCP authorization errors do not include upstream body or credential',async()=>{
 await assert.rejects(withMcp(dummyToken,c=>c.call('campaign-calendar'),{fetcher:async()=>new Response(dummyToken,{status:401})}),e=>e.code==='INVALID_TOKEN'&&!e.message.includes(dummyToken));
 await assert.rejects(withMcp(dummyToken,c=>c.call('campaign-calendar'),{fetcher:mockMcp({failTool:true}).fetcher}),e=>e.code==='MCP_TOOL_ERROR'&&!e.message.includes('private diagnostic'));
});
test('HTTP boundary rejects cross-site, missing credentials and oversized requests',async()=>{
 const make=(headers={},body='{}')=>new Request('https://example.test/api/mcd',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
 await assert.rejects(readInput(make({Origin:'https://elsewhere.test'})),{code:'ORIGIN_REJECTED'});
 await assert.rejects(readInput(make({},'x'.repeat(17000))),e=>e.httpStatus===413);
 assert.throws(()=>getToken(make()),{code:'INVALID_TOKEN'});
 const failureBody=await failure(new Error('a private stack and token')).json();
 assert.equal(failureBody.error.code,'REQUEST_FAILED');assert.doesNotMatch(failureBody.error.message,/private|token/);
 assert.deepEqual(await readInput(make({Origin:'https://example.test'},'{"action":"calendar"}')),{action:'calendar'});
});

const {enrichCoordinates}=await import('../lib/store-coordinates.ts');
const {locateBrowser}=await import('../lib/browser-location.ts');
test('coordinates are joined by official store code, never by similar name or theme eligibility',async()=>{
 const calls=[];
 const client={async call(name,args){calls.push({name,args});if(name==='mall-points-products')return {data:[{spuId:100,spuName:'测试派对',status:2}]};if(name==='query-party-city')return {data:[{code:310100,name:'上海市',latitude:31.23,longitude:121.47}]};return {data:[{code:'same',name:'另一显示名称',latitude:31.17,longitude:121.38},{code:'different',name:'同名门店',latitude:31.18,longitude:121.39}]};}};
 const base={beCode:'',address:'',open:true,hours:'',point:null,coordinateSystem:null};
 const result=await enrichCoordinates(client,[{...base,id:'same',name:'合川路门店'},{...base,id:'missing',name:'同名门店'}],'上海');
 assert.deepEqual(result[0].point,{lat:31.17,lng:121.38});assert.equal(result[0].coordinateSystem,null);assert.equal(result[1].point,null);
 assert.equal(calls[2].args.spuId,100);assert.equal(calls[2].args.code,'310100');
});
test('coordinate catalog failure keeps the original nearby-store result usable',async()=>{
 const original=[{id:'1',name:'测试店',point:null}];
 assert.deepEqual(await enrichCoordinates({call:async()=>{throw new Error('unavailable');}},original,'上海'),original);
});
test('browser geolocation requests high accuracy and retains measured accuracy',async()=>{
 const g={getCurrentPosition(success,error,options){assert.equal(options.enableHighAccuracy,true);assert.equal(options.timeout,12000);success({coords:{latitude:31.23,longitude:121.47,accuracy:20}});}};
 assert.deepEqual(await locateBrowser(g,true),{point:{lat:31.23,lng:121.47},accuracy:20});
});
test('browser location failures explain permission, availability and timeout without fake coordinates',async()=>{
 await assert.rejects(locateBrowser(undefined,false),/HTTPS/);
 await assert.rejects(locateBrowser(undefined,true),/不支持定位/);
 for(const [code,expected] of [[1,/权限/],[2,/无法确定位置/],[3,/超时/]])await assert.rejects(locateBrowser({getCurrentPosition(success,error){error({code});}},true),expected);
});
test('location diagnostics distinguish browser permission from unavailable position data',async()=>{
 for(const [state,code,expected] of [['granted',2,/已允许定位.*无法确定位置/],['granted',3,/已允许定位.*12秒.*超时/],['prompt',3,/权限仍需确认/],['denied',2,/权限未开启/]]){
  const permissions={async query(descriptor){assert.deepEqual(descriptor,{name:'geolocation'});return {state};}};
  await assert.rejects(locateBrowser({getCurrentPosition(success,error){error({code});}},true,permissions),expected);
 }
});
test('unsupported permission inspection preserves failure and does not affect successful location',async()=>{
 const unsupported={async query(){throw new TypeError('unsupported permission');}};
 await assert.rejects(locateBrowser({getCurrentPosition(success,error){error({code:2});}},true,unsupported),/无法确定位置/);
 let inspected=false;
 const result=await locateBrowser({getCurrentPosition(success){success({coords:{latitude:31.23,longitude:121.47,accuracy:20}});}},true,{async query(){inspected=true;throw new Error('unexpected inspection');}});
 assert.equal(inspected,false);assert.equal(result.accuracy,20);
});

const restaurants=parseRestaurants(JSON.parse(await readFile(new URL('./fixtures/official-restaurants.json',import.meta.url),'utf8')));
test('official locator matches both complete name and address within the same city',()=>{
 const target={name:'麦当劳上海合川路餐厅',address:'合川路2570号102、103、104商铺'};
 const match=matchRestaurant(restaurants,target,'上海');assert.ok(match);assert.equal(match.point.lng,121.385104);
 assert.equal(matchRestaurant(restaurants,{...target,address:'合川路2571号102、103、104商铺'},'上海'),null);
 assert.equal(matchRestaurant(restaurants,{...target,name:'麦当劳上海合川路二店餐厅'},'上海'),null);
 assert.equal(matchRestaurant(restaurants,target,'北京'),null);
 assert.equal(matchRestaurant([...restaurants,{...match,point:{lng:121.4,lat:31.2}}],target,'上海'),null);
});
test('Tencent restaurant coordinates are converted before use on OSM',()=>{
 const gcj={lng:121.385104,lat:31.166105},wgs=toWgs(gcj);
 assert.ok(wgs.lng>121.3804&&wgs.lng<121.3806);assert.ok(wgs.lat>31.1679&&wgs.lat<31.1681);
 const roundtrip=toGcj(wgs);assert.ok(Math.abs(roundtrip.lng-gcj.lng)<1e-8&&Math.abs(roundtrip.lat-gcj.lat)<1e-8);
 const known=toGcj({lng:116.404,lat:39.915});assert.ok(Math.abs(known.lng-116.410244499)<1e-7);assert.ok(Math.abs(known.lat-39.916404282)<1e-7);
});
test('locator rejects missing/invalid coordinates and does not invent absent stores',()=>{
 assert.deepEqual(parseRestaurants({data:[{title:'麦当劳测试餐厅',address:'测试路1号',city:'上海市',location:{lat:0,lng:0}}]}),[]);
 assert.equal(matchRestaurant(restaurants,{name:'麦当劳上海徐汇宜山路长兴园餐厅',address:'宜山路1397号5幢B栋111室商铺'},'上海'),null);
});
test('official public locator never receives account credentials and refuses redirects',async()=>{
 await assert.rejects(nearbyRestaurants({lng:121.38,lat:31.17},async(url,options)=>{
  assert.equal(url,'https://www.mcdonalds.com.cn/ajaxs/search_by_point');assert.equal(options.redirect,'manual');
  assert.equal(new Headers(options.headers).has('Authorization'),false);assert.equal(new Headers(options.headers).has('Cookie'),false);
  return new Response('',{status:302,headers:{Location:'https://elsewhere.example'}});
 }),{code:'LOCATOR_UNAVAILABLE'});
});
