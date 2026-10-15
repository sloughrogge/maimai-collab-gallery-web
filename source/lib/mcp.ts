import { LotteryError, record } from "./lottery.ts";

const MCP_URL = "https://mcp.mcd.cn";
const PROTOCOL_VERSION = "2025-06-18";
const MAX_RESPONSE_BYTES = 2_097_152;
const DEFAULT_TIMEOUT_MS = 45_000;

type Fetcher = typeof fetch;
type RpcMessage = Record<string, unknown>;

function upstreamHttpError(response: Response): LotteryError {
  if (response.status >= 300 && response.status < 400) {
    return new LotteryError("UPSTREAM_REDIRECT", "官方连接地址发生变化，已停止这次查询，请稍后重试。");
  }
  if (response.status === 401 || response.status === 403) {
    return new LotteryError("INVALID_TOKEN", "麦当劳拒绝了连接，请检查 Token 是否有效或重新获取。", 401);
  }
  if (response.status === 429) {
    const value = Number(response.headers.get("retry-after"));
    const retry = Number.isFinite(value) && value > 0 ? Math.min(Math.ceil(value), 3600) : 30;
    return new LotteryError("RATE_LIMITED", "查询过于频繁，请稍后再试。", 429, retry);
  }
  return new LotteryError("UPSTREAM_UNAVAILABLE", "麦当劳服务暂时无法连接，请稍后重试。");
}

function json(value: string): unknown {
  try { return JSON.parse(value); }
  catch { throw new LotteryError("UPSTREAM_RESPONSE", "麦当劳返回的信息格式暂时无法识别，请稍后重试。"); }
}

function responseError(): LotteryError {
  return new LotteryError("UPSTREAM_RESPONSE", "麦当劳返回的信息不完整，请稍后重试。");
}

function rpcResult(value: unknown, id: number): unknown {
  const message = record(value);
  if (!message || message.jsonrpc !== "2.0" || message.id !== id) throw responseError();
  if (message.error) throw new LotteryError("MCP_ERROR", "麦当劳暂时无法完成这次查询，请稍后重试。");
  if (!("result" in message)) throw responseError();
  return message.result;
}

/** Read bounded JSON or SSE. SSE may remain open after the matching RPC response. */
async function readRpc(response: Response, id?: number): Promise<unknown> {
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw upstreamHttpError(response);
  }
  const length = Number(response.headers.get("content-length"));
  if (length > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw responseError();
  }
  if (id === undefined) {
    // The initialized notification has no response body in Streamable HTTP.
    await response.body?.cancel().catch(() => {});
    return undefined;
  }
  const reader = response.body?.getReader();
  if (!reader) throw responseError();
  const decoder = new TextDecoder();
  const isSse = (response.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream");
  let bytes = 0;
  let buffer = "";
  const sseMessage = (event: string): RpcMessage | null => {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data || data === "[DONE]") return null;
    const parsed = record(json(data));
    return parsed?.id === id ? parsed : null;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw responseError();
      buffer += decoder.decode(value, { stream: true });
      if (isSse) {
        while (true) {
          const boundary = /\r?\n\r?\n/.exec(buffer);
          if (!boundary) break;
          const event = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const message = sseMessage(event);
          if (message) return rpcResult(message, id);
        }
      }
    }
    buffer += decoder.decode();
    if (!isSse) return rpcResult(json(buffer), id);
    const message = sseMessage(buffer);
    if (message) return rpcResult(message, id);
    throw responseError();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** The official server may place JSON after a Markdown “Original Response” heading. */
function parseToolText(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return json(trimmed);
  const marker = /(?:^|\n)#{1,6}\s+Original Response\s*(?:\r?\n|$)/i.exec(trimmed);
  if (!marker) throw responseError();
  const remainder = trimmed.slice(marker.index + marker[0].length).trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(remainder);
  return json(fenced ? fenced[1] : remainder);
}

function toolPayload(value: unknown): unknown {
  const result = record(value);
  if (!result) throw responseError();
  if (result.isError === true) {
    throw new LotteryError("MCP_TOOL_ERROR", "麦当劳暂时无法查询活动，请稍后重试。");
  }
  if (record(result.structuredContent)) return result.structuredContent;
  if (!Array.isArray(result.content)) throw responseError();
  for (const item of result.content) {
    const block = record(item);
    if (block?.type === "text" && typeof block.text === "string") {
      try { return parseToolText(block.text); }
      catch (error) { if (!(error instanceof LotteryError)) throw error; }
    }
  }
  throw responseError();
}

