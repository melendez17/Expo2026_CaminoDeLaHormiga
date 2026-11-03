import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertVerifiedAdminClaims } from "./security";
import { BackendError, mapDatabaseError } from "./errors";
import type { CatalogRecord, BackendStore } from "./store";
export function backendConfiguration() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    pepper = process.env.TOKEN_PEPPER,
    encryptionKey = process.env.APP_ENCRYPTION_KEY,
    origin = process.env.APP_ORIGIN;
  if (
    !url ||
    !key ||
    !pepper ||
    pepper.length < 32 ||
    !encryptionKey ||
    !/^[a-fA-F0-9]{64}$/.test(encryptionKey) ||
    !origin
  )
    throw new BackendError(
      503,
      "not_configured",
      "El backend de Supabase no está configurado.",
    );
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new BackendError(503, "invalid_origin", "Configura APP_ORIGIN.");
  }
  if (
    parsed.origin !== origin ||
    (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")
  )
    throw new BackendError(
      503,
      "invalid_origin",
      "APP_ORIGIN debe ser un origen HTTPS sin ruta.",
    );
  const databaseUrl = new URL(url);
  if (
    databaseUrl.username ||
    databaseUrl.password ||
    databaseUrl.search ||
    databaseUrl.origin !== url ||
    (databaseUrl.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        ["localhost", "127.0.0.1"].includes(databaseUrl.hostname)
      ))
  )
    throw new BackendError(
      503,
      "invalid_database_url",
      "Configura una URL de Supabase válida.",
    );
  if (process.env.JOBS_SECRET && process.env.JOBS_SECRET.length < 32)
    throw new BackendError(
      503,
      "invalid_jobs_secret",
      "JOBS_SECRET debe tener al menos 32 caracteres.",
    );
  if (
    process.env.EMAIL_ACCESS_ENABLED === "true" &&
    (!process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASSWORD ||
      !process.env.MAIL_FROM ||
      !process.env.JOBS_SECRET)
  )
    throw new BackendError(
      503,
      "smtp_not_configured",
      "Configura SMTP y el trabajo de envío antes de habilitar correo.",
    );
  const sessionSeconds = Number(
    process.env.PARTICIPANT_SESSION_SECONDS ?? 43200,
  );
  if (
    !Number.isInteger(sessionSeconds) ||
    sessionSeconds < 300 ||
    sessionSeconds > 86400
  )
    throw new BackendError(
      503,
      "invalid_config",
      "Configura la duración de la sesión.",
    );
  return { url, key, pepper, encryptionKey, origin, sessionSeconds };
}
export function serverSupabase() {
  const config = backendConfiguration();
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    },
  });
}
let catalogCache: {
  namespace: string;
  value: CatalogRecord;
  expiresAt: number;
} | null = null;
let pendingCatalog: { namespace: string; promise: Promise<unknown> } | null =
  null;
let catalogEpoch = 0;
export class SupabaseBackendStore implements BackendStore {
  constructor(
    readonly client: SupabaseClient,
    readonly namespace = "default",
  ) {}
  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const invalidate = () => {
      catalogCache = null;
      pendingCatalog = null;
      catalogEpoch++;
    };
    if (name === "camino_catalog") {
      if (
        catalogCache?.namespace === this.namespace &&
        catalogCache.expiresAt > Date.now()
      )
        return catalogCache.value as T;
      if (pendingCatalog?.namespace === this.namespace)
        return pendingCatalog.promise as Promise<T>;
      const epoch = catalogEpoch,
        promise = this.call<CatalogRecord>(name, args)
          .then((value) => {
            if (epoch === catalogEpoch && value)
              catalogCache = {
                namespace: this.namespace,
                value,
                expiresAt: Date.now() + 10000,
              };
            return value;
          })
          .finally(() => {
            if (pendingCatalog?.promise === promise) pendingCatalog = null;
          });
      pendingCatalog = { namespace: this.namespace, promise };
      return promise as Promise<T>;
    }
    try {
      const value = await this.call<T>(name, args);
      if (
        [
          "camino_catalog_commit",
          "camino_add_admin",
          "camino_update_staff",
          "camino_bootstrap_admin",
          "camino_seed_catalog",
          "camino_initialize",
        ].includes(name)
      )
        invalidate();
      return value;
    } catch (error) {
      if (error instanceof BackendError && error.code === "revision_conflict")
        invalidate();
      throw error;
    }
  }
  private async call<T>(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw mapDatabaseError(error);
    return data as T;
  }
}
export async function verifyAdminBearer(
  request: Request,
  client: SupabaseClient,
) {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token)
    throw new BackendError(
      401,
      "authentication_required",
      "Inicia sesión como administrador.",
    );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user)
    throw new BackendError(
      401,
      "invalid_session",
      "La sesión administrativa no es válida.",
    );
  assertVerifiedAdminClaims(
    token,
    data.user.id,
    backendConfiguration().url + "/auth/v1",
    process.env.NODE_ENV === "production" ||
      process.env.ADMIN_REQUIRE_MFA !== "false",
  );
  return data.user.id;
}
