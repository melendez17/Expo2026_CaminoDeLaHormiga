import ExcelJS from 'exceljs';
import {z} from 'zod';
import {localDataSchema,storageKey,summary,routeChallenges,type LocalData} from './local-game';
import {CATALOG_KEY,adminRows,validateCatalogChange} from './local-admin';
import {compatibilityBackupKey,restoreCompatibleProgress} from './progress-storage';
import {raffleKey,raffleTickets,readDraws} from './local-tickets';
import {challengeAnswers} from './participant-answers';
import {areaLabel,categoryLabel,participantAreas,roleLabel} from './taxonomy';
export const RESTORE_MARKER='camino-excel-restore-running';
const FORMAT='camino-excel-v1';
type StorageAccess=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Column=[string,string,number?];
const userColumns:Column[]=[['id','ID'],['name','Nombre completo'],['firstName','Nombre'],['firstSurname','Apellido 1'],['secondSurname','Apellido 2'],['email','Correo'],['token','Token'],['role','Rol'],['area','Área de afinidad']];
const projectColumns:Column[]=[['id','ID'],['name','Nombre'],['category','Área'],['specialty','Especialidad'],['level','Nivel'],['buildingId','Edificio ID'],['active','Disponible'],['description','Descripción',60]];
const challengeColumns:Column[]=[['id','ID'],['title','Título',45],['kind','Tipo'],['projectId','Proyecto ID'],['level','Nivel de especialidad'],['buildingId','Edificio ID'],['description','Descripción',60],['code','Código'],['answer','Respuesta del santo'],['badge','Insignia'],['isBase','Base histórica']];
const questionColumns:Column[]=[['challengeId','Reto ID'],['id','Pregunta ID'],['prompt','Pregunta',50],...Array.from({length:6},(_,i)=>[`o${i+1}`,`Opción ${i+1}`,28] as Column),['correct','Opción correcta']];
const agendaColumns:Column[]=[['id','ID'],['title','Actividad',45],['day','Día'],['dayNumber','Número de día'],['category','Categoría'],['time','Inicio'],['endTime','Fin'],['buildingId','Edificio ID'],['description','Descripción',60]];
const ruleKeys=['pasitos','school','third_cycle','specialty','extra','own10','own11','ownAny','other'] as const;
const ruleColumns:Column[]=[['area','Área'],['pasitos','Pasitos'],['school','Escuela'],['third_cycle','Tercer ciclo'],['specialty','Especialidades'],['extra','Extras'],['own10','Propia décimo'],['own11','Propia undécimo'],['ownAny','Propia cualquier nivel'],['other','Otras especialidades']];
function sheet(book:ExcelJS.Workbook,name:string,columns:Column[],rows:Record<string,unknown>[]){
 const ws=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});ws.columns=columns.map(([key,header,width])=>({key,header,width:width??24}));
 for(const row of rows)ws.addRow(row);
 ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF113F2A'}};ws.getRow(1).height=26;
 ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:columns.length}};
 ws.eachRow((row,index)=>{if(index>1){row.alignment={vertical:'top',wrapText:true};if(index%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F7F2'}};}});return ws;
}
export function backupStorageKeys(data:LocalData){return [...data.users.flatMap(u=>[storageKey(data,u.id),compatibilityBackupKey(data,u.id)]),raffleKey(data)];}
function capture(data:LocalData,storage:Pick<Storage,'getItem'>){return Object.fromEntries(backupStorageKeys(data).flatMap(key=>{const value=storage.getItem(key);return value===null?[]:[[key,value]];}));}
export async function createExcelBackup(data:LocalData,storage:Pick<Storage,'getItem'>){
 data=localDataSchema.parse({...data,projects:data.projects.map(p=>({...p,active:p.active!==false})),challenges:data.challenges.map(c=>({...c,level:c.level??(data.projects.find(p=>p.id===c.projectId)?.category==='specialty'?data.projects.find(p=>p.id===c.projectId)?.level:undefined)}))});
 const book=new ExcelJS.Workbook();book.creator='Camino de la Hormiga · ExpoTEC';book.created=new Date();book.title='Respaldo ExpoTEC';
 sheet(book,'Usuarios',userColumns,data.users.map(u=>({...u,role:roleLabel(u.role),area:u.area?areaLabel(u.area):''})));
 sheet(book,'Proyectos',projectColumns,data.projects.map(p=>({...p,category:categoryLabel(p.category),active:p.active===false?'No':'Sí'})));
 sheet(book,'Retos',challengeColumns,data.challenges.map(c=>({...c,level:c.level??(data.projects.find(p=>p.id===c.projectId)?.category==='specialty'?data.projects.find(p=>p.id===c.projectId)?.level:undefined),isBase:c.isBase?'Sí':'No'})));
 sheet(book,'Preguntas',questionColumns,data.challenges.flatMap(c=>(c.questions??[]).map(q=>({challengeId:c.id,id:q.id,prompt:q.prompt,...Object.fromEntries(q.options.map((option,i)=>[`o${i+1}`,option])),correct:q.correctIndex+1}))));
 sheet(book,'Agenda',agendaColumns,data.agenda);
 sheet(book,'Distribución',ruleColumns,participantAreas.map(area=>({area:area.label,...data.assignmentRules.admission[area.value]})));
 sheet(book,'Configuración',[['key','Clave',36],['value','Valor',70]],[{key:'Retos por ronda de visitantes',value:data.assignmentRules.visitorBatchSize},{key:'Versión de datos',value:data.settings.dataVersion},{key:'Exportado (Costa Rica)',value:new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date())}]);
 const rows=adminRows(data,storage);
 sheet(book,'Participación',[['id','Usuario ID'],['name','Persona',32],['token','Token'],['role','Rol'],['area','Área',35],['status','Estado'],['completed','Completados'],['tickets','Tiquetes'],['votes','Votos emitidos'],['available','Votos disponibles'],['error','Revisión',60]],rows.map(r=>({id:r.user.id,name:r.user.name,token:r.user.token,role:roleLabel(r.user.role),area:areaLabel(r.user.area),status:r.status,completed:r.progress?.completed.length,tickets:r.stats?.tickets,votes:r.progress?.votes.length,available:r.stats?.votesAvailable,error:r.error??''})));
 sheet(book,'Encuestas',[['userId','Usuario ID'],['name','Persona',32],['token','Token'],['role','Rol'],['area','Área',35],['state','Estado'],['expectations','¿Qué esperabas descubrir?',55],['interest','¿Qué área te interesa?',45],['satisfaction','Satisfacción (1–5)']],rows.map(r=>({userId:r.user.id,name:r.user.name,token:r.user.token,role:roleLabel(r.user.role),area:areaLabel(r.user.area),state:r.progress?.survey?'Completada':'Pendiente',expectations:r.progress?.survey?.expectations??'',interest:r.progress?.survey?.interest??'',satisfaction:r.progress?.survey?.satisfaction??''})));
 const assignmentColumns:Column[]=[['userId','Usuario ID'],['name','Persona',32],['token','Token'],['challengeId','Reto ID'],['title','Reto',38],['level','Nivel'],['state','Estado'],['question','Pregunta',45],['answer','Respuesta',55],['correct','Correcta']];
 for(const [name,extra]of [['Retos de ruta',false],['Retos adicionales',true]] as const)sheet(book,name,assignmentColumns,rows.flatMap(r=>{if(!r.progress)return [];const p=r.progress;const assigned=extra?data.challenges.filter(c=>p.extraIds.includes(c.id)):routeChallenges(data,p);return assigned.flatMap(c=>{const done=p.completed.find(done=>done.challengeId===c.id);return challengeAnswers(c,done?.answers).map(q=>({userId:r.user.id,name:r.user.name,token:r.user.token,challengeId:c.id,title:c.title,level:c.level??data.projects.find(project=>project.id===c.projectId)?.level??'',state:done?'Completado':'Pendiente',question:q.question,answer:q.answer??'',correct:q.correct===undefined?'':q.correct?'Sí':'No'}));});}));
 const answers=rows.flatMap(r=>r.progress?[...r.progress.completed.map(c=>({...c,state:'Completado'})),...r.progress.failedExtras.map(c=>({...c,state:'Intento incorrecto'})),...r.progress.failedAnswers.map(c=>({...c,state:'Intento incorrecto'}))].flatMap(record=>{const c=data.challenges.find(c=>c.id===record.challengeId);return c?challengeAnswers(c,record.answers).map(q=>({userId:r.user.id,name:r.user.name,token:r.user.token,challengeId:c.id,title:c.title,state:record.state,question:q.question,answer:q.answer??'',correct:q.correct===undefined?'':q.correct?'Sí':'No',at:record.at})):[];}):[]);
 sheet(book,'Respuestas',[['userId','Usuario ID'],['name','Persona',32],['token','Token'],['challengeId','Reto ID'],['title','Reto',38],['state','Estado'],['question','Pregunta',45],['answer','Respuesta',55],['correct','Correcta'],['at','Fecha ISO',27]],answers);
 sheet(book,'Votos',[['userId','Usuario ID'],['name','Persona',32],['project','Proyecto',38],['specialty','Área',35],['at','Fecha ISO',27]],rows.flatMap(r=>r.progress?.votes.map(v=>({userId:r.user.id,name:r.user.name,project:data.projects.find(p=>p.id===v.projectId)?.name??v.projectId,specialty:data.projects.find(p=>p.id===v.projectId)?.specialty,at:v.at}))??[]));
 let tickets:Record<string,unknown>[]=[];try{tickets=raffleTickets(data,storage).tickets.map(t=>({...t,source:t.source==='manual'?'Manual':'Retos'}));}catch{tickets=[{name:'Los tiquetes necesitan revisión. Los datos originales se conservan en el respaldo.'}];}
 sheet(book,'Tiquetes',[['name','Persona',32],['token','Token'],['code','Tiquete',40],['source','Origen'],['issuedAt','Fecha ISO',27],['issuedBy','Emitido por',32]],tickets);
 let draws:Record<string,unknown>[]=[];try{draws=readDraws(data,storage).map(draw=>({...draw}));}catch{draws=[{winnerName:'El historial necesita revisión. El dato original se conserva en el respaldo.'}];}
 sheet(book,'Rifas',[['winnerName','Ganador',35],['ticketCode','Tiquete',40],['prize','Premio',35],['at','Fecha ISO',27],['actorId','Administrador ID'],['poolSize','Tiquetes participantes']],draws);
 sheet(book,'Cambios de asignación',[['name','Persona',32],['from','Anterior',40],['to','Asignado',40],['reason','Motivo',50],['actor','Administrador',32],['at','Fecha ISO',27]],rows.flatMap(r=>r.progress?.assignmentEdits.map(edit=>({name:r.user.name,from:edit.fromId?data.challenges.find(c=>c.id===edit.fromId)?.title??edit.fromId:'Nueva asignación',to:edit.toId?data.challenges.find(c=>c.id===edit.toId)?.title??edit.toId:'Retirado',reason:edit.reason,actor:data.users.find(u=>u.id===edit.actorId)?.name??edit.actorId,at:edit.at}))??[]));
 const hidden=book.addWorksheet('_Restauracion');hidden.state='veryHidden';hidden.addRow([FORMAT]);hidden.addRow(['base64-utf8']);const payload=JSON.stringify({format:FORMAT,catalog:data,storage:capture(data,storage)});const encoded=new TextEncoder().encode(payload);let binary='';for(let i=0;i<encoded.length;i+=16384)binary+=String.fromCharCode(...encoded.subarray(i,i+16384));const safePayload=btoa(binary);for(let i=0;i<safePayload.length;i+=30000)hidden.addRow([safePayload.slice(i,i+30000)]);
 return new Uint8Array(await book.xlsx.writeBuffer());
}
function cellValue(cell:ExcelJS.Cell):unknown {
 const value=cell.value;if(value&&typeof value==='object'){
  if('formula'in value||'sharedFormula'in value)throw Error('El respaldo debe contener valores, no fórmulas.');
  if('richText'in value)return value.richText.map(t=>t.text).join('');if('text'in value)return value.text;
 }
 return value;
}
function records(book:ExcelJS.Workbook,name:string,columns:Column[]){const ws=book.getWorksheet(name);if(!ws)throw Error(`Falta la hoja «${name}».`);for(const [i,column]of columns.entries())if(String(cellValue(ws.getCell(1,i+1))??'')!==column[1])throw Error(`La hoja «${name}» debe conservar la columna «${column[1]}».`);const result:Record<string,unknown>[]=[];ws.eachRow((row,index)=>{if(index>1&&row.values&&columns.some((_,i)=>cellValue(row.getCell(i+1))!==null&&cellValue(row.getCell(i+1))!==undefined))result.push(Object.fromEntries(columns.map(([key],i)=>[key,cellValue(row.getCell(i+1))])));});return result;}
const text=(v:unknown)=>v===null||v===undefined?'':String(v).trim();const optional=(v:unknown)=>text(v)||undefined;
const yes=(v:unknown)=>v===true||v===1||['si','sí','true','yes'].includes(text(v).toLowerCase());
function time(v:unknown){if(v instanceof Date)return `${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`;if(typeof v==='number'){const minutes=Math.round((v%1)*1440);return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}return text(v);}
const payloadSchema=z.object({format:z.literal(FORMAT),catalog:z.unknown(),storage:z.record(z.string(),z.string())});
export type ExcelBackup={original:LocalData;catalog:LocalData;storage:Record<string,string>;warnings:string[]};
export async function readExcelBackup(bytes:ArrayBuffer|Uint8Array):Promise<ExcelBackup>{
 const book=new ExcelJS.Workbook();try{await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);}catch{throw Error('No se pudo abrir el Excel. Selecciona un archivo .xlsx exportado desde Respaldo.');}
 const hidden=book.getWorksheet('_Restauracion');if(!hidden||cellValue(hidden.getCell(1,1))!==FORMAT)throw Error('Este archivo no es un respaldo Excel de Camino ExpoTEC.');const encoded=cellValue(hidden.getCell(2,1))==='base64-utf8';let json='';for(let i=encoded?3:2;i<=hidden.rowCount;i++)json+=String(cellValue(hidden.getCell(i,1))??'');if(encoded)json=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(json),c=>c.charCodeAt(0)));const payload=payloadSchema.parse(JSON.parse(json));const original=localDataSchema.parse(payload.catalog),next=structuredClone(original);
 next.users=records(book,'Usuarios',userColumns).map(row=>({id:text(row.id),name:text(row.name)||[row.firstName,row.firstSurname,row.secondSurname].map(text).join(' '),firstName:optional(row.firstName),firstSurname:optional(row.firstSurname),secondSurname:optional(row.secondSurname),email:optional(row.email),token:text(row.token).toUpperCase(),role:({'Admin':'admin','Visitante':'visitor','Admisión':'admission'}as Record<string,string>)[text(row.role)]??text(row.role),area:optional(row.area)})) as LocalData['users'];
 next.projects=records(book,'Proyectos',projectColumns).map(row=>({...row,id:text(row.id),name:text(row.name),category:({'Pasitos':'pasitos','Escuela':'school','Tercer ciclo':'third_cycle','Especialidad':'specialty'}as Record<string,string>)[text(row.category)]??text(row.category),specialty:text(row.specialty),level:text(row.level).toLowerCase()==='preescolar'?'preescolar':Number(row.level),buildingId:text(row.buildingId),active:yes(row.active),description:text(row.description)})) as LocalData['projects'];
 const questions=records(book,'Preguntas',questionColumns);const challenges=records(book,'Retos',challengeColumns);
 if(questions.some(q=>!challenges.some(c=>text(c.id)===text(q.challengeId))))throw Error('Hay preguntas sin reto. Conserva sus IDs o elimina también esas filas.');
 next.challenges=challenges.map(row=>({id:text(row.id),title:text(row.title),kind:text(row.kind),projectId:optional(row.projectId),level:optional(row.level)?Number(row.level):undefined,buildingId:text(row.buildingId),description:text(row.description),code:optional(row.code),answer:optional(row.answer),badge:optional(row.badge),isBase:yes(row.isBase),questions:questions.some(q=>text(q.challengeId)===text(row.id))?questions.filter(q=>text(q.challengeId)===text(row.id)).map(q=>({id:text(q.id),prompt:text(q.prompt),options:Array.from({length:6},(_,i)=>text(q[`o${i+1}`])).filter(Boolean),correctIndex:Number(q.correct)-1})):undefined})) as LocalData['challenges'];
 next.agenda=records(book,'Agenda',agendaColumns).map(row=>({id:text(row.id),title:text(row.title),day:text(row.day),dayNumber:optional(row.dayNumber)?Number(row.dayNumber):undefined,category:text(row.category),time:time(row.time),endTime:optional(row.endTime)?time(row.endTime):undefined,buildingId:text(row.buildingId),description:text(row.description)})) as LocalData['agenda'];
 const rules=records(book,'Distribución',ruleColumns);next.assignmentRules.admission=Object.fromEntries(rules.map(row=>{const area=participantAreas.find(a=>a.label===text(row.area)||a.value===text(row.area));if(!area)throw Error(`Área desconocida en Distribución: ${text(row.area)}.`);return[area.value,Object.fromEntries(ruleKeys.map(key=>[key,Number(row[key]??0)]))];})) as LocalData['assignmentRules']['admission'];
 next.assignmentRules.visitorBatchSize=Number(records(book,'Configuración',[['key','Clave'],['value','Valor']]).find(row=>row.key==='Retos por ronda de visitantes')?.value);next.agendaManaged=true;
 const catalog=localDataSchema.parse(next);const allowed=new Set(backupStorageKeys(original));for(const key of Object.keys(payload.storage))if(!allowed.has(key))throw Error('El respaldo contiene una clave de almacenamiento ajena al catálogo.');
 const warnings:string[]=[];for(const user of original.users){const raw=payload.storage[storageKey(original,user.id)];if(raw)try{restoreCompatibleProgress(original,user.id,JSON.parse(raw));}catch{warnings.push(`El avance de ${user.name} se conservará tal como está y necesita revisión.`);}}
 return {original,catalog,storage:payload.storage,warnings};
}
export function restoreExcelBackup(current:LocalData,storage:StorageAccess,actorId:string,backup:ExcelBackup){
 if(!current.users.some(u=>u.id===actorId&&u.role==='admin'))throw Error('Se necesita un administrador para restaurar.');
 if(backup.catalog.settings.dataVersion!==current.settings.dataVersion)throw Error('El Excel pertenece a otra versión de la aplicación.');
 const catalog=validateCatalogChange(backup.original,backup.catalog,actorId,{getItem:key=>backup.storage[key]??null});
 const keys=[...new Set([CATALOG_KEY,...backupStorageKeys(current),...backupStorageKeys(catalog),...Object.keys(backup.storage)])];const previous=Object.fromEntries(keys.map(key=>[key,storage.getItem(key)]));
 const rollbackKey=`camino-before-excel:${Date.now()}:${crypto.randomUUID()}`;storage.setItem(rollbackKey,JSON.stringify({catalog:current,storage:previous}));
 storage.setItem(RESTORE_MARKER,'1');
 try{
  for(const key of keys)if(key!==CATALOG_KEY){const raw=backup.storage[key];if(raw===undefined)storage.removeItem(key);else storage.setItem(key,raw);}
  storage.setItem(CATALOG_KEY,JSON.stringify(catalog));
 }catch(error){for(const key of keys)storage.removeItem(key);for(const [key,raw]of Object.entries(previous)){if(raw===null)storage.removeItem(key);else storage.setItem(key,raw);}throw error;}finally{storage.removeItem(RESTORE_MARKER);}
 return catalog;
}
