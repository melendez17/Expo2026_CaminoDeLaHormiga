// Browser-safe adapter. No service-role key, database password, or server secret.
export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export function createApiClient(
  options: { base?: string; accessToken?: () => Promise<string | null> } = {},
) {
  const base = options.base ?? "/api/v1";
  if (!base.startsWith("/") || base.startsWith("//"))
    throw Error("La API debe estar en el mismo origen.");
  async function request<T>(
    method: string,
    path: string,
    input?: Record<string, unknown>,
    requestId?: string,
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw Error("Ruta de API no válida.");
    const accessToken = await options.accessToken?.();
    const mutation = !["GET", "HEAD"].includes(method),
      id = mutation
        ? (requestId ??
          (typeof input?.requestId === "string"
            ? input.requestId
            : crypto.randomUUID()))
        : undefined;
    const body = input
      ? {
          ...input,
          ...(id && !path.startsWith("/auth/") ? { requestId: id } : {}),
        }
      : undefined;
    let response: Response;
    try {
      response = await fetch(base + path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiClientError(
        0,
        "network_error",
        "No se pudo confirmar la operación. Reintenta con el mismo requestId.",
        id,
      );
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new ApiClientError(
        response.status,
        "invalid_response",
        "No se pudo confirmar la respuesta. Conserva el requestId para reintentar.",
        id,
      );
    }
    if (!response.ok)
      throw new ApiClientError(
        response.status,
        result.error?.code ?? "request_failed",
        result.error?.message ?? "No se pudo completar la operación.",
        id ?? result.requestId,
      );
    return result as T;
  }
  return {
    request,
    me: () => request("GET", "/me"),
    catalog: () => request("GET", "/catalog"),
    leaderboard: () => request("GET", "/leaderboard"),
    login: (token: string) => request("POST", "/auth/login", { token }),
    activate: (credential: string) =>
      request("POST", "/auth/activate", { credential }),
    requestEmail: (email: string, token: string) =>
      request("POST", "/auth/request-email", { email, token }),
    verifyEmail: (challengeId: string, code: string) =>
      request("POST", "/auth/verify-email", { challengeId, code }),
    logout: () => request("POST", "/auth/logout", {}),
    start: (id?: string) => request("POST", "/me/start", {}, id),
    nextRound: (id?: string) => request("POST", "/me/next-round", {}, id),
    answer: (
      challengeId: string,
      answers: Record<string, string>,
      id?: string,
    ) => request("POST", "/me/answers", { challengeId, answers }, id),
    vote: (projectId: string, id?: string) =>
      request("POST", "/me/votes", { projectId }, id),
    survey: (
      values: { expectations: string; interest: string; satisfaction: number },
      id?: string,
    ) => request("POST", "/me/survey", values, id),
  };
}
