import { localDataSchema, parseProgress, freshProgress, storageKey, summary, type LocalData, type LocalProgress } from './local-game';
import campus from './campus.json';
import {restoreCompatibleProgress} from './progress-storage';
import {participantAreas} from './taxonomy';
import { validateRuleCapacity } from './admin-assignments';
export const CATALOG_KEY = 'camino-local-catalog-v1';
export type StorageReader = Pick<Storage, 'getItem'>;
export function generateUserToken(users: LocalData['users'], randomValue = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  const used = new Set(users.map(user => user.token.toUpperCase()));
  const capacity = 36 ** 4;
  const start = randomValue() % capacity;
  for (let offset = 0; offset < capacity; offset++) {
    const token = ((start + offset) % capacity).toString(36).toUpperCase().padStart(4, '0');
    if (!used.has(token)) return token;
  }
  throw Error('No quedan tokens disponibles para crear otro usuario.');
}
export function restoreCatalog(base: LocalData, storage: StorageReader): LocalData {
  const raw = storage.getItem(CATALOG_KEY);
  if (!raw) return base;
  const input = JSON.parse(raw);
  const value = localDataSchema.safeParse(input);
  if (!value.success || value.data.settings.dataVersion !== base.settings.dataVersion) throw Error('El catálogo local no es compatible. Exporta o revisa su respaldo antes de reemplazarlo.');
  // Añade días nuevos del JSON también a catálogos editados antes de esta versión.
  // Las actividades de días ya presentes en el catálogo local se conservan.
  const existingDays = new Set(value.data.agenda.map(event => event.day));
  const newDays = value.data.agendaManaged ? [] : base.agenda.filter(event => !existingDays.has(event.day));
  const result = newDays.length ? { ...value.data, agenda: [...value.data.agenda, ...newDays] } : value.data;
  if ((input.schemaRevision ?? 1) < 3) {
    const projects = base.projects.filter(p => !result.projects.some(old=>old.id===p.id));
    const challenges = base.challenges.filter(c => !result.challenges.some(old=>old.id===c.id));
    return {...result,schemaRevision:4,projects:[...result.projects,...projects],challenges:[...result.challenges,...challenges]};
  }
  if((input.schemaRevision??1)<4) {
    const projectIds=['adm-pasitos-2','adm-escuela-2'];
    return {...result,schemaRevision:4,projects:[...result.projects,...base.projects.filter(p=>projectIds.includes(p.id)&&!result.projects.some(old=>old.id===p.id))],challenges:[...result.challenges,...base.challenges.filter(c=>c.projectId&&projectIds.includes(c.projectId)&&!result.challenges.some(old=>old.id===c.id))]};
  }
  return result;
}
export function adminRows(data: LocalData, storage: StorageReader) {
  return data.users.filter(u => u.role !== 'admin').map(user => {
    try {
      const raw = storage.getItem(storageKey(data, user.id));
      const progress = raw ? restoreCompatibleProgress(data, user.id, JSON.parse(raw)) : freshProgress(data, user.id);
      const stats = summary(data, progress);
      return { user, progress, stats, error: null as string | null, status: stats.routeComplete ? 'Completado' : progress.startedAt ? 'En proceso' : 'Sin activar' };
    } catch {
      return { user, progress: null, stats: null, error: 'Progreso no válido', status: 'Revisar datos' };
    }
  });
}
export function validateCatalogChange(previous: LocalData, input: unknown, actorId: string, storage: StorageReader): LocalData {
  if (previous.users.find(u => u.id === actorId)?.role !== 'admin') throw Error('Se necesita un administrador de prueba.');
  const parsed = localDataSchema.safeParse(input);
  if (!parsed.success) throw Error(parsed.error.issues.map(i => i.message).join(' · '));
  const next = parsed.data;
  if (next.users.find(u => u.id === actorId)?.role !== 'admin') throw Error('No puedes eliminar tu propio acceso de administrador.');
  if (next.settings.dataVersion !== previous.settings.dataVersion) throw Error('La versión del catálogo debe mantenerse al editar desde el panel.');
  if (JSON.stringify(next.settings) !== JSON.stringify(previous.settings)) throw Error('La edición de reglas se realiza en settings.json para una nueva versión de prueba.');
  if(JSON.stringify(previous.assignmentRules)!==JSON.stringify(next.assignmentRules))validateRuleCapacity(next,participantAreas.filter(area=>JSON.stringify(previous.assignmentRules.admission[area.value])!==JSON.stringify(next.assignmentRules.admission[area.value])));
  for (const entry of [...next.challenges, ...next.projects, ...next.agenda]) if (!Object.hasOwn(campus.names, entry.buildingId)) throw Error('La zona del mapa no existe.');
  const onlyAdditions=(['users','projects','challenges','agenda'] as const).every(key=>previous[key].every(old=>next[key].some(current=>current.id===old.id&&JSON.stringify(current)===JSON.stringify(old))))&&JSON.stringify(previous.assignmentRules)===JSON.stringify(next.assignmentRules);
  for (const row of adminRows(previous, storage)) {
    if (row.error || !row.progress) {if(onlyAdditions)continue;throw Error(`El avance de ${row.user.name} necesita revisión. Puedes crear usuarios, proyectos y retos nuevos; para modificar registros existentes, revisa primero ese avance.`);}
    const p: LocalProgress = row.progress;
    const hasProgress = !!p.startedAt || !!p.completed.length || !!p.votes.length || !!p.manualTickets.length;
    const nextUser = next.users.find(u => u.id === row.user.id);
    if (hasProgress && (!nextUser || nextUser.role === 'admin')) throw Error(`No puedes quitar a ${row.user.name}: tiene progreso local.`);
    if (hasProgress && JSON.stringify(previous.challenges.filter(c => c.isBase)) !== JSON.stringify(next.challenges.filter(c => c.isBase))) throw Error('Los cinco retos base están en uso. Para cambiarlos, inicia una nueva versión de prueba desde los JSON.');
    for (const record of [...p.completed,...p.failedExtras,...p.failedAnswers]) {
      const oldChallenge = previous.challenges.find(c => c.id === record.challengeId)!;
      const newChallenge = next.challenges.find(c => c.id === record.challengeId);
      if (!newChallenge || oldChallenge.isBase !== newChallenge.isBase || oldChallenge.kind !== newChallenge.kind || oldChallenge.projectId!==newChallenge.projectId || (oldChallenge.level??previous.projects.find(project=>project.id===oldChallenge.projectId)?.level)!==(newChallenge.level??next.projects.find(project=>project.id===newChallenge.projectId)?.level) || JSON.stringify(oldChallenge.questions) !== JSON.stringify(newChallenge.questions) || oldChallenge.code !== newChallenge.code || oldChallenge.answer !== newChallenge.answer) throw Error('No puedes cambiar reglas de retos que ya tienen respuestas guardadas.');
    }
    if (nextUser) parseProgress(next, nextUser.id, p);
  }
  return next;
}
export function csvField(value: unknown) {
  let text = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
