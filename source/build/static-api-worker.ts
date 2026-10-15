import { POST as queryMcd } from "../app/api/mcd/route";
import { POST as reverseLocation } from "../app/api/map/route";
import { headers } from "../lib/http";
import { configuredOrigins, corsResponse, preflight } from "../lib/request-origin";

// Static files are served by the asset host. Only these two API paths execute
// application code; source files and development diagnostics are never routes.
export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const handle = path === "/api/mcd" ? queryMcd
      : path === "/api/map" ? reverseLocation : null;
    if (!handle) return new Response("Not found", { status: 404, headers });
    const origins = configuredOrigins(env.PUBLIC_WEB_ORIGINS);
    if (request.method === "OPTIONS") return preflight(request, origins);
    if (request.method !== "POST") {
      return Response.json({ ok: false, error: { message: "请从应用发起查询。" } }, {
        status: 405, headers: { ...headers, Allow: "POST" },
      });
    }
    return corsResponse(request, await handle(request, origins), origins);
  },
};
