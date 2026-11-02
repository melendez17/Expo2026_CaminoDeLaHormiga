'use client';
import { useState } from 'react';
import type { LocalData, LocalProgress } from '@/lib/local-game';
import { normalize, routeChallenges } from '@/lib/local-game';
import campus from '@/lib/campus.json';
import { CampusMap } from './campus-map';
import { projectLabel } from '@/lib/taxonomy';
import { AppIcon } from './icons';
const names: Record<string, string> = campus.names;
export function FullCampusMap({ data, progress, selected, onSelect, onReturn }: {
  data: LocalData; progress: LocalProgress; selected: string | null;
  onSelect: (id: string | null) => void; onReturn: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const active = selected ?? '7';
  const routeIds=new Set(routeChallenges(data,progress).map(c=>c.id));
  const challenges = data.challenges.filter(c => routeIds.has(c.id) || progress.extraIds.includes(c.id));
  const atPlace = challenges.filter(c => c.buildingId === active);
  const projects=data.projects.filter(p=>p.buildingId===active).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  const events = data.agenda.filter(e => e.buildingId === active).sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0) || a.time.localeCompare(b.time));
  const places = Object.entries(names).map(([id, name]) => ({ id, name, count: challenges.filter(c => c.buildingId === id).length }))
    .filter(p => (showAll || search || p.count || p.id === active) && normalize(p.name).includes(normalize(search)))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  return <div className="campus-explorer">
    <CampusMap explorer selected={active} onSelect={id => { if (id) onSelect(id); }}/>
    <aside className="campus-sidebar" aria-label="Explorar lugares del campus">
      <label className="campus-search">Ir a un edificio<span className="search-field"><AppIcon name="search"/><input type="search" placeholder="Buscar lugar" value={search} onChange={e => setSearch(e.target.value)}/></span></label>
      <div className="campus-place-list" role="group" aria-label="Lugares del campus">{places.map((place, index) => <button key={place.id} aria-pressed={active === place.id} aria-label={`Seleccionar lugar: ${place.name}`} onClick={() => onSelect(place.id)}><span className="campus-place-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="campus-place-name">{place.name}</span><small>{place.count} {place.count === 1 ? 'reto' : 'retos'}</small></button>)}</div>
      {!places.length && <p className="empty">No encontramos ese lugar. Prueba con otro nombre.</p>}
      {!search && <button className="campus-all-places" onClick={() => setShowAll(!showAll)}>{showAll ? 'Ver lugares de mis retos' : 'Ver todos los lugares'}</button>}
      <section className="campus-selection" aria-labelledby="campus-selection-title">
        <span className="campus-selection-label">Seleccionado</span><h2 id="campus-selection-title" aria-live="polite">{names[active]}</h2>
        <h3>Retos aquí</h3>{atPlace.length ? <ul>{atPlace.map(c => <li key={c.id}>{c.title}{progress.completed.some(item => item.challengeId === c.id) && <span className="campus-completed"><AppIcon name="check" width="12" height="12"/>Completado</span>}</li>)}</ul> : <p>No tienes retos asignados en este lugar.</p>}
        <h3>Proyectos en este edificio · {projects.length}</h3>{projects.length?<ul className="campus-building-projects" tabIndex={0} aria-label="Proyectos del edificio">{projects.map(project=><li key={project.id}><strong>{project.name}</strong><span>{projectLabel(project)}</span>{project.active===false&&<span className="campus-project-closed">No disponible para nuevas visitas</span>}</li>)}</ul>:<p>No hay proyectos registrados en este edificio.</p>}
        <h3>En la agenda</h3>{events.length ? <ul>{events.map(e => <li key={e.id}><span className="campus-event-time">{e.day} · <time>{e.time}</time>{e.endTime && <>–{e.endTime}</>}</span>{e.title}</li>)}</ul> : <p>No hay actividades programadas aquí en la demo.</p>}
        <button className="primary" onClick={onReturn}>Volver a mis retos<AppIcon name="arrow" width="16" height="16"/></button>
      </section>
    </aside>
  </div>;
}
