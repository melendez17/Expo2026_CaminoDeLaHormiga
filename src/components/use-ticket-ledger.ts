'use client';
import { useEffect, useState } from 'react';
import type { LocalData } from '@/lib/local-game';
import { ticketLedger, TICKETS_CHANGED, type ParticipantTicket } from '@/lib/ticket-ledger';
export function useTicketLedger(data: LocalData | null, userId?: string, revision?: unknown) {
  const [ledger, setLedger] = useState<{ tickets: ParticipantTicket[]; error: string; ready: boolean }>({ tickets: [], error: '', ready: false });
  useEffect(() => {
    const load = () => {
      if (!data) { setLedger({ tickets: [], error: '', ready: false }); return; }
      try { setLedger({ tickets: ticketLedger(data, localStorage, userId), error: '', ready: true }); }
      catch (e) { setLedger({ tickets: [], error: e instanceof Error ? e.message : 'No se pudieron leer los tiquetes.', ready: true }); }
    };
    load();
    window.addEventListener('storage', load); window.addEventListener('focus', load); window.addEventListener(TICKETS_CHANGED, load);
    return () => { window.removeEventListener('storage', load); window.removeEventListener('focus', load); window.removeEventListener(TICKETS_CHANGED, load); };
  }, [data, userId, revision]);
  return ledger;
}
