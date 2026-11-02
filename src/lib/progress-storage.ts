import {freshProgress,parseProgress,progressSchema,storageKey,upgradeVisitorProgress,type LocalData,type LocalProgress} from './local-game';
type Store=Pick<Storage,'getItem'|'setItem'>;
export const compatibilityBackupKey=(data:LocalData,userId:string)=>`${storageKey(data,userId)}:before-compatibility-repair`;

// Legacy visitors could have project visits in extraIds. Convert those assignments
// before applying the newer extra-only validation, without dropping any answers.
export function restoreCompatibleProgress(data:LocalData,userId:string,input:unknown):LocalProgress {
 try{return parseProgress(data,userId,input);}catch(originalError){
  const old=progressSchema.safeParse(input),user=data.users.find(u=>u.id===userId);
  if(!old.success||user?.role!=='visitor'||old.data.userId!==userId||old.data.dataVersion!==data.settings.dataVersion||!old.data.startedAt||old.data.visitorRounds.length)throw originalError;
  const refs=[...old.data.routeIds,...old.data.extraIds,...old.data.completed.map(c=>c.challengeId)];
  if(refs.some(id=>!data.challenges.some(c=>c.id===id)))throw originalError;
  return parseProgress(data,userId,upgradeVisitorProgress(data,old.data));
 }
}
export function loadLocalProgress(data:LocalData,storage:Store,userId:string,upgradeVisitors=true):LocalProgress {
 const key=storageKey(data,userId),raw=storage.getItem(key);if(!raw)return freshProgress(data,userId);
 let input:unknown;try{input=JSON.parse(raw);}catch{throw Error('El avance guardado no se puede leer como JSON. Descarga el respaldo para revisarlo; no se ha borrado.');}
 const restored=restoreCompatibleProgress(data,userId,input);
 const next=parseProgress(data,userId,upgradeVisitors?upgradeVisitorProgress(data,restored):restored);
 const serialized=JSON.stringify(next);
 if(serialized!==JSON.stringify(input)) {
  const backup=compatibilityBackupKey(data,userId);
  if(storage.getItem(backup)===null)storage.setItem(backup,raw);
  storage.setItem(key,serialized);
 }
 return next;
}
