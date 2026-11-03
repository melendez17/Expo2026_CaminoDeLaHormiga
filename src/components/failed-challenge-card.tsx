'use client';
import {useEffect,useRef} from 'react';
import type{FailedAttempt}from'@/lib/failed-attempts';
import{failedAttemptDetails}from'@/lib/failed-attempts';
import{AppIcon,PlaceTag}from'./icons';
export function FailedChallengeCard({attempt,onReview}:{attempt:FailedAttempt;onReview:()=>void}){
 const wrong=failedAttemptDetails(attempt).filter(detail=>detail.correct===false);
 return <article className="failed-challenge-card" aria-label={`Reto fallado: ${attempt.challenge.title}`}>
  <span className="failure-symbol" aria-hidden="true"><AppIcon name="close"/></span>
  <div><span className="failed-challenge-status">Fallado · Bloqueado</span><h2>{attempt.challenge.title}</h2><p>{wrong.length===1?`La respuesta a «${wrong[0].question}» no coincide con la correcta.`:`${wrong.length} respuestas no coinciden con las correctas.`}</p><small>No cuenta como pendiente ni como completado.</small></div>
  <button onClick={onReview} aria-label={`Revisar intento: ${attempt.challenge.title}`}>Ver mi intento<AppIcon name="arrow" width="16" height="16"/></button>
 </article>;
}
export function FailedChallengeReview({attempt,place,replacementTitle,onClose}:{attempt:FailedAttempt;place:string;replacementTitle:string;onClose:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),details=failedAttemptDetails(attempt);
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement as HTMLElement|null;dialog?.showModal();return()=>{dialog?.close();previous?.focus();};},[]);
 return <dialog ref={ref} className="modal local-dialog failed-challenge-review" aria-labelledby="failed-review-title" onCancel={onClose}>
  <div className="row"><span className="failed-challenge-status"><AppIcon name="close" width="18" height="18"/>Fallado · Bloqueado</span><button onClick={onClose} aria-label="Cerrar revisión del intento"><AppIcon name="close"/></button></div>
  <h2 id="failed-review-title">{attempt.challenge.title}</h2><PlaceTag>{place}</PlaceTag><p>{attempt.challenge.description}</p>
  <p className="failed-review-explanation">Este intento falló porque las respuestas marcadas en rojo no coinciden con las respuestas correctas del reto. Puedes consultarlo, pero no volver a enviarlo.</p>
  <dl>{details.map((detail,index)=><div key={index} className={detail.correct===false?'failed-review-answer is-incorrect':'failed-review-answer'}><dt>{detail.question}</dt><dd><span>Tu respuesta: <strong>{detail.answer??'Sin respuesta'}</strong></span><span className={detail.correct===false?'failed-review-verdict':'failed-review-correct'}><AppIcon name={detail.correct===false?'close':'check'} width="15" height="15"/>{detail.correct===false?'Incorrecta':'Correcta'}</span>{detail.correct===false&&<p>Respuesta correcta: <strong>{detail.correctAnswer}</strong></p>}</dd></div>)}</dl>
  <p className="muted">Intento guardado: {new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(attempt.at))} · Costa Rica</p><p>Reto asignado en su lugar: <strong>{replacementTitle}</strong>.</p><button onClick={onClose}>Cerrar revisión</button>
 </dialog>;
}
