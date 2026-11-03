"use client";
import { ApiClientError, createApiClient } from "./api-client";
import type { participantView } from "./backend/domain";
import type { LocalData, LocalProgress, LocalUser } from "./local-game";
import type { Profile } from "./backend/store";
export type ParticipantState = ReturnType<typeof participantView>;
export type PublicCatalog = {
  version: number;
  projects: LocalData["projects"];
  agenda: LocalData["agenda"];
  settings: LocalData["settings"];
  assignmentRules: LocalData["assignmentRules"];
  votingOpen: boolean;
};
export type UserRecord = Profile & {
  progressVersion: number;
  stats?: ReturnType<typeof import("./local-game").summary>;
  startedAt?: string | null;
  hasSurvey?: boolean;
};
export type RankedProject = LocalData["projects"][number] & {
  votes: number;
  rank: number | null;
  tied: boolean;
};
export type Page<T> = { items: T[]; total: number };
export type Metrics = {
  participants: number;
  started: number;
  completed: number;
  completions: number;
  tickets: number;
  votes: number;
  availableVotes: number;
  attempts: number;
  surveys: number;
};
export type AdminCatalog = {
  lastCreated?: Profile | null;
  version: number;
  catalog: Omit<LocalData, "users">;
  admins: Profile[];
  votingOpen: boolean;
  raffleOpen: boolean;
};
// This adapter owns only transient request state. No credentials, answers or progress are persisted in the browser.
let apiOwner: string | null = null;
export function bindApiUser(id: string | null) {
  apiOwner = id;
}
const client = createApiClient({ userId: () => apiOwner });
const pending = new Map<string, string>();
export function forgetPendingActions() {
  pending.clear();
  apiOwner = null;
}
export async function api<T>(
  path: string,
  method = "GET",
  input?: Record<string, unknown>,
): Promise<T> {
  if (method === "GET") return client.request<T>(method, path);
  const key = method + path + JSON.stringify(input ?? {}),
    requestId = pending.get(key) ?? crypto.randomUUID();
  pending.set(key, requestId);
  try {
    const value = await client.request<T>(method, path, input ?? {}, requestId);
    if (pending.get(key) === requestId) pending.delete(key);
    return value;
  } catch (error) {
    if (
      error instanceof ApiClientError &&
      error.status > 0 &&
      error.status < 500 &&
      error.code !== "invalid_response" &&
      pending.get(key) === requestId
    )
      pending.delete(key);
    throw error;
  }
}
export async function ranking(): Promise<RankedProject[]> {
  const all: RankedProject[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api<
      Page<{
        id: string;
        name: string;
        specialty: string;
        category: LocalData["projects"][number]["category"];
        level: string;
        building_id: string;
        votes: number;
        rank: number | null;
      }>
    >("/leaderboard?limit=100&offset=" + offset);
    for (const row of page.items)
      all.push({
        ...row,
        description: "",
        level: row.level === "preescolar" ? "preescolar" : Number(row.level),
        buildingId: row.building_id,
        tied: false,
      });
    if (all.length >= page.total || page.items.length < 100) break;
  }
  const counts = new Map<number, number>();
  all.forEach((p) => counts.set(p.votes, (counts.get(p.votes) ?? 0) + 1));
  return all.map((p) => ({
    ...p,
    tied: p.votes > 0 && (counts.get(p.votes) ?? 0) > 1,
  }));
}
export async function downloadApi(path: string, name: string) {
  const response = await fetch("/api/v1" + path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: apiOwner ? { "X-Camino-User": apiOwner } : {},
  });
  if (!response.ok) {
    let message = "No se pudo descargar el archivo.",
      code = "download_failed";
    try {
      const body = await response.json();
      message = body.error?.message ?? message;
      code = body.error?.code ?? code;
    } catch {}
    throw new ApiClientError(response.status, code, message);
  }
  const blob = await response.blob(),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Presentation-only view: questions intentionally have no correctIndex or stand code.
// Never run localDataSchema/parseProgress or local grading against this projection.
export function displayData(
  catalog: PublicCatalog,
  state: ParticipantState,
): LocalData {
  return {
    ...catalog,
    users: [state.user],
    challenges: [
      ...state.challenges,
      ...state.failedAttempts
        .map((a) => a.challenge)
        .filter((c) => !state.challenges.some((task) => task.id === c.id)),
    ],
    schemaRevision: 4,
    agendaManaged: true,
  } as unknown as LocalData;
}
export function displayProgress(
  state: ParticipantState,
  catalog: PublicCatalog,
): LocalProgress {
  return {
    version: 1,
    userId: state.user.id,
    dataVersion: catalog.settings.dataVersion,
    assignmentEdits: [],
    failedAnswers: [],
    failedExtras: [],
    ...state.progress,
    manualTickets: state.progress.manualTickets.map((t) => ({
      ...t,
      actorId: "",
    })),
  };
}
export function isUnauthorized(error: unknown) {
  return (
    error instanceof ApiClientError &&
    (error.status === 401 || error.code === "session_changed")
  );
}
