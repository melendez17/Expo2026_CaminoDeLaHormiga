'use client';
import { useRef, useState } from 'react';
import type { LocalData, LocalUser } from '@/lib/local-game';
import { normalize } from '@/lib/local-game';
import { drawTicket, issueManualTicket, raffleTickets, readDraws, type RaffleDraw } from '@/lib/local-tickets';
import { AdminPagination } from './admin-pagination';
const date = (value:string)=>new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
export function AdminTickets({data,actor,onIssued}:{data:LocalData;actor:LocalUser;onIssued:()=>void}) {
  const [token,setToken]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[prize,setPrize]=useState('');
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [result,setResult]=useState<RaffleDraw|null>(()=>{try{return readDraws(data,localStorage).at(-1)??null;}catch{return null;}});
  const drawing=useRef(false);
  let draws:RaffleDraw[]=[],pool:ReturnType<typeof raffleTickets>={tickets:[],invalidUsers:0},loadError='';
  try {draws=readDraws(data,localStorage);pool=raffleTickets(data,localStorage);} catch(e) {loadError=e instanceof Error?e.message:'No se pudieron leer los tiquetes.';}
  const won=new Set(draws.map(d=>d.ticketId));
  const eligible=pool.tickets.filter(t=>!won.has(t.id));
  const list=pool.tickets.filter(t=>normalize(`${t.name} ${t.token} ${t.code}`).includes(normalize(search)));
  const pages=Math.max(1,Math.ceil(list.length/10)),current=Math.min(page,pages);
  return <section className="admin-ticket-section"><h2>Tiquetes y rifa</h2><p className="muted">Los tiquetes y sorteos se guardan en este navegador. Los votos emitidos conservan la participación en la rifa.</p>
    {(error||loadError)&&<p className="form-error" role="alert">{error||loadError}</p>}{message&&<p className="feedback" role="status">{message}</p>}
    <div className="ticket-actions-grid"><section className="ticket-issue-panel"><h3>Crear tiquete manual</h3><p>Para los retos realizados en papel. Ingresa el token y crea un tiquete virtual con un voto disponible.</p><form onSubmit={e=>{e.preventDefault();setError('');setMessage('');try{const issued=issueManualTicket(data,localStorage,actor.id,token);setToken('');setMessage(`Tiquete M-${issued.ticket.id} creado para ${issued.user.name}.`);onIssued();}catch(e){setError(e instanceof Error?e.message:'No se pudo crear el tiquete.');}}}><label>Token del participante<input value={token} onChange={e=>setToken(e.target.value.toUpperCase())} maxLength={4} minLength={4} pattern="[A-Za-z0-9]{4}" placeholder="K8P2" required autoComplete="off"/></label><button className="primary" disabled={!!loadError}>Crear</button></form></section>
    <section className="ticket-draw-panel"><h3>Rifa aleatoria</h3><div className="ticket-pool-count"><strong>{eligible.length}</strong><span>tiquetes disponibles de {pool.tickets.length}</span></div><p>Todos los tiquetes disponibles tienen la misma oportunidad. Cada tiquete puede ganar una vez; una persona puede ganar con distintos tiquetes.</p>{!result?<form onSubmit={e=>{e.preventDefault();if(drawing.current)return;drawing.current=true;setError('');try{setResult(drawTicket(data,localStorage,actor.id,prize));}catch(e){drawing.current=false;setError(e instanceof Error?e.message:'No se pudo sortear.');}}}><label>Premio (opcional)<input value={prize} onChange={e=>setPrize(e.target.value)} maxLength={120} placeholder="Por ejemplo: premio de la mañana"/></label><button className="primary" disabled={!eligible.length||!!loadError}>Sortear un tiquete</button></form>:<div className="raffle-winner" role="status"><span>Tiquete ganador{result.prize?` · ${result.prize}`:''}</span><h4>{result.winnerName}</h4><code>{result.ticketCode}</code><p>{date(result.at)}</p><button onClick={()=>{setResult(null);setPrize('');drawing.current=false;}}>Preparar otro sorteo</button></div>}</section></div>
    {!!pool.invalidUsers&&<p className="form-error">Se excluyeron {pool.invalidUsers} participantes con progreso no válido. Revisa sus datos antes de continuar.</p>}
    <div className="ranking-list-heading"><h3>Registro de tiquetes</h3><label className="admin-search"><span className="sr-only">Buscar tiquete</span><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Nombre, token o tiquete"/></label></div>
    <div className="admin-table-wrap"><table className="admin-data-table ticket-register"><thead><tr><th>Tiquete</th><th>Participante</th><th>Origen</th><th>Estado</th></tr></thead><tbody>{list.slice((current-1)*10,current*10).map(t=><tr key={t.id}><td><code>{t.code}</code></td><td>{t.name}<small>Token: {t.token}</small></td><td>{t.source==='manual'?'Manual · papel':'Retos digitales'}{t.issuedAt&&<small>{date(t.issuedAt)}<br/>Emisor: {t.issuedBy}</small>}</td><td>{won.has(t.id)?'Ganador':'Disponible'}</td></tr>)}</tbody></table></div>{!list.length&&<p className="empty">{search?'No encontramos tiquetes con esa búsqueda.':'Todavía no hay tiquetes. Completa retos o crea uno manual con el token.'}</p>}
    <AdminPagination page={current} pageCount={pages} total={list.length} size={10} onChange={setPage} label="Páginas de tiquetes"/>
    <h3 className="ticket-history-heading">Historial de sorteos</h3>{draws.length?<ol className="raffle-history">{[...draws].reverse().map(d=><li key={d.id}><div><strong>{d.winnerName}</strong><p>{d.prize||'Sorteo sin nombre'} · {date(d.at)} · Entre {d.poolSize} tiquetes · {data.users.find(u=>u.id===d.actorId)?.name??'Admin'}</p></div><code>{d.ticketCode}</code></li>)}</ol>:<p className="empty">El ganador y su tiquete quedarán registrados aquí después del primer sorteo.</p>}
  </section>;
}
