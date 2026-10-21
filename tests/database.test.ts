import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const cid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('migraciones y transacciones de la ruta, permisos, códigos, encuesta, votos y rifa',async(t)=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);`);
 for(const name of ['202610210001_initial.sql','202610210002_admin.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/seed.example.sql',import.meta.url),'utf8'));
 const actor=randomUUID(),otherActor=randomUUID();
 await db.query('insert into auth.users(id) values($1),($2)',[actor,otherActor]);
 await db.query("insert into staff values($1,'admin','Admin'),($2,'admissions','Admisión')",[actor,otherActor]);
 const scalar=async(sql:string,args:unknown[]=[])=>{const r=await db.query<Record<string,unknown>>(sql,args);return Object.values(r.rows[0])[0];};
 const register=async(hash:string)=>await scalar("select register_participant('applicant','12345678'||$1,'Ana Prueba','ana@example.test',null,$2,$3)",[hash,hash,actor]) as string;
 const id=await register('1'),other=await register('2');
 async function complete(challenge:number,answers:unknown,code:string|null=null,request=randomUUID(),participant=id,staff:string|null=null,paper:string|null=null){return scalar('select complete_challenge($1,$2,$3,$4,$5,$6,$7)',[participant,cid(challenge),request,JSON.stringify(answers),code,staff,paper]);}
 const free={projectName:'Proyecto agua',level:'Quinto',description:'Aprendí sobre sensores y el agua.'};
 await t.test('registro asigna cinco base, extras y un solo santo al azar',async()=>{
  assert.equal(await scalar('select count(*)::integer from challenge_assignments a join challenges c on c.id=a.challenge_id where a.participant_id=$1 and c.is_base',[id]),5);
  assert.equal(await scalar("select count(*)::integer from challenge_assignments a join challenges c on c.id=a.challenge_id where a.participant_id=$1 and c.kind='saint'",[id]),1);
  await assert.rejects(()=>complete(1,free),/not_activated/);
  await scalar('select activate_participant($1,$2)',['1','session1']);
  await assert.rejects(()=>scalar('select activate_participant($1,$2)',['wrong','bad']),/invalid_token/);
 });
 await t.test('rate limit persiste el intento rechazado',async()=>{
  assert.equal(await scalar("select take_rate_limit('ip',2,60)"),true);assert.equal(await scalar("select take_rate_limit('ip',2,60)"),true);assert.equal(await scalar("select take_rate_limit('ip',2,60)"),false);
  assert.equal(await scalar("select hits from rate_limits where key='ip'"),3);
 });
 await t.test('RLS y funciones deniegan acceso directo del navegador',async()=>{
  await db.exec('set role anon');
  await assert.rejects(()=>db.query('select * from participants'),/permission denied/);
  await assert.rejects(()=>db.query('select admin_metrics()'),/permission denied/);
  await db.exec('reset role');
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.query('select * from answer_keys'),/permission denied/);
  await db.exec('reset role');
 });
 await t.test('respuesta inválida no crea progreso ni consume códigos',async()=>{
  await assert.rejects(()=>complete(1,{}),/invalid_answers/);
  assert.equal(await scalar('select count(*)::integer from completions'),0);
 });
 await t.test('reintento y duplicado no duplican premios; UUID no puede reutilizarse con otro reto',async()=>{
  const request=randomUUID();await complete(1,free,null,request);await complete(1,free,null,request);await complete(1,free);
  assert.equal(await scalar('select count(*)::integer from completions'),1);
  await assert.rejects(()=>complete(2,free,null,request),/idempotency_conflict/);
 });
 await t.test('solo el quinto reto base entrega el tiquete de ruta',async()=>{
  await complete(2,free);await complete(3,free);
  for(const n of [4,5,6])await db.query("insert into stand_codes(challenge_id,code_hash,expires_at,max_uses,created_by) values($1,$2,now()+interval '1 hour',1,$3)",[cid(n),'code'+n,actor]);
  await assert.rejects(()=>complete(4,{},'bad'),/invalid_code/);
  await complete(4,{},'code4');assert.equal(await scalar('select count(*)::integer from tickets'),0);
  await complete(5,{},'code5');assert.equal(await scalar("select count(*)::integer from tickets where source='route'"),1);
  assert.ok(await scalar('select route_completed_at from participants where id=$1',[id]));
  assert.equal(await scalar('select admission_completed_at from participants where id=$1',[id]),null);
 });
 await t.test('dos preguntas correctas y código; par extra entrega un tiquete',async()=>{
  const quiz={[cid(201)]:0,[cid(202)]:1};
  await assert.rejects(()=>complete(6,{quiz:{[cid(201)]:0,[cid(202)]:0}},'code6'),/invalid_answers/);
  assert.equal(await scalar("select uses from stand_codes where code_hash='code6'"),0);
  await complete(6,{quiz},'code6');await complete(6,{quiz},'code6');
  assert.equal(await scalar("select uses from stand_codes where code_hash='code6'"),1);
  assert.equal(await scalar("select count(*)::integer from tickets where source='extra'"),0);
  const saint=await scalar("select c.id from challenges c join challenge_assignments a on a.challenge_id=c.id where a.participant_id=$1 and c.kind='saint'",[id]) as string;
  await complete(Number(saint.slice(-3)),{saint:'Santo de ejemplo'});
  assert.equal(await scalar("select count(*)::integer from tickets where source='extra'"),1);
 });
 await t.test('encuesta obligatoria para admisión, bonus idempotente',async()=>{
  await assert.rejects(()=>db.query("select submit_survey($1,'Aprender mucho',5,'TICs')",[other]),/route_incomplete/);
  await db.query("select submit_survey($1,'Aprender mucho',5,'TICs')",[id]);await db.query("select submit_survey($1,'Aprender mucho',5,'TICs')",[id]);
  assert.equal(await scalar("select count(*)::integer from tickets where source='survey'"),1);
  assert.ok(await scalar('select admission_completed_at from participants where id=$1',[id]));
 });
 await t.test('voto no elimina participación en rifa, no permite doble gasto ni tiquete ajeno',async()=>{
  const ticket=await scalar('select id from tickets limit 1');
  await db.query('select cast_vote($1,$2,$3)',[id,ticket,cid(101)]);await db.query('select cast_vote($1,$2,$3)',[id,ticket,cid(101)]);
  await assert.rejects(()=>db.query('select cast_vote($1,$2,$3)',[id,ticket,cid(102)]),/ticket_spent/);
  await assert.rejects(()=>db.query('select cast_vote($1,$2,$3)',[other,ticket,cid(101)]),/ticket_missing/);
  assert.equal(await scalar('select count(*)::integer from tickets'),3);assert.equal(await scalar('select count(*)::integer from votes'),1);
 });
 await t.test('pasaporte requiere rol y deja auditoría; reintentos siguen siendo idempotentes',async()=>{
  const request=randomUUID();await assert.rejects(()=>complete(1,{},null,request,other,otherActor,'P-001'),/paper_forbidden/);
  await complete(1,{},null,request,other,actor,'P-001');await complete(1,{},null,request,other,actor,'P-001');
  assert.equal(await scalar("select count(*)::integer from audit_log where action='paper_completion'"),1);
 });
 await t.test('sorteo exige cierre, permisos y conteo estable',async()=>{
  const snapshot=new Date(Date.now()+1000).toISOString();
  await assert.rejects(()=>db.query('select draw_raffle($1,3,0,$2,$3)',[actor,snapshot,randomUUID()]),/raffle_not_closed/);
  await db.exec('update settings set raffle_closed=true');
  await assert.rejects(()=>db.query('select draw_raffle($1,3,0,$2,$3)',[otherActor,snapshot,randomUUID()]),/forbidden/);
  await assert.rejects(()=>db.query('select draw_raffle($1,2,0,$2,$3)',[actor,snapshot,randomUUID()]),/raffle_snapshot_changed/);
  const request=randomUUID();const result=await scalar('select draw_raffle($1,3,0,$2,$3)',[actor,snapshot,request]);assert.ok(result);assert.equal(await scalar('select draw_raffle($1,3,0,$2,$3)',[actor,snapshot,request]),result);assert.equal(await scalar('select count(*)::integer from raffles'),1);
 });
 await db.close();
});
