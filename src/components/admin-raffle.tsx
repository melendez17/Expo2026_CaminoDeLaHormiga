'use client';
import { useEffect, useRef, useState } from 'react';
import type { LocalData } from '@/lib/local-game';
import { addManual, digitalTickets, drawRaffle, raffleKey, readRaffle, type RaffleState, type RaffleTicket } from '@/lib/raffle';
export function AdminRaffle({ data }: { data: LocalData }) {
  const [state, setState] = useState<RaffleState>({ manual: [], history: [] });
  const [digital, setDigital] = useState<RaffleTicket[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    const load = () => { try { setState(readRaffle(data, localStorage)); setDigital(digitalTickets(data, localStorage)); setReady(true); setError(''); } catch (e) { setReady(false); setError(e instanceof Error ? e.message : 'No se pudo cargar la rifa.'); } };
    load(); window.addEventListener('storage', load); window.addEventListener('focus', load);
    return () => { window.removeEventListener('storage', load); window.removeEventListener('focus', load); };
  }, [data]);
  async function update(action: (current: RaffleState) => RaffleState) {
    if (busy.current) return;
    busy.current = true;
    try {
      // Serialize writes across tabs so two draws cannot select the same ticket.
      await navigator.locks.request(raffleKey(data), () => {
        const next = action(readRaffle(data, localStorage));
        localStorage.setItem(raffleKey(data), JSON.stringify(next)); setState(next); setError('');
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Revisa el almacenamiento del navegador.'); }
    finally { busy.current = false; }
  }
  const used = new Set(state.history.map(h => h.winner.id));
  const digitalCount = digital.filter(t => !used.has(t.id)).length;
  const manualCount = state.manual.filter(t => !used.has(t.id)).length;
  const winner = state.history[0];
  return <section className="admin-raffle" aria-labelledby="raffle-title">
    <h2 id="raffle-title">Rifa aleatoria</h2>
    <p>Participan juntos los tiquetes digitales ganados y los manuales registrados. Cada tiquete tiene la misma probabilidad; un tiquete ganador no vuelve a participar.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="raffle-draw"><div><h3>Tiquetes disponibles</h3><p><b>{digitalCount}</b> digitales · <b>{manualCount}</b> manuales · <b>{digitalCount + manualCount}</b> en total</p><p>Los votos emitidos no descuentan tiquetes de la rifa.</p></div><button className="primary" disabled={!ready || digitalCount + manualCount === 0} onClick={() => void update(current => drawRaffle(current, digitalTickets(data, localStorage)))}>Sortear ganador</button></div>
    {ready && !digitalCount && !manualCount && <p>No hay tiquetes disponibles. Registra un tiquete manual o completa la ruta de un participante.</p>}
    {winner && <div className="raffle-winner" role="status"><h3>Último ganador</h3><strong>{winner.winner.name}</strong><p>Tiquete ganador: <b>{winner.winner.number}</b> · {winner.winner.source === 'digital' ? 'Digital' : 'Manual'}</p></div>}
    <section className="admin-editor"><h3>Registrar tiquete manual</h3><form onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const fields = new FormData(form); void update(current => addManual(current, String(fields.get('name')), String(fields.get('number')))); }}><label>Nombre del participante<input name="name" required maxLength={160} /></label><label>Número de tiquete manual<input name="number" required maxLength={80} /></label><div><button type="submit" disabled={!ready}>Registrar tiquete</button></div></form></section>
    {state.manual.length > 0 && <details><summary>Tiquetes manuales registrados ({state.manual.length})</summary><ul>{state.manual.map(t => <li key={t.id}>{t.number} · {t.name}{used.has(t.id) ? ' · Ganador' : ''}</li>)}</ul></details>}
    <h3>Historial de sorteos</h3>
    {!state.history.length ? <p>Aún no se han realizado sorteos.</p> : <div className="raffle-table"><table><thead><tr><th scope="col">Fecha y hora (Costa Rica)</th><th scope="col">Ganador</th><th scope="col">Tiquete ganador</th><th scope="col">Tipo</th><th scope="col">Tiquetes participantes</th></tr></thead><tbody>{state.history.map(h => <tr key={h.id}><td><time dateTime={h.at}>{new Date(h.at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}</time></td><td>{h.winner.name}</td><td>{h.winner.number}</td><td>{h.winner.source === 'digital' ? 'Digital' : 'Manual'}</td><td>{h.total}</td></tr>)}</tbody></table></div>}
    <p className="muted">El registro y el historial se conservan únicamente en este navegador para esta versión del evento.</p>
  </section>;
}
