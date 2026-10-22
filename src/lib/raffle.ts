import { z } from 'zod';
import { adminRows, type StorageReader } from './local-admin';
import { normalize, raffleKey, type LocalData } from './local-game';
const emailSchema = z.union([z.email().max(254), z.literal('')]).optional();
const ticketSchema = z.object({ userId: z.string().optional(), id: z.string().min(1), name: z.string().trim().min(1).max(160), email: emailSchema, number: z.string().trim().min(1).max(80), source: z.enum(['digital', 'manual']) });
export type RaffleTicket = z.infer<typeof ticketSchema>;
const stateSchema = z.object({ manual: z.array(ticketSchema.extend({ source: z.literal('manual') })), history: z.array(z.object({ id: z.string(), at: z.iso.datetime(), winner: ticketSchema, total: z.number().int().positive() })) });
export type RaffleState = z.infer<typeof stateSchema>;
export { raffleKey } from './local-game';
export function readRaffle(data: LocalData, storage: StorageReader): RaffleState {
  const raw = storage.getItem(raffleKey(data));
  if (!raw) return { manual: [], history: [] };
  const parsed = stateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw Error('El historial de rifa no es válido. Revisa el respaldo del navegador antes de continuar.');
  const state = parsed.data;
  const replacements = new Map<string, RaffleTicket>();
  // Upgrade old digital labels and link legacy manual entries without losing winners.
  const canonicalDigital = (t: RaffleTicket): RaffleTicket => {
    if (t.source !== 'digital' || !t.id.startsWith('digital:')) return t;
    const user = data.users.find(u => t.id.startsWith(`digital:${u.id}:`));
    const index = Number(t.id.split(':').at(-1));
    if (!user || !Number.isInteger(index) || index < 1) return t;
    return { ...t, id: `${user.token} ${index}`, number: `${user.token} ${index}` };
  };
  state.history = state.history.map(h => ({ ...h, winner: canonicalDigital(h.winner) }));
  const counts = new Map(adminRows(data, storage).map(r => [r.user.token, r.stats?.tickets ?? 0]));
  const reserved = [...state.manual, ...state.history.map(h => h.winner)];
  state.manual = state.manual.map(t => {
    if (/^[A-Z0-9]{4} [1-9]\d*$/.test(t.id)) return t;
    const matches = data.users.filter(u => u.role !== 'admin' && (t.email && u.email ? t.email.toLowerCase() === u.email.toLowerCase() : normalize(t.name) === normalize(u.name)));
    if (matches.length !== 1) return t;
    const user = matches[0];
    const max = Math.max(counts.get(user.token) ?? 0, ...reserved.filter(x => x.id.startsWith(`${user.token} `)).map(x => Number(x.id.split(' ')[1]) || 0));
    const id = `${user.token} ${max + 1}`;
    const next = { ...t, id, number: id };
    reserved.push(next); replacements.set(t.id, next);
    return next;
  });
  state.history = state.history.map(h => ({ ...h, winner: replacements.has(h.winner.id) ? { ...h.winner, id: replacements.get(h.winner.id)!.id, number: replacements.get(h.winner.id)!.number } : h.winner }));
  return state;
}
export function digitalTickets(data: LocalData, storage: StorageReader, userId?: string): RaffleTicket[] {
  const rows = adminRows(data, storage).filter(row => !userId || row.user.id === userId);
  if (rows.some(row => row.error)) throw Error('Hay progresos no válidos. Revisa los datos de participantes antes de rifar.');
  const state = readRaffle(data, storage);
  const manualIds = new Set(state.manual.map(t => t.id));
  return rows.flatMap(row => {
    const tickets: RaffleTicket[] = [];
    let sequence = 1;
    while (tickets.length < (row.stats?.tickets ?? 0)) {
      const id = `${row.user.token} ${sequence++}`;
      if (!manualIds.has(id)) tickets.push({ userId: row.user.id, id, number: id, name: row.user.name, email: row.user.email, source: 'digital' });
    }
    return tickets;
  });
}
export function addManual(data: LocalData, state: RaffleState, token: string, digital: RaffleTicket[]): RaffleState {
  const code = token.trim().toUpperCase();
  const user = data.users.find(u => u.token === code && u.role !== 'admin');
  if (!user) throw Error('El token no pertenece a un participante registrado. Crea primero su usuario.');
  const all = [...digital, ...state.manual, ...state.history.map(h => h.winner)];
  const max = Math.max(0, ...all.filter(t => t.id.startsWith(`${code} `)).map(t => Number(t.id.slice(5)) || 0));
  const id = `${code} ${max + 1}`;
  const ticket = { userId: user.id, id, name: user.name, email: user.email ?? '', number: id, source: 'manual' as const };
  return { ...state, manual: [...state.manual, ticket] };
}
// Rejection sampling avoids bias when the pool size does not divide 2^32.
export function randomIndex(size: number, next = () => crypto.getRandomValues(new Uint32Array(1))[0]): number {
  if (!Number.isSafeInteger(size) || size < 1 || size > 0x100000000) throw Error('No hay tiquetes disponibles para rifar.');
  const limit = Math.floor(0x100000000 / size) * size;
  let value: number; do { value = next(); } while (value >= limit);
  return value % size;
}
export function drawRaffle(state: RaffleState, digital: RaffleTicket[]): RaffleState {
  const used = new Set(state.history.map(h => h.winner.id));
  const pool = [...digital, ...state.manual].filter(t => !used.has(t.id));
  const winner = pool[randomIndex(pool.length)];
  return { ...state, history: [{ id: crypto.randomUUID(), at: new Date().toISOString(), winner: { ...winner }, total: pool.length }, ...state.history] };
}
