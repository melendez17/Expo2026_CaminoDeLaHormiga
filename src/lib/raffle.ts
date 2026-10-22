import { z } from 'zod';
import { adminRows, type StorageReader } from './local-admin';
import type { LocalData } from './local-game';
const emailSchema = z.union([z.email().max(254), z.literal('')]).optional();
const ticketSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(160), email: emailSchema, number: z.string().trim().min(1).max(80), source: z.enum(['digital', 'manual']) });
export type RaffleTicket = z.infer<typeof ticketSchema>;
const stateSchema = z.object({ manual: z.array(ticketSchema.extend({ source: z.literal('manual') })), history: z.array(z.object({ id: z.string(), at: z.iso.datetime(), winner: ticketSchema, total: z.number().int().positive() })) });
export type RaffleState = z.infer<typeof stateSchema>;
export const raffleKey = (data: LocalData) => `camino-raffle-v1-${data.settings.dataVersion}`;
export function readRaffle(data: LocalData, storage: StorageReader): RaffleState {
  const raw = storage.getItem(raffleKey(data));
  if (!raw) return { manual: [], history: [] };
  const parsed = stateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw Error('El historial de rifa no es válido. Revisa el respaldo del navegador antes de continuar.');
  return parsed.data;
}
export function digitalTickets(data: LocalData, storage: StorageReader): RaffleTicket[] {
  const rows = adminRows(data, storage);
  if (rows.some(row => row.error)) throw Error('Hay progresos no válidos. Revisa los datos de participantes antes de rifar.');
  return rows.flatMap(row => Array.from({ length: row.stats?.tickets ?? 0 }, (_, i) => ({ id: `digital:${row.user.id}:${i + 1}`, name: row.user.name, email: row.user.email, number: `D-${row.user.token}-${i + 1}`, source: 'digital' as const })));
}
export function addManual(state: RaffleState, name: string, number: string, email = ''): RaffleState {
  const ticket = ticketSchema.parse({ id: `manual:${number.trim().toUpperCase()}`, name: name.trim(), email: email.trim(), number: number.trim().toUpperCase(), source: 'manual' });
  if (state.manual.some(t => t.id === ticket.id)) throw Error('Ese tiquete manual ya está registrado.');
  return { ...state, manual: [...state.manual, { ...ticket, source: 'manual' }] };
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
