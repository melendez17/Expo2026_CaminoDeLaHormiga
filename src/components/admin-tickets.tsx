'use client';
import { useState } from 'react';
import { normalize, type LocalData } from '@/lib/local-game';
import type { ParticipantTicket } from '@/lib/ticket-ledger';
import { TicketCodes } from './ticket-wallet';
import { AdminPagination } from './admin-pagination';
export function AdminTickets({ data, tickets, error, ready }: { data: LocalData; tickets: ParticipantTicket[]; error: string; ready: boolean }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const users = data.users.filter(u => u.role !== 'admin' && normalize(`${u.name} ${u.token} ${u.email ?? ''}`).includes(normalize(search)));
  const pages = Math.max(1, Math.ceil(users.length / 10));
  const current = Math.min(page, pages);
  return <section className="admin-tickets" aria-label="Tiquetes por participante"><h2>Tiquetes por participante</h2><p>Consulta el total y los códigos digitales y manuales asociados al token de cada participante.</p><label className="project-search">Buscar por nombre, token o correo<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/></label>{error ? <p className="form-error" role="alert">{error}</p> : !ready ? <p>Cargando tiquetes…</p> : <><p>{tickets.length} tiquetes en total · {tickets.filter(t => !t.won).length} disponibles para próximos sorteos</p><div className="participant-ticket-list">{users.slice((current - 1) * 10, current * 10).map(user => {
    const owned = tickets.filter(t => t.userId === user.id);
    return <article key={user.id} aria-label={`Tiquetes de ${user.name}`}><header><div><h3>{user.name}</h3><p>Token: <b>{user.token}</b> · {user.email || 'Correo sin registrar'}</p></div><p><b>{owned.length}</b> tiquetes · {owned.filter(t => t.source === 'digital').length} digitales · {owned.filter(t => t.source === 'manual').length} manuales</p></header><TicketCodes tickets={owned}/></article>;
  })}</div>{!users.length && <p>No encontramos participantes con esa búsqueda.</p>}<AdminPagination page={current} pageCount={pages} total={users.length} size={10} onChange={setPage} label="Páginas de tiquetes"/></>}</section>;
}
