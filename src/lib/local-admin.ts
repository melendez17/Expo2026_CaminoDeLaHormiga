import { localDataSchema, parseProgress, freshProgress, storageKey, summary, type LocalData, type LocalProgress } from './local-game';
import campus from './campus.json';
export const CATALOG_KEY = 'camino-local-catalog-v1';
export type StorageReader = Pick<Storage, 'getItem'>;
export function restoreCatalog(base: LocalData, storage: StorageReader): LocalData {
  const raw = storage.getItem(CATALOG_KEY);
  if (!raw) return base;
  const value = localDataSchema.safeParse(JSON.parse(raw));
  if (!value.success || value.data.settings.dataVersion !== base.settings.dataVersion) throw Error('El catálogo local no es compatible. Exporta o revisa su respaldo antes de reemplazarlo.');
  // Añade días nuevos del JSON también a catálogos editados antes de esta versión.
  // Las actividades de días ya presentes en el catálogo local se conservan.
  const existingDays = new Set(value.data.agenda.map(event => event.day));
  const newDays = base.agenda.filter(event => !existingDays.has(event.day));
  return newDays.length ? { ...value.data, agenda: [...value.data.agenda, ...newDays] } : value.data;
}
export function adminRows(data: LocalData, storage: StorageReader) {
  return data.users.filter(u => u.role !== 'admin').map(user => {
    try {
      const raw = storage.getItem(storageKey(data, user.id));
      const progress = raw ? parseProgress(data, user.id, JSON.parse(raw)) : freshProgress(data, user.id);
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
  for (const entry of [...next.challenges, ...next.projects, ...next.agenda]) if (!Object.hasOwn(campus.names, entry.buildingId)) throw Error('La zona del mapa no existe.');
  for (const row of adminRows(previous, storage)) {
    if (row.error || !row.progress) throw Error(`Revisa los datos guardados de ${row.user.name} antes de cambiar el catálogo.`);
    const p: LocalProgress = row.progress;
    const hasProgress = !!p.startedAt || !!p.completed.length || !!p.votes.length;
    const nextUser = next.users.find(u => u.id === row.user.id);
    if (hasProgress && (!nextUser || nextUser.role === 'admin')) throw Error(`No puedes quitar a ${row.user.name}: tiene progreso local.`);
    if (hasProgress && JSON.stringify(previous.challenges.filter(c => c.isBase)) !== JSON.stringify(next.challenges.filter(c => c.isBase))) throw Error('Los cinco retos base están en uso. Para cambiarlos, inicia una nueva versión de prueba desde los JSON.');
    for (const record of p.completed) {
      const oldChallenge = previous.challenges.find(c => c.id === record.challengeId)!;
      const newChallenge = next.challenges.find(c => c.id === record.challengeId);
      if (!newChallenge || oldChallenge.isBase !== newChallenge.isBase || oldChallenge.kind !== newChallenge.kind || JSON.stringify(oldChallenge.questions) !== JSON.stringify(newChallenge.questions) || oldChallenge.code !== newChallenge.code || oldChallenge.answer !== newChallenge.answer) throw Error('No puedes cambiar reglas de retos que ya tienen respuestas guardadas.');
    }
    if (nextUser) parseProgress(next, nextUser.id, p);
  }
  return next;
}
export function csvField(value: unknown) {
  let text = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
