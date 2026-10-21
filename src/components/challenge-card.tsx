'use client';
import type { LocalChallenge } from '@/lib/local-game';
import { AppIcon, PinIcon, PlaceTag } from './icons';
const kindLabels = { freeform: 'Explora un proyecto', quiz: 'Preguntas de especialidad', code: 'Valida tu visita', saint: 'Descubre el campus' };
export function ChallengeCard({ challenge, index, completed, place, onLocate, onAnswer }: {
  challenge: LocalChallenge; index: number; completed: boolean; place: string;
  onLocate: () => void; onAnswer: () => void;
}) {
  return <article className={`challenge-card ${completed ? 'done' : ''}`}>
    <header className="challenge-card-header"><span className={`challenge-type-icon type-${challenge.kind}`}><AppIcon name={challenge.kind}/></span><div><span className="challenge-step">Reto {String(index + 1).padStart(2, '0')} · {challenge.isBase ? 'Camino base' : 'Extra'}</span><span className="challenge-kind">{kindLabels[challenge.kind]}</span></div><span className={`challenge-status ${completed ? 'is-complete' : ''}`}>{completed && <AppIcon name="check" width="13" height="13"/>}{completed ? 'Completado' : 'Por descubrir'}</span></header>
    <div className="challenge-content"><h2>{challenge.title}</h2><p>{challenge.description}</p><PlaceTag>{place}</PlaceTag></div>
    <footer className="card-actions"><button className="location-button primary-location" onClick={onLocate} aria-label={`Ubicación: ${challenge.title}`}><PinIcon width="17" height="17"/>Ubicación</button><button className="text-button challenge-answer-button" disabled={completed} onClick={onAnswer} aria-label={`Responder: ${challenge.title}`}>{completed ? <><AppIcon name="check" width="16" height="16"/>Listo</> : <>Hacer reto<AppIcon name="arrow" width="16" height="16"/></>}</button></footer>
  </article>;
}
