import { readdir, mkdir, copyFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const source = new URL("source/pages-dist/", root);
// Only publish allowlisted compiled entrypoints/assets. Retain old hashed assets
// so an already-open page can continue loading its original version.
for (const entry of await readdir(source, { withFileTypes: true })) {
  if (entry.name === "assets" && entry.isDirectory()) {
    await mkdir(new URL("assets/", root), { recursive: true });
    for (const asset of await readdir(new URL("assets/", source))) {
      if (!/^[A-Za-z0-9_-]+\.(js|css)$/.test(asset)) throw new Error("Unexpected asset: " + asset);
      await copyFile(new URL("assets/" + asset, source), new URL("assets/" + asset, root));
    }
  } else if (["index.html", ".nojekyll", "favicon.svg", "file.svg", "globe.svg", "window.svg"].includes(entry.name) && entry.isFile()) {
    await copyFile(new URL(entry.name, source), new URL(entry.name, root));
  } else throw new Error("Unexpected build entry: " + entry.name);
}
console.log("Static website updated from source/pages-dist; commit the changed files to publish.");
