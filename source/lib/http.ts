import { LotteryError } from "./lottery.ts";
import { object } from "./gallery.ts";
import { assertRequestOrigin } from "./request-origin.ts";
export const headers = {"Cache-Control":"no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"strict-origin-when-cross-origin", "Vary":"Origin, Authorization"};
export function failure(error: unknown): Response {
  const e=error instanceof LotteryError?error:new LotteryError("REQUEST_FAILED","这次查询未能完成，请稍后再试。",502);
  return Response.json({ok:false,error:{code:e.code,message:e.message}}, {status:e.httpStatus,headers:{...headers,...(e.retryAfter?{"Retry-After":String(e.retryAfter)}:{})}});
}
export function getToken(request:Request):string {
  const match=request.headers.get("authorization")?.match(/^Bearer ([\x21-\x7e]{8,8192})$/);
  if(!match) throw new LotteryError("INVALID_TOKEN","请先连接你的麦当劳账户。",401);
  return match[1];
}
export async function readInput(request:Request,limit=16384,allowedOrigins?:ReadonlySet<string>):Promise<Record<string,unknown>> {
  assertRequestOrigin(request,allowedOrigins);
  if(!request.headers.get("content-type")?.startsWith("application/json")) throw new LotteryError("INVALID_REQUEST","请求格式不正确。",415);
  if(Number(request.headers.get("content-length"))>limit) throw new LotteryError("INVALID_REQUEST","请求内容过大。",413);
  const reader=request.body?.getReader();if(!reader) throw new LotteryError("INVALID_REQUEST","缺少请求内容。",400);
  let bytes=0,text="";const decoder=new TextDecoder();
  try {while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>limit)throw new LotteryError("INVALID_REQUEST","请求内容过大。",413);text+=decoder.decode(r.value,{stream:true});}text+=decoder.decode();
    const value=JSON.parse(text);if(!value||typeof value!=="object"||Array.isArray(value))throw new Error();return object(value);
  } catch(e){if(e instanceof LotteryError)throw e;throw new LotteryError("INVALID_REQUEST","请求格式不正确。",400);} finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function textField(value:unknown,max=120):string {if(typeof value!=="string"||!value.trim()||value.length>max)throw new LotteryError("INVALID_REQUEST","请填写有效的查询内容。",400);return value.trim();}
