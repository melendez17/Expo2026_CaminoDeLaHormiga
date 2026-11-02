import {test} from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{localDataSchema,freshProgress,completeLocal,startLocal,parseProgress,storageKey,summary,type LocalChallenge,type Answers,type LocalProgress}from'../src/lib/local-game';
import{restoreCompatibleProgress,loadLocalProgress,compatibilityBackupKey}from'../src/lib/progress-storage';import{adminRows}from'../src/lib/local-admin';import{readAssignmentProgress}from'../src/lib/admin-assignments';
const data=localDataSchema.parse(Object.fromEntries(['users','projects','challenges','agenda','settings'].map(k=>[k,JSON.parse(readFileSync(new URL(`../public/data/${k}.json`,import.meta.url),'utf8'))])));
const answer=(c:LocalChallenge):Answers=>c.kind==='freeform'?{projectName:'Proyecto anterior',level:'Quinto',description:'Aprendí cómo mejorar el cuidado del agua.'}:c.kind==='saint'?{saint:c.answer!}:{code:c.code!,...Object.fromEntries((c.questions??[]).map(q=>[q.id,String(q.correctIndex)]))};
function legacy(){let p:LocalProgress={...freshProgress(data,'ana'),startedAt:'2026-10-21T12:00:00.000Z'};for(const c of data.challenges.filter(c=>c.isBase))p=completeLocal(data,p,c.id,answer(c));const oldExtra=data.challenges.find(c=>c.projectId&&!c.isBase)!;p.extraIds=[oldExtra.id];p=completeLocal(data,p,oldExtra.id,answer(oldExtra));p.votes=[{projectId:'agua',at:'2026-10-21T12:00:00.000Z'}];p.manualTickets=[{id:'papel',actorId:'admin',at:'2026-10-21T12:00:00.000Z'}];p.survey={expectations:'Conocer proyectos',interest:'Tecnología',satisfaction:5};return p;}
function store(){const values=new Map<string,string>(),writes:string[]=[];return{values,writes,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,v:string)=>{writes.push(key);values.set(key,v);}};}
test('reproduce el bloqueo antiguo y restaura visitas a proyectos guardadas como extras antes de validar',()=>{
 const old=legacy();assert.throws(()=>parseProgress(data,'ana',old),/adicionales/);
 const restored=restoreCompatibleProgress(data,'ana',old);assert.ok(restored.visitorRounds.length);assert.equal(restored.extraIds.length,0);assert.deepEqual(restored.completed,old.completed);assert.deepEqual(restored.votes,old.votes);assert.deepEqual(restored.manualTickets,old.manualTickets);assert.deepEqual(restored.survey,old.survey);assert.equal(restored.startedAt,old.startedAt);assert.ok(summary(data,restored).tickets>=summary(data,old).tickets);assert.deepEqual(parseProgress(data,'ana',restored),restored);
});
test('conversión respalda el original antes de escribir y es idempotente',()=>{
 const s=store(),raw=JSON.stringify(legacy(),null,2),key=storageKey(data,'ana');s.values.set(key,raw);
 const p=loadLocalProgress(data,s,'ana');assert.deepEqual(s.writes,[compatibilityBackupKey(data,'ana'),key]);assert.equal(s.getItem(compatibilityBackupKey(data,'ana')),raw);assert.deepEqual(JSON.parse(s.getItem(key)!),p);
 const count=s.writes.length;assert.deepEqual(loadLocalProgress(data,s,'ana'),p);assert.equal(s.writes.length,count);assert.equal(s.getItem(compatibilityBackupKey(data,'ana')),raw);
});
test('rutas antiguas del visitante que ya no coinciden con su perfil se convierten sin perder respuestas',()=>{
 const previous=structuredClone(data);previous.users[0].role='admission';previous.users[0].area='Desarrollo Web';let p=startLocal(previous,freshProgress(previous,'ana'));const c=previous.challenges.find(c=>c.id===p.routeIds[0])!;p=completeLocal(previous,p,c.id,answer(c));assert.throws(()=>parseProgress(data,'ana',p),/modalidad/);
 const restored=restoreCompatibleProgress(data,'ana',p);assert.ok(restored.visitorRounds.length);assert.deepEqual(restored.completed,p.completed);assert.deepEqual(new Set(restored.visitorRounds.flat()),new Set(p.routeIds));
});
test('errores reales, otra persona, versión incorrecta y referencias desconocidas no se borran ni se omiten',()=>{
 const s=store(),key=storageKey(data,'ana');for(const raw of ['{no es JSON',JSON.stringify({...legacy(),userId:'carlos'}),JSON.stringify({...legacy(),dataVersion:'otra'}),JSON.stringify({...legacy(),routeIds:['reto-que-no-existe']}),JSON.stringify({...legacy(),completed:[{challengeId:'tics',answers:{code:'ZZZZ'},at:new Date().toISOString()}]})]){
 s.values.set(key,raw);const count=s.writes.length;assert.throws(()=>loadLocalProgress(data,s,'ana'));assert.equal(s.getItem(key),raw);assert.equal(s.writes.length,count);
 }
});
test('admin y asignaciones reconocen el mismo progreso recuperado sin sobrescribirlo al consultarlo',()=>{
 const s=store(),raw=JSON.stringify(legacy()),key=storageKey(data,'ana');s.values.set(key,raw);assert.equal(adminRows(data,s).find(row=>row.user.id==='ana')!.error,null);assert.equal(readAssignmentProgress(data,s,'ana').completed.length,legacy().completed.length);assert.equal(s.getItem(key),raw);assert.equal(s.writes.length,0);
});
