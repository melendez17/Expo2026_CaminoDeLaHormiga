'use client';
import { useEffect, useState } from 'react';
import { createParticipant, parseParticipantDetails } from '@/lib/user-registration';
import { adminRows, csvField, CATALOG_KEY, restoreCatalog } from '@/lib/local-admin';
import { normalize, type LocalChallenge, type LocalData, type LocalUser } from '@/lib/local-game';
import campus from '@/lib/campus.json';
import { PageIntro } from './page-intro';
import { PlaceTag } from './icons';
import { AppNavigation } from './app-navigation';
import { AdminOverview } from './admin-overview';
import { AdminTickets } from './admin-tickets';
import { ParticipantTickets } from './participant-tickets';
import { useTicketLedger } from './use-ticket-ledger';
import { AdminRaffle } from './admin-raffle';
import { ParticipantAnswers } from './participant-answers';

type Resource = 'users' | 'challenges' | 'projects';
type Tab = 'overview' | Resource | 'backup' | 'raffle' | 'tickets';
type Editor = { resource: Resource; id: string | null };
const names: Record<string, string> = campus.names;
function download(name: string, content: string | ArrayBuffer, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LocalAdmin({ data, actor, onLogout, onSave }: {
  data: LocalData; actor: LocalUser; onLogout: () => void; onSave: (next: LocalData) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<{ userId: string; view: 'answers' | 'tickets' } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [kind, setKind] = useState<LocalChallenge['kind']>('freeform');
  const [remove, setRemove] = useState<{ resource: Resource; id: string; title: string } | null>(null);
  const [userKind, setUserKind] = useState<LocalUser['kind'] | ''>('');
  const [exporting, setExporting] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh(n => n + 1);
    window.addEventListener('storage', update); window.addEventListener('focus', update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener('focus', update); };
  }, []);
  const rows = adminRows(data, localStorage);
  const ledger = useTicketLedger(data);
  const detailUser = data.users.find(u => u.id === detail?.userId && u.role !== 'admin');
  const item = editor?.id ? data[editor.resource].find(entry => entry.id === editor.id) : null;
  const user = editor?.resource === 'users' ? item as LocalUser | null : null;
  const challenge = editor?.resource === 'challenges' ? item as LocalChallenge | null : null;
  const project = editor?.resource === 'projects' ? item as LocalData['projects'][number] | null : null;

  function attempt(action: () => void) {
    setError(''); try { action(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el cambio.'); }
  }
  function changeTab(next: Tab) { setTab(next); setDetail(null); setEditor(null); setRemove(null); setSearch(''); setError(''); setMessage(''); }
  function showParticipant(userId: string, view: 'answers' | 'tickets') {
    if (tab !== 'users') setSearch('');
    setTab('users'); setDetail({ userId, view }); setEditor(null); setRemove(null); setError(''); setMessage('');
  }
  function showAnswers(id: string) { showParticipant(id, 'answers'); }
  function open(resource: Resource, id: string | null) {
    setError(''); setMessage(''); setRemove(null); setEditor({ resource, id });
    if (resource === 'users') setUserKind(data.users.find(u => u.id === id)?.kind ?? '');
    if (resource === 'challenges') setKind(data.challenges.find(c => c.id === id)?.kind ?? 'freeform');
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editor) return;
    const values = new FormData(e.currentTarget);
    const text = (key: string) => String(values.get(key) ?? '').trim();
    if (editor.resource === 'users' && !editor.id) {
      if (savingUser) return;
      setSavingUser(true); setError('');
      try {
        // A shared catalog lock keeps simultaneous registrations in separate tabs unique.
        await navigator.locks.request(CATALOG_KEY, () => {
          const latest = restoreCatalog(data, localStorage);
          const created = createParticipant(latest, { nationalId: String(values.get('nationalId') ?? ''), name: text('name'), email: text('email'), kind: text('kind') as LocalUser['kind'] });
          onSave({ ...latest, users: [...latest.users, created] });
          setEditor(null); setMessage(`Usuario generado: ${created.name}. Token de acceso: ${created.token}.`);
        });
      } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el usuario.'); }
      finally { setSavingUser(false); }
      return;
    }
    attempt(() => {
      const id = editor.id ?? crypto.randomUUID();
      const next = structuredClone(data);
      if (editor.resource === 'users') {
        const details = parseParticipantDetails({ nationalId: String(values.get('nationalId') ?? ''), name: text('name'), email: text('email'), kind: text('kind') as LocalUser['kind'] });
        const value: LocalUser = { id, ...details, token: user!.token, role: user?.role ?? 'participant' };
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
      onSave(next); setEditor(null); setMessage('Cambio guardado en este navegador.');
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
  async function exportExcel() {
    if (exporting) return;
    setExporting(true); setError(''); setMessage('');
    try {
      const { participantExcel } = await import('@/lib/participant-export');
      const current = restoreCatalog(data, localStorage);
      const content = await participantExcel(current, localStorage);
      download('participantes-expotec.xlsx', content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setMessage('Excel generado con usuarios, estados finales y respuestas guardadas en este navegador.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo generar el Excel. Inténtalo de nuevo.'); }
    finally { setExporting(false); }
  }
  function report() {
    const header = ['Nombre', 'Perfil', 'Estado', 'Retos', 'Tiquetes', 'Códigos de tiquetes', 'Votos emitidos', 'Votos disponibles', 'Encuesta'];
    const csv = [header, ...rows.map(r => [r.user.name, r.user.kind, r.status, r.progress?.completed.length ?? '', ledger.ready && !ledger.error ? ledger.tickets.filter(t => t.userId === r.user.id).length : 'Revisar tiquetes', ledger.error ? 'Revisar tiquetes' : ledger.tickets.filter(t => t.userId === r.user.id).map(t => `${t.number} (${t.source === 'manual' ? 'Manual' : 'Digital'})`).join(' · '), r.progress?.votes.length ?? '', r.stats?.votesAvailable ?? '', r.progress?.survey ? 'Completada' : 'Pendiente'])].map(row => row.map(csvField).join(',')).join('\r\n');
    download('metricas-demo.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }
  const field = (label: string, name: string, defaultValue = '', required = true) => <label>{label}<input name={name} defaultValue={defaultValue} required={required} maxLength={160} /></label>;
  const location = (value = '7') => <label>Edificio<select name="buildingId" defaultValue={value}>{Object.entries(names).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;

  return <div className={`local-app admin-local ${tab === 'overview' ? 'admin-overview-active' : ''}`}><header className="local-header"><a className="brand admin-school-brand" href="/" aria-label="CEDES Don Bosco, inicio"><img src="/brand/cedes-don-bosco-white.png" alt="CEDES Don Bosco" width="2048" height="661" /></a><div className="local-account"><span>{actor.name}<small>Administrador de prueba</small></span><button onClick={onLogout}>Salir</button></div></header>
    <AppNavigation label="Administración local" admin items={[
      { id: 'overview', title: 'Resumen', icon: 'dashboard' }, { id: 'users', title: 'Usuarios', icon: 'users' },
      { id: 'challenges', title: 'Retos', icon: 'route' }, { id: 'projects', title: 'Proyectos', icon: 'projects' },
      { id: 'tickets', title: 'Tiquetes', icon: 'ticket' }, { id: 'raffle', title: 'Rifa', icon: 'ticket' }, { id: 'backup', title: 'Respaldo', icon: 'backup' }
    ] as const} active={tab} onChange={changeTab}/>
    <main className="local-content"><div className="local-section admin-container"><div className="admin-title-row"><PageIntro eyebrow="PANEL DE ADMINISTRACIÓN" sequence="01" title={tab === 'overview' ? 'Resumen' : tab === 'raffle' ? 'Rifa aleatoria' : tab === 'users' ? 'Usuarios' : tab === 'tickets' ? 'Tiquetes' : tab === 'backup' ? 'Exportar datos' : 'Panel de administración'} description="Gestiona el catálogo y consulta las pruebas realizadas en este navegador." />{tab === 'overview' && <div className="admin-overview-actions"><button onClick={() => refresh(n => n + 1)}>Actualizar métricas</button><button onClick={() => attempt(report)}>Descargar CSV</button></div>}</div>
      <p className="admin-local-note">Modo local de prueba: este token es público. Los cambios y las métricas no se comparten entre dispositivos ni modifican los JSON del repositorio.</p>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="feedback" role="status">{message}</p>}
      {tab === 'overview' && <AdminOverview data={data} rows={rows} onAnswers={showAnswers} ledger={ledger}/>}
      {!detail && (tab === 'users' || tab === 'challenges' || tab === 'projects') && <>
        <div className="admin-section-top"><h2>{tab === 'users' ? 'Usuarios de prueba' : tab === 'challenges' ? 'Catálogo de retos' : 'Proyectos para votar'}</h2><button className="primary" onClick={() => open(tab, null)}>{tab === 'users' ? 'Nuevo usuario' : tab === 'challenges' ? 'Nuevo reto extra' : 'Nuevo proyecto'}</button></div>
        {editor && <section className="admin-editor" key={`${editor.resource}-${editor.id ?? 'new'}`}><h3>{editor.id ? 'Editar registro' : 'Crear registro'}</h3><form onSubmit={save}>
          {editor.resource === 'users' && <><label>Tipo de usuario<select name="kind" value={userKind} onChange={e => setUserKind(e.target.value as LocalUser['kind'])} required><option value="" disabled>Selecciona el tipo de usuario</option><option value="visitor">Visitante</option><option value="applicant">Postulante</option></select></label>{field('Nombre completo', 'name', user?.name)}<label>Correo electrónico (opcional)<input name="email" type="email" defaultValue={user?.email ?? ''} maxLength={254} /></label>{userKind === 'applicant' && <><label>Identificación<input name="nationalId" defaultValue={user?.nationalId ?? ''} required aria-describedby="identification-help" /></label><p className="muted" id="identification-help">Escribe la cédula o el pasaporte tal como aparece en el documento.</p></>}{editor.id ? <p>Token asignado: <b>{user?.token}</b></p> : <p>Al generar el usuario se asignará automáticamente un token hexadecimal único de cuatro caracteres (0–9 y A–F).</p>}{user?.role === 'admin' && <p>Este registro conserva su rol de administrador.</p>}</>}
          {editor.resource === 'projects' && <>{field('Nombre del proyecto', 'name', project?.name)}{field('Especialidad', 'specialty', project?.specialty)}{location(project?.buildingId)}<label>Descripción<textarea name="description" defaultValue={project?.description} maxLength={1000} required /></label></>}
          {editor.resource === 'challenges' && <>{field('Título del reto', 'title', challenge?.title)}{location(challenge?.buildingId)}<label>Descripción<textarea name="description" defaultValue={challenge?.description} maxLength={1000} required /></label><label>Tipo de reto<select name="challengeKind" value={kind} onChange={e => setKind(e.target.value as LocalChallenge['kind'])}><option value="freeform">Formulario libre</option><option value="quiz">Especialidad: dos preguntas y código</option><option value="code">Código de stand / photobooth</option><option value="saint">Nombre del santo</option></select></label><p className="muted">{challenge?.isBase ? 'Reto base. La ruta mantiene exactamente cinco.' : 'Este reto aparecerá en futuras rondas extra.'} Las reglas de retos con respuestas guardadas se conservan.</p>
            {(kind === 'quiz' || kind === 'code') && <label>Código del stand<input name="code" defaultValue={challenge?.code ?? ''} pattern="[A-Za-z0-9]{4}" maxLength={4} minLength={4} required /></label>}
            {kind === 'saint' && field('Respuesta esperada', 'answer', challenge?.answer)}
            {kind === 'quiz' && <><label>Proyecto<select name="projectId" defaultValue={challenge?.projectId ?? ''} required><option value="">Selecciona un proyecto</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{[0, 1].map(index => <fieldset key={index}><legend>{index === 0 ? 'Pregunta del objetivo' : 'Pregunta técnica'}</legend>{field('Pregunta', `q${index}Prompt`, challenge?.questions?.[index]?.prompt)}<label>Opciones (una por línea, entre 2 y 6)<textarea name={`q${index}Options`} defaultValue={challenge?.questions?.[index]?.options.join('\n') ?? ''} required maxLength={1000} /></label><label>Número de la opción correcta (desde 1)<input name={`q${index}Correct`} type="number" min={1} max={6} defaultValue={(challenge?.questions?.[index]?.correctIndex ?? 0) + 1} required /></label></fieldset>)}</>}
          </>}
          <div className="admin-form-actions"><button type="submit" className="primary" disabled={savingUser}>{savingUser ? 'Generando…' : editor.resource === 'users' && !editor.id ? 'Generar usuario' : 'Guardar cambios'}</button><button type="button" onClick={() => { setEditor(null); setError(''); }}>Cancelar edición</button></div>
        </form></section>}
        {remove && <section className="reset-confirm"><p>¿Eliminar «{remove.title}» del catálogo de este navegador? No se eliminarán progresos existentes; si el registro está en uso, se bloqueará.</p><button onClick={removeEntry}>Confirmar eliminación</button><button onClick={() => setRemove(null)}>Cancelar</button></section>}
        <label className="project-search">Buscar en el catálogo<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="admin-record-list">{data[tab].filter(entry => normalize(JSON.stringify(entry)).includes(normalize(search))).map(entry => {
          const title = 'title' in entry ? entry.title : entry.name;
          return <article key={entry.id}><div><h3>{title}</h3>{'token' in entry && <p>{entry.kind === 'applicant' && <>Identificación: {entry.nationalId || 'Sin registrar'} · </>}Correo: {'email' in entry && entry.email ? entry.email : 'Sin registrar'} · Token: <b>{entry.token}</b> · {entry.role === 'admin' ? 'Administrador' : entry.kind === 'applicant' ? 'Postulante' : 'Visitante'}</p>}{'buildingId' in entry && <PlaceTag>{names[entry.buildingId]}</PlaceTag>}{'isBase' in entry && <small>{entry.isBase ? 'Reto base' : 'Reto extra'}</small>}</div><div className="admin-record-actions">{'token' in entry && entry.role !== 'admin' && <><button onClick={() => showAnswers(entry.id)} aria-label={`Ver respuestas: ${title}`}>Ver respuestas</button><button onClick={() => showParticipant(entry.id, 'tickets')} aria-label={`Ver tiquetes: ${title}`}>Ver tiquetes</button></>}<button onClick={() => open(tab, entry.id)} aria-label={`Editar: ${title}`}>Editar</button><button className="danger-button" onClick={() => { setRemove({ resource: tab, id: entry.id, title }); setError(''); }} aria-label={`Eliminar: ${title}`}>Eliminar</button></div></article>;
        })}</div>
      </>}
      {tab === 'tickets' && <AdminTickets {...ledger}/>}
      {tab === 'raffle' && <AdminRaffle data={data} />}
      {tab === 'users' && detail && <section className="user-detail"><div className="admin-detail-actions"><button onClick={() => setDetail(null)}>Volver a usuarios</button><div role="group" aria-label="Consultar participante"><button aria-pressed={detail.view === 'answers'} onClick={() => setDetail({ ...detail, view: 'answers' })}>Ver respuestas</button><button aria-pressed={detail.view === 'tickets'} onClick={() => setDetail({ ...detail, view: 'tickets' })}>Ver tiquetes</button></div></div>{!detailUser ? <p>El participante ya no está disponible.</p> : detail.view === 'answers' ? <ParticipantAnswers data={data} rows={rows} selectedId={detail.userId}/> : <ParticipantTickets user={detailUser} ledger={ledger} votesAvailable={rows.find(r => r.user.id === detail.userId)?.stats?.votesAvailable}/>}</section>}
      {tab === 'backup' && <section className="admin-backup"><h2>Exportar datos de ExpoTEC</h2><p>Descarga un archivo Excel (.xlsx) con todos los participantes registrados, incluidos quienes no activaron el recorrido. Puedes filtrar dentro de Excel por tipo de usuario y estado final.</p><ul><li><b>Usuarios:</b> nombre, tipo de usuario, identificación, correo, token, estado, avances y votos.</li><li><b>Retos base:</b> cada pregunta y respuesta, con los retos completados y pendientes.</li><li><b>Retos extra:</b> los retos asignados a cada participante y sus respuestas.</li><li><b>Encuestas:</b> respuestas guardadas y estado de la encuesta.</li></ul><button className="primary" onClick={() => void exportExcel()} disabled={exporting}>{exporting ? 'Generando Excel…' : 'Exportar Excel (.xlsx)'}</button><p className="muted">Completado significa que terminó los cinco retos base. Las respuestas pendientes aparecen vacías. El archivo contiene los datos guardados en este navegador al momento de exportar.</p></section>}
    </div></main>
  </div>;
}
