import type { LocalData } from './local-game';
import type { StorageReader } from './local-admin';
import { digitalTickets, readRaffle, type RaffleTicket } from './raffle';
export type ParticipantTicket = RaffleTicket & { userId: string; token: string; won: boolean };
export const TICKETS_CHANGED = 'camino-tickets-changed';
export function ticketLedger(data: LocalData, storage: StorageReader, userId?: string): ParticipantTicket[] {
  const state = readRaffle(data, storage);
  const winners = new Set(state.history.map(h => h.winner.id));
  const result: ParticipantTicket[] = [];
  for (const ticket of [...digitalTickets(data, storage, userId), ...state.manual]) {
    const owner = data.users.find(u => u.role !== 'admin' && (ticket.userId ? u.id === ticket.userId : ticket.id.startsWith(`${u.token} `)));
    if (!owner) {
      if (!userId) throw Error(`El tiquete ${ticket.number} no tiene un participante válido. Revisa su registro antes de rifar.`);
      continue;
    }
    if (userId && owner.id !== userId) continue;
    result.push({ ...ticket, name: owner.name, email: owner.email ?? '', userId: owner.id, token: owner.token, won: winners.has(ticket.id) });
  }
  return result.sort((a, b) => a.token.localeCompare(b.token) || Number(a.number.split(' ').at(-1)) - Number(b.number.split(' ').at(-1)));
}
