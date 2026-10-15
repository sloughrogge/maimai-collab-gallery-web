import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const apiOrigin = process.env.VITE_API_ORIGIN || "";
  const url = new URL(apiOrigin);
  if (url.protocol !== "https:" || url.origin !== apiOrigin) {
    throw new Error("VITE_API_ORIGIN must be a complete HTTPS origin without a trailing slash.");
  }
  return {
    base: "./",
    plugins: [react()],
    define: { "import.meta.env.VITE_API_ORIGIN": JSON.stringify(apiOrigin) },
    build: { outDir: "pages-dist", emptyOutDir: true, minify: true, sourcemap: false },
  };
});
