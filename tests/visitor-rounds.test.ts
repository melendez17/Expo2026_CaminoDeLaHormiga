import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {localDataSchema,freshProgress,startLocal,currentVisitorRound,generateVisitorRound,visitorCandidates,upgradeVisitorProgress,completeLocal,summary,parseProgress,voteLocal,addExtraForWrongAnswer,saintQuestion,routeChallenges,type LocalChallenge,type LocalProgress,type Answers} from '../src/lib/local-game';
const data=localDataSchema.parse(Object.fromEntries(['users','projects','challenges','agenda','settings'].map(k=>[k,JSON.parse(readFileSync(new URL(`../public/data/${k}.json`,import.meta.url),'utf8'))])));
function answer(c:LocalChallenge):Answers{return c.kind==='freeform'?{projectName:'Proyecto',level:'Décimo',description:'Aprendí cómo aplicar estas ideas en mi comunidad.'}:c.kind==='saint'?{saintChoice:String(saintQuestion(c).correctIndex)}:{code:c.code!,...Object.fromEntries((c.questions??[]).map(q=>[q.id,String(q.correctIndex)]))};}
function finish(p:LocalProgress){for(const c of currentVisitorRound(data,p))p=completeLocal(data,p,c.id,answer(c));return p;}
test('visitante gana al completar dos, recibe otra pareja distinta y conserva votos y progreso',()=>{
 let p=startLocal(data,freshProgress(data,'ana'),()=>.3);assert.equal(currentVisitorRound(data,p).length,2);assert.equal(summary(data,p).baseTarget,2);assert.equal(summary(data,p).tickets,0);
 assert.throws(()=>generateVisitorRound(data,p),/pendientes/);const c=currentVisitorRound(data,p)[0];p=completeLocal(data,p,c.id,answer(c));assert.equal(summary(data,p).tickets,0);assert.throws(()=>generateVisitorRound(data,p),/pendientes/);
 p=finish(p);assert.equal(summary(data,p).tickets,1);assert.equal(summary(data,p).routeComplete,true);p=voteLocal(data,p,'agua');assert.equal(summary(data,p).votesAvailable,0);assert.equal(summary(data,p).tickets,1);
 p=generateVisitorRound(data,p,()=>.3);assert.equal(p.visitorRounds.length,2);assert.equal(new Set(p.visitorRounds.flat()).size,4);assert.equal(summary(data,p).tickets,1);assert.equal(summary(data,p).base,2);assert.equal(summary(data,p).extra,0);
 p=finish(p);assert.equal(summary(data,p).base,2);assert.equal(summary(data,p).extra,2);assert.equal(summary(data,p).tickets,2);assert.equal(summary(data,p).votesAvailable,1);assert.deepEqual(parseProgress(data,'ana',JSON.parse(JSON.stringify(p))),p);
 assert.throws(()=>parseProgress(data,'ana',{...p,visitorRoundIndex:0}),/rondas/);
});
test('rondas se agotan sin repetir proyectos ni retos y una respuesta repetida no duplica premios',()=>{
 let p=startLocal(data,freshProgress(data,'ana'),()=>.4);
 while(true){p=finish(p);if(!visitorCandidates(data,p).length)break;p=generateVisitorRound(data,p,()=>.4);}
 const ids=p.visitorRounds.flat();assert.equal(new Set(ids).size,ids.length);const projects=routeChallenges(data,p).filter(c=>c.projectId).map(c=>c.projectId);assert.equal(new Set(projects).size,projects.length);
 assert.equal(summary(data,p).tickets,Math.floor(p.completed.length/2));const c=currentVisitorRound(data,p)[0];assert.deepEqual(completeLocal(data,p,c.id,answer(c)),p);assert.throws(()=>generateVisitorRound(data,p),/No quedan retos/);assert.deepEqual(parseProgress(data,'ana',p),p);
});
test('admisión conserva ruta de cinco y no puede usar rondas de visitante',()=>{
 const p=startLocal(data,freshProgress(data,'sofia'));assert.equal(p.routeIds.length,5);assert.equal(p.visitorRounds.length,0);assert.equal(summary(data,p).baseTarget,5);assert.throws(()=>generateVisitorRound(data,p),/visitantes/);
});
test('migración conserva respuestas, encuesta, votos y tiquetes manuales y muestra como máximo dos pendientes',()=>{
 let old:LocalProgress={...freshProgress(data,'ana'),startedAt:new Date().toISOString()};
 for(const c of data.challenges.filter(c=>c.isBase))old=completeLocal(data,old,c.id,answer(c));old=voteLocal(data,old,'agua');old.survey={expectations:'Conocer proyectos',interest:'Tecnología',satisfaction:5};old.manualTickets=[{id:'manual',actorId:'admin',at:new Date().toISOString()}];
 const p=upgradeVisitorProgress(data,old);assert.deepEqual(p.completed,old.completed);assert.deepEqual(p.votes,old.votes);assert.deepEqual(p.manualTickets,old.manualTickets);assert.deepEqual(p.survey,old.survey);assert.ok(summary(data,p).tickets>=summary(data,old).tickets);assert.ok(currentVisitorRound(data,p).length<=2);assert.deepEqual(parseProgress(data,'ana',p),p);assert.equal(upgradeVisitorProgress(data,p),p);
 const pending=upgradeVisitorProgress(data,{...freshProgress(data,'ana'),startedAt:new Date().toISOString()});assert.equal(pending.visitorRounds.length,3);assert.throws(()=>completeLocal(data,pending,pending.visitorRounds[1][0],answer(data.challenges.find(c=>c.id===pending.visitorRounds[1][0])!)),/otra ronda/);
});
test('errores conservan la pareja y asignan extras; el santo se reemplaza dentro de la ronda',()=>{
 const catalog=structuredClone(data);catalog.users[0].area='Ciberseguridad';let p=startLocal(catalog,freshProgress(catalog,'ana'),()=>.3);const c=currentVisitorRound(catalog,p)[0],a=answer(c);a.code='ZZZZ';p=addExtraForWrongAnswer(catalog,p,c.id,a,()=>0);assert.equal(p.failedExtras.length,1);assert.equal(p.extraIds.length,0);assert.equal(p.visitorRounds[0].length,2);assert.ok(!p.visitorRounds[0].includes(c.id));assert.equal(summary(catalog,p).tickets,0);assert.deepEqual(parseProgress(catalog,'ana',p),p);assert.throws(()=>generateVisitorRound(catalog,p),/pendientes/);
 const saint=data.challenges.find(c=>c.id==='santo-b')!;const forced:LocalProgress={...freshProgress(data,'ana'),startedAt:new Date().toISOString(),visitorRounds:[['santo-b','photo']]};const q=saintQuestion(saint);const changed=addExtraForWrongAnswer(data,forced,saint.id,{saintChoice:String((q.correctIndex+1)%q.options.length)},()=>0);assert.notEqual(changed.visitorRounds[0][0],saint.id);assert.equal(changed.visitorRounds[0].length,2);assert.deepEqual(parseProgress(data,'ana',changed),changed);
});

