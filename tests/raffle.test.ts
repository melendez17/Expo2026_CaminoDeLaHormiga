import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addManual, digitalTickets, drawRaffle, raffleKey, randomIndex, readRaffle, type RaffleState } from '../src/lib/raffle';
import { localDataSchema, freshProgress, completeLocal, storageKey, manualTicketCount, summary, voteLocal, parseProgress } from '../src/lib/local-game';
const keys = ['users', 'projects', 'challenges', 'agenda', 'settings'];
const data = localDataSchema.parse(Object.fromEntries(keys.map(key => [key, JSON.parse(readFileSync(new URL(`../public/data/${key}.json`, import.meta.url), 'utf8'))])));
data.users.find(u => u.id === 'ana')!.email = 'ana@example.com';
const empty = (): RaffleState => ({ manual: [], history: [] });
const add = (state = empty()) => addManual(data, state, 'k8p2', []);
function reader(state: RaffleState, tickets: boolean | number = false) {
  let p: ReturnType<typeof freshProgress> = { ...freshProgress(data, 'ana'), startedAt: new Date().toISOString() };
  if (tickets) for (const c of data.challenges.filter(c => c.isBase)) {
    const answers: Record<string, string> = c.kind === 'freeform' ? { projectName: 'Proyecto', level: 'Quinto', description: 'Aprendí sobre tecnología y sensores.' } : { code: c.code!, ...Object.fromEntries((c.questions ?? []).map(q => [q.id, String(q.correctIndex)])) };
    p = completeLocal(data, p, c.id, answers);
  }
  if (tickets === 2) p = { ...p, survey: { expectations: 'Conocer proyectos', interest: 'Tecnología', satisfaction: 5 } };
  return { getItem: (key: string) => key === raffleKey(data) ? JSON.stringify(state) : key === storageKey(data, 'ana') ? JSON.stringify(p) : null };
}
test('manual tickets link existing participants and number each registration', () => {
  const first = add();
  assert.equal(first.manual[0].id, 'K8P2 1');
  assert.equal(first.manual[0].number, 'K8P2 1');
  assert.equal(first.manual[0].name, 'Ana Rodríguez');
  assert.equal(first.manual[0].email, 'ana@example.com');
  assert.equal(add(first).manual[1].id, 'K8P2 2');
  assert.throws(() => addManual(data, first, 'ZZZZ', []), /registrado/);
  assert.throws(() => addManual(data, first, 'ADM1', []), /registrado/);
});
test('digital and manual share stable sequence when more digital tickets are earned', () => {
  const digital = digitalTickets(data, reader(empty(), true));
  assert.equal(digital[0].id, 'K8P2 1');
  assert.equal(digital[0].email, 'ana@example.com');
  const manual = addManual(data, empty(), 'K8P2', digital);
  assert.equal(manual.manual[0].number, 'K8P2 2');
  assert.equal(digitalTickets(data, reader(manual, true))[0].number, 'K8P2 1');
  assert.deepEqual(digitalTickets(data, reader(manual, 2)).map(t => t.number), ['K8P2 1', 'K8P2 3']);
  const next = addManual(data, manual, 'K8P2', digitalTickets(data, reader(manual, 2)));
  assert.equal(next.manual[1].number, 'K8P2 4');
  const manualFirst = add();
  assert.equal(digitalTickets(data, reader(manualFirst, true))[0].number, 'K8P2 2');
});
test('mixed pool records snapshots and excludes winning tickets', () => {
  const state = add();
  const digital = [{ id: 'M4T7 1', name: 'Carlos', email: 'carlos@example.com', number: 'M4T7 1', source: 'digital' as const }];
  const first = drawRaffle(state, digital);
  const second = drawRaffle(first, digital);
  assert.equal(first.history[0].total, 2);
  assert.equal(second.history[0].total, 1);
  assert.notEqual(first.history[0].winner.id, second.history[0].winner.id);
  assert.throws(() => drawRaffle(second, digital), /No hay tiquetes/);
  assert.deepEqual(readRaffle(data, reader(second)), second);
  assert.equal(state.history.length, 0);
});
test('legacy ticket labels migrate without reentering winning tickets', () => {
  const old = { manual: [{ id: 'manual:001', name: 'Ana Rodríguez', email: 'ana@example.com', number: '001', source: 'manual' as const }], history: [{ id: 'draw', at: new Date().toISOString(), winner: { id: 'digital:ana:1', name: 'Ana Rodríguez', number: 'D-K8P2-1', source: 'digital' as const }, total: 2 }] };
  const storage = reader(old, true);
  const restored = readRaffle(data, storage);
  assert.equal(restored.manual[0].id, 'K8P2 2');
  assert.equal(restored.history[0].winner.id, 'K8P2 1');
  assert.equal(digitalTickets(data, storage)[0].id, 'K8P2 1');
  const drawn = drawRaffle(restored, digitalTickets(data, storage));
  assert.equal(drawn.history[0].winner.id, 'K8P2 2');
  assert.deepEqual(readRaffle(data, reader(restored, true)), restored);
});
test('winner emails survive persistence and old histories without email remain readable', () => {
  const drawn = drawRaffle(add(), []);
  assert.equal(readRaffle(data, reader(drawn)).history[0].winner.email, 'ana@example.com');
  const old = JSON.parse(JSON.stringify(drawn)); delete old.manual[0].email; delete old.history[0].winner.email;
  assert.equal(readRaffle(data, reader(old)).history[0].winner.email, undefined);
});
test('random sampling rejects biased tail and empty pools', () => {
  const values = [0xffffffff, 5];
  assert.equal(randomIndex(3, () => values.shift()!), 2);
  assert.equal(randomIndex(1, () => 0xffffffff), 0);
  assert.throws(() => randomIndex(0));
});

