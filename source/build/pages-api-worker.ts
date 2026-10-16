import apiWorker from "./static-api-worker";

type PagesEnv = Cloudflare.Env & { ASSETS: Fetcher };

// Pages Advanced mode uses the same API handlers as the standalone Worker.
// _routes.json normally sends only /api/* here; keep the asset fallback for
// direct local use and for any future expansion of the invocation routes.
export default {
  async fetch(request: Request, env: PagesEnv): Promise<Response> {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return apiWorker.fetch(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
