import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../pages-dist/',import.meta.url);
await rm(new URL('_headers',root),{force:true});
await writeFile(new URL('.nojekyll',root),'');
const html=await readFile(new URL('index.html',root),'utf8');
assert(/src="\.\/assets\/.+\.js"/.test(html),'Pages scripts must use a relative base');
assert(html.includes('href="./favicon.svg"'),'Pages favicon must use a relative base');
async function check(dir){for(const item of await readdir(dir,{withFileTypes:true})){
 const path=new URL(item.name+(item.isDirectory()?'/':''),dir);
 if(item.isDirectory()){assert.equal(item.name,'assets');await check(path);continue;}
 assert(!/\.(map|tsx?|jsx|mjs)$/.test(item.name));
 assert(!/^\.(env|git)/.test(item.name));
 if(/\.(js|html|css)$/.test(item.name)){
  const body=await readFile(path,'utf8');
  for(const marker of ['sourceMappingURL=','ui-replay-token','mcp.mcd.cn','query-nearby-stores','INSERT INTO service_limits'])assert(!body.includes(marker),`Unexpected server or test data: ${marker}`);
 }
}}
await check(root);
console.log('GitHub Pages artifact verified: relative assets, no backend code or source maps.');
