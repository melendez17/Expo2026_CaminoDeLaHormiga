import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {localDataSchema,freshProgress,startLocal,routeChallenges,summary,visitorCandidates,completeLocal,voteLocal,parseProgress,storageKey,addExtraForWrongAnswer,saintQuestion,type LocalData,type LocalProgress,type LocalChallenge,type Answers} from '../src/lib/local-game';
import {changeAssignment,prepareAssignments,validateRuleCapacity} from '../src/lib/admin-assignments';
import {validateCatalogChange,restoreCatalog,CATALOG_KEY} from '../src/lib/local-admin';
const raw=Object.fromEntries(['users','projects','challenges','agenda','settings'].map(k=>[k,JSON.parse(readFileSync(new URL(`../public/data/${k}.json`,import.meta.url),'utf8'))]));const data=localDataSchema.parse(raw);
function store(){const values=new Map<string,string>();return{values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,v:string)=>{values.set(key,v);}};}
function save(s:ReturnType<typeof store>,p:LocalProgress){s.setItem(storageKey(data,p.userId),JSON.stringify(p));}
function answer(c:LocalChallenge):Answers{return c.kind==='freeform'?{projectName:'Proyecto',level:'Décimo',description:'Aprendí nuevas ideas durante esta visita.'}:c.kind==='saint'?{saintChoice:String(saintQuestion(c).correctIndex)}:{code:c.code!,...Object.fromEntries((c.questions??[]).map(q=>[q.id,String(q.correctIndex)]))};}
const spare=(p:LocalProgress)=>data.challenges.find(c=>c.projectId&&!routeChallenges(data,p).some(a=>a.projectId===c.projectId)&&!p.extraIds.includes(c.id))!;
test('nuevas distribuciones y catálogo con dos proyectos disponibles de Pasitos y Escuela',()=>{
 validateRuleCapacity(data);
 for(const [area,expected] of [['pasitos',{pasitos:2,school:1,specialty:1}],['school',{school:2,third_cycle:1,specialty:1}],['third_cycle',{third_cycle:2,specialty:2}]] as const){
  const catalog=structuredClone(data);catalog.users[0].role='admission';catalog.users[0].area=area;const p=startLocal(catalog,freshProgress(catalog,'ana'));
  assert.equal(p.routeIds.length,5);assert.ok(p.routeRule);const projects=routeChallenges(catalog,p).filter(c=>c.projectId).map(c=>catalog.projects.find(p=>p.id===c.projectId)!);for(const [category,count]of Object.entries(expected))assert.equal(projects.filter(p=>p.category===category).length,count);
 }
});
test('editar cantidades afecta solo rutas nuevas y rechaza planes sin catálogo suficiente',()=>{
 const s=store(),old=startLocal(data,freshProgress(data,'sofia'));save(s,old);const changed=structuredClone(data);changed.assignmentRules.admission['Desarrollo Web'].other=2;
 const next=validateCatalogChange(data,changed,'admin',s);assert.deepEqual(parseProgress(next,'sofia',old),old);assert.equal(startLocal(next,freshProgress(next,'sofia')).routeIds.length,6);
 const invalid=structuredClone(data);invalid.assignmentRules.admission.pasitos.pasitos=3;assert.throws(()=>validateCatalogChange(data,invalid,'admin',s),/Pasitos.*Faltan/);assert.deepEqual(JSON.parse(s.getItem(storageKey(data,'sofia'))!),old);
 assert.throws(()=>validateCatalogChange(data,changed,'ana',s),/administrador/);
});
test('rutas anteriores sin snapshot conservan la distribución original',()=>{
 const catalog=structuredClone(data);catalog.users[0].role='admission';catalog.users[0].area='pasitos';catalog.assignmentRules.admission.pasitos={...catalog.assignmentRules.admission.pasitos,pasitos:1,specialty:2};const p=startLocal(catalog,freshProgress(catalog,'ana'));delete p.routeRule;
 assert.deepEqual(parseProgress({...catalog,assignmentRules:data.assignmentRules},'ana',p),p);
});
test('reemplazo manual admite excepción de área, conserva completados y registra administrador y motivo',()=>{
 const s=store();let p=prepareAssignments(data,s,'admin','sofia');const first=data.challenges.find(c=>c.id===p.routeIds[0])!;p=completeLocal(data,p,first.id,answer(first));save(s,p);const source=p.routeIds[1],target=spare(p);
 const next=changeAssignment(data,s,'admin','sofia',{fromId:source,toId:target.id,reason:'El puesto cerró temprano'});
 assert.equal(next.routeIds.length,5);assert.ok(next.routeIds.includes(target.id));assert.ok(!next.routeIds.includes(source));assert.deepEqual(next.completed,p.completed);assert.equal(summary(data,next).tickets,0);assert.equal(next.assignmentEdits[0].actorId,'admin');assert.equal(next.assignmentEdits[0].reason,'El puesto cerró temprano');assert.deepEqual(parseProgress(data,'sofia',next),next);
 const before=s.getItem(storageKey(data,'sofia'));assert.throws(()=>changeAssignment(data,s,'admin','sofia',{fromId:first.id,reason:'Quitar completado'}),/pendientes/);assert.equal(s.getItem(storageKey(data,'sofia')),before);
 assert.throws(()=>changeAssignment(data,s,'ana','sofia',{fromId:target.id,reason:'Sin permiso'}),/administrador/);
 assert.throws(()=>changeAssignment(data,s,'admin','sofia',{fromId:target.id,toId:next.routeIds[0],reason:'Duplicado'}),/asignado/);
});
test('quitar un pendiente puede terminar la ruta; añadir extras no revoca tiquetes ni votos',()=>{
 const s=store();let p=prepareAssignments(data,s,'admin','sofia');const pending=p.routeIds.at(-1)!;
 for(const id of p.routeIds.slice(0,-1)){const c=data.challenges.find(c=>c.id===id)!;p=completeLocal(data,p,id,answer(c));}save(s,p);assert.equal(summary(data,p).routeComplete,false);
 p=changeAssignment(data,s,'admin','sofia',{fromId:pending,reason:'Actividad cancelada'});assert.equal(p.routeIds.length,4);assert.equal(summary(data,p).tickets,1);assert.equal(summary(data,p).routeComplete,true);
 const extra=data.challenges.find(c=>!c.projectId&&c.kind==='code'&&!p.routeIds.includes(c.id)&&c.id!==pending)!;
 p=changeAssignment(data,s,'admin','sofia',{toId:extra.id,scope:'extra',reason:'Actividad adicional'});assert.equal(summary(data,p).tickets,1);assert.ok(p.extraIds.includes(extra.id));assert.throws(()=>changeAssignment(data,s,'admin','sofia',{toId:spare(p).id,scope:'route',reason:'Añadir después'}),/completada/);
});
test('rondas de visitantes permiten cambios y asignaciones manuales sin borrar avance',()=>{
 const s=store(),p=prepareAssignments(data,s,'admin','ana');const next=changeAssignment(data,s,'admin','ana',{fromId:p.visitorRounds[0][0],toId:spare(p).id,reason:'El proyecto no está atendiendo'});assert.equal(next.visitorRounds[0].length,2);assert.ok(!visitorCandidates(data,next).some(c=>c.id===p.visitorRounds[0][0]));assert.deepEqual(parseProgress(data,'ana',next),next);
 const added=changeAssignment(data,s,'admin','ana',{toId:spare(next).id,scope:'visitor',reason:'Nueva visita solicitada'});assert.equal(added.visitorRounds[0].length,3);assert.equal(summary(data,added).tickets,0);
});
test('proyectos cerrados se excluyen de nuevas asignaciones y no se aceptan como reemplazo',()=>{
 const catalog=structuredClone(data);catalog.projects.find(p=>p.id==='agua')!.active=false;const p=startLocal(catalog,freshProgress(catalog,'sofia'));assert.ok(!routeChallenges(catalog,p).some(c=>c.projectId==='agua'));
 const s=store();s.setItem(storageKey(catalog,'sofia'),JSON.stringify(p));assert.throws(()=>changeAssignment(catalog,s,'admin','sofia',{fromId:p.routeIds[0],toId:'tics',reason:'Destino cerrado'}),/no está disponible/);
});
test('historial de fallos sigue siendo válido al reemplazar o retirar el reto pendiente',()=>{
 const s=store();let p=prepareAssignments(data,s,'admin','sofia');const c=data.challenges.find(c=>c.id===p.routeIds[0])!;p=addExtraForWrongAnswer(data,p,c.id,{...answer(c),code:'ZZZZ'},()=>0);save(s,p);
 const next=changeAssignment(data,s,'admin','sofia',{fromId:c.id,toId:spare(p).id,reason:'Proyecto cerrado tras el intento'});assert.equal(next.failedAnswers.length,1);assert.deepEqual(parseProgress(data,'sofia',next),next);
});
test('migración agrega solo los nuevos ejemplos y no restaura proyectos borrados del catálogo anterior',()=>{
 const old=structuredClone(data);old.schemaRevision=3;old.projects=old.projects.filter(p=>!['adm-pasitos-2','adm-escuela-2','agua-11-b'].includes(p.id));old.challenges=old.challenges.filter(c=>!c.projectId||old.projects.some(p=>p.id===c.projectId));
 const restored=restoreCatalog(data,{getItem:key=>key===CATALOG_KEY?JSON.stringify(old):null});assert.equal(restored.schemaRevision,4);assert.equal(restored.projects.filter(p=>p.category==='pasitos').length,2);assert.equal(restored.projects.filter(p=>p.category==='school').length,2);assert.ok(!restored.projects.some(p=>p.id==='agua-11-b'));
});

