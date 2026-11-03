import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { BackendError } from "./errors";
export function secret() {
  return randomBytes(32).toString("base64url");
}
export function publicToken() {
  return randomBytes(2).toString("hex").toUpperCase();
}
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function credentialHash(value: string, pepper: string) {
  return createHmac("sha256", pepper).update(value).digest("hex");
}
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  return (
    "{" +
    Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
      .join(",") +
    "}"
  );
}
export function requestHash(method: string, path: string, input: unknown) {
  return hash(canonicalJson({ method, path, input }));
}
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function encrypt(value: unknown, key: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64url",
  );
}
export function decrypt<T>(value: string, key: string): T {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length < 29)
    throw new BackendError(
      500,
      "encrypted_data_error",
      "No se pudo recuperar el dato protegido.",
    );
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    bytes.subarray(0, 12),
  );
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString(
      "utf8",
    ),
  ) as T;
}
export async function readJson<T>(
  request: Request,
  schema: { parse: (value: unknown) => T },
  maxBytes = 16384,
): Promise<T> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new BackendError(415, "content_type", "Usa application/json.");
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new BackendError(
      413,
      "body_too_large",
      "Solicitud demasiado grande.",
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new BackendError(400, "invalid_json", "Falta el cuerpo JSON.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BackendError(
          413,
          "body_too_large",
          "Solicitud demasiado grande.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BackendError(400, "invalid_json", "JSON inválido.");
  }
  return schema.parse(value);
}
export function enforceOrigin(request: Request, origin: string) {
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new BackendError(403, "origin_forbidden", "Origen no permitido.");
}
export function sessionCookieName(production: boolean) {
  return production ? "__Host-camino_session" : "camino_session";
}
export function readCookie(request: Request, name: string) {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.startsWith(name + "="));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

// This is a claims check AFTER Supabase Auth has verified the token, not a JWT verifier.
export function assertVerifiedAdminClaims(
  token: string,
  verifiedId: string,
  issuer: string,
  requireMfa = true,
) {
  let claims: {
    sub?: string;
    aal?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
  };
  try {
    claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
  } catch {
    throw new BackendError(
      401,
      "invalid_session",
      "La sesión administrativa no es válida.",
    );
  }
  const audience = Array.isArray(claims.aud)
    ? claims.aud.includes("authenticated")
    : claims.aud === "authenticated";
  if (
    claims.sub !== verifiedId ||
    claims.iss !== issuer ||
    !audience ||
    typeof claims.exp !== "number" ||
    claims.exp <= Date.now() / 1000
  )
    throw new BackendError(
      401,
      "invalid_session",
      "La sesión administrativa no es válida.",
    );
  if (requireMfa && claims.aal !== "aal2")
    throw new BackendError(
      403,
      "mfa_required",
      "Confirma el segundo factor de administrador.",
    );
}
