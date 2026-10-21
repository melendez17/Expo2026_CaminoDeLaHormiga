'use client';
import type { LocalChallenge } from '@/lib/local-game';
import { AppIcon, PinIcon, PlaceTag } from './icons';

function category(challenge: LocalChallenge, place: string, specialty?: string): { name: string; tone: string } {
  const area = `${specialty ?? ''} ${place}`.toLocaleLowerCase('es');
  if (/pasitos|infantil/.test(area)) return { name: 'Pasitos', tone: 'pasitos' };
  if (/escuela/.test(area)) return { name: 'Escuela', tone: 'school' };
  if (/tercer ciclo|iii ciclo|3[.º°]? ciclo/.test(area)) return { name: 'Tercer ciclo', tone: 'third-cycle' };
  if (specialty) return { name: specialty, tone: 'specialty' };
  if (challenge.kind === 'quiz') return { name: 'Especialidades', tone: 'specialty' };
  if (challenge.kind === 'code') return { name: 'Stands', tone: 'stands' };
  return { name: challenge.kind === 'saint' ? 'Descubre el campus' : 'Explora un proyecto', tone: 'campus' };
}

export function ChallengeCard({ challenge, index, completed, specialty, place, onLocate, onAnswer }: {
  challenge: LocalChallenge; index: number; completed: boolean; specialty?: string; place: string;
  onLocate: () => void; onAnswer: () => void;
}) {
  const group = category(challenge, place, specialty);
  return <article className={`challenge-card compact-challenge ${completed ? 'done' : ''}`}>
    <span className={`challenge-type-icon theme-${group.tone}`}><AppIcon name="quiz"/></span>
    <div className="challenge-content">
      <span className="challenge-category">{group.name}<span className="sr-only"> · Reto {index + 1} · {challenge.isBase ? 'Camino base' : 'Extra'}</span></span>
      <h2>{challenge.title}</h2>
      <PlaceTag>{place}</PlaceTag>
      {completed && <span className="challenge-status is-complete"><AppIcon name="check" width="13" height="13"/>Completado</span>}
    </div>
    <div className="card-actions">
      <button className="location-button primary-location" onClick={onLocate} aria-label={`Ubicación: ${challenge.title}`} title={`Ver ubicación: ${place}`}><PinIcon width="17" height="17"/><span>Ubicación</span></button>
      <button className="text-button challenge-answer-button" disabled={completed} onClick={onAnswer} aria-label={`Responder: ${challenge.title}`} title={completed ? 'Reto completado' : 'Hacer reto'}><span>{completed ? 'Listo' : 'Hacer reto'}</span><AppIcon name={completed ? 'check' : 'arrow'} width="18" height="18"/></button>
    </div>
  </article>;
}
