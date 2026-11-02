import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { completeLocal, findUser, freshProgress, generateExtras, extraChallenges, localDataSchema, parseProgress, summary, validateAnswers, voteLocal, type Answers, type LocalChallenge, type LocalProgress } from '../src/lib/local-game';
const keys = ['users', 'projects', 'challenges', 'agenda', 'settings'];
const data = localDataSchema.parse(Object.fromEntries(keys.map(key => [key, JSON.parse(readFileSync(new URL(`../public/data/${key}.json`, import.meta.url), 'utf8'))])));
function answers(c: LocalChallenge): Answers {
  if (c.kind === 'freeform') return { projectName: 'Proyecto de prueba', level: 'Quinto', description: 'Aprendí cómo funcionan los sensores.' };
  if (c.kind === 'saint') return { saint: c.answer! };
  return { code: c.code!, ...Object.fromEntries((c.questions ?? []).map(q => [q.id, String(q.correctIndex)])) };
}
function baseProgress() {
  let p: LocalProgress = { ...freshProgress(data, 'ana'), startedAt: new Date().toISOString() };
  for (const c of data.challenges.filter(c => c.isBase)) p = completeLocal(data, p, c.id, answers(c));
  return p;
}
test('datos JSON coherentes, tokens únicos y login normalizado', () => {
  assert.equal(findUser(data, ' k8p2 ')?.name, 'Ana Rodríguez');
  assert.equal(findUser(data, 'ZZZZ'), null);
  assert.equal(data.challenges.filter(c => c.isBase).length, 5);
});
test('no completar antes de iniciar ni generar extras antes de cinco base', () => {
  const p = freshProgress(data, 'ana');
  assert.throws(() => completeLocal(data, p, 'pasitos', {}), /inicia/);
  assert.throws(() => generateExtras(data, p), /ruta asignada/);
});
test('especialidad exige ambas respuestas correctas y código', () => {
  const c = data.challenges.find(c => c.id === 'tics')!;
  assert.ok(validateAnswers(c, { ...answers(c), technical: '0' }));
  assert.ok(validateAnswers(c, { ...answers(c), code: 'XXXX' }));
  assert.equal(validateAnswers(c, { ...answers(c), code: ' t1c5 ' }), null);
});
test('cinco base otorgan un tiquete y un voto; duplicar reto no duplica premios', () => {
  const p = baseProgress();
  assert.deepEqual(summary(data, p), { base: 5, baseTarget: 5, extra: 0, routeComplete: true, digitalTickets: 1, manualTickets: 0, tickets: 1, votesAvailable: 1 });
  const repeat = completeLocal(data, p, 'photo', answers(data.challenges.find(c => c.id === 'photo')!));
  assert.equal(repeat.completed.length, 5); assert.equal(summary(data, repeat).tickets, 1);
});
test('generar extras sin repetir, completar pares y agotar catálogo', () => {
  let p: LocalProgress = baseProgress();
  let batches = 0;
  while (p.extraIds.length < extraChallenges(data).filter(c=>!c.isBase).length) {
    p = generateExtras(data, p, () => 0.5); batches++;
    assert.equal(new Set(p.extraIds).size, p.extraIds.length);
    assert.throws(() => generateExtras(data, p), /Termina/);
    for (const id of p.extraIds) if (!p.completed.some(c => c.challengeId === id)) {
      const c = data.challenges.find(c => c.id === id)!;
      p = completeLocal(data, p, id, answers(c));
    }
  }
  assert.ok(batches > 1);
  assert.equal(summary(data, p).tickets, 1 + Math.floor(p.extraIds.length / 2));
  assert.deepEqual(generateExtras(data, p).extraIds, p.extraIds);
});
test('votar consume un voto, conserva tiquetes y bloquea sobregasto', () => {
  const p = voteLocal(data, baseProgress(), 'agua');
  assert.equal(summary(data, p).tickets, 1); assert.equal(summary(data, p).votesAvailable, 0);
  assert.throws(() => voteLocal(data, p, 'energia'), /No tienes votos/);
});
test('importar preserva propietario, respuestas, catálogo y saldo', () => {
  const p = baseProgress(); assert.deepEqual(parseProgress(data, 'ana', JSON.parse(JSON.stringify(p))), p);
  assert.throws(() => parseProgress(data, 'carlos', p), /otra persona/);
  assert.throws(() => parseProgress(data, 'ana', { ...p, dataVersion: 'old' }), /versión/);
  assert.throws(() => parseProgress(data, 'ana', { ...p, completed: [...p.completed, p.completed[0]] }), /duplicado/);
  assert.throws(() => parseProgress(data, 'ana', { ...p, votes: [{ projectId: 'agua', at: 'now' }, { projectId: 'energia', at: 'now' }] }), /votos no válidos/);
  assert.throws(() => parseProgress(data, 'ana', { ...p, completed: p.completed.map(c => c.challengeId === 'photo' ? { ...c, answers: { code: 'BAD' } } : c) }), /respuestas/);
});
test('encuesta añade bono configurable sin alterar el premio de ruta', () => {
  const p = { ...baseProgress(), survey: { expectations: 'Aprender mucho', interest: 'TICs', satisfaction: 5 } };
  assert.equal(summary(data, p).tickets, 1 + data.settings.surveyBonus);
  assert.equal(parseProgress(data, 'ana', p).survey?.satisfaction, 5);
});
