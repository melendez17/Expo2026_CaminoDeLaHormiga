import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localDataSchema, freshProgress, extraChallenges, summary, parseProgress, storageKey, completeLocal, availableProjects, routeChallenges, startLocal, generateExtras, voteLocal, type LocalData, type LocalProgress } from '../src/lib/local-game';
import { roles, admissionRoles } from '../src/lib/taxonomy';
import { issueManualTicket, raffleTickets, drawTicket, readDraws, raffleKey, secureIndex } from '../src/lib/local-tickets';
import { validateCatalogChange } from '../src/lib/local-admin';
const raw=Object.fromEntries(['users','projects','challenges','agenda','settings'].map(key=>[key,JSON.parse(readFileSync(new URL(`../public/data/${key}.json`,import.meta.url),'utf8'))]));
const data=localDataSchema.parse(raw);
function storage() {const values=new Map<string,string>();return {values,getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};}
function baseProgress(catalog:LocalData=data) {
  let p:LocalProgress={...freshProgress(catalog,'ana'),startedAt:'2026-11-02T12:00:00.000Z'};
  for(const c of catalog.challenges.filter(c=>c.isBase)) p=completeLocal(catalog,p,c.id,c.kind==='freeform'?{projectName:'Proyecto',level:'Primero',description:'Aprendí sobre tecnología y sensores.'}:{code:c.code!,...Object.fromEntries((c.questions??[]).map(q=>[q.id,String(q.correctIndex)]))});
  return p;
}
test('seis roles, cuatro modalidades de admisión y migración del perfil anterior',()=>{
  assert.equal(roles.length,6);
  for(const role of roles) {
    const fixture=structuredClone(raw);fixture.users[0].role=role.value;
    const user=localDataSchema.parse(fixture).users[0];
    assert.equal(user.kind,admissionRoles.some(value=>value===role.value)?'applicant':'visitor');
  }
  const old=structuredClone(raw);old.users[0].role='participant';old.users[0].kind='applicant';
  assert.equal(localDataSchema.parse(old).users[0].role,'fourth_cycle');
});
test('categorías de proyecto y especialidades completas; Web y Ciberseguridad comparten TICs',()=>{
  for(const specialty of ['Desarrollo Web','Ciberseguridad']) {
    const fixture=structuredClone(raw);fixture.projects[0].specialty=specialty;
    assert.equal(localDataSchema.parse(fixture).projects[0].buildingId,'17');
    fixture.projects[0].buildingId='15';assert.equal(localDataSchema.safeParse(fixture).success,false);
  }
  const old=structuredClone(raw);old.projects[0].specialty='TICs';old.projects[2].specialty='Dibujo y Modelado';
  assert.equal(localDataSchema.parse(old).projects[0].specialty,'Desarrollo Web');
  assert.equal(localDataSchema.parse(old).projects[2].specialty,'Dibujo y Modelado de Edificaciones');
  for(const [category,label] of [['pasitos','Pasitos'],['school','Escuela'],['third_cycle','Tercer ciclo']]) {
    const fixture=structuredClone(raw);fixture.projects[0].category=category;fixture.projects[0].specialty='';fixture.projects[0].level=category==='pasitos'?'preescolar':category==='school'?1:7;
    assert.equal(localDataSchema.parse(fixture).projects[0].specialty,label);
  }
});
test('rutas por modalidad cumplen las cantidades y categorías, sin proyectos repetidos',()=>{
  for(const [role,expected] of [['pasitos',{pasitos:1,school:1,specialty:2}],['school',{school:1,third_cycle:1,specialty:2}],['third_cycle',{third_cycle:2,specialty:2}]] as const) {
    const fixture=structuredClone(raw);fixture.users[0].role=role;
    const catalog=localDataSchema.parse(fixture),started=startLocal(catalog,freshProgress(catalog,'ana'),()=>.4);
    assert.equal(started.routeIds.length,5);
    const route=routeChallenges(catalog,started),projects=route.filter(c=>c.projectId).map(c=>catalog.projects.find(p=>p.id===c.projectId)!);
    assert.equal(new Set(projects.map(p=>p.id)).size,4);
    assert.equal(new Set(projects.filter(p=>p.category==='specialty').map(p=>p.specialty)).size,2);
    assert.equal(route.filter(c=>!c.projectId&&(c.kind==='code'||c.kind==='saint')).length,1);
    for(const [category,count] of Object.entries(expected))assert.equal(projects.filter(p=>p.category===category).length,count);
    assert.deepEqual(parseProgress(catalog,'ana',started),started);
    assert.deepEqual(startLocal(catalog,started),started);
  }
});
test('Cuarto ciclo combina décimo y undécimo de su especialidad, un tercero propio, otro externo y un extra',()=>{
  const fixture=structuredClone(raw);fixture.users[0].role='fourth_cycle';delete fixture.users[0].assignedSpecialty;
  assert.throws(()=>startLocal(localDataSchema.parse(fixture),freshProgress(data,'ana')),/asignarte una especialidad/);
  fixture.users[0].assignedSpecialty='Ciberseguridad';
  const catalog=localDataSchema.parse(fixture);
  let p=startLocal(catalog,freshProgress(catalog,'ana'));
  assert.equal(p.routeIds.length,5);
  const route=routeChallenges(catalog,p),projects=route.filter(c=>c.projectId).map(c=>catalog.projects.find(p=>p.id===c.projectId)!);
  const own=projects.filter(p=>p.specialty==='Ciberseguridad');
  assert.equal(own.length,3);assert.ok(own.some(p=>p.level===10));assert.ok(own.some(p=>p.level===11));
  assert.equal(new Set(projects.map(p=>p.id)).size,4);
  const others=projects.filter(p=>p.specialty!=='Ciberseguridad');
  assert.equal(others.length,1);
  assert.equal(route.filter(c=>!c.projectId&&(c.kind==='code'||c.kind==='saint')).length,1);
  for(const c of route) {
    const answers:Record<string,string>=c.kind==='freeform'?{projectName:'Proyecto',level:'Décimo',description:'Aprendí sobre tecnología para ayudar a la comunidad.'}:c.kind==='saint'?{saint:c.answer!}:{code:c.code!,...Object.fromEntries((c.questions??[]).map(q=>[q.id,String(q.correctIndex)]))};
    p=completeLocal(catalog,p,c.id,answers);
  }
  assert.equal(summary(catalog,p).routeComplete,true);assert.equal(summary(catalog,p).baseTarget,5);assert.equal(summary(catalog,p).tickets,1);
  assert.deepEqual(parseProgress(catalog,'ana',p),p);
  const other=route.find(c=>catalog.projects.find(p=>p.id===c.projectId)?.specialty!=='Ciberseguridad'&&c.projectId)!;
  const replacement=catalog.challenges.find(c=>!p.routeIds.includes(c.id)&&catalog.projects.find(p=>p.id===c.projectId)?.specialty==='Ciberseguridad')!;
  assert.throws(()=>parseProgress(catalog,'ana',{...p,routeIds:p.routeIds.map(id=>id===other.id?replacement.id:id)}),/especialidad asignada/);
});
test('Cuarto ciclo sortea un tercer proyecto distinto de décimo o undécimo y exige tres propios',()=>{
  const fixture=structuredClone(raw);fixture.users[0].role='fourth_cycle';fixture.users[0].assignedSpecialty='Desarrollo Web';
  const catalog=localDataSchema.parse(fixture);
  const thirdLevels=new Set<number|string>();
  for(const random of [()=>0,()=>0.999]) {
    const p=startLocal(catalog,freshProgress(catalog,'ana'),random);
    assert.equal(new Set(p.routeIds).size,5);
    const third=catalog.projects.find(project=>project.id===catalog.challenges.find(c=>c.id===p.routeIds[2])?.projectId)!;
    assert.equal(third.specialty,'Desarrollo Web');thirdLevels.add(third.level);
    assert.deepEqual(parseProgress(catalog,'ana',p),p);
  }
  assert.deepEqual([...thirdLevels].sort(),[10,11]);
  const keep=new Set([10,11].map(level=>fixture.projects.find((p:{specialty:string;level:number})=>p.specialty==='Desarrollo Web'&&p.level===level)!.id));
  fixture.projects=fixture.projects.filter((p:{id:string;specialty:string})=>p.specialty!=='Desarrollo Web'||keep.has(p.id));
  fixture.challenges=fixture.challenges.filter((c:{projectId?:string})=>!c.projectId||fixture.projects.some((p:{id:string})=>p.id===c.projectId));
  const scarce=localDataSchema.parse(fixture);
  assert.throws(()=>startLocal(scarce,freshProgress(scarce,'ana')),/tercer proyecto distinto/);
});
test('ningún extra posterior es una visita a proyecto y falta de undécimo bloquea una ruta incompleta',()=>{
  const p=baseProgress();
  assert.ok(generateExtras(data,p).extraIds.every(id=>extraChallenges(data).some(c=>c.id===id)&&!data.challenges.find(c=>c.id===id)!.projectId));
  const fixture=structuredClone(raw);fixture.users[0].role='fourth_cycle';fixture.users[0].assignedSpecialty='Desarrollo Web';
  fixture.projects=fixture.projects.filter((p:{specialty:string;level:number})=>!(p.specialty==='Desarrollo Web'&&p.level===11));
  fixture.challenges=fixture.challenges.filter((c:{projectId?:string})=>!c.projectId||fixture.projects.some((p:{id:string})=>p.id===c.projectId));
  const catalog=localDataSchema.parse(fixture);
  assert.throws(()=>startLocal(catalog,freshProgress(catalog,'ana')),/undécimo/);
});
test('rutas insuficientes no se asignan parcialmente y los visitantes conservan cinco retos',()=>{
  const fixture=structuredClone(raw);fixture.users[0].role='third_cycle';fixture.projects=fixture.projects.filter((p:{category:string})=>p.category!=='third_cycle');fixture.challenges=fixture.challenges.filter((c:{projectId?:string})=>!c.projectId?.startsWith('adm-tercer'));
  const catalog=localDataSchema.parse(fixture);assert.throws(()=>startLocal(catalog,freshProgress(catalog,'ana')),/Faltan proyectos/);
  const visitor=startLocal(data,freshProgress(data,'carlos'));
  assert.equal(routeChallenges(data,visitor).length,5);assert.equal(availableProjects(data,'carlos').length,data.projects.length);
});
test('emisión por token crea un tiquete y un voto sin fabricar respuestas ni activar el recorrido',()=>{
  const store=storage();const result=issueManualTicket(data,store,'admin',' k8p2 ','manual-1');
  assert.equal(result.user.id,'ana');
  const progress=parseProgress(data,'ana',JSON.parse(store.getItem(storageKey(data,'ana'))!));
  assert.equal(progress.startedAt,null);assert.equal(progress.completed.length,0);
  assert.equal(summary(data,progress).tickets,1);assert.equal(summary(data,progress).votesAvailable,1);
  assert.equal(progress.manualTickets[0].actorId,'admin');
  issueManualTicket(data,store,'admin','K8P2','manual-1');assert.equal(raffleTickets(data,store).tickets.length,1);
  issueManualTicket(data,store,'admin','K8P2','manual-2');assert.equal(raffleTickets(data,store).tickets.length,2);
});
test('emisión rechaza permisos insuficientes, admin destinatario y token inexistente sin escribir',()=>{
  const store=storage();
  assert.throws(()=>issueManualTicket(data,store,'carlos','K8P2'),/administrador/);
  assert.throws(()=>issueManualTicket(data,store,'admin','ADM1'),/participante válido/);
  assert.throws(()=>issueManualTicket(data,store,'admin','ZZZZ'),/participante válido/);
  assert.equal(store.values.size,0);
});
test('tiquetes digitales y manuales participan aun después de votar; ganar no consume votos',()=>{
  const store=storage();store.setItem(storageKey(data,'ana'),JSON.stringify(baseProgress()));
  issueManualTicket(data,store,'admin','K8P2','papel');
  const p=parseProgress(data,'ana',JSON.parse(store.getItem(storageKey(data,'ana'))!));
  store.setItem(storageKey(data,'ana'),JSON.stringify(voteLocal(data,p,'agua')));
  assert.equal(raffleTickets(data,store).tickets.length,2);
  const winner=drawTicket(data,store,'admin','Premio de prueba',()=>0);
  assert.equal(winner.winnerName,'Ana Rodríguez');assert.equal(winner.ticketCode,'D-K8P2-001');
  assert.equal(winner.poolSize,2);
  const second=drawTicket(data,store,'admin','Segundo premio',()=>0);
  assert.equal(second.ticketCode,'M-papel');assert.equal(second.poolSize,1);
  assert.equal(readDraws(data,store).length,2);
  assert.throws(()=>drawTicket(data,store,'admin'),/No hay tiquetes/);
  assert.equal(summary(data,parseProgress(data,'ana',JSON.parse(store.getItem(storageKey(data,'ana'))!))).votesAvailable,1);
});
test('no se pierden premios manuales al editar ni se sobrescribe un historial corrupto',()=>{
  const store=storage();issueManualTicket(data,store,'admin','K8P2','manual');
  const next=structuredClone(data);next.users=next.users.filter(u=>u.id!=='ana');
  assert.throws(()=>validateCatalogChange(data,next,'admin',store),/progreso local/);
  store.setItem(raffleKey(data),'{no es json');
  assert.throws(()=>drawTicket(data,store,'admin'));
  assert.equal(store.getItem(raffleKey(data)),'{no es json');
});
test('datos antiguos sin manualTickets se restauran; registros manuales inválidos se rechazan',()=>{
  const old:Record<string,unknown>={...freshProgress(data,'ana')};delete old.manualTickets;
  assert.deepEqual(parseProgress(data,'ana',old).manualTickets,[]);
  assert.throws(()=>parseProgress(data,'ana',{...old,manualTickets:[{id:'x',actorId:'carlos',at:new Date().toISOString()}]}),/emisor/);
  for(let i=0;i<20;i++)assert.ok(secureIndex(17)>=0&&secureIndex(17)<17);
  assert.throws(()=>secureIndex(0));
});
