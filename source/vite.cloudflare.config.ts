import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Deploy the frontend and APIs together in the owner's Cloudflare account.
// The existing vite.config.ts remains available for the Sites build workflow.
export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";
  const { cloudflare } = await import("@cloudflare/vite-plugin");
  return {
    define: { "import.meta.env.VITE_API_ORIGIN": JSON.stringify("") },
    build: { sourcemap: false, minify: true },
    environments: { server: { build: { sourcemap: false, minify: true } } },
    plugins: [
      react(),
      cloudflare({
        configPath: "./wrangler.cloudflare.jsonc",
        viteEnvironment: { name: "server" },
        inspectorPort: false,
      }),
    ],
  };
});
