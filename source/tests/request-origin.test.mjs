import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredOrigins, assertRequestOrigin, corsResponse, preflight } from '../lib/request-origin.ts';
import { readInput } from '../lib/http.ts';

const backend='https://api.example.test', frontend='https://gallery-owner.github.io';
const allowed=configuredOrigins(frontend);
const request=(origin, extra={})=>new Request(backend+'/api/mcd', { method:'POST', headers:{Origin:origin,'Sec-Fetch-Site':'cross-site','Content-Type':'application/json',...extra}, body:'{"action":"calendar"}' });
test('only canonical explicitly configured HTTPS origins are accepted',()=>{
 assert.deepEqual([...configuredOrigins(frontend+', https://*.github.io,http://unsafe.test,https://bad.test/path,not-a-url')],[frontend]);
 assert.doesNotThrow(()=>assertRequestOrigin(request(frontend),allowed));
 for(const origin of ['https://another-owner.github.io','https://gallery-owner.github.io.evil.test','null'])assert.throws(()=>assertRequestOrigin(request(origin),allowed),{httpStatus:403});
 assert.throws(()=>assertRequestOrigin(request(frontend)),{httpStatus:403});
});
test('configured Pages origin can use the existing JSON boundary while other sites cannot',async()=>{
 assert.deepEqual(await readInput(request(frontend),16384,allowed),{action:'calendar'});
 await assert.rejects(()=>readInput(request('https://another-owner.github.io'),16384,allowed),{httpStatus:403});
});
test('preflight only allows POST with the app headers, without cookies or wildcard access',()=>{
 const req=(origin, method='POST', fields='authorization,content-type')=>new Request(backend+'/api/mcd',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':fields}});
 const result=preflight(req(frontend),allowed);
 assert.equal(result.status,204);
 assert.equal(result.headers.get('Access-Control-Allow-Origin'),frontend);
 assert.equal(result.headers.get('Access-Control-Allow-Credentials'),null);
 for(const [origin,method,fields] of [['https://evil.test','POST','authorization'],[frontend,'DELETE','content-type'],[frontend,'POST','x-extra']])assert.equal(preflight(req(origin,method,fields),allowed).status,403);
});
test('CORS preserves error status, non-cacheability and authentication requirements',async()=>{
 const original=Response.json({ok:false,error:{code:'INVALID_TOKEN'}},{status:401,headers:{'Cache-Control':'no-store',Vary:'Origin, Authorization'}});
 const result=corsResponse(request(frontend),original,allowed);
 assert.equal(result.status,401);
 assert.equal(result.headers.get('Cache-Control'),'no-store');
 assert.equal(result.headers.get('Vary'),'Origin, Authorization');
 assert.equal(result.headers.get('Access-Control-Allow-Origin'),frontend);
 assert.equal((await result.json()).error.code,'INVALID_TOKEN');
 assert.equal(corsResponse(request('https://evil.test'),new Response(''),allowed).headers.get('Access-Control-Allow-Origin'),null);
});
