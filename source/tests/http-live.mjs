import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
const base=process.env.GALLERY_TEST_URL||'http://127.0.0.1:5180';
const outcomes=[];
const providerObservations=[];
async function post(path,body,extra={}){const r=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...extra},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={text};}return {status:r.status,headers:r.headers,data};}
async function check(name,run){await run();outcomes.push({name,result:'passed'});console.log('PASS '+name);}
await check('MCP missing Token is rejected before querying upstream',async()=>{const r=await post('/api/mcd',{action:'calendar'});assert.equal(r.status,401);assert.equal(r.data.error.code,'INVALID_TOKEN');});
await check('Cross-site location requests are rejected',async()=>{const r=await post('/api/map',{action:'reverse',point:{lat:31.23,lng:121.47}},{Origin:'https://unrelated.example'});assert.equal(r.status,403);});
await check('Retired route and store-coordinate actions are rejected',async()=>{for(const action of ['route','store-location','search']){const r=await post('/api/map',{action});assert.equal(r.status,400);assert.equal(r.data.error.code,'INVALID_REQUEST');}});
await check('Overlarge body is rejected',async()=>{const r=await post('/api/map',{action:'reverse',query:'x'.repeat(3000)});assert.equal(r.status,413);});
await check('Invalid location is rejected without a provider request',async()=>{const r=await post('/api/map',{action:'reverse',point:{lat:100,lng:121.47}});assert.equal(r.status,400);assert.equal(r.data.error.code,'INVALID_POINT');});
const point={lat:31.2319264,lng:121.4715447};
function verifyReverse(r){
  assert.match(r.headers.get('cache-control'),/no-store/);
  if(r.status===200){assert.equal(r.data.places[0].city,'上海市');assert.ok(r.data.places[0].street);providerObservations.push({status:r.status,result:'public landmark resolved'});}
  else{assert.ok([502,503].includes(r.status));assert.equal(r.data.ok,false);assert.ok(r.data.error?.message);providerObservations.push({status:r.status,result:'provider unavailable; GPS reverse success not verified',code:r.data.error.code});}
}
await check('Optional reverse lookup returns a valid place or a safe unavailable response',async()=>{verifyReverse(await post('/api/map',{action:'reverse',point}));});
await new Promise(r=>setTimeout(r,1400));
await check('Shared D1 limiter admits one request and rejects the simultaneous request',async()=>{const results=await Promise.all([post('/api/map',{action:'reverse',point}),post('/api/map',{action:'reverse',point})]);assert.equal(results.filter(r=>r.status===429).length,1);assert.equal(results.find(r=>r.status===429).headers.get('retry-after'),'2');verifyReverse(results.find(r=>r.status!==429));});
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('./evidence/store-flow-http.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),base,publicLandmarkCoordinatesOnly:true,outcomes,providerObservations},null,2)+'\n');
console.log(`${outcomes.length} HTTP integration checks passed.`);