test('editar reglas no revoca tiquetes ni votos de rutas completadas',()=>{
 const s=store();let p=startLocal(data,freshProgress(data,'sofia'));for(const id of p.routeIds){const c=data.challenges.find(c=>c.id===id)!;p=completeLocal(data,p,id,answer(c));}p=voteLocal(data,p,'agua');save(s,p);
 const changed=structuredClone(data);changed.assignmentRules.admission['Desarrollo Web'].other=2;const next=validateCatalogChange(data,changed,'admin',s);assert.equal(summary(next,p).tickets,1);assert.equal(summary(next,p).votesAvailable,0);assert.deepEqual(parseProgress(next,'sofia',p).votes,p.votes);
});
test('un santo aprobado manualmente puede fallar y cambiar sin invalidar la ruta',()=>{
 const s=store();let p=prepareAssignments(data,s,'admin','sofia');const extra=routeChallenges(data,p).find(c=>!c.projectId)!;
 if(extra.id!=='santo-b')p=changeAssignment(data,s,'admin','sofia',{fromId:extra.id,toId:'santo-b',reason:'Visita alternativa'});
 const q=saintQuestion(data.challenges.find(c=>c.id==='santo-b')!);p=addExtraForWrongAnswer(data,p,'santo-b',{saintChoice:String((q.correctIndex+1)%q.options.length)},()=>0);assert.deepEqual(parseProgress(data,'sofia',p),p);
});
