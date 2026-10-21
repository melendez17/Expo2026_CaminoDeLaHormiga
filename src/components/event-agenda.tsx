'use client';
import { useState } from 'react';
import type { LocalData } from '@/lib/local-game';
import campus from '@/lib/campus.json';
import { AppIcon, CalendarIcon, ClockIcon, PinIcon, PlaceTag } from './icons';
import { PageIntro } from './page-intro';
const names: Record<string, string> = campus.names;
function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'A.M.' : 'P.M.'}`;
}
const categories = [['general', 'General'], ['pastoral', 'Pastoral'], ['radio', 'CEDES Radio']] as const;
export function EventAgenda({ data, onLocate }: { data: LocalData; onLocate: (id: string) => void }) {
  const [category, setCategory] = useState('general');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const days = [...new Set(data.agenda.map(event => event.day))];
  const [day, setDay] = useState(days[0] ?? 'Sábado');
  const events = data.agenda.filter(event => event.day === day && event.category === category).sort((a, b) => a.time.localeCompare(b.time));
  const dayNumber = data.agenda.find(event => event.day === day)?.dayNumber;
  return <section className={`local-section agenda-section agenda-category-${category}`}>
    <PageIntro eyebrow="ELIGE TU PRÓXIMO ENCUENTRO" title="Agenda ExpoTEC" description="Talleres, proyectos y momentos para compartir. Organiza tu visita a tu ritmo."/>
    <div className="agenda-intro"><div><span className="eyebrow">ELIGE TU PRÓXIMA PARADA</span><h2>Programación del campus</h2></div><span className="sample-label">Programación de ejemplo</span></div>
    <p className="agenda-disclaimer">{data.settings.agendaNote}</p>
    <div className="agenda-controls"><div className="day-selector" role="group" aria-label="Día de la agenda">{days.map(item => <button key={item} aria-pressed={day === item} onClick={() => setDay(item)}><CalendarIcon />{item}</button>)}</div><div className="agenda-view-switch" role="group" aria-label="Vista de agenda"><button aria-pressed={view === 'cards'} onClick={() => setView('cards')}>Tarjetas</button><button aria-pressed={view === 'table'} onClick={() => setView('table')}>Tabla</button></div></div>
    <div className="filter-tabs category-tabs">{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div>
    <div className="day-heading">{dayNumber && <b className="schedule-day-number">{dayNumber}</b>}<div className="schedule-day-title"><span className="eyebrow">{category === 'radio' ? 'AL AIRE' : 'PROGRAMA DEL DÍA'}</span><h2>{day}</h2></div><span className="day-event-count">{events.length} {events.length === 1 ? 'actividad' : 'actividades'}</span></div>
    {view === 'cards' ? <div className="agenda-event-grid">{events.map((event, index) => <article className={`event-card event-${event.category}`} key={event.id}>
      <div className="event-card-top"><span className="event-category">{categories.find(([id]) => id === event.category)?.[1]}</span><span className="event-sequence" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span></div>
      <time className="event-time"><ClockIcon />{event.time}{event.endTime && <><span>—</span>{event.endTime}</>}</time>
      <h3>{event.title}</h3><p>{event.description}</p><PlaceTag>{names[event.buildingId]}</PlaceTag>
      <button className="location-button primary-location" onClick={() => onLocate(event.buildingId)} aria-label={`Ubicación: ${event.title}`}><PinIcon />Ver ubicación<span aria-hidden="true"><AppIcon name="arrow" width="16" height="16"/></span></button>
    </article>)}</div> : <div className="agenda-table-wrap" role="region" aria-label={`Programa del ${day}`} tabIndex={0}><table className="agenda-table"><caption>Programa del {day} · {categories.find(([id]) => id === category)?.[1]} · Horarios de ejemplo</caption><thead><tr><th scope="col">N.º</th><th scope="col">Hora</th><th scope="col">Actividad y lugar</th><th scope="col">En el mapa</th></tr></thead><tbody>{events.map((event, index) => <tr key={event.id}><th scope="row" className="schedule-row-number">{String(index + 1).padStart(2, '0')}</th><td><time>{formatTime(event.time)}{event.endTime && <> – {formatTime(event.endTime)}</>}</time></td><td><strong>{event.title}</strong><small className="schedule-category">{categories.find(([id]) => id === event.category)?.[1]}</small><p>{event.description}</p><PlaceTag>{names[event.buildingId]}</PlaceTag></td><td><button className="location-button primary-location" onClick={() => onLocate(event.buildingId)} aria-label={`Ubicación: ${event.title}`}><PinIcon /><span>Ubicación</span></button></td></tr>)}</tbody></table></div>}
    {view === 'table' && <p className="agenda-table-hint">Desliza la tabla para ver todas las columnas →</p>}
    {!events.length && <p className="empty">No hay actividades en esta categoría para {day.toLowerCase()}.</p>}
    <p className="agenda-timezone"><ClockIcon />Hora de Costa Rica · Programación de demostración</p>
    {category === 'radio' && (data.settings.radioUrl ? <audio controls src={data.settings.radioUrl} preload="none" /> : <p className="reward-rule">La transmisión de CEDES Radio estará disponible cuando se publique su enlace.</p>)}
  </section>;
}
