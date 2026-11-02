'use client';
import { useRef, useState } from 'react';
import type { LocalData, LocalUser } from '@/lib/local-game';
import { normalize } from '@/lib/local-game';
import { issueManualTicket, raffleTickets, readDraws, type RaffleDraw } from '@/lib/local-tickets';
import { AdminRaffle } from './admin-raffle';
import { AdminPagination } from './admin-pagination';
const date = (value:string)=>new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date(value));
export function AdminTickets({data,actor,onIssued}:{data:LocalData;actor:LocalUser;onIssued:()=>void}) {
  const [token,setToken]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [issuing,setIssuing]=useState(false),issuingRef=useRef(false);
  let draws:RaffleDraw[]=[],pool:ReturnType<typeof raffleTickets>={tickets:[],invalidUsers:0},loadError='';
  try {draws=readDraws(data,localStorage);pool=raffleTickets(data,localStorage);} catch(e) {loadError=e instanceof Error?e.message:'No se pudieron leer los tiquetes.';}
  const won=new Set(draws.map(d=>d.ticketId));
  const list=pool.tickets.filter(t=>normalize(`${t.name} ${t.token} ${t.code}`).includes(normalize(search)));
  const pages=Math.max(1,Math.ceil(list.length/10)),current=Math.min(page,pages);
  return <section className="admin-ticket-section"><h2>Tiquetes</h2><p className="muted">Los tiquetes y sorteos se guardan en este navegador. Los votos emitidos conservan la participación en la rifa.</p>
    {(error||loadError)&&<p className="form-error" role="alert">{error||loadError}</p>}{message&&<p className="feedback" role="status">{message}</p>}
    <div className="ticket-actions-grid tickets-only"><section className="ticket-issue-panel"><h3>Crear tiquete manual</h3><p>Para los retos realizados en papel. Ingresa el token y crea un tiquete virtual con un voto disponible.</p><form onSubmit={async e=>{e.preventDefault();if(issuingRef.current)return;issuingRef.current=true;setIssuing(true);setError('');setMessage('');try{const issue=()=>issueManualTicket(data,localStorage,actor.id,token);const issued=navigator.locks?await navigator.locks.request(`camino-manual:${data.settings.dataVersion}:${token.trim().toUpperCase()}`,issue):issue();setToken('');setMessage(`Tiquete ${issued.ticketCode} creado para ${issued.user.name}.`);onIssued();}catch(e){setError(e instanceof Error?e.message:'No se pudo crear el tiquete.');}finally{issuingRef.current=false;setIssuing(false);}}}><label>Token del participante<input value={token} onChange={e=>setToken(e.target.value.toUpperCase())} maxLength={4} minLength={4} pattern="[A-Za-z0-9]{4}" placeholder="K8P2" required autoComplete="off"/></label><button className="primary" disabled={!!loadError||issuing}>{issuing?'Creando…':'Crear'}</button></form></section>
    </div>

    {!!pool.invalidUsers&&<p className="form-error">Se excluyeron {pool.invalidUsers} participantes con progreso no válido. Revisa sus datos antes de continuar.</p>}
    <div className="ranking-list-heading"><h3>Registro de tiquetes</h3><label className="admin-search"><span className="sr-only">Buscar tiquete</span><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Nombre, token o tiquete"/></label></div>
    <div className="admin-table-wrap"><table className="admin-data-table ticket-register"><thead><tr><th>Tiquete</th><th>Participante</th><th>Origen</th><th>Estado</th></tr></thead><tbody>{list.slice((current-1)*10,current*10).map(t=><tr key={t.id}><td><code>{t.code}</code></td><td>{t.name}<small>Token: {t.token}</small></td><td>{t.source==='manual'?'Manual · papel':'Retos digitales'}{t.issuedAt&&<small>{date(t.issuedAt)}<br/>Emisor: {t.issuedBy}</small>}</td><td>{won.has(t.id)?'Ganador':'Disponible'}</td></tr>)}</tbody></table></div>{!list.length&&<p className="empty">{search?'No encontramos tiquetes con esa búsqueda.':'Todavía no hay tiquetes. Completa retos o crea uno manual con el token.'}</p>}
    <AdminPagination page={current} pageCount={pages} total={list.length} size={10} onChange={setPage} label="Páginas de tiquetes"/>
    <AdminRaffle data={data} actor={actor} onDrawn={onIssued}/>
  </section>;
}
