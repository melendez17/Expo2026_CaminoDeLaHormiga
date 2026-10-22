import { z } from 'zod';
import type { LocalData, LocalUser } from './local-game';
const registrationSchema = z.object({
  kind: z.enum(['visitor', 'applicant'], 'Selecciona si la persona es visitante o postulante.'),
  nationalId: z.string().optional(),
  name: z.string().trim().min(2, 'Ingresa el nombre completo.').max(160),
  email: z.union([z.email('Ingresa un correo electrónico válido.').max(254), z.literal('')]).optional()
}).refine(value => value.kind !== 'applicant' || !!value.nationalId?.trim(), { path: ['nationalId'], message: 'Ingresa la identificación del postulante.' });
export type ParticipantInput = { nationalId?: string; name: string; email?: string; kind: LocalUser['kind'] };
export function parseParticipantDetails(input: ParticipantInput) {
  const parsed = registrationSchema.safeParse({ ...input, email: input.email?.trim() });
  if (!parsed.success) throw Error(parsed.error.issues[0].message);
  return { ...parsed.data, nationalId: parsed.data.kind === 'applicant' ? parsed.data.nationalId : undefined };
}
export function generateUserToken(users: Pick<LocalUser, 'token'>[], next = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  const used = new Set(users.map(u => u.token.toUpperCase()));
  const available = Array.from({ length: 0x10000 }, (_, i) => i.toString(16).toUpperCase().padStart(4, '0')).filter(t => !used.has(t));
  if (!available.length) throw Error('No quedan tokens hexadecimales de cuatro caracteres disponibles. No se creó el usuario.');
  const limit = Math.floor(0x100000000 / available.length) * available.length;
  let value: number; do { value = next(); } while (value >= limit);
  return available[value % available.length];
}
export function createParticipant(data: LocalData, input: ParticipantInput): LocalUser {
  const details = parseParticipantDetails(input);
  if (details.nationalId && data.users.some(u => u.kind === 'applicant' && u.nationalId === details.nationalId)) throw Error('Ya existe un postulante con esa identificación. Busca su registro en Usuarios.');
  return { id: crypto.randomUUID(), ...details, token: generateUserToken(data.users), role: 'participant' };
}
