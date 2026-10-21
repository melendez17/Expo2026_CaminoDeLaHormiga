import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeAnswers } from '../src/lib/participant-answers';
import type { LocalChallenge } from '../src/lib/local-game';
const base = { id: 'test', title: 'Reto', description: 'Descripción', buildingId: '7', isBase: false };
test('formulario conserva preguntas y respuestas de texto, incluidos saltos de línea', () => {
  const c: LocalChallenge = { ...base, kind: 'freeform' };
  const result = challengeAnswers(c, { projectName: 'Agua', level: 'Quinto', description: 'Línea uno\nLínea dos' });
  assert.deepEqual(result.map(r => r.question), ['Nombre del proyecto', 'Nivel', '¿Qué descubriste?']);
  assert.equal(result[2].answer, 'Línea uno\nLínea dos');
});
test('quiz traduce índices a texto y distingue opción cero de falta de respuesta', () => {
  const c: LocalChallenge = { ...base, kind: 'quiz', code: 'A123', questions: [{ id: 'objective', prompt: '¿Qué busca?', options: ['Cuidar agua', 'Desperdiciar'], correctIndex: 0 }, { id: 'technical', prompt: '¿Cómo mide?', options: ['Cartel', 'Sensor'], correctIndex: 1 }] };
  const answered = challengeAnswers(c, { objective: '0', technical: '1', code: 'a123' });
  assert.deepEqual(answered, [{ question: '¿Qué busca?', answer: 'Cuidar agua', correct: true }, { question: '¿Cómo mide?', answer: 'Sensor', correct: true }, { question: 'Código del stand', answer: 'a123', correct: true }]);
  assert.equal(challengeAnswers(c)[0].answer, null);
  assert.equal(challengeAnswers(c, { objective: '1' })[0].correct, false);
});
test('santo muestra la respuesta de la persona y código pendiente no inventa datos', () => {
  assert.deepEqual(challengeAnswers({ ...base, kind: 'saint', answer: 'San Juan Bosco' }, { saint: 'san juan bosco' }), [{ question: 'Nombre del santo', answer: 'san juan bosco', correct: true }]);
  assert.deepEqual(challengeAnswers({ ...base, kind: 'code', code: 'A123' }), [{ question: 'Código del stand', answer: null }]);
});
