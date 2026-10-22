'use client';
import type { LocalUser } from '@/lib/local-game';
import type { useTicketLedger } from './use-ticket-ledger';
import { TicketWallet } from './ticket-wallet';
export function ParticipantTickets({ user, ledger, votesAvailable }: { user: LocalUser; ledger: ReturnType<typeof useTicketLedger>; votesAvailable: number | undefined }) {
  return <section aria-label={`Tiquetes de ${user.name}`}><header className="participant-answer-header"><div><h2>Tiquetes de {user.name}</h2><p>Token: <b>{user.token}</b> · {user.email || 'Correo sin registrar'}</p></div></header><p>Votos disponibles: <b>{votesAvailable ?? 'Revisar datos'}</b>. Cada tiquete digital o manual permite un voto; votar conserva la participación en la rifa.</p><TicketWallet title="Códigos de tiquetes" {...ledger} tickets={ledger.tickets.filter(t => t.userId === user.id)}/></section>;
}
