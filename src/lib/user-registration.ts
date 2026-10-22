import { z } from 'zod';
import type { LocalData, LocalUser } from './local-game';
export const normalizeNationalId = (value: string) => value.trim().replace(/[\s-]/g, '');
const registrationSchema = z.object({
  kind: z.enum(['visitor', 'applicant'], 'Selecciona si la persona es visitante o postulante.'),
  nationalId: z.string().transform(normalizeNationalId).pipe(z.string().regex(/^\d{1,30}$/, 'Ingresa una cédula válida con números, espacios o guiones.')),
  name: z.string().trim().min(2, 'Ingresa el nombre completo.').max(160),
  email: z.union([z.email('Ingresa un correo electrónico válido.').max(254), z.literal('')]).optional()
});
export function generateUserToken(users: Pick<LocalUser, 'token'>[], next = () => crypto.getRandomValues(new Uint32Array(1))[0]): string {
  const used = new Set(users.map(u => u.token));
  const available = Array.from({ length: 10000 }, (_, i) => String(i).padStart(4, '0')).filter(t => !used.has(t));
  if (!available.length) throw Error('No quedan tokens de cuatro dígitos disponibles. No se creó el usuario.');
  const limit = Math.floor(0x100000000 / available.length) * available.length;
  let value: number; do { value = next(); } while (value >= limit);
  return available[value % available.length];
}
export function createParticipant(data: LocalData, input: { nationalId: string; name: string; email?: string; kind: LocalUser['kind'] }): LocalUser {
  const parsed = registrationSchema.safeParse({ ...input, email: input.email?.trim() });
  if (!parsed.success) throw Error(parsed.error.issues[0].message);
  if (data.users.some(u => u.nationalId === parsed.data.nationalId)) throw Error('Ya existe un usuario con esa cédula. Busca su registro en Usuarios.');
  return { id: crypto.randomUUID(), ...parsed.data, token: generateUserToken(data.users), role: 'participant' };
}
