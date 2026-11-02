'use client';
import { hasIncorrectAnswer } from '@/lib/incorrect-answer';
import { LoadingScreen } from './loading-screen';

import { useEffect, useRef, useState } from 'react';
import { FullCampusMap } from './full-campus-map';
import { CampusMap } from './campus-map';
import { AppIcon, PinIcon, PlaceTag } from './icons';
import { AppNavigation } from './app-navigation';
import { ChallengeCard } from './challenge-card';
import { EventAgenda } from './event-agenda';
import { projectLabel, roleLabel, isAdmissionRole, routeArea } from '@/lib/taxonomy';
import { VoteHistory } from './vote-history';
import { PageIntro } from './page-intro';
import { LocalAdmin } from './local-admin';
import { CATALOG_KEY, restoreCatalog, validateCatalogChange } from '@/lib/local-admin';
import campus from '@/lib/campus.json';
import {
  availableProjects, extraChallenges, routeChallenges, startLocal, upgradeVisitorProgress, generateVisitorRound, currentVisitorRound, visitorCandidates, completeLocal, saintQuestion, addExtraForWrongAnswer, findUser, freshProgress, generateExtras, localDataSchema,
  normalize, parseProgress, storageKey, summary, voteLocal,
  type Answers, type LocalChallenge, type LocalData, type LocalProgress, type LocalUser
} from '@/lib/local-game';

type Section = 'route' | 'dashboard' | 'votes' | 'agenda' | 'map';
const names: Record<string, string> = campus.names;
const SESSION_KEY = 'camino-local-user';

function readProgress(data: LocalData, userId: string) {
  const saved = localStorage.getItem(storageKey(data, userId));
  const parsed=saved?parseProgress(data,userId,JSON.parse(saved)):freshProgress(data,userId);
  const updated=upgradeVisitorProgress(data,parsed);
  if(updated!==parsed)localStorage.setItem(storageKey(data,userId),JSON.stringify(parseProgress(data,userId,updated)));
  return updated;
}

