import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addManual, drawRaffle, randomIndex, readRaffle } from '../src/lib/raffle';
import type { LocalData } from '../src/lib/local-game';
test('manual tickets reject duplicate numbers and blank names', () => {
  const state = addManual({ manual: [], history: [] }, ' Ana ', ' a01 ');
  assert.equal(state.manual[0].name, 'Ana');
  assert.throws(() => addManual(state, 'Luis', 'A01'), /ya está/);
  assert.throws(() => addManual(state, ' ', 'A02'));
});
test('mixed pool records a snapshot and excludes previous winning tickets', () => {
  const state = addManual({ manual: [], history: [] }, 'Ana', '01');
  const digital = [{ id: 'digital:luis:1', name: 'Luis', number: 'D-LUIS-1', source: 'digital' as const }];
  const first = drawRaffle(state, digital);
  assert.equal(first.history[0].total, 2);
  const second = drawRaffle(first, digital);
  assert.equal(second.history[0].total, 1);
  assert.notEqual(first.history[0].winner.id, second.history[0].winner.id);
  assert.throws(() => drawRaffle(second, digital), /No hay tiquetes/);
  assert.equal(state.history.length, 0);
  const data = { settings: { dataVersion: 'test' } } as LocalData;
  assert.deepEqual(readRaffle(data, { getItem: () => JSON.stringify(second) }), second);
  assert.throws(() => readRaffle(data, { getItem: () => '{broken' }));
});
test('random sampling rejects biased tail and empty pools', () => {
  const values = [0xffffffff, 5];
  assert.equal(randomIndex(3, () => values.shift()!), 2);
  assert.equal(randomIndex(1, () => 0xffffffff), 0);
  assert.throws(() => randomIndex(0));
});
test('winner email survives saving and old histories remain readable', () => {
  const state = addManual({ manual: [], history: [] }, 'Ana', 'M99', 'ana@example.com');
  const drawn = drawRaffle(state, []);
  assert.equal(drawn.history[0].winner.email, 'ana@example.com');
  const data = { settings: { dataVersion: 'email-test' } } as LocalData;
  assert.equal(readRaffle(data, { getItem: () => JSON.stringify(drawn) }).history[0].winner.email, 'ana@example.com');
  const old = JSON.parse(JSON.stringify(drawn));
  delete old.manual[0].email; delete old.history[0].winner.email;
  assert.equal(readRaffle(data, { getItem: () => JSON.stringify(old) }).history[0].winner.email, undefined);
  assert.throws(() => addManual(state, 'Luis', 'M100', 'invalid-email'));
});
