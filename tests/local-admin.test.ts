import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateUserToken, adminRows, CATALOG_KEY, restoreCatalog, validateCatalogChange } from '../src/lib/local-admin';
import { localDataSchema, freshProgress, storageKey, completeLocal, summary, type LocalData, type LocalProgress } from '../src/lib/local-game';
const keys = ['users', 'projects', 'challenges', 'agenda', 'settings'];
const data = localDataSchema.parse(Object.fromEntries(keys.map(key => [key, JSON.parse(readFileSync(new URL(`../public/data/${key}.json`, import.meta.url), 'utf8'))])));
const values = new Map<string, string>();
const storage = { getItem: (key: string) => values.get(key) ?? null };
function change(action: (copy: LocalData) => void) { const copy = structuredClone(data); action(copy); return copy; }

test('admin de prueba existe y no cuenta como participante en métricas', () => {
  assert.equal(data.users.find(u => u.token === 'ADM1')?.role, 'admin');
  const rows = adminRows(data, storage); assert.equal(rows.length, 4); assert.equal(rows.filter(r => r.status === 'Sin activar').length, 4);
});
test('catálogo exige administrador, tokens únicos y conservar acceso propio', () => {
  assert.throws(() => validateCatalogChange(data, data, 'ana', storage), /administrador/);
  assert.throws(() => validateCatalogChange(data, change(c => c.users = c.users.filter(u => u.id !== 'admin')), 'admin', storage), /propio acceso/);
  assert.throws(() => validateCatalogChange(data, change(c => c.users[0].token = 'ADM1'), 'admin', storage), /tokens duplicados/);
});
test('agregar usuario y proyecto persiste catálogo con validación de zonas', () => {
  const next = validateCatalogChange(data, change(c => {
    c.users.push({ id: 'prueba', name: 'Persona de Prueba', token: 'P123', role: 'visitor' });
    c.projects.push({ id: 'huerta', name: 'Huerta inteligente', description: 'Sensores para la huerta.', category: 'specialty', level:10, specialty: 'Desarrollo Web', buildingId: '17' });
  }), 'admin', storage);
  const saved = new Map([[CATALOG_KEY, JSON.stringify(next)]]);
  assert.equal(restoreCatalog(data, { getItem: key => saved.get(key) ?? null }).users.length, 6);
  assert.throws(() => validateCatalogChange(data, change(c => c.projects[0].buildingId = '99'), 'admin', storage), /zona del mapa|edificio seleccionado/);
});
test('retos base y proyectos referenciados no pueden eliminarse', () => {
  assert.throws(() => validateCatalogChange(data, change(c => c.challenges = c.challenges.filter(r => r.id !== 'pasitos')), 'admin', storage), /cinco retos/);
  assert.throws(() => validateCatalogChange(data, change(c => c.projects = c.projects.filter(p => p.id !== 'agua')), 'admin', storage), /proyecto del reto/);
});
test('progreso existente se preserva al editar; rechaza borrar usuario o cambiar respuestas', () => {
  let p: LocalProgress = { ...freshProgress(data, 'ana'), startedAt: new Date().toISOString() };
  for (const c of data.challenges.filter(c => c.isBase)) {
    const answers: Record<string, string> = c.kind === 'freeform' ? { projectName: 'Proyecto', level: 'Quinto', description: 'Aprendí sobre tecnología y sensores.' } : { code: c.code!, ...Object.fromEntries((c.questions ?? []).map(q => [q.id, String(q.correctIndex)])) };
    p = completeLocal(data, p, c.id, answers);
  }
  const saved = new Map([[storageKey(data, 'ana'), JSON.stringify(p)]]);
  const reader = { getItem: (key: string) => saved.get(key) ?? null };
  assert.equal(summary(data, p).tickets, 1);
  assert.throws(() => validateCatalogChange(data, change(c => c.users = c.users.filter(u => u.id !== 'ana')), 'admin', reader), /progreso local/);
  assert.throws(() => validateCatalogChange(data, change(c => c.challenges[0].title = 'Otro nombre'), 'admin', reader), /base están en uso/);
  const renamed = validateCatalogChange(data, change(c => c.projects[0].name = 'AquaSmart renovado'), 'admin', reader);
  assert.equal(adminRows(renamed, reader).find(r => r.user.id === 'ana')?.stats?.tickets, 1);
});
test('corrupción no se cuenta como cero y bloquea sobrescritura incompatible', () => {
  const reader = { getItem: (key: string) => key === storageKey(data, 'ana') ? 'not-json' : null };
  assert.equal(adminRows(data, reader).find(r => r.user.id === 'ana')?.status, 'Revisar datos');
  assert.throws(() => validateCatalogChange(data, data, 'admin', reader), /Revisa los datos/);
});

test('catálogos anteriores incorporan los días nuevos sin reemplazar actividades ni usuarios editados', () => {
  const saved = structuredClone(data);
  saved.agenda = saved.agenda.filter(event => event.day === 'Sábado');
  saved.agenda[0].title = 'Apertura editada en este navegador';
  saved.users[0].name = 'Nombre editado';
  const restored = restoreCatalog(data, { getItem: () => JSON.stringify(saved) });
  assert.deepEqual([...new Set(restored.agenda.map(event => event.day))].sort(), ['Domingo','Sábado','Viernes']);
  assert.equal(restored.agenda.find(event => event.id === saved.agenda[0].id)?.title, 'Apertura editada en este navegador');
  assert.equal(restored.users[0].name, 'Nombre editado');
  assert.deepEqual(restoreCatalog(data, { getItem: () => JSON.stringify(restored) }), restored);
  const customFriday = data.agenda.find(event => event.day === 'Viernes')!;
  saved.agenda.push({ ...customFriday, title: 'Viernes personalizado' });
  const custom = restoreCatalog(data, { getItem: () => JSON.stringify(saved) });
  assert.equal(custom.agenda.filter(event => event.day === 'Viernes').length, 1);
  assert.equal(custom.agenda.find(event => event.day === 'Viernes')?.title, 'Viernes personalizado');
});

