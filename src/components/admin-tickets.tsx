'use client';
import { useState } from 'react';
import { normalize } from '@/lib/local-game';
import type { useTicketLedger } from './use-ticket-ledger';
import { AdminPagination } from './admin-pagination';
export function AdminTickets({ tickets, error, ready }: ReturnType<typeof useTicketLedger>) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const [status, setStatus] = useState('');
  const [size, setSize] = useState(0);
  const [page, setPage] = useState(1);
  const query = normalize(search);
  const filtered = tickets.filter(t => normalize(`${t.name} ${t.token} ${t.number}`).includes(query) && (!source || t.source === source) && (!status || (status === 'winner' ? t.won : !t.won)));
  const digital = filtered.filter(t => t.source === 'digital').length;
  const manual = filtered.filter(t => t.source === 'manual').length;
  const pages = size ? Math.max(1, Math.ceil(filtered.length / size)) : 1;
  const current = Math.min(page, pages);
  const visible = size ? filtered.slice((current - 1) * size, current * size) : filtered;
  return <section className="admin-tickets" aria-label="Todos los tiquetes"><h2>Todos los tiquetes</h2><p>Consulta los códigos digitales y manuales de todos los participantes, incluidos los tiquetes ganadores.</p>
    <div className="ticket-filters"><label>Buscar por nombre, token o código<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Por ejemplo: Ana o K8P2"/></label><label>Origen del tiquete<select value={source} onChange={e => { setSource(e.target.value); setPage(1); }}><option value="">Todos los orígenes</option><option value="digital">Digital</option><option value="manual">Manual</option></select></label><label>Estado del tiquete<select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todos los estados</option><option value="eligible">Participa en la rifa</option><option value="winner">Ganador</option></select></label><label>Tiquetes por página<select value={size} onChange={e => { setSize(Number(e.target.value)); setPage(1); }}><option value={0}>Todos</option><option value={25}>25 por página</option><option value={50}>50 por página</option></select></label></div>
    {error ? <p className="form-error" role="alert">{error}</p> : !ready ? <p>Cargando tiquetes…</p> : <><p role="status">{filtered.length} de {tickets.length} tiquetes · {digital} {digital === 1 ? 'digital' : 'digitales'} · {manual} {manual === 1 ? 'manual' : 'manuales'}</p>{!filtered.length ? <p className="empty">{tickets.length ? 'No encontramos tiquetes con esos filtros.' : 'Todavía no hay tiquetes registrados.'}</p> : <div className="all-tickets-table" role="region" aria-label="Listado de tiquetes" tabIndex={0}><table><thead><tr><th scope="col">Código del tiquete</th><th scope="col">Participante</th><th scope="col">Token</th><th scope="col">Origen</th><th scope="col">Estado</th></tr></thead><tbody>{visible.map(t => <tr key={t.id}><td><strong>{t.number}</strong></td><td>{t.name}</td><td>{t.token}</td><td>{t.source === 'manual' ? 'Manual' : 'Digital'}</td><td className={t.won ? 'ticket-won' : 'ticket-eligible'}>{t.won ? 'Ganador' : 'Participa en la rifa'}</td></tr>)}</tbody></table></div>}{size > 0 && <AdminPagination page={current} pageCount={pages} total={filtered.length} size={size} onChange={setPage} label="Páginas de todos los tiquetes"/>}</>}
  </section>;
}
