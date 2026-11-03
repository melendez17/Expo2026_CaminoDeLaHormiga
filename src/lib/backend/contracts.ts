import { z } from "zod";
import { participantAreas } from "../taxonomy";
import { assignmentRulesSchema } from "../assignment-rules";
export const requestId = z.uuid();
export const entityId = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[\p{L}\p{N}_.:-]+$/u);
export const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const area = z
  .string()
  .refine(
    (value) => participantAreas.some((a) => a.value === value),
    "Área no válida.",
  );
export const profileInput = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    firstSurname: z.string().trim().min(1).max(100),
    secondSurname: z.string().trim().min(1).max(100),
    email,
    role: z.enum(["visitor", "admission"]),
    area,
    consent: z.literal(true),
  })
  .strict();
export const createUserInput = profileInput.extend({
  requestId,
  delivery: z.enum(["card", "email", "both"]).default("card"),
});
export const updateUserInput = profileInput
  .omit({ consent: true })
  .partial()
  .extend({
    requestId,
    expectedVersion: z.number().int().nonnegative(),
    active: z.boolean().optional(),
  })
  .strict();
export const commandInput = z.object({ requestId }).strict();
export const answerInput = z
  .object({
    requestId,
    challengeId: entityId,
    answers: z
      .record(z.string().min(1).max(100), z.string().max(2000))
      .refine((value) => Object.keys(value).length <= 12),
  })
  .strict();
export const surveyInput = z
  .object({
    requestId,
    expectations: z.string().trim().min(5).max(1000),
    interest: z.string().trim().min(2).max(160),
    satisfaction: z.number().int().min(1).max(5),
  })
  .strict();
export const voteInput = z.object({ requestId, projectId: entityId }).strict();
export const manualInput = z
  .object({
    requestId,
    token: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{4}$/),
  })
  .strict();
export const assignmentInput = z
  .object({
    requestId,
    mode: z.enum(["prepare", "replace", "remove", "add"]),
    fromId: entityId.optional(),
    category: z.string().max(150).optional(),
    level: z.union([z.literal(10), z.literal(11)]).optional(),
    scope: z.enum(["route", "extra", "visitor"]).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const catalogInput = z
  .object({
    requestId,
    expectedVersion: z.number().int().positive(),
    resource: z.enum(["projects", "challenges", "agenda", "assignmentRules"]),
    operation: z.enum(["create", "update", "delete"]),
    id: entityId.optional(),
    value: z.unknown(),
  })
  .strict();
export const rulesInput = z
  .object({
    requestId,
    expectedVersion: z.number().int().positive(),
    assignmentRules: assignmentRulesSchema,
  })
  .strict();
export const activateInput = z
  .object({ credential: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const emailAccessInput = z
  .object({
    email,
    token: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-F0-9]{4}$/),
  })
  .strict();
export const verifyEmailInput = z
  .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{8}$/) })
  .strict();
export const raffleInput = z
  .object({ requestId, prize: z.string().trim().min(1).max(120) })
  .strict();
export const raffleSettingsInput = z
  .object({
    requestId,
    expectedVersion: z.number().int().positive(),
    votingOpen: z.boolean().optional(),
    raffleOpen: z.boolean().optional(),
  })
  .strict();
export const rotateInput = z
  .object({ requestId, reason: z.string().trim().min(3).max(500) })
  .strict();
export type Registration = z.infer<typeof profileInput>;
