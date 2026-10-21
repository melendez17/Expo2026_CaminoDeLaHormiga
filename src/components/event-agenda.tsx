'use client';
import { useState } from 'react';
import type { LocalData } from '@/lib/local-game';
import campus from '@/lib/campus.json';
import { ClockIcon, PinIcon } from './icons';
import { PageIntro } from './page-intro';
const names: Record<string, string> = campus.names;
function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'A.M.' : 'P.M.'}`;
}
const categories = [['general', 'General'], ['pastoral', 'Pastoral'], ['radio', 'CEDES Radio']] as const;
export function EventAgenda({ data, onLocate }: { data: LocalData; onLocate: (id: string) => void }) {
  const [category, setCategory] = useState('general');
  const days = [...new Set(data.agenda.map(event => event.day))];
  const [day, setDay] = useState(days[0] ?? 'Sábado');
  const events = data.agenda.filter(event => event.day === day && event.category === category).sort((a, b) => a.time.localeCompare(b.time));
  const dayNumber = data.agenda.find(event => event.day === day)?.dayNumber;
  return <section className={`local-section agenda-section agenda-category-${category}`}>
    <PageIntro eyebrow="ELIGE TU PRÓXIMO ENCUENTRO" sequence="04" title="Agenda" accent="ExpoTEC." description="Talleres, proyectos y momentos para compartir. Organiza tu visita a tu ritmo."/>
    <p className="agenda-disclaimer"><strong>Programación de ejemplo</strong><span>{data.settings.agendaNote}</span></p>
    <div className="day-selector" role="group" aria-label="Día de la agenda">{days.map(item => <button key={item} aria-pressed={day === item} onClick={() => setDay(item)}><b>{data.agenda.find(event => event.day === item)?.dayNumber ?? '—'}</b><span>{item}<small>Noviembre</small></span><span className="day-selector-count">{data.agenda.filter(event => event.day === item).length}</span></button>)}</div>
    <div className="agenda-day-bar"><div className="day-heading">{dayNumber && <b className="schedule-day-number">{dayNumber}</b>}<div className="schedule-day-title"><span className="eyebrow">{category === 'radio' ? 'AL AIRE' : 'PROGRAMA DEL DÍA'}</span><h2>{day}</h2></div></div>
    <div className="filter-tabs category-tabs">{categories.map(([id, label]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}</div></div>
    <div className="agenda-table-wrap" role="region" aria-label={`Programa del ${day}`} tabIndex={0}><table className="agenda-table"><caption className="sr-only">Programa del {day} · {categories.find(([id]) => id === category)?.[1]} · Horarios de ejemplo</caption><colgroup><col className="agenda-col-number"/><col className="agenda-col-time"/><col className="agenda-col-activity"/><col className="agenda-col-location"/></colgroup><thead className="sr-only"><tr><th scope="col">N.º</th><th scope="col">Hora</th><th scope="col">Actividad y lugar</th><th scope="col">En el mapa</th></tr></thead><tbody>{events.map((event, index) => <tr key={event.id}><th scope="row" className="schedule-row-number">{String(index + 1).padStart(2, '0')}</th><td className="agenda-time-cell"><time>{formatTime(event.time)}</time>{event.endTime && <><span className="agenda-time-separator"> – </span><time>{formatTime(event.endTime)}</time></>}</td><td><h3>{event.title}</h3><small className="schedule-category">{categories.find(([id]) => id === event.category)?.[1]} · {names[event.buildingId]}</small><p>{event.description}</p></td><td><button className="location-button primary-location" onClick={() => onLocate(event.buildingId)} aria-label={`Ubicación: ${event.title}`} title={`Ver ubicación: ${names[event.buildingId]}`}><PinIcon /></button></td></tr>)}</tbody></table></div>
    {!events.length && <p className="empty">No hay actividades en esta categoría para {day.toLowerCase()}.</p>}
    <p className="agenda-timezone"><ClockIcon />Hora de Costa Rica · Programación de demostración</p>
    {category === 'radio' && (data.settings.radioUrl ? <audio controls src={data.settings.radioUrl} preload="none" /> : <p className="reward-rule">La transmisión de CEDES Radio estará disponible cuando se publique su enlace.</p>)}
  </section>;
}
