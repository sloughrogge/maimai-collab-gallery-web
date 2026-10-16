import assert from "node:assert/strict";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { build } from "vite";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(sourceRoot, "dist/client");
const apiBundle = resolve(sourceRoot, "dist/server/index.js");
const output = resolve(sourceRoot, "cf-pages-dist");
// Keep this outside source/: the Workers Vite plugin puts an automatic deploy
// redirect in source/.wrangler/deploy, which Pages must not inherit.
const deployRoot = resolve(sourceRoot, "../.cloudflare-pages");

// Only replace this build's output, after confirming the standalone build is
// present. The fixed resolved target must stay inside this source workspace.
assert(output.startsWith(sourceRoot + sep));
assert.equal(output, resolve(sourceRoot, "cf-pages-dist"));
await Promise.all([access(resolve(client, "index.html")), access(apiBundle)]);
await rm(output, { recursive: true, force: true });
await cp(client, output, { recursive: true });
await rm(resolve(output, ".assetsignore"), { force: true });

// Reuse the already-built standalone API bundle. Vite (an existing direct
// dependency) compiles only the small Pages adapter around that bundle.
await build({
  configFile: false,
  root: sourceRoot,
  publicDir: false,
  resolve: {
    alias: [{ find: "./static-api-worker", replacement: apiBundle }],
  },
  build: {
    ssr: resolve(sourceRoot, "build/pages-api-worker.ts"),
    outDir: output,
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    rollupOptions: {
      external: ["cloudflare:workers"],
      output: { entryFileNames: "_worker.js" },
    },
  },
});

await writeFile(resolve(output, "_routes.json"), JSON.stringify({
  version: 1,
  include: ["/api/*"],
  exclude: [],
}, null, 2) + "\n");

// Pages otherwise assumes an SPA and serves index.html for unknown paths.
// Preserve the existing app's 404 boundary, including nonexistent source URLs.
await writeFile(resolve(output, "404.html"),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>页面不存在</title><h1>页面不存在</h1><a href="/">返回麦麦联名馆</a></html>\n');

// This project's pinned Wrangler version requires the default config filename
// for Pages. Keep a separate source config and stage the default filename
// outside the public output, adjusting paths from its new directory.
const configPath = resolve(sourceRoot, "wrangler.pages.jsonc");
const parsed = ts.parseConfigFileTextToJson(configPath, await readFile(configPath, "utf8"));
assert(!parsed.error, "Unable to parse wrangler.pages.jsonc");
const config = parsed.config;
const stagedPath = path => relative(deployRoot, resolve(sourceRoot, path)).replaceAll("\\", "/");
config.$schema = stagedPath("node_modules/wrangler/config-schema.json");
config.pages_build_output_dir = stagedPath("cf-pages-dist");
for (const scope of [config, ...Object.values(config.env || {})]) {
  for (const database of scope.d1_databases || []) {
    if (database.migrations_dir) database.migrations_dir = stagedPath(database.migrations_dir);
  }
}
await mkdir(deployRoot, { recursive: true });
await writeFile(resolve(deployRoot, "wrangler.jsonc"), JSON.stringify(config, null, 2) + "\n");

console.log("Cloudflare Pages artifact ready: cf-pages-dist (static assets + API worker).");
