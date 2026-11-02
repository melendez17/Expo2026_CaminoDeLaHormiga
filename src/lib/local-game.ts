import { z } from 'zod';
import { canonicalSpecialty, categoryLabel, specialties, isAdmissionRole } from './taxonomy';
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
  schemaRevision: z.number().int().min(1).default(3),
  users: z.array(z.object({ id: z.string(), name: z.string().min(2), email: z.string().trim().toLowerCase().pipe(z.email({error:'Ingresa un correo electrónico válido.'})).optional(), token: z.string().regex(/^[A-Z0-9]{4}$/), kind: z.enum(['applicant', 'visitor']).default('visitor'), assignedSpecialty: z.string().transform(canonicalSpecialty).optional(), role: z.enum(['participant', 'admin', 'visitor', 'pasitos', 'school', 'third_cycle', 'fourth_cycle']).optional() }).transform(user => {
    const role = !user.role || user.role === 'participant' ? (user.kind === 'applicant' ? 'fourth_cycle' as const : 'visitor' as const) : user.role;
    return { ...user, role, kind: isAdmissionRole(role) ? 'applicant' as const : 'visitor' as const };
  }).superRefine((user,ctx)=>{if(user.assignedSpecialty&&!specialties.some(s=>s.name===user.assignedSpecialty))ctx.addIssue({code:'custom',message:'La especialidad asignada no es válida'});})).min(1),
  projects: z.array(z.object({ id: z.string().min(1), name: z.string().min(2), buildingId: z.string(), category: z.enum(['pasitos','school','third_cycle','specialty']).optional(), level: z.union([z.literal('preescolar'),z.number().int().min(1).max(11)]).optional(), specialty: z.string().default(''), description: z.string().min(5) }).transform(project => {
    const category = project.category ?? (project.buildingId === '8' ? 'pasitos' : project.buildingId === '3' ? 'school' : 'specialty');
    const level=project.level??(category==='pasitos'?'preescolar':category==='school'?5:category==='third_cycle'?8:10);
    return { ...project, category, level, specialty: category === 'specialty' ? canonicalSpecialty(project.specialty) : categoryLabel(category) };
  }).superRefine((project, ctx) => {
    if(project.category==='pasitos'?project.level!=='preescolar':project.category==='school'?typeof project.level!=='number'||project.level<1||project.level>6:project.category==='third_cycle'?typeof project.level!=='number'||project.level<7||project.level>9:project.level!==10&&project.level!==11)ctx.addIssue({code:'custom',message:'El nivel no corresponde al área del proyecto'});
    if (project.category === 'specialty') {
      const specialty = specialties.find(s => s.name === project.specialty);
      if (!specialty) ctx.addIssue({ code: 'custom', message: 'Selecciona una especialidad válida' });
      else if (specialty.buildingId !== project.buildingId) ctx.addIssue({ code: 'custom', message: 'La especialidad no corresponde al edificio seleccionado' });
    }
  })),
  challenges: z.array(challengeSchema),
  agenda: z.array(z.object({ id: z.string(), title: z.string(), category: z.enum(['general', 'pastoral', 'radio']), day: z.string().min(1).default('Sábado'), dayNumber: z.number().int().min(1).max(31).optional(), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), buildingId: z.string(), description: z.string() })),
  settings: z.object({ dataVersion: z.string(), title: z.string(), baseReward: z.number().int().positive(), extraEvery: z.number().int().positive(), surveyBonus: z.number().int().nonnegative(), extraBatchSize: z.number().int().positive(), radioUrl: z.url().nullable(), agendaNote: z.string() })
}).superRefine((data, ctx) => {
  if (data.challenges.filter(c => c.isBase).length !== 5) ctx.addIssue({ code: 'custom', message: 'Deben existir cinco retos base' });
  for (const entries of [data.users, data.projects, data.challenges, data.agenda]) {
    if (new Set(entries.map(e => e.id)).size !== entries.length) ctx.addIssue({ code: 'custom', message: 'Hay identificadores duplicados' });
  }
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
  routeIds: z.array(z.string()).default([]),
  manualTickets: z.array(z.object({ id: z.string().min(1), actorId: z.string().min(1), at: z.iso.datetime() })).default([]),
  extraIds: z.array(z.string()), votes: z.array(z.object({ projectId: z.string(), at: z.string() })),
  survey: z.object({ expectations: z.string().min(5), interest: z.string().min(2), satisfaction: z.number().int().min(1).max(5) }).nullable()
});
export type LocalProgress = z.infer<typeof progressSchema>;
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function findUser(data: LocalData, token: string) {
  return data.users.find(u => u.token === token.trim().toUpperCase()) ?? null;
}
export function freshProgress(data: LocalData, userId: string): LocalProgress {
  return { version: 1, dataVersion: data.settings.dataVersion, userId, startedAt: null, completed: [], routeIds: [], manualTickets: [], extraIds: [], votes: [], survey: null };
}
export function summary(data: LocalData, progress: LocalProgress) {
  const ids = new Set(routeChallenges(data,progress).map(c=>c.id));
  const baseTarget=ids.size;
  const base = progress.completed.filter(r => ids.has(r.challengeId)).length;
  const extra = progress.completed.length - base;
  const routeComplete = baseTarget>0 && base === baseTarget;
  const digitalTickets = (routeComplete ? data.settings.baseReward + Math.floor(extra / data.settings.extraEvery) : 0) + (routeComplete && progress.survey ? data.settings.surveyBonus : 0);
  const tickets = digitalTickets + progress.manualTickets.length;
  return { base, baseTarget, extra, routeComplete, digitalTickets, manualTickets: progress.manualTickets.length, tickets, votesAvailable: tickets - progress.votes.length };
}
export function availableProjects(data: LocalData, _userId: string) { return data.projects; }
export function routeChallenges(data:LocalData,progress:LocalProgress) {
  return progress.routeIds.length ? progress.routeIds.map(id=>data.challenges.find(c=>c.id===id)!).filter(Boolean) : data.challenges.filter(c=>c.isBase);
}
export function extraChallenges(data:LocalData) { return data.challenges.filter(c=>!c.projectId&&(c.kind==='code'||c.kind==='saint')); }
export function startLocal(data:LocalData,progress:LocalProgress,random=Math.random): LocalProgress {
  if(progress.startedAt)return progress;
  const user=data.users.find(u=>u.id===progress.userId);
  if(!user)throw Error('El participante no existe.');
  if(!isAdmissionRole(user.role))return {...progress,startedAt:new Date().toISOString()};
  const shuffle=<T,>(values:T[])=>{const result=[...values];for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}return result;};
  const plans:Record<string,[string,number][]>={pasitos:[['pasitos',1],['school',1],['specialty',2]],school:[['school',1],['third_cycle',1],['specialty',2]],third_cycle:[['third_cycle',2],['specialty',2]],fourth_cycle:[]};
  if(user.role==='fourth_cycle'&&!user.assignedSpecialty)throw Error('El administrador debe asignarte una especialidad antes de iniciar.');
  const ids:string[]=[];
  if(user.role==='fourth_cycle') {
    for(const level of [10,11]) {
      const candidates=data.projects.filter(p=>p.category==='specialty'&&p.specialty===user.assignedSpecialty&&p.level===level).map(p=>data.challenges.find(c=>c.projectId===p.id)).filter((c):c is LocalChallenge=>!!c);
      if(!candidates.length)throw Error(`Faltan proyectos con retos de ${user.assignedSpecialty} de ${level===10?'décimo':'undécimo'}.`);
      ids.push(shuffle(candidates)[0].id);
    }
    const remaining=data.projects.filter(p=>p.category==='specialty'&&p.specialty===user.assignedSpecialty).map(p=>data.challenges.find(c=>c.projectId===p.id)).filter((c):c is LocalChallenge=>!!c&&!ids.includes(c.id));
    if(!remaining.length)throw Error('Falta un tercer proyecto distinto de tu especialidad con un reto.');
    ids.push(shuffle(remaining)[0].id);
    const others=data.projects.filter(p=>p.category==='specialty'&&p.specialty!==user.assignedSpecialty).map(p=>data.challenges.find(c=>c.projectId===p.id)).filter((c):c is LocalChallenge=>!!c);
    if(!others.length)throw Error('Falta un proyecto de otra especialidad con un reto.');
    ids.push(shuffle(others)[0].id);
  }

  for(const [category,count] of plans[user.role]) {
    const candidates=data.projects.filter(p=>p.category===category).map(p=>data.challenges.find(c=>c.projectId===p.id)).filter((c):c is LocalChallenge=>!!c);
    if(candidates.length<count)throw Error(`Faltan proyectos con retos de ${categoryLabel(category)} para preparar tu ruta. Solicita ayuda al administrador.`);
    if(category==='specialty'&&count>1) {
      const names=[...new Set(candidates.map(c=>data.projects.find(p=>p.id===c.projectId)!.specialty))];
      if(names.length<count)throw Error('Faltan especialidades distintas con proyectos y retos para preparar tu ruta.');
      for(const name of shuffle(names).slice(0,count))ids.push(shuffle(candidates.filter(c=>data.projects.find(p=>p.id===c.projectId)!.specialty===name))[0].id);
    } else ids.push(...shuffle(candidates).slice(0,count).map(c=>c.id));
  }
  {
    const extra=shuffle(extraChallenges(data).filter(c=>!ids.includes(c.id)))[0];
    if(!extra)throw Error('Falta un reto extra para preparar tu ruta.');
    ids.push(extra.id);
  }
  return {...progress,startedAt:new Date().toISOString(),routeIds:ids};
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
  if (!challenge || (!routeChallenges(data,progress).some(c=>c.id===id) && !progress.extraIds.includes(id))) throw Error('Este reto todavía no está en tu camino.');
  if (progress.completed.some(c => c.challengeId === id)) return progress;
  const error = validateAnswers(challenge, answers); if (error) throw Error(error);
  return { ...progress, completed: [...progress.completed, { challengeId: id, answers, at: new Date().toISOString() }] };
}
export function generateExtras(data: LocalData, progress: LocalProgress, random = Math.random): LocalProgress {
  if (!summary(data, progress).routeComplete) throw Error('Completa los cinco retos base o la ruta asignada para descubrir más.');
  if (progress.extraIds.some(id => !progress.completed.some(c => c.challengeId === id))) throw Error('Termina los retos adicionales disponibles antes de generar otros.');
  const assigned = new Set(routeChallenges(data,progress).map(c=>c.id));
  const candidates = extraChallenges(data).filter(c => !progress.extraIds.includes(c.id) && !assigned.has(c.id));
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  return { ...progress, extraIds: [...progress.extraIds, ...candidates.slice(0, data.settings.extraBatchSize).map(c => c.id)] };
}
export function voteLocal(data: LocalData, progress: LocalProgress, projectId: string): LocalProgress {
  if (summary(data, progress).votesAvailable <= 0) throw Error('No tienes votos disponibles. Completa más retos para conseguir otro tiquete.');
  if (!data.projects.some(p => p.id === projectId)) throw Error('El proyecto no existe.');
  return { ...progress, votes: [...progress.votes, { projectId, at: new Date().toISOString() }] };
}
export function parseProgress(data: LocalData, userId: string, input: unknown): LocalProgress {
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) throw Error('El formato del progreso no es válido. Revisa los campos del archivo.');
  const p = parsed.data;
  if (p.userId !== userId || p.dataVersion !== data.settings.dataVersion) throw Error('El archivo pertenece a otra persona o versión de la demo.');
  if(new Set(p.routeIds).size!==p.routeIds.length||p.routeIds.some(id=>!data.challenges.some(c=>c.id===id)))throw Error('La ruta asignada no es válida.');
  if(p.routeIds.length&&!validRoute(data,p))throw Error('La ruta no corresponde a la modalidad o especialidad asignada.');
  if (new Set(p.manualTickets.map(t => t.id)).size !== p.manualTickets.length || p.manualTickets.some(t => !data.users.some(u => u.id === t.actorId && u.role === 'admin'))) throw Error('Los tiquetes manuales tienen identificadores duplicados o un emisor no válido.');
  if (new Set(p.extraIds).size !== p.extraIds.length || p.extraIds.some(id => !extraChallenges(data).some(c => c.id === id) || routeChallenges(data,p).some(c=>c.id===id))) throw Error('La lista de retos adicionales no es válida.');
  if ((!p.startedAt && (p.routeIds.length || p.completed.length || p.extraIds.length || p.votes.length || p.survey)) || new Set(p.completed.map(c => c.challengeId)).size !== p.completed.length) throw Error('El progreso está duplicado o no tiene inicio.');
  for (const record of p.completed) {
    const c = data.challenges.find(c => c.id === record.challengeId);
    if (!c || (!routeChallenges(data,p).some(base=>base.id===c.id) && !p.extraIds.includes(c.id)) || validateAnswers(c, record.answers)) throw Error('El archivo contiene respuestas o retos no válidos.');
  }
  if (p.votes.some(v => !data.projects.some(project => project.id === v.projectId)) || summary(data, p).votesAvailable < 0) throw Error('El archivo contiene votos no válidos.');
  if ((p.extraIds.length || p.survey) && !summary(data, p).routeComplete) throw Error('Los retos base no están completos.');
  return p;
}
function validRoute(data:LocalData,p:LocalProgress) {
 const user=data.users.find(u=>u.id===p.userId);if(!user||!isAdmissionRole(user.role))return false;
 const projects=p.routeIds.map(id=>data.challenges.find(c=>c.id===id)!).filter(c=>c.projectId).map(c=>data.projects.find(project=>project.id===c.projectId)!);
 if(new Set(projects.map(project=>project.id)).size!==projects.length)return false;
 if(p.routeIds.length!==5||projects.length!==4||p.routeIds.filter(id=>extraChallenges(data).some(c=>c.id===id)).length!==1)return false;
 if(user.role==='fourth_cycle') {
   const own=projects.filter(project=>project.specialty===user.assignedSpecialty&&project.category==='specialty');
   const others=projects.filter(project=>project.specialty!==user.assignedSpecialty&&project.category==='specialty');
   return own.length===3&&own.some(p=>p.level===10)&&own.some(p=>p.level===11)&&others.length===1;
 }
 const count=(category:string)=>projects.filter(project=>project.category===category).length;
 return new Set(projects.filter(p=>p.category==='specialty').map(p=>p.specialty)).size===2&&count('specialty')===2&&(user.role==='pasitos'?count('pasitos')===1&&count('school')===1:user.role==='school'?count('school')===1&&count('third_cycle')===1:count('third_cycle')===2);
}
export const storageKey = (data: LocalData, userId: string) => `camino-local:${data.settings.dataVersion}:${userId}`;
