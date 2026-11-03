import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("migración de producción convive con las dos migraciones históricas sin borrar tablas", async () => {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);",
  );
  for (const name of [
    "202610210001_initial.sql",
    "202610210002_admin.sql",
    "202611030001_production.sql",
    "202611030002_token_login.sql",
    "202611030003_admin_token_login.sql",
  ]) {
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  }
  const result = await db.query<{ legacy: string; production: string }>(
    "select to_regclass('public.participants')::text legacy, to_regclass('camino.profiles')::text production",
  );
  assert.equal(result.rows[0].legacy, "participants");
  assert.equal(result.rows[0].production, "camino.profiles");
  await db.exec("set role authenticated");
  await assert.rejects(
    () => db.query("select * from camino.profiles"),
    /permission denied/,
  );
  await db.exec("reset role");
  await db.close();
});
