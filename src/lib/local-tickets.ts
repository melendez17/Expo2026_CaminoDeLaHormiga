import { z } from 'zod';
import {loadLocalProgress} from './progress-storage';
import { adminRows } from './local-admin';
import { findUser, freshProgress, parseProgress, storageKey, type LocalData } from './local-game';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
function assertAdmin(data: LocalData, actorId: string) {
  if (!data.users.some(u => u.id === actorId && u.role === 'admin')) throw Error('Solo un administrador puede emitir tiquetes o realizar rifas.');
}
export function issueManualTicket(data: LocalData, store: Store, actorId: string, token: string, id = crypto.randomUUID()) {
  assertAdmin(data, actorId);
  const user = findUser(data, token);
  if (!user || user.role === 'admin') throw Error('Ingresa el token de un participante válido.');
  const progress=loadLocalProgress(data,store,user.id,false);
  if (progress.manualTickets.some(t => t.id === id)) return { user, ticket: progress.manualTickets.find(t => t.id === id)! };
  const ticket = { id, actorId, at: new Date().toISOString() };
  const next = parseProgress(data, user.id, { ...progress, manualTickets: [...progress.manualTickets, ticket] });
  store.setItem(storageKey(data, user.id), JSON.stringify(next));
  return { user, ticket };
}
export function raffleTickets(data: LocalData, store: Pick<Storage,'getItem'>) {
  const rows = adminRows(data, store);
  const tickets = rows.flatMap(row => {
    if (!row.progress || !row.stats) return [];
    const owner = { userId: row.user.id, name: row.user.name, token: row.user.token };
    return [
      ...Array.from({length: row.stats.digitalTickets}, (_,i) => ({ ...owner, id: `digital:${row.user.id}:${i+1}`, code: `D-${row.user.token}-${String(i+1).padStart(3,'0')}`, source: 'digital' as const, issuedAt: null, issuedBy: null })),
      ...row.progress.manualTickets.map(t => ({ ...owner, id: `manual:${t.id}`, code: `M-${t.id}`, source: 'manual' as const, issuedAt: t.at, issuedBy: data.users.find(u=>u.id===t.actorId)?.name??'Admin' }))
    ];
  });
  if (new Set(tickets.map(t => t.id)).size !== tickets.length) throw Error('Hay identificadores de tiquetes duplicados. Revisa los registros antes de sortear.');
  return { tickets, invalidUsers: rows.filter(r => r.error).length };
}
const drawSchema = z.object({id:z.string().min(1),ticketId:z.string().min(1),ticketCode:z.string().min(1),winnerId:z.string().min(1),winnerName:z.string().min(1),source:z.enum(['digital','manual']),at:z.iso.datetime(),actorId:z.string().min(1),poolSize:z.number().int().positive(),prize:z.string().max(120)});
export type RaffleDraw = z.infer<typeof drawSchema>;
const ledgerSchema = z.object({ version:z.literal(1),dataVersion:z.string(),draws:z.array(drawSchema) });
export const raffleKey = (data:LocalData) => `camino-raffle:${data.settings.dataVersion}`;
export function readDraws(data:LocalData,store:Pick<Storage,'getItem'>): RaffleDraw[] {
  const raw=store.getItem(raffleKey(data));
  if (!raw) return [];
  const parsed=ledgerSchema.safeParse(JSON.parse(raw));
  if (!parsed.success || parsed.data.dataVersion!==data.settings.dataVersion) throw Error('El registro de sorteos no es válido. No se sobrescribió el historial.');
  const draws=parsed.data.draws;
  if (new Set(draws.map(d=>d.id)).size!==draws.length || new Set(draws.map(d=>d.ticketId)).size!==draws.length) throw Error('El historial contiene sorteos o tiquetes ganadores duplicados.');
  return draws;
}
export function secureIndex(length:number) {
  if (!Number.isSafeInteger(length)||length<1||length>4294967296) throw Error('Cantidad de tiquetes no válida.');
  const limit=4294967296-(4294967296%length),values=new Uint32Array(1);
  do { crypto.getRandomValues(values); } while(values[0]>=limit);
  return values[0]%length;
}
export function drawTicket(data:LocalData,store:Store,actorId:string,prize='',randomIndex=secureIndex) {
  assertAdmin(data,actorId);
  const draws=readDraws(data,store), won=new Set(draws.map(d=>d.ticketId));
  const pool=raffleTickets(data,store).tickets.filter(t=>!won.has(t.id));
  if (!pool.length) throw Error('No hay tiquetes disponibles para la rifa.');
  const index=randomIndex(pool.length);
  if (!Number.isInteger(index)||index<0||index>=pool.length) throw Error('No se pudo obtener un resultado aleatorio válido.');
  const ticket=pool[index];
  const draw=drawSchema.parse({id:crypto.randomUUID(),ticketId:ticket.id,ticketCode:ticket.code,winnerId:ticket.userId,winnerName:ticket.name,source:ticket.source,at:new Date().toISOString(),actorId,poolSize:pool.length,prize:prize.trim()});
  store.setItem(raffleKey(data),JSON.stringify({version:1,dataVersion:data.settings.dataVersion,draws:[...draws,draw]}));
  return draw;
}
