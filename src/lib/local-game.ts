import { z } from 'zod';
const questionSchema = z.object({
  id: z.string().min(1), prompt: z.string().min(1),
  options: z.array(z.string()).min(2).max(6), correctIndex: z.number().int().nonnegative()
}).refine(q => q.correctIndex < q.options.length, 'Respuesta fuera de las opciones');
const challengeSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), description: z.string(),
  buildingId: z.string(), kind: z.enum(['freeform', 'quiz', 'code', 'saint']),
  isBase: z.boolean(), projectId: z.string().optional(), code: z.string().optional(),
  answer: z.string().optional(), badge: z.string().optional(), questions: z.array(questionSchema).optional()
}).superRefine((c, ctx) => {
  if (c.kind === 'quiz' && !c.projectId) ctx.addIssue({ code: 'custom', message: 'La especialidad debe tener un proyecto' });
  if (c.questions && new Set(c.questions.map(q => q.id)).size !== c.questions.length) ctx.addIssue({ code: 'custom', message: 'Las preguntas deben tener identificadores diferentes' });
  if (c.kind === 'quiz' && c.questions?.length !== 2) ctx.addIssue({ code: 'custom', message: 'Cada especialidad necesita dos preguntas' });
  if (['quiz', 'code'].includes(c.kind) && !/^[A-Z0-9]{4}$/.test(c.code ?? '')) ctx.addIssue({ code: 'custom', message: 'Falta un código de cuatro caracteres' });
  if (c.kind === 'saint' && !c.answer) ctx.addIssue({ code: 'custom', message: 'Falta la respuesta del santo' });
});
export const localDataSchema = z.object({
  users: z.array(z.object({ id: z.string(), nationalId: z.string().regex(/^\d{1,30}$/, 'La cédula debe contener solo números.').optional(), name: z.string().min(2), email: z.union([z.email().max(254), z.literal('')]).optional(), token: z.string().regex(/^[A-Z0-9]{4}$/), kind: z.enum(['applicant', 'visitor']), role: z.enum(['participant', 'admin']).default('participant') })).min(1),
  projects: z.array(z.object({ id: z.string().min(1), name: z.string().min(2), buildingId: z.string(), specialty: z.string().min(2), description: z.string().min(5) })),
  challenges: z.array(challengeSchema),
  agenda: z.array(z.object({ id: z.string(), title: z.string(), category: z.enum(['general', 'pastoral', 'radio']), day: z.string().min(1).default('Sábado'), dayNumber: z.number().int().min(1).max(31).optional(), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), buildingId: z.string(), description: z.string() })),
  settings: z.object({ dataVersion: z.string(), title: z.string(), baseReward: z.number().int().positive(), extraEvery: z.number().int().positive(), surveyBonus: z.number().int().nonnegative(), extraBatchSize: z.number().int().positive(), radioUrl: z.url().nullable(), agendaNote: z.string() })
}).superRefine((data, ctx) => {
  if (data.challenges.filter(c => c.isBase).length !== 5) ctx.addIssue({ code: 'custom', message: 'Deben existir cinco retos base' });
  for (const entries of [data.users, data.projects, data.challenges, data.agenda]) {
    if (new Set(entries.map(e => e.id)).size !== entries.length) ctx.addIssue({ code: 'custom', message: 'Hay identificadores duplicados' });
  }
  const nationalIds = data.users.flatMap(u => u.nationalId ? [u.nationalId] : []);
  if (new Set(nationalIds).size !== nationalIds.length) ctx.addIssue({ code: 'custom', message: 'Hay cédulas duplicadas' });
  if (new Set(data.users.map(u => u.token)).size !== data.users.length) ctx.addIssue({ code: 'custom', message: 'Hay tokens duplicados' });
  for (const c of data.challenges) if (c.projectId && !data.projects.some(p => p.id === c.projectId)) ctx.addIssue({ code: 'custom', message: 'El proyecto del reto no existe' });
});
export type LocalData = z.infer<typeof localDataSchema>;
export type LocalUser = LocalData['users'][number];
export type LocalChallenge = LocalData['challenges'][number];
export type Answers = Record<string, string>;
export const progressSchema = z.object({
  version: z.literal(1), dataVersion: z.string(), userId: z.string(), startedAt: z.string().nullable(),
  completed: z.array(z.object({ challengeId: z.string(), answers: z.record(z.string(), z.string()), at: z.string() })),
  extraIds: z.array(z.string()), votes: z.array(z.object({ projectId: z.string(), at: z.string() })),
  survey: z.object({ expectations: z.string().min(5), interest: z.string().min(2), satisfaction: z.number().int().min(1).max(5) }).nullable()
});
export type LocalProgress = z.infer<typeof progressSchema>;
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function findUser(data: LocalData, token: string) {
  return data.users.find(u => u.token === token.trim().toUpperCase()) ?? null;
}
export function freshProgress(data: LocalData, userId: string): LocalProgress {
  return { version: 1, dataVersion: data.settings.dataVersion, userId, startedAt: null, completed: [], extraIds: [], votes: [], survey: null };
}
// Count vote credits from the persisted manual register, never from imported progress.
export function manualTicketCount(data: LocalData, userId: string, storage: Pick<Storage, 'getItem'>): number {
  const user = data.users.find(u => u.id === userId && u.role !== 'admin');
  if (!user) return 0;
  const raw = storage.getItem(raffleKey(data));
  if (!raw) return 0;
  const parsed = z.object({ manual: z.array(z.object({ id: z.string().min(1), userId: z.string().optional(), name: z.string(), email: z.string().optional(), source: z.literal('manual') })) }).safeParse(JSON.parse(raw));
  if (!parsed.success) throw Error('Revisa el registro de tiquetes manuales antes de votar.');
  const owned = parsed.data.manual.filter(t => {
    if (t.userId) return t.userId === userId;
    if (/^[A-Z0-9]{4} [1-9]\d*$/.test(t.id)) return t.id.startsWith(`${user.token} `);
    const matches = data.users.filter(u => u.role !== 'admin' && (t.email && u.email ? t.email.toLowerCase() === u.email.toLowerCase() : normalize(t.name) === normalize(u.name)));
    return matches.length === 1 && matches[0].id === userId;
  });
  return new Set(owned.map(t => t.id)).size;
}
export function summary(data: LocalData, progress: LocalProgress, manualTickets = 0) {
  const base = progress.completed.filter(r => data.challenges.some(c => c.id === r.challengeId && c.isBase)).length;
  const extra = progress.completed.length - base;
  const routeComplete = base === 5;
  const digitalTickets = (routeComplete ? data.settings.baseReward + Math.floor(extra / data.settings.extraEvery) : 0) + (routeComplete && progress.survey ? data.settings.surveyBonus : 0);
  const tickets = digitalTickets + manualTickets;
  return { base, extra, routeComplete, digitalTickets, manualTickets, tickets, votesAvailable: tickets - progress.votes.length };
}
export function validateAnswers(challenge: LocalChallenge, answers: Answers): string | null {
  if (challenge.kind === 'freeform') {
    if ((answers.projectName?.trim().length ?? 0) < 2 || !answers.level?.trim() || (answers.description?.trim().length ?? 0) < 10) return 'Completa el nombre, el nivel y una descripción de al menos 10 caracteres.';
  }
  if (challenge.kind === 'quiz') {
    for (const q of challenge.questions ?? []) if (answers[q.id] !== String(q.correctIndex)) return 'Hay una respuesta por revisar. Observa el proyecto y vuelve a intentarlo.';
  }
  if (['quiz', 'code'].includes(challenge.kind) && answers.code?.trim().toUpperCase() !== challenge.code) return 'El código del stand no es correcto. Revisa los cuatro caracteres.';
  if (challenge.kind === 'saint' && normalize(answers.saint ?? '') !== normalize(challenge.answer ?? '')) return 'Revisa el nombre del santo y vuelve a intentarlo.';
  return null;
}
export function completeLocal(data: LocalData, progress: LocalProgress, id: string, answers: Answers): LocalProgress {
  if (!progress.startedAt) throw Error('Primero inicia tu camino.');
  const challenge = data.challenges.find(c => c.id === id);
  if (!challenge || (!challenge.isBase && !progress.extraIds.includes(id))) throw Error('Este reto todavía no está en tu camino.');
  if (progress.completed.some(c => c.challengeId === id)) return progress;
  const error = validateAnswers(challenge, answers); if (error) throw Error(error);
  return { ...progress, completed: [...progress.completed, { challengeId: id, answers, at: new Date().toISOString() }] };
}
export function generateExtras(data: LocalData, progress: LocalProgress, random = Math.random): LocalProgress {
  if (!summary(data, progress).routeComplete) throw Error('Completa los cinco retos base para descubrir más.');
  if (progress.extraIds.some(id => !progress.completed.some(c => c.challengeId === id))) throw Error('Termina los retos adicionales disponibles antes de generar otros.');
  const candidates = data.challenges.filter(c => !c.isBase && !progress.extraIds.includes(c.id));
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  return { ...progress, extraIds: [...progress.extraIds, ...candidates.slice(0, data.settings.extraBatchSize).map(c => c.id)] };
}
export function voteLocal(data: LocalData, progress: LocalProgress, projectId: string, manualTickets = 0): LocalProgress {
  if (summary(data, progress, manualTickets).votesAvailable <= 0) throw Error('No tienes votos disponibles. Consigue otro tiquete para volver a votar.');
  if (!data.projects.some(p => p.id === projectId)) throw Error('El proyecto no existe.');
  return { ...progress, votes: [...progress.votes, { projectId, at: new Date().toISOString() }] };
}
export function parseProgress(data: LocalData, userId: string, input: unknown, manualTickets = 0): LocalProgress {
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) throw Error('El formato del progreso no es válido. Revisa los campos del archivo.');
  const p = parsed.data;
  if (p.userId !== userId || p.dataVersion !== data.settings.dataVersion) throw Error('El archivo pertenece a otra persona o versión de la demo.');
  if (new Set(p.extraIds).size !== p.extraIds.length || p.extraIds.some(id => !data.challenges.some(c => c.id === id && !c.isBase))) throw Error('La lista de retos adicionales no es válida.');
  if ((!p.startedAt && (p.completed.length || p.extraIds.length || p.votes.length || p.survey)) || new Set(p.completed.map(c => c.challengeId)).size !== p.completed.length) throw Error('El progreso está duplicado o no tiene inicio.');
  for (const record of p.completed) {
    const c = data.challenges.find(c => c.id === record.challengeId);
    if (!c || (!c.isBase && !p.extraIds.includes(c.id)) || validateAnswers(c, record.answers)) throw Error('El archivo contiene respuestas o retos no válidos.');
  }
  if (p.votes.some(v => !data.projects.some(project => project.id === v.projectId)) || summary(data, p, manualTickets).votesAvailable < 0) throw Error('El archivo contiene votos no válidos.');
  if ((p.extraIds.length || p.survey) && !summary(data, p).routeComplete) throw Error('Los retos base no están completos.');
  return p;
}
export const storageKey = (data: LocalData, userId: string) => `camino-local:${data.settings.dataVersion}:${userId}`;

export const raffleKey = (data: LocalData) => `camino-raffle-v1-${data.settings.dataVersion}`;
