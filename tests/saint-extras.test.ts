import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localDataSchema,freshProgress,startLocal,completeLocal,summary,parseProgress,generateExtras,saintQuestion,replaceFailedSaint,extraChallenges,routeChallenges} from '../src/lib/local-game';
import {challengeAnswers} from '../src/lib/participant-answers';
import {validateCatalogChange} from '../src/lib/local-admin';
const raw=Object.fromEntries(['users','projects','challenges','agenda','settings'].map(k=>[k,JSON.parse(readFileSync(new URL(`../public/data/${k}.json`,import.meta.url),'utf8'))]));
const data=localDataSchema.parse(raw);
function base(){let p=startLocal(data,freshProgress(data,'ana'));for(const c of routeChallenges(data,p)){p=completeLocal(data,p,c.id,c.kind==='freeform'?{projectName:'Proyecto',level:'Décimo',description:'Descubrí nuevas ideas en este proyecto.'}:{code:c.code!,...Object.fromEntries((c.questions??[]).map(q=>[q.id,String(q.correctIndex)]))});}return p;}
test('santo acepta opción correcta, rechaza opción inválida y conserva respuestas antiguas',()=>{
 const c=data.challenges.find(c=>c.id==='santo-b')!,q=saintQuestion(c),p={...base(),extraIds:[c.id]};
 assert.equal(completeLocal(data,p,c.id,{saintChoice:String(q.correctIndex)}).completed.length,6);
 assert.equal(completeLocal(data,p,c.id,{saint:c.answer!}).completed.length,6);
 assert.throws(()=>replaceFailedSaint(data,p,c.id,{saintChoice:'999'}),/Marca una opción/);
 assert.throws(()=>replaceFailedSaint(data,p,c.id,{saintChoice:String(q.correctIndex)}),/correcta/);
 const legacy={...c,questions:undefined};assert.equal(saintQuestion(legacy).options.length,4);
});
test('fallar reemplaza extra, no suma premios, no se repite y conserva respuesta e historial',()=>{
 const before={...base(),extraIds:['santo-b']};const wrong={saintChoice:'2'};
 const p=replaceFailedSaint(data,before,'santo-b',wrong,()=>0);
 assert.equal(p.completed.length,before.completed.length);assert.deepEqual(summary(data,p),summary(data,before));
 assert.notEqual(p.extraIds[0],'santo-b');assert.ok(extraChallenges(data).some(c=>c.id===p.extraIds[0]));
 assert.equal(p.failedExtras[0].replacementId,p.extraIds[0]);assert.deepEqual(p.failedExtras[0].answers,wrong);
 assert.equal(challengeAnswers(data.challenges.find(c=>c.id==='santo-b')!,wrong)[0].correct,false);
 assert.deepEqual(parseProgress(data,'ana',JSON.parse(JSON.stringify(p))),p);
 assert.throws(()=>completeLocal(data,p,'santo-b',{saintChoice:'0'}),/no está en tu camino/);
 const replacement=data.challenges.find(c=>c.id===p.extraIds[0])!;
 const completed=completeLocal(data,p,replacement.id,replacement.kind==='saint'?{saintChoice:String(saintQuestion(replacement).correctIndex)}:{code:replacement.code!});
 assert.ok(!generateExtras(data,completed).extraIds.includes('santo-b'));
 assert.throws(()=>parseProgress(data,'ana',{...p,failedExtras:[{...p.failedExtras[0],answers:{saintChoice:'0'}}]}),/historial/);
 const modified=structuredClone(data);modified.challenges.find(c=>c.id==='santo-b')!.questions![0].correctIndex=1;
 assert.throws(()=>validateCatalogChange(data,modified,'admin',{getItem:key=>key.endsWith(':ana')?JSON.stringify(p):null}),/respuestas guardadas/);
});
test('reemplazo en ruta de admisión conserva cinco retos y las cuotas de proyectos',()=>{
 const catalog=structuredClone(data);catalog.users[0].role='pasitos';catalog.users[0].kind='applicant';
 const initial=startLocal(catalog,freshProgress(catalog,'ana'));
 initial.routeIds[4]='santo-b';
 const p=replaceFailedSaint(catalog,initial,'santo-b',{saintChoice:'2'},()=>0);
 assert.equal(p.routeIds.length,5);assert.equal(p.extraIds.length,0);assert.notEqual(p.routeIds[4],'santo-b');
 assert.equal(routeChallenges(catalog,p).filter(c=>c.projectId).length,4);
 assert.deepEqual(parseProgress(catalog,'ana',p),p);
 assert.equal(summary(catalog,p).tickets,0);
});
test('sin suplentes avisa sin mutar; opciones y respuesta correcta se validan',()=>{
 const p=base();p.extraIds=extraChallenges(data).filter(c=>!c.isBase).map(c=>c.id);
 const saved=JSON.stringify(p);assert.throws(()=>replaceFailedSaint(data,p,'santo-b',{saintChoice:'2'}),/No quedan retos extra/);assert.equal(JSON.stringify(p),saved);
 const invalid=structuredClone(data);invalid.challenges.find(c=>c.id==='santo-b')!.questions![0].correctIndex=9;assert.throws(()=>localDataSchema.parse(invalid));
 invalid.challenges.find(c=>c.id==='santo-b')!.questions![0].correctIndex=0;invalid.challenges.find(c=>c.id==='santo-b')!.questions![0].options=['San José','San José'];assert.throws(()=>localDataSchema.parse(invalid));
});
