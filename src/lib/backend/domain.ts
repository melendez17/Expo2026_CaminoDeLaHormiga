import { randomInt } from "node:crypto";
import {
  localDataSchema,
  freshProgress,
  parseProgress,
  startLocal,
  completeLocal,
  generateExtras,
  summary,
  routeChallenges,
  currentVisitorRound,
  saintQuestion,
  type LocalData,
  type LocalProgress,
  type LocalUser,
  type Answers,
} from "../local-game";
import { hasIncorrectAnswer } from "../incorrect-answer";
import { addExtraForWrongAnswer, validateAnswers } from "../local-game";
import { failedAttempts, failedAttemptDetails } from "../failed-attempts";
import { storageKey } from "../local-game";
import { issueManualTicket } from "../local-tickets";
import {
  prepareAssignments,
  changeAssignment,
  changeAssignmentByCategory,
} from "../admin-assignments";
import { BackendError } from "./errors";
export const secureRandom = () => randomInt(0x100000000) / 0x100000000;
export function participantData(
  catalog: Omit<LocalData, "users">,
  users: LocalUser[],
): LocalData {
  return localDataSchema.parse({
    ...catalog,
    users: users.map((user) => {
      const { area, ...rest } = user;
      return { ...rest, ...(area ? { area } : {}) };
    }),
  });
}
export function executeCommand(
  data: LocalData,
  progress: LocalProgress,
  command: string,
  input: Record<string, unknown>,
  actorId: string,
): { progress: LocalProgress; result: Record<string, unknown> } {
  let next = progress,
    result: Record<string, unknown> = {};
  try {
    if (command === "start") next = startLocal(data, progress, secureRandom);
    else if (command === "next")
      next = generateExtras(data, progress, secureRandom);
    else if (command === "answer") {
      const id = String(input.challengeId),
        answers = input.answers as Answers,
        c = data.challenges.find((c) => c.id === id);
      if (!c)
        throw new BackendError(404, "challenge_missing", "Reto no disponible.");
      const assigned =
        routeChallenges(data, progress).some((task) => task.id === id) ||
        progress.extraIds.includes(id);
      const current =
        !progress.visitorRounds.length ||
        currentVisitorRound(data, progress).some((task) => task.id === id) ||
        progress.extraIds.includes(id);
      if (
        !assigned ||
        (!current &&
          !progress.completed.some((done) => done.challengeId === id))
      )
        throw new BackendError(
          403,
          "challenge_not_assigned",
          "Este reto no pertenece a tus pendientes actuales.",
        );
      const allowed =
        c.kind === "freeform"
          ? ["projectName", "level", "description"]
          : c.kind === "saint"
            ? ["saintChoice"]
            : ["code", ...(c.questions ?? []).map((q) => q.id)];
      if (Object.keys(answers).some((key) => !allowed.includes(key)))
        throw new BackendError(
          400,
          "invalid_answers",
          "La respuesta contiene campos no permitidos.",
        );
      if (hasIncorrectAnswer(c, answers)) {
        next = addExtraForWrongAnswer(
          data,
          progress,
          id,
          answers,
          secureRandom,
        );
        const saved = next.failedExtras.at(-1)!;
        const attempt = failedAttempts(data, next).find(
          (attempt) =>
            attempt.challenge.id === saved.challengeId &&
            attempt.at === saved.at,
        )!;
        result = {
          outcome: "incorrect",
          challengeId: id,
          replacementId: next.failedExtras.at(-1)!.replacementId,
          corrections: failedAttemptDetails(attempt),
        };
      } else {
        const error = validateAnswers(c, answers);
        if (error) throw new BackendError(422, "invalid_answers", error);
        next = completeLocal(data, progress, id, answers);
        result = { outcome: "correct", duplicate: next === progress };
      }
    } else if (command === "survey") {
      if (!summary(data, progress).routeComplete)
        throw new BackendError(
          409,
          "route_incomplete",
          "Completa tu primera ronda o ruta base.",
        );
      if (!progress.survey)
        next = {
          ...progress,
          survey: {
            expectations: String(input.expectations),
            interest: String(input.interest),
            satisfaction: Number(input.satisfaction),
          },
        };
    } else if (command === "vote") {
      if (summary(data, progress).votesAvailable <= 0)
        throw new BackendError(409, "no_votes", "No tienes votos disponibles.");
      if (!data.projects.some((p) => p.id === input.projectId))
        throw new BackendError(
          404,
          "project_missing",
          "Proyecto no disponible.",
        );
      next = {
        ...progress,
        votes: [
          ...progress.votes,
          { projectId: String(input.projectId), at: new Date().toISOString() },
        ],
      };
    } else if (command === "manual" || command === "assignment") {
      const values = new Map([
          [storageKey(data, progress.userId), JSON.stringify(progress)],
        ]),
        store = {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => {
            values.set(key, value);
          },
        };
      if (command === "manual") {
        const user = data.users.find((u) => u.id === progress.userId)!;
        const issued = issueManualTicket(data, store, actorId, user.token);
        result = { ticketCode: issued.ticketCode };
        next = parseProgress(
          data,
          user.id,
          JSON.parse(store.getItem(storageKey(data, user.id))!),
        );
      } else {
        const mode = String(input.mode),
          reason = String(input.reason);
        if (mode === "prepare")
          next = prepareAssignments(data, store, actorId, progress.userId);
        else if (mode === "remove")
          next = changeAssignment(data, store, actorId, progress.userId, {
            fromId: String(input.fromId),
            reason,
          });
        else
          next = changeAssignmentByCategory(
            data,
            store,
            actorId,
            progress.userId,
            {
              fromId:
                typeof input.fromId === "string" ? input.fromId : undefined,
              category: String(input.category),
              level: input.level as 10 | 11 | undefined,
              scope: input.scope as "route" | "extra" | "visitor" | undefined,
              reason,
            },
          );
      }
    } else
      throw new BackendError(
        404,
        "command_missing",
        "Operación no disponible.",
      );
    next = parseProgress(data, progress.userId, next);
    return { progress: next, result };
  } catch (error) {
    if (error instanceof BackendError) throw error;
    throw new BackendError(
      409,
      "journey_rule",
      error instanceof Error
        ? error.message
        : "No se pudo actualizar el recorrido.",
    );
  }
}
export function publicChallenge(challenge: LocalData["challenges"][number]) {
  const { code, answer, questions, ...safe } = challenge;
  return { ...safe, questions: questions?.map(({ correctIndex, ...q }) => q) };
}
export function participantView(
  data: LocalData,
  user: LocalUser,
  progress: LocalProgress,
  version: number,
) {
  const assigned = !progress.startedAt
    ? []
    : progress.visitorRounds.length
      ? progress.visitorRounds.slice(0, progress.visitorRoundIndex + 1).flat()
      : routeChallenges(data, progress).map((c) => c.id);
  const ids = new Set([...assigned, ...progress.extraIds]);
  return {
    user,
    version,
    stats: summary(data, progress),
    progress: {
      startedAt: progress.startedAt,
      routeIds: progress.routeIds,
      visitorRounds: progress.visitorRounds.slice(
        0,
        progress.visitorRoundIndex + 1,
      ),
      visitorRoundIndex: progress.visitorRoundIndex,
      extraIds: progress.extraIds,
      completed: progress.completed,
      votes: progress.votes,
      survey: progress.survey,
      manualTickets: progress.manualTickets.map(({ id, at }) => ({ id, at })),
    },
    challenges: data.challenges
      .filter((c) => ids.has(c.id))
      .map(publicChallenge),
    failedAttempts: failedAttempts(data, progress).map((attempt) => ({
      id: attempt.id,
      challenge: publicChallenge(attempt.challenge),
      at: attempt.at,
      replacementId: attempt.currentId,
      details: failedAttemptDetails(attempt),
    })),
  };
}
export function projection(data: LocalData, progress: LocalProgress) {
  const route = progress.startedAt ? routeChallenges(data, progress) : [];
  return {
    assignments: [
      ...route.map((c) => ({
        challengeId: c.id,
        phase:
          (progress.visitorRounds.length &&
            progress.visitorRounds[0].includes(c.id)) ||
          !progress.visitorRounds.length
            ? "base"
            : "additional",
        round: progress.visitorRounds.length
          ? progress.visitorRounds.findIndex((r) => r.includes(c.id))
          : 0,
      })),
      ...progress.extraIds.map((id) => ({
        challengeId: id,
        phase: "additional",
        round: progress.visitorRoundIndex,
      })),
    ],
    stats: summary(data, progress),
  };
}
