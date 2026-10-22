'use client';
import type { LocalData } from '@/lib/local-game';
import type { adminRows } from '@/lib/local-admin';
import { challengeAnswers } from '@/lib/participant-answers';
import campus from '@/lib/campus.json';
import { PlaceTag } from './icons';
type Row = ReturnType<typeof adminRows>[number];
const names: Record<string, string> = campus.names;
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Costa_Rica' }).format(date);
}
export function ParticipantAnswers({ data, rows, selectedId }: {
  data: LocalData; rows: Row[]; selectedId: string;
}) {
  const row = rows.find(r => r.user.id === selectedId);
  const progress = row?.progress;
  const challenges = data.challenges.filter(c => c.isBase || progress?.extraIds.includes(c.id));
  return <section className="participant-answers">
    <div className="admin-section-top"><h2>Respuestas por participante</h2></div>

    {!row ? <p className="empty">El participante seleccionado ya no está disponible.</p> : <>
      <header className="participant-answer-header"><div><span className="eyebrow">FICHA DEL PARTICIPANTE</span><h3>{row.user.name}</h3><p>{row.user.kind === 'applicant' ? 'Postulante' : 'Visitante'} · Token {row.user.token}</p></div><span className="place-tag">{row.status}</span></header>
      {row.error || !progress ? <p className="form-error" role="alert">Los datos de esta persona no son válidos. No podemos presentar sus respuestas hasta revisar el progreso guardado.</p> : <>
        <p className="muted">{progress.completed.length} retos completados · Respuestas guardadas en este navegador. Se muestran los retos completados y los pendientes; los intentos incorrectos no se conservan en esta demo.</p>
        {progress.startedAt && <p className="answer-date">Inicio del camino: {formatDate(progress.startedAt)} · Hora de Costa Rica</p>}
        {!progress.completed.length && <p className="empty">Esta persona todavía no tiene respuestas guardadas.</p>}
        <div className="participant-answer-list">{challenges.map(challenge => {
          const record = progress.completed.find(c => c.challengeId === challenge.id);
          return <article key={challenge.id} className={`participant-answer-card ${record ? 'answered' : 'unanswered'}`}>
            <div className="answer-card-top"><div><span className="eyebrow">{challenge.isBase ? 'RETO BASE' : 'RETO EXTRA'} · {record ? 'COMPLETADO' : 'PENDIENTE'}</span><h4>{challenge.title}</h4></div><PlaceTag>{names[challenge.buildingId]}</PlaceTag></div>
            {record && <p className="answer-date">Respondido: {formatDate(record.at)}</p>}
            <dl>{challengeAnswers(challenge, record?.answers).map((detail, i) => <div key={i} className="question-answer"><dt>{detail.question}</dt><dd>{detail.answer === null ? <span className="answer-pending">Sin respuesta</span> : <><span className="answer-text">{detail.answer}</span>{detail.correct !== undefined && <span className={`answer-result ${detail.correct ? 'correct' : 'incorrect'}`}>{detail.correct ? 'Correcta' : 'Incorrecta'}</span>}</>}</dd></div>)}</dl>
          </article>;
        })}</div>
        <article className="participant-answer-card survey-answers"><span className="eyebrow">ENCUESTA</span><h4>Expectativas y satisfacción</h4>{progress.survey ? <dl>
          <div className="question-answer"><dt>¿Qué esperabas descubrir?</dt><dd className="answer-text">{progress.survey.expectations}</dd></div>
          <div className="question-answer"><dt>¿Qué área te interesa?</dt><dd className="answer-text">{progress.survey.interest}</dd></div>
          <div className="question-answer"><dt>¿Cómo fue tu experiencia?</dt><dd className="answer-text">{progress.survey.satisfaction} de 5</dd></div>
        </dl> : <p className="answer-pending">Encuesta pendiente. Aún no hay respuestas guardadas.</p>}</article>
      </>}
    </>}
  </section>;
}