test('el catálogo anterior recibe los proyectos y retos necesarios de admisión sin pisar sus ediciones',()=>{
  const old=JSON.parse(JSON.stringify(data));delete old.schemaRevision;
  old.projects=old.projects.filter((p:{id:string})=>!p.id.startsWith('adm-')&&p.id!=='ciber');
  old.challenges=old.challenges.filter((c:{id:string})=>!c.id.startsWith('reto-'));
  old.projects[0].name='Proyecto editado anteriormente';
  const migrated=restoreCatalog(data,{getItem:()=>JSON.stringify(old)});
  assert.equal(migrated.schemaRevision,4);
  assert.equal(migrated.projects[0].name,'Proyecto editado anteriormente');
  assert.equal(migrated.projects.filter(p=>p.category==='third_cycle').length,2);
  assert.ok(migrated.challenges.some(c=>c.projectId==='ciber'));
});

test('tokens automáticos de cuatro caracteres evitan colisiones y recorren el espacio completo', () => {
  const users = [...data.users, {...data.users[0],id:'zero',token:'0000'}, {...data.users[0],id:'one',token:'0001'}];
  assert.equal(generateUserToken(users,()=>0),'0002');
  assert.equal(generateUserToken([...users,{...users[0],token:'ZZZZ'}],()=>36**4-1),'0002');
  for(let i=0;i<20;i++) {
    const token=generateUserToken(users);
    assert.match(token,/^[A-Z0-9]{4}$/);
    assert.ok(!users.some(user=>user.token===token));
  }
});

test('correo se valida, se normaliza y los usuarios anteriores siguen siendo compatibles', () => {
  const valid=change(c=>{c.users[0].email='  ANA@EXAMPLE.COM  ';});
  assert.equal(validateCatalogChange(data,valid,'admin',storage).users[0].email,'ana@example.com');
  assert.throws(()=>validateCatalogChange(data,change(c=>{c.users[0].email='incorrecto';}),'admin',storage),/correo electrónico válido/);
  assert.throws(()=>localDataSchema.parse(change(c=>{c.users[0].email='';})));
  const legacy=structuredClone(data);delete legacy.users[0].email;
  assert.equal(localDataSchema.parse(legacy).users[0].email,undefined);
});

test('nombre y dos apellidos se guardan separados y componen el nombre completo', () => {
  const input=change(c=>{Object.assign(c.users[0],{firstName:'  Ana María  ',firstSurname:'Rodríguez',secondSurname:'Vargas'});});
  const user=localDataSchema.parse(input).users[0];
  assert.equal(user.firstName,'Ana María');assert.equal(user.firstSurname,'Rodríguez');assert.equal(user.secondSurname,'Vargas');
  assert.equal(user.name,'Ana María Rodríguez Vargas');
  delete input.users[0].secondSurname;
  assert.throws(()=>localDataSchema.parse(input),/ambos apellidos/);
  input.users[0].secondSurname='   ';
  assert.throws(()=>localDataSchema.parse(input));
  assert.equal(localDataSchema.parse(data).users[0].name,data.users[0].name);
});

test('agenda administrada permite crear, editar y borrar sin recuperar días eliminados',()=>{
  const emptyStorage={getItem:()=>null};
  const created=change(c=>{c.agendaManaged=true;c.agenda.push({id:'agenda-admin',title:'Taller nuevo',day:'Viernes',dayNumber:13,time:'12:00',endTime:'13:00',category:'general',buildingId:'17',description:'Actividad de prueba.'});});
  const saved=validateCatalogChange(data,created,'admin',emptyStorage);
  const edited=structuredClone(saved);edited.agenda.find(e=>e.id==='agenda-admin')!.title='Taller actualizado';
  assert.equal(validateCatalogChange(saved,edited,'admin',emptyStorage).agenda.find(e=>e.id==='agenda-admin')?.title,'Taller actualizado');
  const removed={...edited,agenda:edited.agenda.filter(e=>e.day!=='Viernes')};
  const valid=validateCatalogChange(edited,removed,'admin',emptyStorage);
  const restored=restoreCatalog(data,{getItem:key=>key===CATALOG_KEY?JSON.stringify(valid):null});
  assert.ok(!restored.agenda.some(e=>e.day==='Viernes'));
  const cleared=validateCatalogChange(valid,{...valid,agenda:[]},'admin',emptyStorage);
  assert.deepEqual(restoreCatalog(data,{getItem:()=>JSON.stringify(cleared)}).agenda,[]);
  assert.throws(()=>validateCatalogChange(data,created,'ana',emptyStorage),/administrador/);
});
test('agenda rechaza títulos vacíos, horarios invertidos y edificios desconocidos',()=>{
  const emptyStorage={getItem:()=>null};
  assert.throws(()=>validateCatalogChange(data,change(c=>{c.agenda[0].title='   ';}),'admin',emptyStorage));
  assert.throws(()=>validateCatalogChange(data,change(c=>{c.agenda[0].time='12:00';c.agenda[0].endTime='11:00';}),'admin',emptyStorage),/posterior/);
  assert.throws(()=>validateCatalogChange(data,change(c=>{c.agenda[0].endTime=c.agenda[0].time;}),'admin',emptyStorage),/posterior/);
  assert.throws(()=>validateCatalogChange(data,change(c=>{c.agenda[0].buildingId='inexistente';}),'admin',emptyStorage),/zona/);
});
