'use client';
import { useEffect, useState } from 'react';
import type { LocalData, LocalUser } from '@/lib/local-game';
import { routeChallenges } from '@/lib/local-game';
import { areaLabel, participantAreas, projectLabel } from '@/lib/taxonomy';
import { ruleDescription, ruleTotal, type RouteRule } from '@/lib/assignment-rules';
import { changeAssignment, changeAssignmentByCategory, replacementCandidates, replacementCategories, prepareAssignments, readAssignmentProgress } from '@/lib/admin-assignments';
import campus from '@/lib/campus.json';
const names:Record<string,string>=campus.names;
const generalFields:[keyof RouteRule,string][]=[['pasitos','Pasitos'],['school','Escuela'],['third_cycle','Tercer ciclo'],['specialty','Especialidades'],['extra','Extras']];
const specialtyFields:[keyof RouteRule,string][]=[['own10','Propia · Décimo'],['own11','Propia · Undécimo'],['ownAny','Propia · Cualquier nivel'],['other','Otras especialidades'],['extra','Extras']];
export function AdminAssignments({data,actor,onSave,onChanged,participantId}:{data:LocalData;actor:LocalUser;onSave:(next:LocalData)=>void;onChanged:()=>void;participantId?:string}) {
 const tab=participantId?'person':'rules';
 const userId=participantId??'';
 const [draft,setDraft]=useState(()=>structuredClone(data.assignmentRules));
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [edit,setEdit]=useState<{fromId:string|null;mode:'replace'|'remove'|'add'}|null>(null);
 const [category,setCategory]=useState(''),[level,setLevel]=useState<''|'10'|'11'>(''),[scope,setScope]=useState<'route'|'extra'|'visitor'>('route'),[reason,setReason]=useState('Proyecto no disponible');
 useEffect(()=>{if(edit)document.querySelector('.assignment-edit')?.scrollIntoView({block:'start'});},[edit?.fromId,edit?.mode]);
 useEffect(()=>setDraft(structuredClone(data.assignmentRules)),[data.assignmentRules]);
 const user=data.users.find(u=>u.id===userId&&u.role!=='admin');
 let progress:ReturnType<typeof readAssignmentProgress>|null=null,readError='';
 if(user)try{progress=readAssignmentProgress(data,localStorage,user.id);}catch(e){readError=`No pudimos abrir el avance guardado: ${(e as Error).message}`;}
 const assigned=progress?[...routeChallenges(data,progress),...data.challenges.filter(c=>progress!.extraIds.includes(c.id))]:[];
 const describe=(id:string)=>{const c=data.challenges.find(c=>c.id===id);if(!c)return 'Sin reto';const p=data.projects.find(p=>p.id===c.projectId);return p?`${p.name} · ${projectLabel(p)}`:`${c.title} · Reto extra`;};
 const candidates=progress?replacementCandidates(data,progress,edit?.fromId??null,category,level?Number(level) as 10|11:undefined):[];
 const proposed=candidates[0];
 const attempt=(action:()=>void)=>{setError('');setMessage('');try{action();}catch(e){setError((e as Error).message);}};
 const open=(fromId:string|null)=>{setEdit({fromId,mode:fromId?'replace':'add'});setCategory('');setLevel('');setScope(progress?.visitorRounds.length?'visitor':'route');setReason(fromId?'Proyecto no disponible':'Asignación manual');setError('');setMessage('');};
 const field=(area:string,key:keyof RouteRule,label:string)=><label key={key}>{label}<input aria-label={`${areaLabel(area)}: ${label}`} type="number" min={0} max={20} value={draft.admission[area][key]} onChange={e=>setDraft(old=>({...old,admission:{...old.admission,[area]:{...old.admission[area],[key]:Number(e.target.value)}}}))} required /></label>;
 return <section className="admin-assignment-section">
  {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="feedback" role="status">{message}</p>}
  {tab==='rules'?<form onSubmit={e=>{e.preventDefault();attempt(()=>{onSave({...data,assignmentRules:draft});setMessage('Distribución guardada. Se aplicará a las rutas nuevas; las que ya iniciaron conservan sus retos.');});}}>
   <h2>Visitantes</h2><div className="assignment-visitor-rule"><label>Retos por ronda<input aria-label="Retos por ronda de visitantes" type="number" min={1} max={20} value={draft.visitorBatchSize} required onChange={e=>setDraft(old=>({...old,visitorBatchSize:Number(e.target.value)}))}/></label><p>Se prioriza el área de afinidad. Cada dos retos completados siguen dando un tiquete, aunque cambies el tamaño de la ronda.</p></div>
   <h2>Admisión · Cantidades por área</h2><p>Escribe cuántos proyectos de cada categoría y cuántos extras debe completar cada persona. Cero significa que esa categoría no se asigna.</p>
   <div className="assignment-rule-grid">{participantAreas.slice(0,3).map(area=><fieldset key={area.value}><legend>{area.label} <span>{ruleTotal(draft.admission[area.value])} retos</span></legend><div className="assignment-counts">{generalFields.map(([key,label])=>field(area.value,key,label))}</div><p>{ruleDescription(draft.admission[area.value],area.label)}</p></fieldset>)}</div>
   <h3>Especialidades</h3><p>Cada especialidad tiene su propia distribución. “Propia” se refiere al área elegida por la persona.</p>
   <div className="assignment-specialties">{participantAreas.slice(3).map(area=><details key={area.value}><summary>{area.label}<span>{ruleTotal(draft.admission[area.value])} retos</span></summary><div className="assignment-counts">{specialtyFields.map(([key,label])=>field(area.value,key,label))}</div><p>{ruleDescription(draft.admission[area.value],area.label)}</p></details>)}</div>
   <p className="assignment-note">Se comprueba que haya suficientes proyectos disponibles con retos. Esta configuración no cambia rutas iniciadas ni elimina respuestas. Para una excepción, abre Usuarios y pulsa Asignación en la persona correspondiente.</p><button className="primary" type="submit">Guardar distribución</button>
  </form>:<div className="assignment-person">
   <h2>Asignación de retos</h2>
   {readError&&<p role="alert" className="form-error">{readError}</p>}
   {user&&progress&&<><p className="assignment-note">Los completados están protegidos. Puedes reemplazar o quitar pendientes y añadir una asignación manual. Son excepciones a la distribución del área y se guardan con tu nombre y el motivo.</p>
    {!progress.startedAt?<button className="primary" onClick={()=>attempt(()=>{prepareAssignments(data,localStorage,actor.id,user.id);onChanged();setMessage('Retos iniciales asignados.');})}>Asignar retos iniciales</button>:<>
     <div className="admin-section-top"><h3>{assigned.length} retos asignados · {progress.completed.length} completados</h3><button className="primary" onClick={()=>open(null)}>Añadir reto a esta persona</button></div>
     <ul className="assignment-person-list">{assigned.map(c=><li key={c.id}><div><strong>{describe(c.id)}</strong><small>{names[c.buildingId]}{progress!.visitorRounds.length>0&&` · Ronda ${progress!.visitorRounds.findIndex(r=>r.includes(c.id))+1}`}</small>{data.projects.find(p=>p.id===c.projectId)?.active===false&&<span className="assignment-unavailable">Proyecto no disponible</span>}</div>{progress!.completed.some(done=>done.challengeId===c.id)?<span className="assignment-protected">Completado · protegido</span>:<button onClick={()=>open(c.id)} aria-label={`Cambiar asignación: ${c.title}`}>Cambiar</button>}</li>)}</ul>
     {edit&&<form className="admin-editor assignment-edit" onSubmit={e=>{e.preventDefault();attempt(()=>{if(edit.mode==='remove')changeAssignment(data,localStorage,actor.id,user.id,{fromId:edit.fromId??undefined,reason});else changeAssignmentByCategory(data,localStorage,actor.id,user.id,{fromId:edit.fromId??undefined,category,level:level?Number(level) as 10|11:undefined,scope,reason,expectedToId:proposed?.id});onChanged();setEdit(null);setMessage('Asignación actualizada. La persona verá el cambio en este navegador sin perder lo completado.');});}}>
      <h3>{edit.fromId?'Cambiar reto pendiente':'Nueva asignación'}</h3>{edit.fromId&&<><p>Actual: {describe(edit.fromId)}</p><label>Acción<select aria-label="Acción sobre la asignación" value={edit.mode} onChange={e=>setEdit({...edit,mode:e.target.value as 'replace'|'remove'})}><option value="replace">Reemplazar por otro reto</option><option value="remove">Quitar este reto</option></select></label></>}
      {!edit.fromId&&<label>Destino del reto<select aria-label="Destino de la asignación" value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setCategory('');setLevel('');}}><option value={progress.visitorRounds.length?'visitor':'route'}>{progress.visitorRounds.length?'Ronda actual':'Ruta de admisión'}</option><option value="extra">Retos extra</option></select></label>}
      {edit.mode!=='remove'&&<><label>¿Por qué tipo de reto quieres cambiarlo?<select aria-label="Tipo de reto de reemplazo" value={category} required onChange={e=>{setCategory(e.target.value);setLevel('');}}><option value="">Selecciona una categoría</option>{replacementCategories().map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>{(category.startsWith('specialty:')||category.startsWith('building:'))&&<label>Nivel del reemplazo<select aria-label="Nivel del reemplazo" value={level} onChange={e=>setLevel(e.target.value as typeof level)}><option value="">Cualquier nivel</option><option value="10">Décimo</option><option value="11">Undécimo</option></select></label>}{category&&(proposed?<p className="assignment-note" data-testid="assignment-preview" data-challenge-id={proposed.id}><strong>Se asignará:</strong> {describe(proposed.id)}<br/>{names[proposed.buildingId]} · {candidates.length} opciones disponibles de esta categoría. Se toma la primera disponible, sin elegir otra categoría al azar.</p>:<p className="form-error" role="alert">No hay retos disponibles de esta categoría y nivel. Puedes elegir otra categoría o registrar otro proyecto con su reto.</p>)}</>}
      <label>Motivo del cambio<textarea name="reason" aria-label="Motivo del cambio" required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      {edit.mode==='remove'&&<p className="assignment-note">Quitar un pendiente puede reducir la meta y permitir que la persona termine con menos retos. Sus completados y respuestas se conservan.</p>}
      <div className="admin-form-actions"><button type="submit" className="primary" disabled={edit.mode!=='remove'&&!proposed}>Aplicar cambio</button><button type="button" onClick={()=>setEdit(null)}>Cancelar cambio</button></div>
     </form>}
     {!!progress.assignmentEdits.length&&<details className="assignment-history"><summary>Historial de cambios ({progress.assignmentEdits.length})</summary><ul>{[...progress.assignmentEdits].reverse().map(change=><li key={change.id}><strong>{change.fromId?describe(change.fromId):'Nueva asignación'} → {change.toId?describe(change.toId):'Retirado'}</strong><p>{change.reason}</p><small>{data.users.find(u=>u.id===change.actorId)?.name} · {new Intl.DateTimeFormat('es-CR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(change.at))}</small></li>)}</ul></details>}
    </>}
   </>}
  </div>}
 </section>;
}
