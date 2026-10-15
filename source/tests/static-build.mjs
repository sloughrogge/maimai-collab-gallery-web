import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { relative } from 'node:path';

const root = new URL('../dist/client/', import.meta.url);
async function files(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = new URL(item.name + (item.isDirectory() ? '/' : ''), dir);
    result.push(...(item.isDirectory() ? await files(path) : [path]));
  }
  return result;
}
const list = await files(root);
assert(list.some(file => file.pathname.endsWith('/index.html')));
let scriptCount = 0;
for (const file of list) {
  const name = relative(root.pathname, file.pathname);
  assert(!/(^|\/)(app|lib|tests|server|node_modules|\.git|\.openai)(\/|$)/.test(name), `Source directory exposed: ${name}`);
  assert(!/\.(map|tsx?|jsx|mjs)$/.test(name), `Uncompiled source exposed: ${name}`);
  assert(!/(^|\/)(\.env|\.dev\.vars|package\.json|wrangler\.json)/.test(name), `Configuration exposed: ${name}`);
  if (/\.(html|js|css)$/.test(name)) {
    const body = await readFile(file, 'utf8');
    assert(!body.includes('sourceMappingURL='), `Source map advertised: ${name}`);
    assert(!body.includes('ui-replay-token'), `Replay fixture exposed: ${name}`);
    assert(!body.includes('mcp.mcd.cn'), `MCP transport leaked into client: ${name}`);
    assert(!body.includes('query-nearby-stores'), `MCP tool logic leaked into client: ${name}`);
    assert(!body.includes('INSERT INTO service_limits'), `Database logic leaked into client: ${name}`);
    if (name.endsWith('.js')) scriptCount++;
  }
}
assert(scriptCount > 0);
const html = await readFile(new URL('index.html', root), 'utf8');
assert(html.includes('id="root"'));
assert(/src="\/assets\/[^" ]+\.js"/.test(html));
assert(!html.includes('/client/main.tsx'));
const worker = new URL('../dist/server/', import.meta.url);
const config = JSON.parse(await readFile(new URL('wrangler.json', worker), 'utf8'));
assert.equal(config.main, 'index.js');
assert.equal(config.assets.directory, '../client');
assert.equal(config.assets.not_found_handling, 'none');
assert.deepEqual(config.assets.run_worker_first, ['/api/*']);
assert((await readFile(new URL('index.js', worker), 'utf8')).includes('mcp.mcd.cn'));
console.log(JSON.stringify({ check: 'static_build_boundary', passed: true, publicFiles: list.map(file => relative(root.pathname, file.pathname)), serverSeparate: true }));
