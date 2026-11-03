import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { localDataSchema } from "../src/lib/local-game";
import { mapDatabaseError } from "../src/lib/backend/errors";
import type { BackendStore } from "../src/lib/backend/store";
import { BackendService } from "../src/lib/backend/service";
import campus from "../src/lib/campus.json";
export const sample = localDataSchema.parse(
  Object.fromEntries(
    ["users", "projects", "challenges", "agenda", "settings"].map((k) => [
      k,
      JSON.parse(
        readFileSync(
          new URL(`../public/data/${k}.json`, import.meta.url),
          "utf8",
        ),
      ),
    ]),
  ),
);
export class SQLStore implements BackendStore {
  constructor(readonly db: PGlite) {}
  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (
      !/^camino_[a-z_]+$/.test(name) ||
      Object.keys(args).some((key) => !/^p_[a-z0-9_]+$/.test(key))
    )
      throw Error("Unsafe internal SQL name");
    const entries = Object.entries(args),
      params = entries.map(([, value]) =>
        value !== null && typeof value === "object"
          ? JSON.stringify(value)
          : value,
      );
    try {
      const result = await this.db.query<{ result: T }>(
        `select public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(",")}) as result`,
        params,
      );
      return result.rows[0]?.result;
    } catch (error) {
      if (process.env.BACKEND_DEBUG_TESTS === "true")
        console.error(
          "TEST SQL",
          name,
          (error as { code?: string }).code,
          (error as Error).message,
        );
      throw mapDatabaseError(error as { code?: string; message?: string });
    }
  }
}
export async function backendFixture() {
  const db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);",
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202611030001_production.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202611030002_token_login.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const store = new SQLStore(db),
    config = {
      pepper: "test-only-pepper-not-a-production-key-123456789",
      encryptionKey: "11".repeat(32),
      origin: "https://school.test",
      sessionSeconds: 43200,
    },
    service = new BackendService(store, config),
    adminId = randomUUID();
  const { users, ...catalog } = sample;
  await store.rpc("camino_initialize", {
    p_catalog: catalog,
    p_buildings: campus.names,
  });
  await store.rpc("camino_seed_catalog", { p_catalog: catalog });
  await db.query("insert into auth.users values($1)", [adminId]);
  await store.rpc("camino_bootstrap_admin", {
    p_id: adminId,
    p_first: "Admin",
    p_surname1: "Colegio",
    p_surname2: "Prueba",
    p_email: "admin@example.test",
  });
  return { db, store, service, config, adminId, catalog };
}
export function registration(
  email = "persona@example.test",
  role: "visitor" | "admission" = "visitor",
  area = "Ciberseguridad",
) {
  return {
    firstName: "Ana",
    firstSurname: "Prueba",
    secondSurname: "Colegio",
    email,
    role,
    area,
    consent: true as const,
  };
}
