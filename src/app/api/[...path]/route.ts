import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { ApiError, allRows, body, check, codeHash, configured, db, rate, sameOrigin, sessionHash, shortCode, staff, state, visitor } from '@/lib/server';
import { completionInput, csvCell, participantStatus, registrationInput, surveyInput, tokenInput, voteInput } from '@/lib/contracts';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
const publicCatalog=(data:unknown)=>NextResponse.json(data,{headers:{'Cache-Control':'public, s-maxage=60, stale-while-revalidate=120'}});
async function handle(req:NextRequest){
 try{
  const path=req.nextUrl.pathname.replace(/^\/api\//,'');const method=req.method;
  if(method==='POST')sameOrigin(req);
  if(path==='catalog'&&method==='GET'){
   if(!configured())return json({configured:false,challenges:[],questions:[],projects:[],events:[],radioUrl:null});
   const client=db();const [ch,q,p,e,s]=await Promise.all([
    client.from('challenges').select('id,title,description,building_id,project_id,kind,is_base,badge_key').eq('active',true).order('is_base',{ascending:false}),
    client.from('quiz_questions').select('id,challenge_id,kind,prompt,options'),
    client.from('projects').select('id,name,building_id,description').eq('active',true),
    client.from('agenda_events').select('*').order('starts_at'),client.from('settings').select('radio_url').single()
   ]);return publicCatalog({configured:true,challenges:check(ch),questions:check(q),projects:check(p),events:check(e),radioUrl:check(s)?.radio_url??null});
  }
  if(path==='auth/activate'&&method==='POST'){
   await rate(req,'activate',20);await rate(req,'activate-global',600);const {token}=await body(req,tokenInput);
   const raw=randomBytes(32).toString('base64url');const id=check(await db().rpc('activate_participant',{p_token_hash:codeHash(token),p_session_hash:sessionHash(raw)}));
   const res=json(await state(id));res.cookies.set('camino_session',raw,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:86400});return res;
  }
  if(path==='auth/logout'&&method==='POST'){
   const raw=req.cookies.get('camino_session')?.value;
   if(raw)check(await db().from('participant_sessions').delete().eq('token_hash',sessionHash(raw)));
   const res=json({ok:true});res.cookies.delete('camino_session');return res;
  }
  if(path==='me'&&method==='GET')return json(await state(await visitor(req)));
  if(path==='completions'&&method==='POST'){
   const id=await visitor(req);await rate(req,'completion:'+id,30);const input=await body(req,completionInput);
   if(input.participantId!==id)throw new ApiError(409,'Cambió la sesión del dispositivo. Reactiva el token del propietario del borrador.');
   const result=check(await db().rpc('complete_challenge',{p_participant:id,p_challenge:input.challengeId,p_request:input.requestId,p_answers:input.answers,p_code_hash:input.code?codeHash(input.code):null}));
   return json({result,state:await state(id)});
  }
  if(path==='survey'&&method==='POST'){
   const id=await visitor(req);const input=await body(req,surveyInput);
   check(await db().rpc('submit_survey',{p_participant:id,p_expectations:input.expectations,p_satisfaction:input.satisfaction,p_interest:input.interest}));return json(await state(id));
  }
  if(path==='votes'&&method==='POST'){
   const id=await visitor(req);const v=await body(req,voteInput);check(await db().rpc('cast_vote',{p_participant:id,p_ticket:v.ticketId,p_project:v.projectId}));return json(await state(id));
  }
  if(path==='push-subscriptions'&&method==='POST'){
   const id=await visitor(req);const v=await body(req,z.object({endpoint:z.url().startsWith('https://').max(2000),keys:z.object({p256dh:z.string().max(256),auth:z.string().max(128)})}));
   // No se envían solicitudes a endpoints arbitrarios; el worker push requiere configuración adicional.
   const existing=check(await db().from('push_subscriptions').select('participant_id').eq('endpoint',v.endpoint).maybeSingle());
   if(existing&&existing.participant_id!==id)throw new ApiError(409,'Suscripción ya asociada a otra sesión.');
   check(await db().from('push_subscriptions').upsert({participant_id:id,...v},{onConflict:'endpoint'}));return json({ok:true});
  }
  if(path==='admin/login'&&method==='POST'){
   await rate(req,'admin-login',10);const v=await body(req,z.object({email:z.email(),password:z.string().min(8).max(256)}));
   const client=db();const {data,error}=await client.auth.signInWithPassword(v);
   if(error||!data.session)throw new ApiError(401,'Correo o contraseña incorrectos.');
   const profile=check(await client.from('staff').select('role').eq('user_id',data.user.id).maybeSingle());
   if(!profile)throw new ApiError(403,'La cuenta no tiene un rol de personal.');
   return json({accessToken:data.session.access_token,expiresAt:data.session.expires_at,role:profile.role});
  }
  if(path==='admin/participants'&&method==='POST'){
   const actor=await staff(req,['admin','registrar']);const v=await body(req,registrationInput);
   for(let attempt=0;attempt<8;attempt++){
    const token=shortCode();const r=await db().rpc('register_participant',{p_kind:v.kind,p_identity:v.identityNumber??null,p_name:v.name,p_email:v.email,p_phone:v.phone??null,p_token_hash:codeHash(token),p_actor:actor.user_id});
    if(r.error?.code==='23505'&&r.error.message.includes('token_hash'))continue;
    const id=check(r);return json({id,token,expiresInHours:24},201);
   }throw new ApiError(503,'No se pudo reservar un código. Reintenta.');
  }
  if(path==='admin/metrics'&&method==='GET'){
   await staff(req,['admin','registrar','admissions','raffle']);return json(check(await db().rpc('admin_metrics')));
  }
  if(path==='admin/report'&&method==='GET'){
   await staff(req,['admin','admissions']);
   const rows=await allRows('participants','id,kind,identity_number,name,email,phone,created_at,activated_at,route_completed_at,admission_completed_at,surveys(expectations,satisfaction,interest),completions(challenge_id,answers,source,created_at)');
   const header=['id','tipo','cedula','nombre','correo','telefono','estado','registro','activacion','ruta_completada','admision_completada','duracion_minutos','encuesta','respuestas'];
   const csv=[header.map(csvCell).join(','),...rows.map(p=>[
    p.id,p.kind,p.identity_number,p.name,p.email,p.phone,participantStatus(p as {activated_at:string|null;route_completed_at:string|null}),p.created_at,p.activated_at,p.route_completed_at,p.admission_completed_at,
    p.route_completed_at&&p.activated_at?Math.round((Date.parse(String(p.route_completed_at))-Date.parse(String(p.activated_at)))/60000):'',JSON.stringify(p.surveys),JSON.stringify(p.completions)
   ].map(csvCell).join(','))].join('\r\n');
   return new NextResponse('\ufeff'+csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="admisiones.csv"','Cache-Control':'no-store'}});
  }
  if(path==='admin/manual'&&method==='POST'){
   const actor=await staff(req,['admin','registrar']);const v=await body(req,completionInput.extend({participantId:z.uuid(),paperReference:z.string().trim().min(3).max(120)}));
   check(await db().rpc('complete_challenge',{p_participant:v.participantId,p_challenge:v.challengeId,p_request:v.requestId,p_answers:v.answers,p_actor:actor.user_id,p_paper_ref:v.paperReference}));return json(await state(v.participantId));
  }
  if(path==='admin/stand-codes'&&method==='POST'){
   const actor=await staff(req,['admin','registrar']);const v=await body(req,z.object({challengeId:z.uuid(),maxUses:z.number().int().min(1).max(4000),validMinutes:z.number().int().min(1).max(120)}));
   const challenge=check(await db().from('challenges').select('kind').eq('id',v.challengeId).single());
   if(!challenge||!['code','quiz_code'].includes(challenge.kind))throw new ApiError(400,'El reto no utiliza códigos.');
   for(let i=0;i<8;i++){
    const code=shortCode();const expiresAt=new Date(Date.now()+v.validMinutes*60000).toISOString();
    const r=await db().from('stand_codes').insert({challenge_id:v.challengeId,code_hash:codeHash(code),expires_at:expiresAt,max_uses:v.maxUses,created_by:actor.user_id}).select('id').single();
    if(r.error?.code==='23505')continue;check(r);return json({code,expiresAt},201);
   }throw new ApiError(503,'No se pudo reservar el código.');
  }
  if(path==='admin/raffles'&&method==='POST'){
   const actor=await staff(req,['admin','raffle']);
   const input=await body(req,z.object({requestId:z.uuid()}));
   const snapshot=new Date().toISOString();const {count,error}=await db().from('tickets').select('id',{count:'exact',head:true}).lte('created_at',snapshot);check({data:null,error});
   if(!count)throw new ApiError(409,'No hay tiquetes elegibles.');
   const id=check(await db().rpc('draw_raffle',{p_actor:actor.user_id,p_count:count,p_offset:randomInt(count),p_snapshot:snapshot,p_request:input.requestId}));
   const draw=check(await db().from('raffles').select('ticket_id').eq('id',id).single());
   if(!draw)throw new ApiError(500,'No se pudo consultar el resultado.');
   const ticket=check(await db().from('tickets').select('participant_id').eq('id',draw.ticket_id).single());
   const winner=ticket?check(await db().from('participants').select('name').eq('id',ticket.participant_id).single()):null;
   return json({raffleId:id,winnerName:winner?.name,ticketId:draw.ticket_id},201);
  }
  throw new ApiError(404,'Endpoint no encontrado.');
 }catch(error){
  if(error instanceof ApiError)return json({error:error.message},error.status);
  console.error('Unexpected API error:',error instanceof Error?error.name:'unknown');return json({error:'Error interno. Reintenta más tarde.'},500);
 }
}
export const GET=handle;
export const POST=handle;
