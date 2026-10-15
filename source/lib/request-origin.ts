import { LotteryError } from "./lottery.ts";

export function configuredOrigins(value = ""): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const item of value.split(",")) {
    const raw = item.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      // Configure complete HTTPS origins, never wildcard subdomains or paths.
      if (url.protocol === "https:" && url.origin === raw && !url.hostname.includes("*")) origins.add(raw);
    } catch { /* Invalid configuration stays denied. */ }
  }
  return origins;
}

export function assertRequestOrigin(request: Request, allowed: ReadonlySet<string> = new Set()) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const trustedExternal = !!origin && allowed.has(origin);
  if ((origin && origin !== new URL(request.url).origin && !trustedExternal) ||
      (site && !["same-origin", "none"].includes(site) && !trustedExternal)) {
    throw new LotteryError("ORIGIN_REJECTED", "请从本应用发起查询。", 403);
  }
}

export function corsResponse(request: Request, response: Response, allowed: ReadonlySet<string>): Response {
  const origin = request.headers.get("origin");
  if (!origin || !allowed.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  const vary = new Set((headers.get("Vary") || "").split(",").map(v => v.trim()).filter(Boolean));
  vary.add("Origin");
  headers.set("Vary", [...vary].join(", "));
  return new Response(response.body, { status: response.status, headers });
}

export function preflight(request: Request, allowed: ReadonlySet<string>): Response {
  const origin = request.headers.get("origin");
  const method = request.headers.get("access-control-request-method");
  const fields = (request.headers.get("access-control-request-headers") || "")
    .toLowerCase().split(",").map(field => field.trim()).filter(Boolean);
  if (!origin || !allowed.has(origin) || method !== "POST" ||
      fields.some(field => !["authorization", "content-type"].includes(field))) {
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } });
  }
  return corsResponse(request, new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    "Cache-Control": "no-store",
  } }), allowed);
}
