import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BackendService } from "../../src/lib/backend/service";
import { mapDatabaseError } from "../../src/lib/backend/errors";
import { localDataSchema } from "../../src/lib/local-game";
import { validateRuleCapacity } from "../../src/lib/admin-assignments";
import type { BackendStore } from "../../src/lib/backend/store";
if (existsSync(".env.local")) loadEnvFile(".env.local");
export const args = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((arg, index, array) =>
      arg.startsWith("--")
        ? [
            [
              arg.slice(2),
              array[index + 1]?.startsWith("--") || !array[index + 1]
                ? true
                : array[index + 1],
            ],
          ]
        : [],
    ),
);
export function text(name: string) {
  const value = args[name];
  if (typeof value !== "string" || !value) throw Error(`Falta --${name}.`);
  return value;
}
export function connection() {
  const url = z.url().parse(process.env.SUPABASE_URL),
    key = z.string().min(20).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store: BackendStore = {
    async rpc<T>(name: string, params: Record<string, unknown> = {}) {
      const result = await client.rpc(name, params);
      if (result.error) throw mapDatabaseError(result.error);
      return result.data as T;
    },
  };
  return { client, store };
}
export function service() {
  const { store, client } = connection(),
    pepper = z.string().min(32).parse(process.env.TOKEN_PEPPER),
    encryptionKey = z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .parse(process.env.APP_ENCRYPTION_KEY),
    origin = z.url().parse(process.env.APP_ORIGIN);
  return {
    service: new BackendService(store, {
      pepper,
      encryptionKey,
      origin,
      sessionSeconds: 43200,
    }),
    client,
    store,
  };
}
export function readCatalog() {
  const raw =
    typeof args.file === "string"
      ? JSON.parse(readFileSync(args.file, "utf8"))
      : Object.fromEntries(
          ["users", "projects", "challenges", "agenda", "settings"].map((k) => [
            k,
            JSON.parse(readFileSync(`public/data/${k}.json`, "utf8")),
          ]),
        );
  const candidate = raw.catalog ?? raw;
  const data = localDataSchema.parse({
    ...candidate,
    users: [
      {
        id: "catalog-validator",
        name: "Validador del catálogo",
        token: "ADM0",
        role: "admin",
      },
    ],
  });
  validateRuleCapacity(data);
  const { users, ...catalog } = data;
  if (args.production && catalog.settings.dataVersion.startsWith("demo"))
    throw Error(
      "Producción requiere un catálogo real con dataVersion distinto de demo. No uses respuestas o códigos del repositorio en la feria.",
    );
  return catalog;
}
