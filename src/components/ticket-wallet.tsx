'use client';
import type { ParticipantTicket } from '@/lib/ticket-ledger';
export function TicketCodes({ tickets }: { tickets: ParticipantTicket[] }) {
  return tickets.length ? <ul className="ticket-codes">{tickets.map(t => <li key={t.id}><strong>{t.number}</strong><span>{t.source === 'manual' ? 'Manual' : 'Digital'}</span><span className={t.won ? 'ticket-won' : 'ticket-eligible'}>{t.won ? 'Ganador' : 'Participa en la rifa'}</span></li>)}</ul> : <p className="empty">Sin tiquetes registrados.</p>;
}
export function TicketWallet({ tickets, error, ready }: { tickets: ParticipantTicket[]; error: string; ready: boolean }) {
  return <section className="ticket-wallet" aria-label="Mis tiquetes"><h2>Mis tiquetes</h2>{error ? <p className="form-error" role="alert">{error}</p> : !ready ? <p>Cargando tiquetes…</p> : <><p><b>{tickets.length}</b> en total · {tickets.filter(t => t.source === 'digital').length} digitales · {tickets.filter(t => t.source === 'manual').length} manuales</p><TicketCodes tickets={tickets}/><p className="muted">Cada código identifica uno de tus tiquetes. Los marcados como ganadores ya fueron premiados y se conservan aquí para consulta.</p></>}</section>;
}