test('admin and participant see the same codes, origins and winning status', async () => {
  const { ticketLedger } = await import('../src/lib/ticket-ledger');
  const digital = digitalTickets(data, reader(empty(), true));
  const manual = addManual(data, empty(), 'K8P2', digital);
  const storage = reader(drawRaffle(manual, digital), true);
  const admin = ticketLedger(data, storage);
  const personal = ticketLedger(data, storage, 'ana');
  assert.deepEqual(personal, admin.filter(t => t.userId === 'ana'));
  assert.deepEqual(personal.map(t => t.number), ['K8P2 1', 'K8P2 2']);
  assert.deepEqual(personal.map(t => t.source), ['digital', 'manual']);
  assert.equal(personal.filter(t => t.won).length, 1);
  assert.deepEqual(ticketLedger(data, storage, 'carlos'), []);
  assert.equal(personal[1].token, 'K8P2');
});
test('manual tickets are visible without route progress and another invalid progress does not hide personal codes', async () => {
  const { ticketLedger } = await import('../src/lib/ticket-ledger');
  const base = reader(add());
  const storage = { getItem: (key: string) => key === storageKey(data, 'carlos') ? '{broken' : base.getItem(key) };
  assert.equal(ticketLedger(data, storage, 'ana')[0].number, 'K8P2 1');
  assert.throws(() => ticketLedger(data, storage), /progresos/);
});
test('catalog changes cannot orphan manual tickets or change their token', async () => {
  const { validateCatalogChange } = await import('../src/lib/local-admin');
  const storage = { getItem: (key: string) => key === raffleKey(data) ? JSON.stringify(add()) : null };
  for (const action of [
    (next: typeof data) => { next.users = next.users.filter(u => u.id !== 'ana'); },
    (next: typeof data) => { next.users.find(u => u.id === 'ana')!.token = 'AAAA'; },
    (next: typeof data) => { next.users.find(u => u.id === 'ana')!.role = 'admin'; }
  ]) {
    const next = structuredClone(data); action(next);
    assert.throws(() => validateCatalogChange(data, next, 'admin', storage), /tiquetes manuales asociados/);
  }
});


test('one manual ticket grants exactly one vote and survives reload without generating a digital ticket', async () => {
  const { adminRows } = await import('../src/lib/local-admin');
  const storage = reader(add());
  const count = manualTicketCount(data, 'ana', storage);
  assert.equal(count, 1);
  assert.equal(manualTicketCount(data, 'carlos', storage), 0);
  const p = parseProgress(data, 'ana', JSON.parse(storage.getItem(storageKey(data, 'ana'))!), count);
  assert.equal(summary(data, p, count).votesAvailable, 1);
  const voted = voteLocal(data, p, data.projects[0].id, count);
  assert.equal(summary(data, voted, count).votesAvailable, 0);
  assert.throws(() => voteLocal(data, voted, data.projects[0].id, count), /No tienes votos/);
  assert.deepEqual(parseProgress(data, 'ana', JSON.parse(JSON.stringify(voted)), count), voted);
  assert.throws(() => parseProgress(data, 'ana', voted), /votos no válidos/);
  const reloaded = { getItem: (key: string) => key === storageKey(data, 'ana') ? JSON.stringify(voted) : storage.getItem(key) };
  assert.equal(adminRows(data, reloaded).find(r => r.user.id === 'ana')!.stats!.votesAvailable, 0);
  assert.equal(adminRows(data, reloaded).find(r => r.user.id === 'ana')!.stats!.tickets, 1);
  assert.deepEqual(digitalTickets(data, reloaded), []);
});
test('digital and manual vote credits add together and raffle prizes do not consume votes', () => {
  const initial = reader(empty(), true);
  const digital = digitalTickets(data, initial);
  const manual = addManual(data, empty(), 'K8P2', digital);
  const drawn = drawRaffle(manual, digital);
  const storage = reader(drawn, true);
  const count = manualTicketCount(data, 'ana', storage);
  let p = parseProgress(data, 'ana', JSON.parse(storage.getItem(storageKey(data, 'ana'))!), count);
  assert.equal(summary(data, p, count).votesAvailable, 2);
  p = voteLocal(data, p, data.projects[0].id, count);
  p = voteLocal(data, p, data.projects[0].id, count);
  assert.equal(summary(data, p, count).votesAvailable, 0);
  assert.throws(() => voteLocal(data, p, data.projects[0].id, count), /No tienes votos/);
  const next = addManual(data, drawn, 'K8P2', digital);
  const added = manualTicketCount(data, 'ana', reader(next, true));
  assert.equal(summary(data, p, added).votesAvailable, 1);
  assert.equal(next.manual[1].number, 'K8P2 3');
});
