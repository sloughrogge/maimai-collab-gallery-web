import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";

export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  const managed = readExecutionProfile() === "managed-linux";
  return {
    server: {
      ...(managed ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(process.env.CODEX_SANDBOX === "seatbelt"
        ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    build: { sourcemap: false, minify: true },
    environments: { server: { build: { sourcemap: false, minify: true } } },
    plugins: [
      react(),
      sites({ mockAuth: false }),
      cloudflare({
        viteEnvironment: { name: "server" },
        inspectorPort: false,
        config: {
          name: "maimai-collab-gallery",
          main: "./build/static-api-worker.ts",
          compatibility_date: "2026-05-15",
          compatibility_flags: ["nodejs_compat"],
          assets: { not_found_handling: "none", run_worker_first: ["/api/*"] },
          d1_databases: hostingConfig.d1 ? [{
            binding: hostingConfig.d1,
            database_name: "site-creator-d1",
            database_id: "00000000-0000-4000-8000-000000000000",
          }] : [],
          r2_buckets: hostingConfig.r2 ? [{ binding: hostingConfig.r2, bucket_name: "site-creator-r2" }] : [],
        },
      }),
    ],
  };
});
