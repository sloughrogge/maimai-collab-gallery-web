import assert from 'node:assert/strict';

// No cookie, hosted bypass token or MCP credential: suitable for anonymous
// checks against the local production build and the public deployment.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5180';
const origin = new URL(base).origin;
const results = [];
async function request(path, expected, init = {}) {
  const response = await fetch(new URL(path, base), { redirect: 'manual', ...init });
  assert.equal(response.status, expected, `${path}: unexpected HTTP status`);
  results.push({ path, status: response.status });
  return response;
}
const page = await request('/', 200);
assert.match(page.headers.get('content-type'), /text\/html/);
const html = await page.text();
assert(html.includes('麦麦联名馆'));
assert(html.includes('id="root"'));
assert(!html.includes('signin-with-chatgpt'));
const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1]);
assert(scripts.some(path => path.endsWith('.js')));
for (const path of scripts) {
  const asset = await request(path, 200);
  const body = await asset.text();
  assert(!body.includes('sourceMappingURL='));
  assert(!body.includes('mcp.mcd.cn'));
  if (path.endsWith('.js')) await request(path + '.map', 404);
}
for (const path of ['/app/page.tsx', '/lib/mcp.ts', '/.env', '/.git/config', '/server/index.js', '/tests/fixtures/calendar.json', '/api/diagnostics']) {
  await request(path, 404);
}
const post = (body, extra = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...extra }, body: JSON.stringify(body) });
await request('/api/mcd', 405);
const missingToken = await request('/api/mcd', 401, post({ action: 'calendar' }));
assert.equal(missingToken.headers.get('cache-control'), 'no-store');
assert.equal((await missingToken.json()).error.code, 'INVALID_TOKEN');
await request('/api/mcd', 403, post({ action: 'calendar' }, { Origin: 'https://example.org' }));
await request('/api/map', 400, post({ action: 'reverse', point: {lat: 1000, lng: 1000} }));
console.log(JSON.stringify({ check: 'anonymous_static_http', base: origin, passed: true, results }, null, 2));
