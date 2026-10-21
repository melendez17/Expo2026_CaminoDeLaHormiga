import { normalize, type Answers, type LocalChallenge } from './local-game';
export type AnswerDetail = { question: string; answer: string | null; correct?: boolean };
export function challengeAnswers(challenge: LocalChallenge, answers?: Answers): AnswerDetail[] {
  const result: AnswerDetail[] = [];
  if (challenge.kind === 'freeform') {
    for (const [key, question] of [['projectName', 'Nombre del proyecto'], ['level', 'Nivel'], ['description', '¿Qué descubriste?']]) {
      result.push({ question, answer: answers?.[key] ?? null });
    }
  }
  if (challenge.kind === 'quiz') {
    for (const q of challenge.questions ?? []) {
      const value = answers?.[q.id];
      const selected = value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
      result.push({ question: q.prompt, answer: selected === null ? null : q.options[selected] ?? 'Opción no válida', ...(selected === null ? {} : { correct: selected === q.correctIndex }) });
    }
  }
  if (challenge.kind === 'quiz' || challenge.kind === 'code') {
    const code = answers?.code;
    result.push({ question: 'Código del stand', answer: code ?? null, ...(code === undefined ? {} : { correct: code.trim().toUpperCase() === challenge.code }) });
  }
  if (challenge.kind === 'saint') {
    const saint = answers?.saint;
    result.push({ question: 'Nombre del santo', answer: saint ?? null, ...(saint === undefined ? {} : { correct: normalize(saint) === normalize(challenge.answer ?? '') }) });
  }
  return result;
}
