import 'server-only';
import { z } from 'zod';
export class HttpError extends Error { constructor(public status: number, message: string, public details?: Record<string, unknown>) {super(message);} }
export function appUrl() {
  const value = process.env.APP_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:3417' : '');
  if (!value) throw new HttpError(503, 'APP_URL is not configured');
  return new URL(value).origin;
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Cookie-authenticated mutations always require a browser Origin, even on localhost.
  if (!origin || origin !== appUrl()) throw new HttpError(403, 'Request origin is not allowed');
}
export async function bodyJson(request: Request, maxBytes = 1_000_000): Promise<unknown> {
  const body = await boundedText(request, maxBytes);
  try {return JSON.parse(body);} catch {throw new HttpError(400, 'Invalid JSON');}
}
export async function boundedText(request: Request, maxBytes: number) {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, 'Request is too large');
  if (!request.body) return '';
  const reader = request.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  while (true) {const {done,value} = await reader.read(); if(done) break; size += value.byteLength; if(size>maxBytes){await reader.cancel();throw new HttpError(413,'Request is too large');} parts.push(value);}
  return Buffer.concat(parts).toString('utf8');
}
export function json(data: unknown, status = 200, headers?: HeadersInit) {return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({error:error.message,...error.details},error.status);
  if (error instanceof z.ZodError) return json({error:'Invalid input',issues:error.issues.map(i=>({path:i.path,message:i.message}))},400);
  console.error('Santorio server operation failed',error instanceof Error ? error.message : 'Unknown error');
  return json({error:'The request could not be completed. Please retry.'},500);
}
export async function route(operation:()=>Promise<Response>) {try{return await operation();}catch(e){return errorResponse(e);}}
