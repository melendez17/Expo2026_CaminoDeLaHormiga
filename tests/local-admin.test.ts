import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminRows, CATALOG_KEY, restoreCatalog, validateCatalogChange } from '../src/lib/local-admin';
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
    c.users.push({ id: 'prueba', name: 'Persona de Prueba', token: 'P123', kind: 'visitor', role: 'visitor' });
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
  assert.equal(migrated.schemaRevision,3);
  assert.equal(migrated.projects[0].name,'Proyecto editado anteriormente');
  assert.equal(migrated.projects.filter(p=>p.category==='third_cycle').length,2);
  assert.ok(migrated.challenges.some(c=>c.projectId==='ciber'));
});
