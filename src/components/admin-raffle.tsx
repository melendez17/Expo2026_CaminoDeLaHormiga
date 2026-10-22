'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LocalData } from '@/lib/local-game';
import { addManual, digitalTickets, drawRaffle, raffleKey, readRaffle, type RaffleState, type RaffleTicket } from '@/lib/raffle';
export function AdminRaffle({ data }: { data: LocalData }) {
  const [state, setState] = useState<RaffleState>({ manual: [], history: [] });
  const [digital, setDigital] = useState<RaffleTicket[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const busy = useRef(false);
  const [reel, setReel] = useState<{ id: string; tickets: RaffleTicket[] } | null>(null);
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    if (!spinning) return;
    const timer = window.setTimeout(() => setSpinning(false), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 4300);
    return () => window.clearTimeout(timer);
  }, [spinning]);
  useEffect(() => {
    const load = () => { try { setState(readRaffle(data, localStorage)); setDigital(digitalTickets(data, localStorage)); setReady(true); setError(''); } catch (e) { setReady(false); setError(e instanceof Error ? e.message : 'No se pudo cargar la rifa.'); } };
    load(); window.addEventListener('storage', load); window.addEventListener('focus', load);
    return () => { window.removeEventListener('storage', load); window.removeEventListener('focus', load); };
  }, [data]);
  async function update(action: (current: RaffleState) => RaffleState, afterSave?: (next: RaffleState) => void) {
    if (busy.current || spinning) return;
    busy.current = true;
    try {
      // Serialize writes across tabs so two draws cannot select the same ticket.
      await navigator.locks.request(raffleKey(data), () => {
        const next = action(readRaffle(data, localStorage));
        localStorage.setItem(raffleKey(data), JSON.stringify(next)); setState(next); setError(''); afterSave?.(next);
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Revisa el almacenamiento del navegador.'); }
    finally { busy.current = false; }
  }
  function spin() {
    let pool: RaffleTicket[] = [];
    void update(current => {
      const digital = digitalTickets(data, localStorage);
      const used = new Set(current.history.map(h => h.winner.id));
      pool = [...digital, ...current.manual].filter(t => !used.has(t.id));
      return drawRaffle(current, digital);
    }, next => {
      const result = next.history[0];
      // The saved random result is the exact final item in the visual reel.
      const tickets = Array.from({ length: 36 }, (_, i) => pool[i % pool.length]);
      setReel({ id: result.id, tickets: [...tickets, result.winner] });
      setSpinning(true);
    });
  }
  const used = new Set(state.history.map(h => h.winner.id));
  const digitalCount = digital.filter(t => !used.has(t.id)).length;
  const manualCount = state.manual.filter(t => !used.has(t.id)).length;
  const visibleHistory = spinning ? state.history.slice(1) : state.history;
  const winner = visibleHistory[0];
  return <section className="admin-raffle" aria-labelledby="raffle-title">
    <h2 id="raffle-title">Rifa aleatoria</h2>
    <p>Participan juntos los tiquetes digitales ganados y los manuales registrados. Cada tiquete tiene la misma probabilidad; un tiquete ganador no vuelve a participar.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="raffle-draw"><div><h3>Tiquetes disponibles</h3><p><b>{digitalCount}</b> digitales · <b>{manualCount}</b> manuales · <b>{digitalCount + manualCount}</b> en total</p><p>Los votos emitidos no descuentan tiquetes de la rifa.</p></div><button className="primary" disabled={!ready || spinning || digitalCount + manualCount === 0} onClick={spin}>{spinning ? 'Sorteando…' : 'Sortear ganador'}</button></div>
    <div className={`raffle-stage ${spinning ? 'is-spinning' : ''}`} aria-label="Ruleta de tiquetes" aria-busy={spinning}>
      <div className="raffle-stage-heading"><span>{spinning ? 'La suerte está girando' : reel ? 'Tenemos un ganador' : '¿Quién será el próximo ganador?'}</span><small>RIFA EXPO TEC</small></div>
      <div className="raffle-window" aria-hidden="true"><div className="raffle-selection" />{reel ? <div key={reel.id} className="raffle-reel" style={{ '--reel-end': `-${(reel.tickets.length - 1) * 88}px` } as CSSProperties}>{reel.tickets.map((ticket, i) => <div className="raffle-reel-ticket" key={i}><b>{ticket.number}</b><span>{ticket.name} · {ticket.source === 'digital' ? 'Digital' : 'Manual'}</span></div>)}</div> : <div className="raffle-reel-ticket raffle-reel-placeholder"><b>Tu próximo ganador</b><span>Digitales y manuales en una sola ruleta</span></div>}</div>
      <p role="status">{spinning ? 'Los tiquetes están pasando…' : reel ? 'Sorteo finalizado. Consulta el resultado a continuación.' : 'Presiona Sortear ganador para comenzar.'}</p>
    </div>
    {ready && !spinning && !digitalCount && !manualCount && <p>No hay tiquetes disponibles. Registra un tiquete manual o completa la ruta de un participante.</p>}
    {winner && !spinning && <div className="raffle-winner" role="status"><h3>Último ganador</h3><strong>{winner.winner.name}</strong><p className="raffle-winner-email">{winner.winner.email || 'Correo sin registrar'}</p><p>Tiquete ganador: <b>{winner.winner.number}</b> · {winner.winner.source === 'digital' ? 'Digital' : 'Manual'}</p></div>}
    <section className="admin-editor"><h3>Registrar tiquete manual</h3><form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const fields = new FormData(form); void update(current => addManual(current, String(fields.get('name')), String(fields.get('number')), String(fields.get('email')))); }}><label>Nombre del participante<input name="name" required maxLength={160} /></label><label>Correo electrónico del participante<input name="email" type="email" required maxLength={254} /></label><label>Número de tiquete manual<input name="number" required maxLength={80} /></label><div><button type="submit" disabled={!ready || spinning}>Registrar tiquete</button></div></form></section>
    {state.manual.length > 0 && <details><summary>Tiquetes manuales registrados ({state.manual.length})</summary><ul>{state.manual.map(t => <li key={t.id}>{t.number} · {t.name} · {t.email || 'Correo sin registrar'}{used.has(t.id) ? ' · Ganador' : ''}</li>)}</ul></details>}
    <h3>Historial de sorteos</h3>
    {!visibleHistory.length ? <p>Aún no se han realizado sorteos.</p> : <div className="raffle-table"><table><thead><tr><th scope="col">Fecha y hora (Costa Rica)</th><th scope="col">Ganador</th><th scope="col">Correo electrónico</th><th scope="col">Tiquete ganador</th><th scope="col">Tipo</th><th scope="col">Tiquetes participantes</th></tr></thead><tbody>{visibleHistory.map(h => <tr key={h.id}><td><time dateTime={h.at}>{new Date(h.at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}</time></td><td>{h.winner.name}</td><td>{h.winner.email || 'Sin registrar'}</td><td>{h.winner.number}</td><td>{h.winner.source === 'digital' ? 'Digital' : 'Manual'}</td><td>{h.total}</td></tr>)}</tbody></table></div>}
    <p className="muted">El registro y el historial se conservan únicamente en este navegador para esta versión del evento.</p>
  </section>;
}
