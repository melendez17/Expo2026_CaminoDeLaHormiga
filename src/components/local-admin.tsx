'use client';
import { useEffect, useState } from 'react';
import { adminRows, csvField, generateUserToken } from '@/lib/local-admin';
import { normalize, type LocalChallenge, type LocalData, type LocalUser } from '@/lib/local-game';
import campus from '@/lib/campus.json';
import { PageIntro } from './page-intro';
import { PlaceTag } from './icons';
import { AppNavigation } from './app-navigation';
import { AdminOverview } from './admin-overview';
import { AdminTickets } from './admin-tickets';
import { roles, roleLabel, isAdmissionRole, projectCategories, projectLabel, specialties, levelLabel, type ProjectLevel, type ProjectCategory } from '@/lib/taxonomy';
import { ParticipantAnswers } from './participant-answers';

type Resource = 'users' | 'challenges' | 'projects';
type Tab = 'overview' | Resource | 'backup' | 'answers' | 'tickets';
type Editor = { resource: Resource; id: string | null };
const names: Record<string, string> = campus.names;
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LocalAdmin({ data, actor, onLogout, onSave }: {
  data: LocalData; actor: LocalUser; onLogout: () => void; onSave: (next: LocalData) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [kind, setKind] = useState<LocalChallenge['kind']>('freeform');
  const [editingRole,setEditingRole]=useState<LocalUser['role']>('visitor');
  const [projectLevel,setProjectLevel]=useState<ProjectLevel>(10);
  const [projectCategory,setProjectCategory]=useState<ProjectCategory>('specialty');
  const [projectSpecialty,setProjectSpecialty]=useState<string>('Desarrollo Web');
  const [remove, setRemove] = useState<{ resource: Resource; id: string; title: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(n => n + 1);
    window.addEventListener('storage', update); window.addEventListener('focus', update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener('focus', update); };
  }, []);
  const rows = adminRows(data, localStorage);
  const item = editor?.id ? data[editor.resource].find(entry => entry.id === editor.id) : null;
  const user = editor?.resource === 'users' ? item as LocalUser | null : null;
  const challenge = editor?.resource === 'challenges' ? item as LocalChallenge | null : null;
  const project = editor?.resource === 'projects' ? item as LocalData['projects'][number] | null : null;

  function attempt(action: () => void) {
    setError(''); try { action(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio.'); }
  }
  function changeTab(next: Tab) { setTab(next); setEditor(null); setRemove(null); setSearch(''); setError(''); setMessage(''); }
  function showAnswers(id: string) { changeTab('answers'); setSelectedParticipant(id); }
  function open(resource: Resource, id: string | null) {
    setError(''); setMessage(''); setRemove(null); setEditor({ resource, id });
    if (resource === 'users') setEditingRole(data.users.find(u=>u.id===id)?.role??'visitor');
    if (resource === 'projects') { const p=data.projects.find(p=>p.id===id);setProjectLevel(p?.level??10);setProjectCategory(p?.category??'specialty');setProjectSpecialty(p?.category==='specialty'?p.specialty:'Desarrollo Web'); }
    if (resource === 'challenges') setKind(data.challenges.find(c => c.id === id)?.kind ?? 'freeform');
  }
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editor) return;
    const values = new FormData(e.currentTarget);
    const text = (key: string) => String(values.get(key) ?? '').trim();
    attempt(() => {
      const id = editor.id ?? crypto.randomUUID();
      const next = structuredClone(data);
      if (editor.resource === 'users') {
        if(text('role')==='fourth_cycle'&&!text('assignedSpecialty'))throw Error('Asigna una especialidad al usuario de Cuarto ciclo.');
        const value: LocalUser = { id, name: text('name'), email: text('email').toLowerCase(), token: user?.token ?? generateUserToken(data.users), kind: isAdmissionRole(text('role')) ? 'applicant' : 'visitor', role: text('role') as LocalUser['role'], ...(text('role')==='fourth_cycle'?{assignedSpecialty:text('assignedSpecialty')}:{}) };
        next.users = editor.id ? next.users.map(u => u.id === id ? value : u) : [...next.users, value];
      } else if (editor.resource === 'projects') {
        const value = { id, name: text('name'), buildingId: projectCategory==='specialty' ? specialties.find(s=>s.name===projectSpecialty)!.buildingId : text('buildingId'), category: projectCategory, level: projectLevel, specialty: projectCategory==='specialty'?projectSpecialty:projectCategories.find(c=>c.value===projectCategory)!.label, description: text('description') };
        next.projects = editor.id ? next.projects.map(p => p.id === id ? value : p) : [...next.projects, value];
      } else {
        const value: LocalChallenge = { id, title: text('title'), description: text('description'), buildingId: text('buildingId'), kind, isBase: challenge?.isBase ?? false };
        if(kind==='freeform'&&text('projectId'))value.projectId=text('projectId');
        if (challenge?.badge) value.badge = challenge.badge;
        if (kind === 'quiz' || kind === 'code') value.code = text('code').toUpperCase();
        if (kind === 'saint') value.answer = text('answer');
        if (kind === 'quiz') {
          value.projectId = text('projectId');
          value.questions = [0, 1].map(index => ({
            id: challenge?.questions?.[index]?.id ?? (index === 0 ? 'objective' : 'technical'),
            prompt: text(`q${index}Prompt`), options: text(`q${index}Options`).split('\n').map(s => s.trim()).filter(Boolean), correctIndex: Number(text(`q${index}Correct`)) - 1
          }));
        }
        next.challenges = editor.id ? next.challenges.map(c => c.id === id ? value : c) : [...next.challenges, value];
      }
      onSave(next); setEditor(null); setMessage(editor.resource === 'users' && !editor.id ? `Usuario creado. Token de acceso: ${next.users.find(u => u.id === id)!.token}.` : 'Cambio guardado en este navegador. Exporta el catálogo si quieres conservarlo como archivo.');
    });
  }
  function removeEntry() {
    if (!remove) return;
    attempt(() => {
      const next = structuredClone(data);
      if (remove.resource === 'users') next.users = next.users.filter(u => u.id !== remove.id);
      if (remove.resource === 'projects') next.projects = next.projects.filter(p => p.id !== remove.id);
      if (remove.resource === 'challenges') next.challenges = next.challenges.filter(c => c.id !== remove.id);
      onSave(next); setRemove(null); setMessage('Registro eliminado del catálogo local.');
    });
  }
  function report() {
    const header = ['Nombre', 'Correo electrónico', 'Rol', 'Perfil de admisión', 'Estado', 'Retos', 'Tiquetes', 'Votos emitidos', 'Votos disponibles', 'Encuesta'];
    const csv = [header, ...rows.map(r => [r.user.name, r.user.email ?? '', roleLabel(r.user.role), r.user.kind, r.status, r.progress?.completed.length ?? '', r.stats?.tickets ?? '', r.progress?.votes.length ?? '', r.stats?.votesAvailable ?? '', r.progress?.survey ? 'Completada' : 'Pendiente'])].map(row => row.map(csvField).join(',')).join('\r\n');
    download('metricas-demo.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }
  const field = (label: string, name: string, defaultValue = '', required = true) => <label>{label}<input name={name} defaultValue={defaultValue} required={required} maxLength={160} /></label>;
  const location = (value = '7') => <label>Edificio<select name="buildingId" defaultValue={value}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;

  return <div className={`local-app admin-local ${tab === 'overview' ? 'admin-overview-active' : ''}`}><header className="local-header"><a className="brand admin-school-brand" href="/" aria-label="CEDES Don Bosco, inicio"><img src="/brand/cedes-don-bosco-white.png" alt="CEDES Don Bosco" width="2048" height="661" /></a><div className="local-account"><span>{actor.name}<small>Administrador de prueba</small></span><button onClick={onLogout}>Salir</button></div></header>
    <AppNavigation label="Administración local" admin items={[
      { id: 'overview', title: 'Resumen', icon: 'dashboard' }, { id: 'users', title: 'Usuarios', icon: 'users' },
      { id: 'challenges', title: 'Retos', icon: 'route' }, { id: 'projects', title: 'Proyectos', icon: 'projects' },
      { id: 'answers', title: 'Respuestas', icon: 'answers' }, { id: 'tickets', title: 'Tiquetes', icon: 'ticket' }, { id: 'backup', title: 'Respaldo', icon: 'backup' }
    ] as const} active={tab} onChange={changeTab}/>
    <main className="local-content"><div className="local-section admin-container"><div className="admin-title-row"><PageIntro eyebrow="PANEL DE ADMINISTRACIÓN" sequence="01" title={{overview:'Resumen',users:'Usuarios',projects:'Proyectos',challenges:'Retos',answers:'Respuestas',tickets:'Tiquetes',backup:'Respaldo'}[tab]} description="Gestiona el catálogo y consulta las pruebas realizadas en este navegador." />{tab === 'overview' && <div className="admin-overview-actions"><button onClick={() => refresh(n => n + 1)}>Actualizar métricas</button><button onClick={() => attempt(report)}>Descargar CSV</button></div>}</div>
      <p className="admin-local-note">Modo local de prueba: este token es público. Los cambios y las métricas no se comparten entre dispositivos ni modifican los JSON del repositorio.</p>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="feedback" role="status">{message}</p>}
      {tab === 'tickets' && <AdminTickets data={data} actor={actor} onIssued={()=>refresh(n=>n+1)}/>}
      {tab === 'overview' && <AdminOverview data={data} rows={rows} onAnswers={showAnswers}/>}
      {(tab === 'users' || tab === 'challenges' || tab === 'projects') && <>
        <div className="admin-section-top"><h2>{tab === 'users' ? 'Usuarios de prueba' : tab === 'challenges' ? 'Catálogo de retos' : 'Proyectos para votar'}</h2><button className="primary" onClick={() => open(tab, null)}>{tab === 'users' ? 'Nuevo usuario' : tab === 'challenges' ? 'Nuevo reto' : 'Nuevo proyecto'}</button></div>
        {editor && <section className="admin-editor" key={`${editor.resource}-${editor.id ?? 'new'}`}><h3>{editor.id ? 'Editar registro' : 'Crear registro'}</h3><form onSubmit={save}>
          {editor.resource === 'users' && <>{field('Nombre completo', 'name', user?.name)}<label>Correo electrónico<input name="email" type="email" autoComplete="email" defaultValue={user?.email ?? ''} required maxLength={254} /></label>{user ? <p>Token de acceso: <strong>{user.token}</strong></p> : <p className="muted">El token de acceso se generará automáticamente al guardar.</p>}<label>Rol<select aria-label="Rol" name="role" value={editingRole} onChange={e=>setEditingRole(e.target.value as LocalUser['role'])}>{roles.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></label>{editingRole==='fourth_cycle'&&<label>Especialidad asignada<select name="assignedSpecialty" aria-label="Especialidad asignada" defaultValue={user?.assignedSpecialty??''} required><option value="">Selecciona la especialidad</option>{specialties.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>}<p className="muted">Pasitos, Escuela, Tercer ciclo y Cuarto ciclo son modalidades de admisión con acceso a la encuesta correspondiente.</p>{user?.id === actor.id && <p>Tu propio acceso debe conservar el rol Admin.</p>}</>}
          {editor.resource === 'projects' && <>{field('Nombre del proyecto', 'name', project?.name)}<label>Área del proyecto<select aria-label="Área del proyecto" value={projectCategory} onChange={e=>{const category=e.target.value as ProjectCategory;setProjectCategory(category);setProjectLevel(category==='pasitos'?'preescolar':category==='school'?1:category==='third_cycle'?7:10);}}>{projectCategories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label><label>Nivel del proyecto<select aria-label="Nivel del proyecto" value={String(projectLevel)} onChange={e=>setProjectLevel(e.target.value==='preescolar'?'preescolar':Number(e.target.value))}>{(projectCategory==='pasitos'?['preescolar'] as const:projectCategory==='school'?[1,2,3,4,5,6]:projectCategory==='third_cycle'?[7,8,9]:[10,11]).map(level=><option key={level} value={level}>{levelLabel(level as ProjectLevel)}</option>)}</select></label>{projectCategory==='specialty'?<><label>Especialidad<select aria-label="Especialidad" value={projectSpecialty} onChange={e=>setProjectSpecialty(e.target.value)}>{specialties.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label><p>Edificio: <strong>{names[specialties.find(s=>s.name===projectSpecialty)!.buildingId]}</strong></p></>:location(project?.buildingId??(projectCategory==='pasitos'?'8':projectCategory==='school'?'3':'10'))}<label>Descripción<textarea name="description" defaultValue={project?.description} maxLength={1000} required /></label></>}
          {editor.resource === 'challenges' && <>{field('Título del reto', 'title', challenge?.title)}{kind==='freeform'&&<label>Proyecto relacionado (opcional)<select aria-label="Proyecto relacionado" name="projectId" defaultValue={challenge?.projectId??''}><option value="">Sin proyecto específico</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{location(challenge?.buildingId)}<label>Descripción<textarea name="description" defaultValue={challenge?.description} maxLength={1000} required /></label><label>Tipo de reto<select name="challengeKind" value={kind} onChange={e => setKind(e.target.value as LocalChallenge['kind'])}><option value="freeform">Formulario libre</option><option value="quiz">Especialidad: dos preguntas y código</option><option value="code">Código de stand / photobooth</option><option value="saint">Nombre del santo</option></select></label><p className="muted">{challenge?.isBase ? 'Reto base del recorrido general de visitantes.' : 'Los retos vinculados a proyectos se asignan como visitas. Solo códigos de puestos y santos sin proyecto son retos extra.'} Las reglas de retos con respuestas guardadas se conservan.</p>
            {(kind === 'quiz' || kind === 'code') && <label>Código del stand<input name="code" defaultValue={challenge?.code ?? ''} pattern="[A-Za-z0-9]{4}" maxLength={4} minLength={4} required /></label>}
            {kind === 'saint' && field('Respuesta esperada', 'answer', challenge?.answer)}
            {kind === 'quiz' && <><label>Proyecto<select name="projectId" defaultValue={challenge?.projectId ?? ''} required><option value="">Selecciona un proyecto</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{[0, 1].map(index => <fieldset key={index}><legend>{index === 0 ? 'Pregunta del objetivo' : 'Pregunta técnica'}</legend>{field('Pregunta', `q${index}Prompt`, challenge?.questions?.[index]?.prompt)}<label>Opciones (una por línea, entre 2 y 6)<textarea name={`q${index}Options`} defaultValue={challenge?.questions?.[index]?.options.join('\n') ?? ''} required maxLength={1000} /></label><label>Número de la opción correcta (desde 1)<input name={`q${index}Correct`} type="number" min={1} max={6} defaultValue={(challenge?.questions?.[index]?.correctIndex ?? 0) + 1} required /></label></fieldset>)}</>}
          </>}
          <div className="admin-form-actions"><button type="submit" className="primary">Guardar cambios</button><button type="button" onClick={() => { setEditor(null); setError(''); }}>Cancelar edición</button></div>
        </form></section>}
        {remove && <section className="reset-confirm"><p>¿Eliminar «{remove.title}» del catálogo de este navegador? No se eliminarán progresos existentes; si el registro está en uso, se bloqueará.</p><button onClick={removeEntry}>Confirmar eliminación</button><button onClick={() => setRemove(null)}>Cancelar</button></section>}
        <label className="project-search">Buscar en el catálogo<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="admin-record-list">{data[tab].filter(entry => normalize(JSON.stringify(entry)).includes(normalize(search))).map(entry => {
          const title = 'title' in entry ? entry.title : entry.name;
          return <article key={entry.id}><div><h3>{title}</h3>{'token' in entry && <p>Token: <b>{entry.token}</b> · {roleLabel(entry.role)}{entry.role==='fourth_cycle'&&` · ${entry.assignedSpecialty??'Especialidad pendiente'}`}</p>}{'token' in entry && entry.email && <p>{entry.email}</p>}{'category' in entry && <p className="project-classification">{projectLabel(entry)}</p>}{'buildingId' in entry && <PlaceTag>{names[entry.buildingId]}</PlaceTag>}{'isBase' in entry && <small>{entry.isBase ? 'Reto base' : 'Reto extra'}</small>}</div><div className="admin-record-actions">{'token' in entry && entry.role !== 'admin' && <button onClick={() => showAnswers(entry.id)} aria-label={`Ver respuestas: ${title}`}>Ver respuestas</button>}<button onClick={() => open(tab, entry.id)} aria-label={`Editar: ${title}`}>Editar</button><button className="danger-button" onClick={() => { setRemove({ resource: tab, id: entry.id, title }); setError(''); }} aria-label={`Eliminar: ${title}`}>Eliminar</button></div></article>;
        })}</div>
      </>}
      {tab === 'answers' && <ParticipantAnswers data={data} rows={rows} selectedId={selectedParticipant} onSelect={setSelectedParticipant} />}
      {tab === 'backup' && <section className="admin-backup"><h2>Catálogo JSON</h2><p>Exporta el catálogo editado para llevarlo a otro navegador o copiar sus listas a los archivos de public/data. El respaldo contiene usuarios y tokens ficticios. Los progresos individuales se exportan desde el resumen de cada participante.</p><button className="primary" onClick={() => attempt(() => download('catalogo-expotec.json', JSON.stringify(data, null, 2), 'application/json'))}>Exportar catálogo JSON</button><label>Importar catálogo JSON<input type="file" accept="application/json,.json" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        try { if (file.size > 2000000) throw Error('El archivo supera el tamaño permitido.'); const value = JSON.parse(await file.text()); onSave(value); setMessage('Catálogo importado y validado.'); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Archivo no válido.'); }
      }} /></label><p className="muted">Los cambios deben mantener tu administrador, los cinco retos base y las respuestas/votos ya guardados. No hay envíos a un servidor.</p></section>}
    </div></main>
  </div>;
}
