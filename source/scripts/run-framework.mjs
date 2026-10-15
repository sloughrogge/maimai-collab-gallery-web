import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const cli = new URL("../node_modules/vite/bin/vite.js", import.meta.url);
// Retain the existing developer command while using the static React build.
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...args.map(arg => arg === "--hostname" ? "--host" : arg)];
await import(cli.href);
