'use client';
import { categoryLabel, levelLabel, type ProjectLevel, type ProjectCategory } from '@/lib/taxonomy';
import type { LocalChallenge } from '@/lib/local-game';
import { AppIcon, PinIcon, PlaceTag } from './icons';

function category(challenge: LocalChallenge, place: string, specialty?: string, projectCategory?: ProjectCategory): { name: string; tone: string } {
  if (projectCategory && projectCategory!=='specialty') return {name:categoryLabel(projectCategory),tone:projectCategory==='school'?'school':projectCategory==='third_cycle'?'third-cycle':'pasitos'};
  const area = `${specialty ?? ''} ${place}`.toLocaleLowerCase('es');
  if (/pasitos|infantil/.test(area)) return { name: 'Pasitos', tone: 'pasitos' };
  if (/escuela/.test(area)) return { name: 'Escuela', tone: 'school' };
  if (/tercer ciclo|iii ciclo|3[.º°]? ciclo/.test(area)) return { name: 'Tercer ciclo', tone: 'third-cycle' };
  if (specialty) return { name: specialty, tone: 'specialty' };
  if (challenge.kind === 'quiz') return { name: 'Especialidades', tone: 'specialty' };
  if (challenge.kind === 'code') return { name: 'Stands', tone: 'stands' };
  return { name: challenge.kind === 'saint' ? 'Descubre el campus' : 'Explora un proyecto', tone: 'campus' };
}

export function ChallengeCard({ challenge, index, completed, specialty, projectCategory, projectName, projectLevel, requiredExtra=false, visitorRound=false, place, onLocate, onAnswer }: {
  challenge: LocalChallenge; index: number; completed: boolean; specialty?: string; projectCategory?: ProjectCategory; projectName?: string; projectLevel?: ProjectLevel; requiredExtra?: boolean; visitorRound?:boolean; place: string;
  onLocate: () => void; onAnswer: () => void;
}) {
  const group = category(challenge, place, specialty, projectCategory);
  return <article className={`challenge-card compact-challenge ${completed ? 'done' : ''}`}>
    <span className={`challenge-type-icon theme-${group.tone}`}><AppIcon name="quiz"/><small className="route-card-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</small></span>
    <div className="challenge-content">
      <span className="challenge-category">{requiredExtra?'Reto extra de tu ruta':`${group.name}${projectLevel===undefined?'':` · ${levelLabel(projectLevel)}`}`}<span className="sr-only"> · Reto {index + 1} · {visitorRound?'Ronda de visitante':challenge.isBase ? 'Camino base' : 'Extra'}</span></span>
      <h2>{projectName??challenge.title}</h2>
      <PlaceTag>{place}</PlaceTag>
      {completed && <span className="challenge-status is-complete"><AppIcon name="check" width="13" height="13"/>Completado</span>}
    </div>
    <div className="card-actions">
      <button className="location-button primary-location" onClick={onLocate} aria-label={`Ubicación: ${challenge.title}`} title={`Ver ubicación: ${place}`}><PinIcon width="17" height="17"/><span>Ubicación</span></button>
      <button className="text-button challenge-answer-button" disabled={completed} onClick={onAnswer} aria-label={`Responder: ${challenge.title}`} title={completed ? 'Reto completado' : 'Hacer reto'}><span>{completed ? 'Listo' : 'Hacer reto'}</span><AppIcon name={completed ? 'check' : 'arrow'} width="18" height="18"/></button>
    </div>
  </article>;
}