/** Every query owns its credential, session and timeout; no credentials are stored or logged. */
export async function withMcp<T>(token: string, action: (client: McpClient) => Promise<T>, options: {
  fetcher?: Fetcher;
  timeoutMs?: number;
  now?: Date;
} = {}): Promise<T> {
  if (!/^[\x21-\x7e]{8,8192}$/.test(token)) {
    throw new LotteryError("INVALID_TOKEN", "请粘贴完整的麦当劳 MCP Token。", 401);
  }
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let session: string | null = null;
  let protocol: string | null = null;
  const send = async (method: string, params: Record<string, unknown> | undefined, id?: number) => {
    const headers = new Headers({
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    });
    if (session) headers.set("Mcp-Session-Id", session);
    if (protocol) headers.set("MCP-Protocol-Version", protocol);
    const body: Record<string, unknown> = { jsonrpc: "2.0", method };
    if (id !== undefined) body.id = id;
    if (params !== undefined) body.params = params;
    const response = await fetcher(MCP_URL, {
      method: "POST", headers, body: JSON.stringify(body), signal: controller.signal,
      // workerd supports manual/follow, but rejects redirect:"error" synchronously.
      // Refuse all redirects in readRpc; never forward the credential to a Location.
      cache: "no-store", redirect: "manual", credentials: "omit",
    });
    if (method === "initialize" && response.ok) {
      const header = response.headers.get("mcp-session-id");
      if (header && !/^[\x21-\x7e]{1,1024}$/.test(header)) throw responseError();
      session = header;
    }
    return readRpc(response, id);
  };
  try {
    const init = record(await send("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {}, clientInfo: { name: "maimai-collab-gallery", version: "1.0.0" },
    }, 1));
    if (!init || typeof init.protocolVersion !== "string"
      || ![PROTOCOL_VERSION, "2025-03-26", "2024-11-05"].includes(init.protocolVersion)) throw responseError();
    protocol = init.protocolVersion;
    await send("notifications/initialized", undefined);
    let id = 2;
    const definitions: Record<string, unknown>[] = [];
    let cursor: unknown;
    for (let page=0;page<5;page++) {
      const listed=record(await send("tools/list", cursor ? {cursor} : {}, id++));
      if (Array.isArray(listed?.tools)) definitions.push(...listed.tools.map(record).filter((x):x is Record<string,unknown>=>!!x));
      cursor=listed?.nextCursor; if (!cursor) break;
    }
    for (const tool of definitions) discovered.set(String(tool.name), {name:tool.name,inputSchema:tool.inputSchema,outputSchema:tool.outputSchema,description:tool.description});
    return await action({
      async call(name, args={}) {
        if (!ALLOWED.has(name)) throw new LotteryError("FORBIDDEN_TOOL", "此应用只支持活动和门店的只读查询。",403);
        const definition=definitions.find(t=>t.name===name);
        if (!definition) throw new LotteryError("TOOL_UNAVAILABLE", "官方暂未提供所需查询功能，请稍后再试。");
        const result=toolPayload(await send("tools/call",{name,arguments:prepareArgs(definition.inputSchema,args)},id++));
        const envelope=record(result);
        if (!envelope || envelope.success===false || (envelope.code!==undefined&&!['200','0','0000'].includes(String(envelope.code)))) throw new LotteryError("OFFICIAL_QUERY_FAILED","官方暂时未能返回这项查询，请稍后重试。");
        return result;
      }
    });
  } catch (error) {
    if (controller.signal.aborted) throw new LotteryError("TIMEOUT", "查询等待时间较长，请稍后重新查询。", 504);
    if (error instanceof LotteryError) throw error;
    throw new LotteryError("NETWORK_ERROR", "暂时无法连接麦当劳服务，请稍后重试。");
  } finally {
    clearTimeout(timeout);
    // These request-scoped references are discarded once the request completes.
    session = null;
    protocol = null;
  }
}

const ALLOWED=new Set(["campaign-calendar","query-nearby-stores","query-meals","query-meal-detail","mall-points-products","mall-product-detail","query-party-city","query-party-store"]);
const discovered=new Map<string,unknown>();
export function discoveredSchemas() { return [...discovered.values()]; }
export interface McpClient { call(name:string,args?:Record<string,unknown>):Promise<unknown> }
export function prepareArgs(value:unknown,args:Record<string,unknown>):Record<string,unknown> {
  const schema=record(value),properties=record(schema?.properties)||{}; const result:Record<string,unknown>={};
  for (const [key,value] of Object.entries(args)) {
    if (value===undefined||value===null||value==="") continue;
    const field=record(properties[key]);
    if (!field) continue;
    let next:unknown=value;
    if(field.type==="string") next=String(value);
    if(field.type==="integer"||field.type==="number") {next=Number(value);if(!Number.isFinite(next)||(field.type==="integer"&&!Number.isInteger(next))) throw new LotteryError("INVALID_REQUEST","查询参数无效。",400);}
    if(Array.isArray(field.enum)&&!field.enum.includes(next)) throw new LotteryError("UNSUPPORTED_SCHEMA","官方参数已变化，请更新应用后重试。");
    result[key]=next;
  }
  if(Array.isArray(schema?.required)&&schema.required.some(k=>!(String(k) in result))) throw new LotteryError("UNSUPPORTED_SCHEMA","官方查询需要额外参数，暂时无法自动完成。");
  return result;
}
