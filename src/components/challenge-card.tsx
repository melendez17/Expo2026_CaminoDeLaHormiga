'use client';
import type { LocalChallenge } from '@/lib/local-game';
import { AppIcon, PinIcon, PlaceTag, type IconName } from './icons';

function category(challenge: LocalChallenge, specialty?: string): { name: string; icon: IconName } {
  if (specialty) return { name: specialty, icon: 'quiz' };
  if (challenge.buildingId === '8') return { name: 'Pasitos', icon: 'infant' };
  if (challenge.buildingId === '3') return { name: 'Escuela', icon: 'school' };
  if (challenge.kind === 'saint') return { name: 'Descubre el campus', icon: 'saint' };
  if (challenge.kind === 'quiz') return { name: 'Especialidades', icon: 'quiz' };
  if (challenge.kind === 'code') return { name: 'Stands', icon: 'stand' };
  return { name: 'Explora un proyecto', icon: 'projects' };
}

export function ChallengeCard({ challenge, index, completed, specialty, place, onLocate, onAnswer }: {
  challenge: LocalChallenge; index: number; completed: boolean; specialty?: string; place: string;
  onLocate: () => void; onAnswer: () => void;
}) {
  const group = category(challenge, specialty);
  return <article className={`challenge-card compact-challenge ${completed ? 'done' : ''}`}>
    <span className={`challenge-type-icon type-${challenge.kind}`}><AppIcon name={group.icon}/></span>
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