function ChallengeDialog({ challenge, onClose, onComplete }: {
  challenge: LocalChallenge; onClose: () => void; onComplete: (answers: Answers) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal local-dialog" onCancel={onClose} aria-labelledby="challenge-title">
    <div className="row"><span className="eyebrow">{challenge.kind === 'quiz' ? 'ESPECIALIDAD · MARCA CON X' : 'UN NUEVO DESCUBRIMIENTO'}</span><button type="button" onClick={onClose} aria-label="Cerrar reto"><AppIcon name="close"/></button></div>
    <h2 id="challenge-title">{challenge.title}</h2><p>{challenge.description}</p>
    <form onSubmit={e => {
      e.preventDefault();
      const answers = Object.fromEntries(new FormData(e.currentTarget)) as Answers;
      try { onComplete(answers); } catch (e) { setError((e as Error).message); }
    }}>
      {['quiz','code'].includes(challenge.kind) && <p className="muted">Si respondes incorrectamente, se añadirá otro reto extra y este quedará pendiente.</p>}
      {challenge.kind === 'freeform' && <>
        <label>Nombre del proyecto<input name="projectName" minLength={2} maxLength={160} required /></label>
        <label>Nivel<input name="level" maxLength={80} required placeholder="Por ejemplo: quinto grado" /></label>
        <label>¿Qué descubriste?<textarea name="description" minLength={10} maxLength={1000} required /></label>
      </>}
      {challenge.kind === 'quiz' && challenge.questions?.map((q, index) => <fieldset key={q.id}>
        <legend>{index + 1}. {q.prompt}</legend>
        {q.options.map((option, i) => <label className="radio-option quiz-option" key={i}>
          <input type="radio" name={q.id} value={i} required /><span className="answer-cross" aria-hidden="true"><AppIcon name="close" width="15" height="15"/></span><span>{option}</span>
        </label>)}
      </fieldset>)}
      {['quiz', 'code'].includes(challenge.kind) && <label>Código del stand<input name="code" maxLength={4} pattern="[A-Za-z0-9]{4}" required autoComplete="off" placeholder="4 caracteres" /></label>}
      {challenge.kind === 'saint' && <fieldset><legend>{saintQuestion(challenge).prompt}</legend><p className="muted">Marca con X una opción. Si fallas, recibirás otro reto extra.</p>{saintQuestion(challenge).options.map((option,i)=><label className="radio-option quiz-option" key={i}><input type="radio" name="saintChoice" value={i} required /><span className="answer-cross" aria-hidden="true"><AppIcon name="close" width="15" height="15"/></span><span>{option}</span></label>)}</fieldset>}
      {challenge.kind !== 'freeform' && <details className="demo-help"><summary>Ayuda para probar este reto</summary>
        <p>Estos datos son ficticios y están en <code>challenges.json</code>.</p>
        {challenge.questions?.map(q => <p key={q.id}>{q.prompt}<br /><b>{q.options[q.correctIndex]}</b></p>)}
        {challenge.code && <p>Código de prueba: <b>{challenge.code}</b></p>}
        {challenge.answer && <p>Respuesta de prueba: <b>{challenge.answer}</b></p>}
      </details>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" type="submit">Completar reto</button>
    </form>
  </dialog>;
}

export function Journey({ adminOnly = false }: { adminOnly?: boolean }) {
  const [data, setData] = useState<LocalData | null>(null);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  const [token, setToken] = useState('');
  const [section, setSection] = useState<Section>('route');
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<LocalChallenge | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [projectArea, setProjectArea] = useState('');
  const [filter, setFilter] = useState<'base' | 'extra'>('base');
  const [online, setOnline] = useState(true);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const keys = ['users', 'projects', 'challenges', 'agenda', 'settings'] as const;
      const values = await Promise.all(keys.map(async key => {
        const response = await fetch(`/data/${key}.json`, { cache: 'no-cache' });
        if (!response.ok) throw Error(`No se pudo cargar ${key}.json.`);
        return response.json();
      }));
      const base = localDataSchema.parse(Object.fromEntries(keys.map((key, i) => [key, values[i]])));
      const parsed = restoreCatalog(base, localStorage);
      for (const c of parsed.challenges) if (!names[c.buildingId]) throw Error('Un reto tiene una zona del mapa desconocida.');
      if (!alive) return;
      setData(parsed);
      try {
        const id = sessionStorage.getItem(SESSION_KEY);
        const savedUser = parsed.users.find(u => u.id === id);
        if (savedUser && (!adminOnly || savedUser.role === 'admin')) { setProgress(savedUser.role === 'admin' ? freshProgress(parsed, savedUser.id) : readProgress(parsed, savedUser.id)); setUser(savedUser); }
      } catch { setError('No pudimos restaurar el progreso. Exporta o revisa los datos guardados antes de reiniciarlos.'); }
    }
    void load().catch(() => { if (alive) setLoadError('No se pudieron leer los archivos JSON. Revisa public/data y vuelve a cargar.'); });
    setOnline(navigator.onLine);
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => { alive = false; window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); };
  }, [adminOnly]);

  useEffect(() => {
    if (!data || !user) return;
    const update = (event: StorageEvent) => {
      if (event.key === CATALOG_KEY) {
        try {
          const updated = restoreCatalog(data, localStorage);
          const activeUser = updated.users.find(u => u.id === user.id);
          setData(updated); setUser(activeUser ?? null);
          setProgress(activeUser ? (activeUser.role === 'admin' ? freshProgress(updated, activeUser.id) : readProgress(updated, activeUser.id)) : null);
        } catch { setError('No pudimos actualizar el catálogo de otra pestaña.'); }
        return;
      }
      if (event.key === storageKey(data, user.id)) {
        try { setProgress(readProgress(data, user.id)); setVoteTarget(null); }
        catch { setError('El progreso de otra pestaña no es válido.'); }
      }
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [data, user]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [section, filter]);

  function changeSection(next: Section) { setSection(next); setMessage(''); setError(''); setVoteTarget(null); }
  function mutate(transform: (current: LocalProgress) => LocalProgress) {
    if (!data || !user) throw Error('Inicia sesión para continuar.');
    // Leer otra vez evita operar con una versión obsoleta de otra pestaña.
    const next = parseProgress(data, user.id, upgradeVisitorProgress(data,transform(readProgress(data, user.id))));
    try { localStorage.setItem(storageKey(data, user.id), JSON.stringify(next)); }
    catch { throw Error('El navegador no pudo guardar el progreso. Revisa el espacio o los permisos de almacenamiento.'); }
    setProgress(next);
    return next;
  }
  function attempt(action: () => void) { setError(''); try { action(); } catch (e) { setError((e as Error).message); } }
  function login(e: React.FormEvent) {
    e.preventDefault(); if (!data) return;
    const person = findUser(data, token);
    if (!person) { setError('No encontramos ese token. Revisa los cuatro caracteres.'); return; }
    if (adminOnly && person.role !== 'admin') { setError('Este acceso es solo para administradores. Entra como participante desde el inicio.'); return; }
    attempt(() => { const saved = person.role === 'admin' ? freshProgress(data, person.id) : readProgress(data, person.id); sessionStorage.setItem(SESSION_KEY, person.id); setUser(person); setProgress(saved); setToken(''); setMessage(''); });
  }
  function logout() {
    sessionStorage.removeItem(SESSION_KEY); setUser(null); setProgress(null); setActive(null);
    setMessage(''); setError(''); setVoteTarget(null); setSection('route'); setFilter('base'); setSelected(null); setSearch(''); setProjectArea(''); setResetConfirm(false);
  }
  function exportProgress() {
    if (!data || !user) return;
    const saved = readProgress(data, user.id);
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `camino-${user.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const brand = <a href="/" className="brand school-brand" aria-label="CEDES Don Bosco, inicio"><img src="/brand/cedes-don-bosco-white.png" alt="CEDES Don Bosco" width="2048" height="661" /></a>;
  if (!data) return <LoadingScreen message={loadError || undefined} busy={!loadError}>{loadError && <button onClick={() => window.location.reload()}>Volver a cargar</button>}</LoadingScreen>;
  if (!user || !progress) return <div className="local-login login-entry">
    <header className="local-header">{brand}<span className="local-pill">DEMO LOCAL</span></header>
    <main className="login-layout"><section className="login-story"><span className="eyebrow">FERIA TECNOLÓGICA · CEDES DON BOSCO</span><h1 className="login-event-wordmark" aria-label="ExpoTEC"><span>EXPO</span><span>TEC</span></h1><h2 className="login-journey-title">El camino de la hormiga.</h2><p>Innovación, tecnología y trabajo en equipo. Descubre el campus y construye tu propio camino, un reto a la vez.</p><div className="login-perks"><span>⌖ Descubre lugares</span><span>✦ Completa retos</span><span>♡ Vota por tus favoritos</span></div><img className="login-ant" src="/icon.svg" alt="" /></section>
      <section className="login-card"><span className="eyebrow">TU AVENTURA EMPIEZA AQUÍ</span><h2>{adminOnly ? 'Acceso del administrador' : 'Ingresa con tu token'}</h2><p>Usa el código de cuatro caracteres asignado a tu nombre.</p>
        <form onSubmit={login}><label htmlFor="token">Token de acceso<input id="token" name="token" value={token} onChange={e => setToken(e.target.value.toUpperCase())} maxLength={4} pattern="[A-Z0-9]{4}" required autoComplete="off" placeholder="K8P2" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary" type="submit">Ingresar →</button></form>
        <details className="demo-users"><summary>Ver usuarios para probar</summary><ul>{data.users.filter(u => !adminOnly || u.role === 'admin').map(u => <li key={u.id}><span>{u.name}<small>{roleLabel(u.role)}</small></span><button onClick={() => { setToken(u.token); setError(''); }} aria-label={`Usar token de ${u.name}`}>{u.token}</button></li>)}</ul></details>
        {adminOnly && <a className="admin-participant-link" href="/">Ir al acceso de participantes →</a>}
        <p className="local-footnote">Demo con personas ficticias. Tu progreso se guarda en este navegador.</p>
      </section></main>
  </div>;
  if (user.role === 'admin') return <LocalAdmin data={data} actor={user} onLogout={logout} onSave={input => {
    const next = validateCatalogChange(data, input, user.id, localStorage);
    localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
    setData(next); setUser(next.users.find(u => u.id === user.id)!);
  }} />;
  const affinity=routeArea(user);
  if (!progress.startedAt) return <div className="local-login"><header className="local-header">{brand}<button onClick={logout}>Cambiar usuario</button></header>
    <main className="welcome-screen"><img src="/icon.svg" alt="" /><span className="eyebrow">QUÉ BUENO TENERTE AQUÍ</span><h1>Bienvenido, {user.name.split(' ')[0]}.</h1><p>¿Quieres iniciar el camino de la hormiga?</p><p className="muted">{user.role==='visitor'?`Recibirás dos retos a la vez${user.area?`, priorizando ${user.area}`:''}. Cada dos retos completados te dan un tiquete; no necesitas completar cinco retos base.`:affinity==='specialty'?`Tu ruta: 1 proyecto de décimo y 1 de undécimo de ${user.area}, otro de tu especialidad (décimo o undécimo), 1 de otra especialidad y 1 reto extra.`:affinity==='pasitos'?'Tu ruta: 1 proyecto de Pasitos, 1 de Escuela, 2 de especialidad y 1 reto extra.':affinity==='school'?'Tu ruta: 1 proyecto de Escuela, 1 de Tercer ciclo, 2 de especialidad y 1 reto extra.':affinity==='third_cycle'?'Tu ruta: 2 proyectos de Tercer ciclo, 2 de especialidad y 1 reto extra.':'Cinco retos, muchas ideas y un campus por descubrir.'}<br/>Después puedes seguir explorando y ganar más tiquetes.</p>{error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary start-button" onClick={() => attempt(() => { mutate(p => startLocal(data,p)); setSection('route'); })}>Iniciar el camino →</button>
    </main></div>;

  const stats = summary(data, progress);
  const done = new Set(progress.completed.map(c => c.challengeId));
  const extras = data.challenges.filter(c => progress.extraIds.includes(c.id));
  const assignedProjects = availableProjects(data,user.id);
  const visitorPairs=progress.visitorRounds.length>0;
  const route = visitorPairs?currentVisitorRound(data,progress):routeChallenges(data,progress);
  const nextVisitorAvailable=visitorPairs&&(progress.visitorRoundIndex<progress.visitorRounds.length-1||visitorCandidates(data,progress).length>0);
  const visitorPending=visitorPairs&&(route.some(c=>!done.has(c.id))||progress.extraIds.some(id=>!done.has(id)));
  const routeIds = new Set(route.map(c=>c.id));
  const remainingExtras = extraChallenges(data).filter(c => !routeIds.has(c.id) && !progress.extraIds.includes(c.id) && !progress.failedExtras.some(f=>f.challengeId===c.id)).length;
  const extraPending = extras.some(c => !done.has(c.id));
  const displayed = visitorPairs?[...route,...extras.filter(c=>!done.has(c.id))]:filter === 'base' ? route : extras;
  const projects = assignedProjects.filter(p => (!projectArea || p.specialty === projectArea) && normalize(p.name + ' ' + p.specialty).includes(normalize(search))).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const specialties = [...new Set(assignedProjects.map(p => p.specialty))].sort((a, b) => a.localeCompare(b, 'es'));
  const badges: [string, boolean][] = [
    ['Paso Infantil', data.challenges.some(c => c.badge === 'infant' && done.has(c.id))],
    ['Descubridor', stats.base >= 3], ['Especialista', data.challenges.some(c => c.kind === 'quiz' && done.has(c.id))],
    ['Momento ExpoTEC', data.challenges.some(c => c.badge === 'moment' && done.has(c.id))], ['Hormiga de Oro', stats.routeComplete]
  ];
  function locate(id: string) { setSelected(id); setSection('route'); }
  function renderMap() { return <CampusMap selected={selected} onSelect={setSelected} />; }

  return <div className={`local-app journey-app section-${section}`}>
    <header className="local-header">{brand}<div className="local-account"><span>{user.name.split(' ')[0]}<small>{online ? 'Demo local' : 'Sin conexión · modo local'}</small></span><button onClick={logout}>Salir</button></div></header>
    <AppNavigation label="Navegación principal" items={[
      { id: 'route', title: 'Retos', icon: 'route' }, { id: 'dashboard', title: 'Mi resumen', icon: 'dashboard' },
      { id: 'votes', title: 'Votar', icon: 'votes' }, { id: 'agenda', title: 'Agenda', icon: 'agenda' }, { id: 'map', title: 'Mapa completo', icon: 'map' }
    ] as const} active={section} onChange={changeSection}/>
    {(message || error) && <div className={error ? 'local-feedback is-error' : 'local-feedback'} role={error ? 'alert' : 'status'}>{error || message}<button onClick={() => { setError(''); setMessage(''); }} aria-label="Cerrar mensaje"><AppIcon name="close" width="16" height="16"/></button></div>}
    {section === 'route' && <section className="route-hero" aria-label="Tu recorrido en ExpoTEC">
      <div><p className="route-edition">01 <span/> FERIA TECNOLÓGICA · EXPOTEC 2026</p><h1>TUS<br/><em>RETOS.</em></h1><p className="route-hero-description">{stats.routeComplete ? '¡Lo lograste! Sigue explorando para ganar más tiquetes.' : 'Completa tu ruta y gana tu primer tiquete.'}</p></div>
      <div className="route-hero-counts"><div><span>COMPLETADOS</span><strong>{String(stats.base).padStart(2, '0')}</strong></div><div><span>META</span><strong>{String(stats.baseTarget).padStart(2,'0')}</strong></div></div>
    </section>}
    <main className={section === 'route' ? 'route-workspace' : 'local-content'}>
      {section === 'route' && <><div className="compact-map">{renderMap()}<div className="desktop-map-guide"><span className="map-guide-icon"><PinIcon/></span><div><h2>Tu siguiente parada, a un clic.</h2><p>Usa el botón Ubicación de cualquier reto para ver dónde realizarlo.</p><button onClick={() => changeSection('map')}>Abrir mapa completo<AppIcon name="arrow" width="16" height="16"/></button></div></div></div><div className="route-scroll" ref={scrollRef}>
        <section className="route-overview"><div className="route-heading"><div><h1>Tu camino, {user.name.split(' ')[0]}.</h1></div><button className="route-wallet" onClick={() => changeSection('dashboard')} aria-label="Ver mis tiquetes"><AppIcon name="ticket"/><strong>{stats.tickets}</strong><span>{stats.tickets === 1 ? 'tiquete' : 'tiquetes'}</span></button></div>
        <div className="route-progress-head"><span>{visitorPairs?`Ronda ${progress.visitorRoundIndex+1}`:"Camino base"}</span><strong>{stats.base}<small> de {stats.baseTarget} {stats.baseTarget===1?'reto':'retos'}</small></strong></div><div className="local-route-progress"><progress value={stats.base} max={stats.baseTarget} aria-label={visitorPairs?"Retos de la ronda completados":"Retos base completados"}/><span>{stats.routeComplete ? '¡Lo lograste! Sigue explorando para ganar más tiquetes.' : 'Completa tu ruta y gana tu primer tiquete.'}</span></div></section>
        {!visitorPairs&&<div className="filter-tabs"><button aria-pressed={filter === 'base'} onClick={() => setFilter('base')}>Retos base · {stats.base}/{stats.baseTarget}</button><button aria-pressed={filter === 'extra'} onClick={() => setFilter('extra')}>Retos extra · {stats.extra}</button></div>}
        <div className="challenge-list">{displayed.map((c, index) => <ChallengeCard key={c.id} visitorRound={visitorPairs} challenge={!visitorPairs&&filter==='base'?{...c,isBase:true}:c} index={index} completed={done.has(c.id)} requiredExtra={!visitorPairs&&filter==='base'&&!!progress.routeIds.length&&!c.projectId} specialty={data.projects.find(p => p.id === c.projectId)?.specialty} projectCategory={data.projects.find(p => p.id === c.projectId)?.category} projectLevel={data.projects.find(p=>p.id===c.projectId)?.level} projectName={visitorPairs||progress.routeIds.length?data.projects.find(p=>p.id===c.projectId)?.name:undefined} place={names[c.buildingId]} onLocate={() => setSelected(c.buildingId)} onAnswer={() => { setSelected(c.buildingId); setActive(c); }}/>)}</div>
        {visitorPairs&&<section className="extras-card"><h2>{visitorPending?'Dos retos, a tu ritmo':nextVisitorAvailable?'¡Ronda completada!':'¡Exploraste todos los retos!'}</h2><p>{visitorPending?'Completa los retos pendientes para recibir la siguiente pareja. Cada dos completados te dan un tiquete.':nextVisitorAvailable?'Puedes votar con tus tiquetes o pedir otros dos retos, sin repetir los anteriores.':'No quedan retos sin repetir. Tus tiquetes y votos se conservan.'}</p><button className="primary" disabled={visitorPending||!nextVisitorAvailable} onClick={()=>attempt(()=>{const next=mutate(p=>generateVisitorRound(data,p));setSelected(currentVisitorRound(data,next)[0]?.buildingId??null);scrollRef.current?.scrollTo({top:0});setMessage('Nueva ronda de retos asignada.');})}>Recibir otros 2 retos</button></section>}
        {!visitorPairs&&filter === 'extra' && <section className="extras-card"><h2>{!stats.routeComplete ? (extras.length?'Tienes retos extra asignados':'Tu aventura apenas comienza') : remainingExtras ? 'Siempre hay algo más por descubrir' : '¡Exploraste todos los retos!'}</h2><p>{!stats.routeComplete ? (extras.length?'Puedes realizar ahora los extras asignados por una respuesta incorrecta. Los retos originales siguen pendientes; termina tu ruta base para generar nuevas rondas.':'Termina tu ruta base para desbloquear retos adicionales.') : extraPending ? 'Completa los retos de esta ronda antes de generar la siguiente.' : remainingExtras ? `Cada ${data.settings.extraEvery} retos extra te dan otro tiquete. Quedan ${remainingExtras} retos por descubrir.` : 'Completaste el catálogo de esta demo. Puedes añadir nuevos retos al archivo JSON.'}</p><button className="primary" disabled={!stats.routeComplete || extraPending || !remainingExtras} onClick={() => attempt(() => { mutate(p => generateExtras(data, p)); setMessage('Nuevos destinos añadidos a tu camino.'); })}>Generar más retos</button></section>}
        {!visitorPairs&&stats.routeComplete && filter === 'base' && <section className="extras-card"><h2>¡Terminaste el camino base!</h2><p>Tu primer tiquete ya está disponible. Puedes votar o seguir explorando.</p><div className="row"><button className="primary" onClick={() => setFilter('extra')}>Descubrir más retos</button><button onClick={() => changeSection('votes')}>Ir a votar</button></div></section>}
      </div></>}

      {section === 'dashboard' && <section className="local-section"><PageIntro eyebrow="CADA DESCUBRIMIENTO SUMA" title="Mi" accent="resumen." sequence="02" description={`Así va tu camino, ${user.name.split(' ')[0]}. Cada idea que descubres te lleva más lejos.`} /><div className="local-stats"><article><span className="metric-icon"><AppIcon name="ticket"/></span><strong data-testid="ticket-count">{stats.tickets}</strong><span>Tiquetes para la rifa</span></article><article><span className="metric-icon"><AppIcon name="votes"/></span><strong data-testid="available-votes">{stats.votesAvailable}</strong><span>Votos disponibles</span></article><article><span className="metric-icon"><AppIcon name="check"/></span><strong>{progress.completed.length}</strong><span>Retos completados</span></article><article><span className="metric-icon"><AppIcon name="answers"/></span><strong>{progress.votes.length}</strong><span>Votos entregados</span></article></div><p className="reward-rule">{visitorPairs?"Cada 2 retos completados = 1 tiquete. No necesitas completar cinco retos base.":`Ruta base completada = ${data.settings.baseReward} tiquete · Cada ${data.settings.extraEvery} extras = otro.`} Votar conserva tus tiquetes para la rifa.</p><section hidden aria-label="Tus insignias"><h2>Tus insignias</h2><div className="badges">{badges.map(([name, unlocked]) => <div key={name} className={`badge ${unlocked ? 'unlocked' : ''}`}><span className="badge-symbol" aria-hidden="true"><AppIcon name={unlocked ? 'award' : 'lock'} width="25" height="25"/></span><strong>{name}</strong><small>{unlocked ? 'Desbloqueada' : 'Por descubrir'}</small></div>)}</div></section>
        {!!progress.manualTickets.length && <p className="reward-rule">Incluye {progress.manualTickets.length} {progress.manualTickets.length===1?'tiquete manual':'tiquetes manuales'} por participación en papel.</p>}<h2>Tus votos</h2>{progress.votes.length ? <VoteHistory data={data} votes={progress.votes}/> : <p className="empty">Aún no has votado. {visitorPairs?"Completa dos retos para conseguir tu primer voto.":"Completa el camino base para conseguir tu primer voto."}</p>}
        {stats.routeComplete && !progress.survey && <section className="survey"><h2>{isAdmissionRole(user.role) ? 'Tu encuesta de admisión' : 'Cuéntanos tu experiencia'}</h2><p>{isAdmissionRole(user.role) ? 'Completa la encuesta para cerrar tu proceso de admisión de prueba.' : 'Tu opinión también forma parte del camino.'} Recibirás {data.settings.surveyBonus} tiquete de bono.</p><form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); attempt(() => { mutate(p => p.survey ? p : { ...p, survey: { expectations: String(f.get('expectations')).trim(), interest: String(f.get('interest')).trim(), satisfaction: Number(f.get('satisfaction')) } }); setMessage('Gracias por tu opinión. El bono se añadió a tu resumen.'); }); }}><label>¿Qué esperabas descubrir?<textarea name="expectations" minLength={5} maxLength={1000} required /></label><label>¿Qué área te interesa?<input name="interest" minLength={2} maxLength={160} required /></label><label>¿Cómo fue tu experiencia?<select name="satisfaction">{[5, 4, 3, 2, 1].map(v => <option value={v} key={v}>{v} de 5</option>)}</select></label><button className="primary">Enviar encuesta</button></form></section>}
        {progress.survey && <p className="feedback">Encuesta completada · Bono recibido{isAdmissionRole(user.role) ? ' · Admisión de prueba completada' : ''}.</p>}
        <details className="local-backup"><summary>Guardar, importar o reiniciar mi prueba</summary><p>Los JSON del proyecto definen los datos iniciales. El navegador conserva tu avance; puedes descargarlo como otro JSON.</p><button onClick={() => attempt(exportProgress)}>Exportar mi progreso JSON</button><label>Importar mi progreso JSON<input type="file" accept="application/json,.json" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { if (file.size > 1000000) throw Error('El archivo es demasiado grande.'); const imported = parseProgress(data, user.id, JSON.parse(await file.text())); mutate(current => parseProgress(data,user.id,{...imported,manualTickets:[...new Map([...current.manualTickets,...imported.manualTickets].map(ticket=>[ticket.id,ticket])).values()]})); setMessage('Progreso importado para esta persona.'); setError(''); } catch (e) { setError((e as Error).message); } }} /></label>
          {resetConfirm ? <div className="reset-confirm"><p>¿Borrar los retos y votos de {user.name}? Esta acción solo afecta a esta persona en este navegador.</p><button onClick={() => attempt(() => { mutate(current => ({...freshProgress(data,user.id),manualTickets:current.manualTickets})); setResetConfirm(false); setSelected(null); setFilter('base'); setSection('route'); })}>Sí, reiniciar mi prueba</button><button onClick={() => setResetConfirm(false)}>Cancelar</button></div> : <button className="danger-button" onClick={() => setResetConfirm(true)}>Reiniciar mi prueba</button>}
        </details>
      </section>}

      {section === 'votes' && <section className="local-section"><PageIntro eyebrow="TU VOTO CUENTA" sequence="03" title="Tu proyecto" accent="favorito." description="Busca un proyecto por nombre y dale tu voto."/><div className="voting-layout"><aside className="voting-aside"><div className="vote-balance"><b>{stats.votesAvailable}</b><span>votos disponibles<small>{stats.tickets} tiquetes siguen participando en la rifa</small></span></div><div className="vote-explainer"><h2>Cómo funciona</h2><p>Un tiquete permite un voto. Puedes volver a votar por el mismo equipo si tienes votos disponibles. Votar conserva tus tiquetes para la rifa.</p></div></aside><div className="voting-catalog"><label className="project-search has-search-icon">Buscar proyecto por nombre<span className="search-field"><AppIcon name="search"/><input type="search" value={search} onChange={e => { setSearch(e.target.value); setVoteTarget(null); }} placeholder="Por ejemplo: AquaSmart" /></span></label><div className="project-area-filter"><span>Filtrar por área</span><div className="filter-tabs" role="group" aria-label="Filtrar proyectos por área"><button aria-pressed={!projectArea} onClick={() => { setProjectArea(''); setVoteTarget(null); }}>Todas · {assignedProjects.length}</button>{specialties.map(area => <button key={area} aria-pressed={projectArea === area} onClick={() => { setProjectArea(area); setVoteTarget(null); }}>{area}</button>)}</div></div><p className="muted">{projects.length} {projects.length === 1 ? 'proyecto encontrado' : 'proyectos encontrados'} · Orden A–Z.</p>
        <div className="project-grid">{projects.map(p => <article className="local-project" key={p.id}>
          <div className="project-identity"><h2>{p.name}</h2><span className="project-area">{projectLabel(p)}</span></div>
          {voteTarget === p.id ? <div className="vote-confirm"><p>¿Usar un voto para {p.name}?</p><div className="row"><button className="primary" onClick={() => attempt(() => { mutate(current => voteLocal(data, current, p.id)); setVoteTarget(null); setMessage(`¡Voto para ${p.name}! Tu tiquete sigue en la rifa.`); })}>Confirmar voto</button><button onClick={() => setVoteTarget(null)}>Cancelar</button></div></div> : <button className="primary project-vote-button" disabled={stats.votesAvailable <= 0} onClick={() => setVoteTarget(p.id)}>Dar 1 voto</button>}
        </article>)}</div>
        {!projects.length && <p className="empty">No encontramos proyectos con ese nombre. Prueba con otra palabra.</p>}{!stats.votesAvailable && <p className="reward-rule">Completa {visitorPairs?'dos retos':stats.routeComplete ? 'dos retos extra' : 'tu ruta base'} para obtener otro voto.</p>}</div></div>
      </section>}

      {section === 'agenda' && <EventAgenda data={data} onLocate={locate} />}
      {section === 'map' && <section className="local-section full-map"><PageIntro eyebrow="ENCUENTRA TU PRÓXIMO DESTINO" title="El campus" accent="completo." sequence="05" description="Un campus, muchas historias. Toca una zona o elige un edificio y explora en 3D o 2D." /><FullCampusMap data={data} progress={progress} selected={selected} onSelect={setSelected} onReturn={() => changeSection('route')}/></section>}
    </main>
    {active && <ChallengeDialog key={active.id} challenge={active} onClose={() => setActive(null)} onComplete={answers => {
      if(hasIncorrectAnswer(active,answers)) {
        const next=mutate(current=>addExtraForWrongAnswer(data,current,active.id,answers));
        const extraId=active.kind==='saint'?next.failedExtras.at(-1)!.replacementId:next.failedAnswers.at(-1)!.extraId;
        const extra=data.challenges.find(c=>c.id===extraId)!;
        setActive(extra);setSelected(extra.buildingId);setFilter(next.routeIds.includes(extra.id)?'base':'extra');setError('');
        setMessage(active.kind==='saint'?'La respuesta no era correcta. Te asignamos otro reto extra; este intento no suma puntos.':'La respuesta no era correcta. Añadimos un reto extra a tu camino. El reto original sigue pendiente.');return;
      }
      const wasComplete = stats.routeComplete;
      const next = mutate(current => completeLocal(data, current, active.id, answers));
      setActive(null); setError(''); setMessage(visitorPairs?(summary(data,next).digitalTickets>stats.digitalTickets?'¡Ganaste un tiquete y un voto al completar dos retos!':'¡Reto completado! Cada dos completados recibes un tiquete.'):!wasComplete && summary(data, next).routeComplete ? '¡Completaste el camino base! Ganaste tu primer tiquete y un voto.' : '¡Reto completado! Tu avance quedó guardado.');
    }} />}
  </div>;
}
