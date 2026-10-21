'use client';
import { useEffect, useState } from 'react';
import { adminRows, csvField } from '@/lib/local-admin';
import { normalize, type LocalChallenge, type LocalData, type LocalUser } from '@/lib/local-game';
import campus from '@/lib/campus.json';
import { PageIntro } from './page-intro';
import { PlaceTag } from './icons';

type Resource = 'users' | 'challenges' | 'projects';
type Tab = 'overview' | Resource | 'backup';
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [kind, setKind] = useState<LocalChallenge['kind']>('freeform');
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
  const valid = rows.filter(r => r.stats);
  const totalTickets = valid.reduce((n, row) => n + row.stats!.tickets, 0);
  const totalVotes = valid.reduce((n, row) => n + row.progress!.votes.length, 0);
  const item = editor?.id ? data[editor.resource].find(entry => entry.id === editor.id) : null;
  const user = editor?.resource === 'users' ? item as LocalUser | null : null;
  const challenge = editor?.resource === 'challenges' ? item as LocalChallenge | null : null;
  const project = editor?.resource === 'projects' ? item as LocalData['projects'][number] | null : null;

  function attempt(action: () => void) {
    setError(''); try { action(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio.'); }
  }
  function changeTab(next: Tab) { setTab(next); setEditor(null); setRemove(null); setSearch(''); setError(''); setMessage(''); }
  function open(resource: Resource, id: string | null) {
    setError(''); setMessage(''); setRemove(null); setEditor({ resource, id });
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
        const value: LocalUser = { id, name: text('name'), token: text('token').toUpperCase(), kind: text('kind') as LocalUser['kind'], role: user?.role ?? 'participant' };
        next.users = editor.id ? next.users.map(u => u.id === id ? value : u) : [...next.users, value];
      } else if (editor.resource === 'projects') {
        const value = { id, name: text('name'), buildingId: text('buildingId'), specialty: text('specialty'), description: text('description') };
        next.projects = editor.id ? next.projects.map(p => p.id === id ? value : p) : [...next.projects, value];
      } else {
        const value: LocalChallenge = { id, title: text('title'), description: text('description'), buildingId: text('buildingId'), kind, isBase: challenge?.isBase ?? false };
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
      onSave(next); setEditor(null); setMessage('Cambio guardado en este navegador. Exporta el catálogo si quieres conservarlo como archivo.');
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
    const header = ['Nombre', 'Perfil', 'Estado', 'Retos', 'Tiquetes', 'Votos emitidos', 'Votos disponibles', 'Encuesta'];
    const csv = [header, ...rows.map(r => [r.user.name, r.user.kind, r.status, r.progress?.completed.length ?? '', r.stats?.tickets ?? '', r.progress?.votes.length ?? '', r.stats?.votesAvailable ?? '', r.progress?.survey ? 'Completada' : 'Pendiente'])].map(row => row.map(csvField).join(',')).join('\r\n');
    download('metricas-demo.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }
  const field = (label: string, name: string, defaultValue = '', required = true) => <label>{label}<input name={name} defaultValue={defaultValue} required={required} maxLength={160} /></label>;
  const location = (value = '7') => <label>Edificio<select name="buildingId" defaultValue={value}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;

  return <div className="local-app admin-local"><header className="local-header"><a className="brand" href="/"><img src="/icon.svg" alt="" /><span>CEDES <b>DON BOSCO</b><small>EXPOTEC · PANEL LOCAL</small></span></a><div className="local-account"><span>{actor.name}<small>Administrador de prueba</small></span><button onClick={onLogout}>Salir</button></div></header>
    <nav className="local-nav" aria-label="Administración local">{([['overview', 'Resumen'], ['users', 'Usuarios'], ['challenges', 'Retos'], ['projects', 'Proyectos'], ['backup', 'Respaldo']] as const).map(([id, title]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => changeTab(id)}>{title}</button>)}</nav>
    <main className="local-content"><div className="local-section admin-container"><PageIntro eyebrow="CONTROL DEL CAMINO · DEMO JSON" title="Panel de administración" description="Gestiona el catálogo y consulta las pruebas realizadas en este navegador." />
      <p className="admin-local-note">Modo local de prueba: este token es público. Los cambios y las métricas no se comparten entre dispositivos ni modifican los JSON del repositorio.</p>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="feedback" role="status">{message}</p>}
      {tab === 'overview' && <>
        <div className="admin-section-top"><h2>Métricas locales</h2><div><button onClick={() => refresh(n => n + 1)}>Actualizar métricas</button><button onClick={() => attempt(report)}>Descargar CSV</button></div></div>
        <div className="local-stats admin-metrics">{[
          ['Participantes', rows.length], ['Sin activar', rows.filter(r => r.status === 'Sin activar').length], ['En proceso', rows.filter(r => r.status === 'En proceso').length], ['Completados', rows.filter(r => r.status === 'Completado').length], ['Tiquetes', totalTickets], ['Votos emitidos', totalVotes], ['Votos disponibles', totalTickets - totalVotes], ['Admisiones completas', valid.filter(r => r.user.kind === 'applicant' && r.progress!.survey && r.stats!.routeComplete).length]
        ].map(([name, value]) => <article key={name}><strong>{value}</strong><span>{name}</span></article>)}</div>
        {rows.some(r => r.error) && <p className="form-error">Hay progresos que necesitan revisión. Se excluyeron de los totales de premios.</p>}
        <h2>Estado por participante</h2><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Persona</th><th>Estado</th><th>Retos</th><th>Tiquetes</th><th>Votos disponibles</th></tr></thead><tbody>{rows.map(r => <tr key={r.user.id}><td>{r.user.name}</td><td><span className="place-tag">{r.status}</span></td><td>{r.progress?.completed.length ?? '—'}</td><td>{r.stats?.tickets ?? '—'}</td><td>{r.stats?.votesAvailable ?? '—'}</td></tr>)}</tbody></table></div>
        <h2>Votos por proyecto</h2><div className="admin-vote-results">{data.projects.map(p => <article key={p.id}><span>{p.name}</span><strong>{valid.reduce((n, r) => n + r.progress!.votes.filter(v => v.projectId === p.id).length, 0)} votos</strong></article>)}</div>
      </>}
      {(tab === 'users' || tab === 'challenges' || tab === 'projects') && <>
        <div className="admin-section-top"><h2>{tab === 'users' ? 'Usuarios de prueba' : tab === 'challenges' ? 'Catálogo de retos' : 'Proyectos para votar'}</h2><button className="primary" onClick={() => open(tab, null)}>{tab === 'users' ? 'Nuevo usuario' : tab === 'challenges' ? 'Nuevo reto extra' : 'Nuevo proyecto'}</button></div>
        {editor && <section className="admin-editor" key={`${editor.resource}-${editor.id ?? 'new'}`}><h3>{editor.id ? 'Editar registro' : 'Crear registro'}</h3><form onSubmit={save}>
          {editor.resource === 'users' && <>{field('Nombre completo', 'name', user?.name)}<label>Token de cuatro caracteres<input name="token" defaultValue={user?.token ?? crypto.randomUUID().slice(0, 4).toUpperCase()} pattern="[A-Za-z0-9]{4}" minLength={4} maxLength={4} required /></label><label>Perfil<select name="kind" defaultValue={user?.kind ?? 'visitor'}><option value="visitor">Visitante</option><option value="applicant">Postulante</option></select></label>{user?.role === 'admin' && <p>Este registro conserva su rol de administrador.</p>}</>}
          {editor.resource === 'projects' && <>{field('Nombre del proyecto', 'name', project?.name)}{field('Especialidad', 'specialty', project?.specialty)}{location(project?.buildingId)}<label>Descripción<textarea name="description" defaultValue={project?.description} maxLength={1000} required /></label></>}
          {editor.resource === 'challenges' && <>{field('Título del reto', 'title', challenge?.title)}{location(challenge?.buildingId)}<label>Descripción<textarea name="description" defaultValue={challenge?.description} maxLength={1000} required /></label><label>Tipo de reto<select name="challengeKind" value={kind} onChange={e => setKind(e.target.value as LocalChallenge['kind'])}><option value="freeform">Formulario libre</option><option value="quiz">Especialidad: dos preguntas y código</option><option value="code">Código de stand / photobooth</option><option value="saint">Nombre del santo</option></select></label><p className="muted">{challenge?.isBase ? 'Reto base. La ruta mantiene exactamente cinco.' : 'Este reto aparecerá en futuras rondas extra.'} Las reglas de retos con respuestas guardadas se conservan.</p>
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
          return <article key={entry.id}><div><h3>{title}</h3>{'token' in entry && <p>Token: <b>{entry.token}</b> · {entry.role === 'admin' ? 'Administrador' : entry.kind === 'applicant' ? 'Postulante' : 'Visitante'}</p>}{'buildingId' in entry && <PlaceTag>{names[entry.buildingId]}</PlaceTag>}{'isBase' in entry && <small>{entry.isBase ? 'Reto base' : 'Reto extra'}</small>}</div><div className="admin-record-actions"><button onClick={() => open(tab, entry.id)} aria-label={`Editar: ${title}`}>Editar</button><button className="danger-button" onClick={() => { setRemove({ resource: tab, id: entry.id, title }); setError(''); }} aria-label={`Eliminar: ${title}`}>Eliminar</button></div></article>;
        })}</div>
      </>}
      {tab === 'backup' && <section className="admin-backup"><h2>Catálogo JSON</h2><p>Exporta el catálogo editado para llevarlo a otro navegador o copiar sus listas a los archivos de public/data. El respaldo contiene usuarios y tokens ficticios. Los progresos individuales se exportan desde el resumen de cada participante.</p><button className="primary" onClick={() => attempt(() => download('catalogo-expotec.json', JSON.stringify(data, null, 2), 'application/json'))}>Exportar catálogo JSON</button><label>Importar catálogo JSON<input type="file" accept="application/json,.json" onChange={async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
        try { if (file.size > 2000000) throw Error('El archivo supera el tamaño permitido.'); const value = JSON.parse(await file.text()); onSave(value); setMessage('Catálogo importado y validado.'); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Archivo no válido.'); }
      }} /></label><p className="muted">Los cambios deben mantener tu administrador, los cinco retos base y las respuestas/votos ya guardados. No hay envíos a un servidor.</p></section>}
    </div></main>
  </div>;
}
