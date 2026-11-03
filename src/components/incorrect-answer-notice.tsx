"use client";
import { useEffect, useRef } from "react";
import { AppIcon } from "./icons";
import { correctAnswersForAttempt } from "@/lib/incorrect-answer";
import type { FailureDetail } from "@/lib/failed-attempts";
import type { Answers, LocalChallenge } from "@/lib/local-game";
export function IncorrectAnswerNotice({
  challenge,
  replacement,
  answers,
  onContinue,
  onClose,
  corrections,
}: {
  challenge: LocalChallenge;
  replacement: LocalChallenge;
  answers: Answers;
  corrections?: FailureDetail[];
  onContinue: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      role="alertdialog"
      className="modal local-dialog incorrect-answer-notice"
      aria-labelledby="incorrect-answer-title"
      aria-describedby="incorrect-answer-description"
      onCancel={onClose}
    >
      <span className="failure-symbol failure-alert-symbol" aria-hidden="true">
        <AppIcon name="close" />
      </span>
      <h2 id="incorrect-answer-title">Respuesta incorrecta</h2>
      <p id="incorrect-answer-description">
        El reto «{challenge.title}» quedó bloqueado. Te asignamos otro para que
        puedas completarlo, sin aumentar tus retos pendientes.
      </p>
      <dl>
        {(corrections
          ? corrections
              .filter((d) => d.correct === false)
              .map((d) => ({ question: d.question, answer: d.correctAnswer }))
          : correctAnswersForAttempt(challenge, answers)
        ).map((detail, index) => (
          <div key={index}>
            <dt>{detail.question}</dt>
            <dd>
              La respuesta correcta era: <strong>{detail.answer}</strong>
            </dd>
          </div>
        ))}
      </dl>
      <p>
        Tu nuevo reto es: <strong>{replacement.title}</strong>.
      </p>
      <p className="muted">
        Este intento no suma retos completados, tiquetes ni votos.
      </p>
      <div className="row">
        <button className="primary" onClick={onContinue}>
          Ir al nuevo reto
        </button>
        <button onClick={onClose}>Volver a mis retos</button>
      </div>
    </dialog>
  );
}
