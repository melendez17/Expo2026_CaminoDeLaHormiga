import {allocateRoute,currentVisitorRound,extraChallenges,freshProgress,parseProgress,routeChallenges,startLocal,storageKey,summary,upgradeVisitorProgress,type LocalData,type LocalProgress} from './local-game';
import {participantAreas} from './taxonomy';
type Store=Pick<Storage,'getItem'|'setItem'>;
function requireAdmin(data:LocalData,actorId:string) {if(!data.users.some(u=>u.id===actorId&&u.role==='admin'))throw Error('Se necesita un administrador.');}
export function validateRuleCapacity(data:LocalData,areas=participantAreas) {
 for(const area of areas)try{allocateRoute(data,area.value,data.assignmentRules.admission[area.value],()=>.5);}catch(error){throw Error(`${area.label}: ${(error as Error).message}`);}
}
export function readAssignmentProgress(data:LocalData,storage:Pick<Storage,'getItem'>,userId:string) {
 const raw=storage.getItem(storageKey(data,userId));
 return upgradeVisitorProgress(data,raw?parseProgress(data,userId,JSON.parse(raw)):freshProgress(data,userId));
}
export function prepareAssignments(data:LocalData,storage:Store,actorId:string,userId:string) {
 requireAdmin(data,actorId);const user=data.users.find(u=>u.id===userId);if(!user||user.role==='admin')throw Error('Selecciona un participante.');
 const p=readAssignmentProgress(data,storage,userId);const next=parseProgress(data,userId,startLocal(data,p));storage.setItem(storageKey(data,userId),JSON.stringify(next));return next;
}
export function changeAssignment(data:LocalData,storage:Store,actorId:string,userId:string,input:{fromId?:string;toId?:string;scope?:'route'|'extra'|'visitor';reason:string}) {
 requireAdmin(data,actorId);const user=data.users.find(u=>u.id===userId);if(!user||user.role==='admin')throw Error('Selecciona un participante.');
 const p=readAssignmentProgress(data,storage,userId);if(!p.startedAt)throw Error('Primero asigna los retos iniciales.');
 const reason=input.reason.trim();if(reason.length<3||reason.length>500)throw Error('Escribe el motivo del cambio (3–500 caracteres).');
 const fromId=input.fromId??null,toId=input.toId??null;if(!fromId&&!toId)throw Error('Selecciona el reto que vas a cambiar.');if(fromId===toId)throw Error('Elige un reto diferente.');
 const assigned=[...routeChallenges(data,p).map(c=>c.id),...p.extraIds];
 if(fromId&&(!assigned.includes(fromId)||p.completed.some(c=>c.challengeId===fromId)))throw Error('Solo puedes cambiar retos pendientes asignados.');
 if(toId) {
  const target=data.challenges.find(c=>c.id===toId);if(!target)throw Error('El nuevo reto no existe.');
  const project=data.projects.find(project=>project.id===target.projectId);if(project?.active===false)throw Error('El proyecto no está disponible.');
  if(assigned.includes(toId)||p.failedExtras.some(f=>f.challengeId===toId)||p.assignmentEdits.some(edit=>edit.fromId===toId))throw Error('Ese reto ya fue asignado o retirado.');
  if(target.projectId&&assigned.some(id=>id!==fromId&&data.challenges.find(c=>c.id===id)?.projectId===target.projectId))throw Error('Ese proyecto ya está en el camino.');
 }
 let scope=input.scope??(p.visitorRounds.length?'visitor':'route');
 if(fromId)scope=p.extraIds.includes(fromId)?'extra':p.visitorRounds.length?'visitor':'route';
 if(scope==='extra'&&toId&&!extraChallenges(data).some(c=>c.id===toId))throw Error('En extras debes elegir un reto sin proyecto.');
 if(scope==='route'&&summary(data,p).routeComplete)throw Error('La ruta ya completada se conserva; puedes asignar otro reto extra.');
 const next=structuredClone(p);
 const update=(ids:string[])=>fromId?ids.flatMap(id=>id===fromId?(toId?[toId]:[]):[id]):[...ids,toId!];
 if(scope==='route'){next.routeIds=update(routeChallenges(data,p).map(c=>c.id));if(!next.routeIds.length)throw Error('La ruta debe conservar al menos un reto.');}
 if(scope==='extra')next.extraIds=update(p.extraIds);
 if(scope==='visitor') {
  if(!p.visitorRounds.length)throw Error('Este participante no tiene rondas de visitante.');
  const index=fromId?p.visitorRounds.findIndex(round=>round.includes(fromId)):p.visitorRoundIndex;
  next.visitorRounds[index]=update(p.visitorRounds[index]);if(!next.visitorRounds[index].length||next.visitorRounds[index].length>20)throw Error('La ronda debe conservar entre 1 y 20 retos.');
 }
 next.assignmentEdits.push({id:crypto.randomUUID(),actorId,at:new Date().toISOString(),reason,scope,fromId,toId,role:user.role,area:user.area,...(scope==='route'?{routeIds:[...next.routeIds]}:{})});
 const valid=parseProgress(data,userId,next);storage.setItem(storageKey(data,userId),JSON.stringify(valid));return valid;
}