test('migración conserva intentos incorrectos y los extras asignados antes de entrar en rondas',()=>{
 const legacy:LocalProgress={...freshProgress(data,'ana'),startedAt:new Date().toISOString()};
 const failed={...legacy,extraIds:['santo-b'],failedAnswers:[{challengeId:'photo',answers:{code:'ZZZZ'},at:new Date().toISOString(),extraId:'santo-b'}]};
 const migrated=upgradeVisitorProgress(data,failed);assert.equal(migrated.failedAnswers.length,1);assert.ok(routeChallenges(data,migrated).some(c=>c.id===failed.failedAnswers[0].extraId));assert.deepEqual(parseProgress(data,'ana',migrated),migrated);
});

test('solo el primer reto base prioriza afinidad; adicionales no dependen del área y no repiten proyectos',()=>{
 const catalog=structuredClone(data);catalog.users[0].area='Ciberseguridad';
 let p=startLocal(catalog,freshProgress(catalog,'ana'),()=>.3);
 const base=currentVisitorRound(catalog,p);assert.equal(catalog.projects.find(project=>project.id===base[0].projectId)?.specialty,'Ciberseguridad');assert.notEqual(catalog.projects.find(project=>project.id===base[1].projectId)?.specialty,'Ciberseguridad');
 for(const c of base)p=completeLocal(catalog,p,c.id,answer(c));
 const alternate=structuredClone(catalog);alternate.users[0].area='school';
 const next=generateVisitorRound(catalog,p,()=>.4),same=generateVisitorRound(alternate,p,()=>.4);assert.deepEqual(next.visitorRounds,same.visitorRounds);assert.deepEqual(next.visitorRounds[0],p.visitorRounds[0]);assert.equal(summary(catalog,next).base,2);
 const closed=structuredClone(catalog);closed.projects.filter(project=>project.specialty==='Ciberseguridad').forEach(project=>project.active=false);const fallback=startLocal(closed,freshProgress(closed,'ana'),()=>.3);assert.equal(fallback.visitorRounds[0].length,2);assert.ok(currentVisitorRound(closed,fallback).every(c=>closed.projects.find(project=>project.id===c.projectId)?.specialty!=='Ciberseguridad'));
});
