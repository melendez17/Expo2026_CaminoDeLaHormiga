import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac, randomInt } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
export class ApiError extends Error { constructor(public status:number,message:string){super(message);} }
export function configured(){return !!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&process.env.TOKEN_PEPPER);}
export function db(){
  if(!configured())throw new ApiError(503,'Falta configurar Supabase y TOKEN_PEPPER en el servidor.');
  return createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function codeHash(code:string){
  if(!process.env.TOKEN_PEPPER)throw new ApiError(503,'Falta TOKEN_PEPPER.');
  return createHmac('sha256',process.env.TOKEN_PEPPER).update(code).digest('hex');
}
export function sessionHash(token:string){return createHash('sha256').update(token).digest('hex');}
export function shortCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:4},()=>alphabet[randomInt(alphabet.length)]).join('');}
export function check<T>(r:{data:T;error:{message:string;code?:string}|null}):T{
  if(r.error){
    if(r.error.code==='23505')throw new ApiError(409,'Ya existe este registro.');
    const errors:Record<string,[number,string]>={
      invalid_token:[401,'Token inválido o vencido.'],route_not_configured:[503,'Deben configurarse exactamente cinco retos base.'],
      invalid_answers:[422,'Revisa las respuestas del reto.'],invalid_code:[422,'Código incorrecto, agotado o vencido.'],
      challenge_not_assigned:[403,'Este reto no pertenece a tu recorrido.'],challenge_missing:[404,'Reto no disponible.'],
      idempotency_conflict:[409,'La solicitud ya fue utilizada con otros datos.'],route_incomplete:[409,'Completa los cinco retos base primero.'],
      ticket_spent:[409,'Este tiquete ya fue usado para votar.'],ticket_missing:[404,'Tiquete no disponible.'],
      voting_closed:[409,'La votación está cerrada.'],project_missing:[404,'Proyecto no disponible.'],
      raffle_not_closed:[409,'Cierra la rifa en la configuración antes del sorteo.'],
      raffle_snapshot_changed:[409,'Cambió el conjunto de tiquetes. Reintenta el sorteo.'],
      paper_forbidden:[403,'Sin permiso para registrar el pasaporte.']
    };
    const e=errors[r.error.message];if(e)throw new ApiError(...e);
    console.error('Database operation failed:',r.error.code??'unknown');
    throw new ApiError(500,'No se pudo completar la operación.');
  }return r.data;
}
export async function body<T>(req:NextRequest,schema:z.ZodType<T>):Promise<T>{
  if(Number(req.headers.get('content-length')??0)>16000)throw new ApiError(413,'Solicitud demasiado grande.');
  const text=await req.text();if(Buffer.byteLength(text)>16000)throw new ApiError(413,'Solicitud demasiado grande.');
  let value;try{value=JSON.parse(text);}catch{throw new ApiError(400,'JSON inválido.');}
  const parsed=schema.safeParse(value);if(!parsed.success)throw new ApiError(400,parsed.error.issues.map(i=>i.message).join('; '));return parsed.data;
}
export function sameOrigin(req:NextRequest){
  const allowed=process.env.APP_ORIGIN??req.nextUrl.origin;
  if(req.headers.get('origin')!==allowed)throw new ApiError(403,'Origen no permitido.');
}
export async function rate(req:NextRequest,scope:string,limit=20,seconds=60){
  // TRUST_PROXY solo con un proxy configurado para reemplazar esta cabecera.
  const ip=scope.endsWith('-global')?'shared':process.env.TRUST_PROXY==='true'?(req.headers.get('x-forwarded-for')?.split(',')[0].trim()??'unknown'):'shared';
  const key=codeHash('rate:'+scope+':'+ip);
  if(!check(await db().rpc('take_rate_limit',{p_key:key,p_limit:limit,p_seconds:seconds})))throw new ApiError(429,'Demasiados intentos. Espera un momento.');
}
export async function visitor(req:NextRequest){
  const token=req.cookies.get('camino_session')?.value;if(!token)throw new ApiError(401,'Activa tu token para continuar.');
  const session=check(await db().from('participant_sessions').select('participant_id').eq('token_hash',sessionHash(token)).gt('expires_at',new Date().toISOString()).maybeSingle());
  if(!session)throw new ApiError(401,'Tu sesión venció. Activa tu token nuevamente.');return session.participant_id as string;
}
export async function staff(req:NextRequest,roles:string[]){
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)throw new ApiError(401,'Inicia sesión como personal.');
  const client=db();const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)throw new ApiError(401,'Sesión del personal inválida.');
  const profile=check(await client.from('staff').select('user_id,role').eq('user_id',data.user.id).maybeSingle());
  if(!profile||!roles.includes(profile.role))throw new ApiError(403,'Tu rol no permite esta operación.');return profile;
}
export async function state(id:string){
  const client=db();
  const [p,completions,assignments,tickets,survey]=await Promise.all([
    client.from('participants').select('id,kind,name,activated_at,route_completed_at,admission_completed_at').eq('id',id).single(),
    client.from('completions').select('challenge_id').eq('participant_id',id),
    client.from('challenge_assignments').select('challenge_id').eq('participant_id',id),
    client.from('tickets').select('id,source,votes(ticket_id)').eq('participant_id',id),
    client.from('surveys').select('participant_id').eq('participant_id',id).maybeSingle()
  ]);
  const v=check(p);if(!v)throw new ApiError(404,'Participante no disponible.');return {id:v.id,kind:v.kind,firstName:v.name.trim().split(/\s+/)[0],activatedAt:v.activated_at,routeCompletedAt:v.route_completed_at,admissionCompletedAt:v.admission_completed_at,surveySubmitted:!!check(survey),completed:(check(completions)??[]).map(c=>c.challenge_id),assigned:(check(assignments)??[]).map(c=>c.challenge_id),tickets:(check(tickets)??[]).map(t=>({id:t.id,source:t.source,spent:t.votes.length>0}))};
}
export async function allRows(table:string,columns:string){
  const rows:Record<string,unknown>[]=[];
  for(let offset=0;;offset+=1000){const page=check(await db().from(table).select(columns).order('id').range(offset,offset+999))??[];rows.push(...page as unknown as Record<string,unknown>[]);if(page.length<1000)return rows;}
}
