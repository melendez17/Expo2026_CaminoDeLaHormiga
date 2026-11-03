import { saintQuestion, saintSelection, type Answers, type LocalChallenge } from './local-game';

// Missing or malformed fields stay in the form; only a submitted wrong answer counts.
export function hasIncorrectAnswer(challenge: LocalChallenge, answers: Answers): boolean {
  if (challenge.kind === 'freeform') return false;
  if (challenge.kind === 'saint') {
    const selected = saintSelection(challenge, answers);
    return selected !== null && selected !== saintQuestion(challenge).correctIndex;
  }
  if (challenge.kind === 'quiz') {
    if (!challenge.questions?.every(q => /^\d+$/.test(answers[q.id] ?? '') && Number(answers[q.id]) < q.options.length)) return false;
  }
  const code = answers.code?.trim().toUpperCase() ?? '';
  if (!/^[A-Z0-9]{4}$/.test(code)) return false;
  return code !== challenge.code || (challenge.kind === 'quiz' && challenge.questions!.some(q => Number(answers[q.id]) !== q.correctIndex));
}

export function correctAnswersForAttempt(challenge: LocalChallenge, answers: Answers) {
  const details:{question:string;answer:string}[]=[];
  if(challenge.kind==='quiz')for(const q of challenge.questions??[])if(answers[q.id]!==String(q.correctIndex))details.push({question:q.prompt,answer:q.options[q.correctIndex]});
  if(['quiz','code'].includes(challenge.kind)&&answers.code?.trim().toUpperCase()!==challenge.code)details.push({question:'Código del stand',answer:challenge.code!});
  if(challenge.kind==='saint'){const q=saintQuestion(challenge);details.push({question:q.prompt,answer:q.options[q.correctIndex]});}
  return details;
}
