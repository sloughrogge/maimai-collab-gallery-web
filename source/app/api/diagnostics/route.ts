import {discoveredSchemas} from "../../../lib/mcp.ts";
import {coordinateEvidence} from "../../../lib/store-coordinates.ts";
export function GET(){return process.env.NODE_ENV==="development"?Response.json({schemas:discoveredSchemas(),coordinates:coordinateEvidence()},{headers:{"Cache-Control":"no-store"}}):new Response(null,{status:404});}
