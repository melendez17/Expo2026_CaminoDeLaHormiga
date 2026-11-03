import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  backendFixture,
  registration,
  SQLStore,
  sample,
} from "./backend-support";
import { requestHash, hash, credentialHash } from "../src/lib/backend/security";
import { BackendError } from "../src/lib/backend/errors";
import { executeCommand, projection } from "../src/lib/backend/domain";
import { saintQuestion, type Answers } from "../src/lib/local-game";
test("backend PostgreSQL: migración, permisos, unicidad, transacciones y lógica vigente", async (t) => {
  const f = await backendFixture(),
    { db, store, service, adminId } = f;
  let serial = 0;
  const register = async (
    role: "visitor" | "admission" = "visitor",
    area = "Ciberseguridad",
  ) => {
    const input = registration(`persona-${++serial}@example.test`, role, area),
      request = randomUUID();
    return (await service.register(
      input,
      adminId,
      request,
      requestHash("POST", "admin/users", { ...input, requestId: request }),
    )) as {
      user: { id: string; token: string };
      access: { credential: string };
    };
  };
  let first: Awaited<ReturnType<typeof register>>;
  await t.test(
    "RLS y todas las RPC de producción niegan anon y authenticated",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(
          () => db.query("select * from camino.profiles"),
          /permission denied/,
        );
        await assert.rejects(
          () => db.query("select public.camino_catalog()"),
          /permission denied/,
        );
        await assert.rejects(
          () => db.query("select * from camino.questions"),
          /permission denied/,
        );
        await db.exec("reset role");
      }
      const grants = await db.query<{ allowed: boolean }>(
        "select bool_and(not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')) allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'camino_%'",
      );
      assert.equal(grants.rows[0].allowed, true);
    },
  );
  await t.test(
    "correo único normalizado, código hexadecimal único y credencial protegida",
    async () => {
      first = await register();
      assert.match(first.user.token, /^[A-F0-9]{4}$/);
      assert.match(first.access.credential, /^[A-Za-z0-9_-]{43}$/);
      const rows = await db.query<{ claim_hash: string }>(
        "select claim_hash from camino.profiles where id=$1",
        [first.user.id],
      );
      assert.notEqual(rows.rows[0].claim_hash, first.access.credential);
      assert.equal(
        rows.rows[0].claim_hash,
        credentialHash(first.access.credential, f.config.pepper),
      );
      const input = registration("PERSONA-1@EXAMPLE.TEST");
      await assert.rejects(
        () => service.register(input, adminId, randomUUID(), "a".repeat(64)),
        (e: unknown) => e instanceof BackendError && e.code === "email_exists",
      );
      const count = await db.query<{ n: number }>(
        "select count(*)::integer n from camino.profiles where role<>'admin'",
      );
      assert.equal(count.rows[0].n, 1);
    },
  );
  await t.test(
    "credencial de un solo uso, sesión revocable y rate limit sin rollback del fallo",
    async () => {
      const raw = "a".repeat(43);
      assert.equal(
        await store.rpc("camino_activate", {
          p_claim_hash: credentialHash(
            first.access.credential,
            f.config.pepper,
          ),
          p_session_hash: hash(raw),
          p_expires: new Date(Date.now() + 60000).toISOString(),
        }),
        first.user.id,
      );
      assert.equal(
        await store.rpc("camino_activate", {
          p_claim_hash: credentialHash(
            first.access.credential,
            f.config.pepper,
          ),
          p_session_hash: hash("b".repeat(43)),
          p_expires: new Date(Date.now() + 60000).toISOString(),
        }),
        null,
      );
      assert.ok(await store.rpc("camino_actor", { p_session_hash: hash(raw) }));
      await store.rpc("camino_logout", { p_session_hash: hash(raw) });
      assert.equal(
        await store.rpc("camino_actor", { p_session_hash: hash(raw) }),
        null,
      );
      assert.equal(
        await store.rpc("camino_rate", {
          p_key: "test-rate",
          p_limit: 1,
          p_seconds: 60,
        }),
        true,
      );
      assert.equal(
        await store.rpc("camino_rate", {
          p_key: "test-rate",
          p_limit: 1,
          p_seconds: 60,
        }),
        false,
      );
    },
  );
  await t.test(
    "visitante conserva dos base, falla con reemplazo y evidencia sin aumentar pendientes",
    async () => {
      await service.command(
        first.user.id,
        first.user.id,
        randomUUID(),
        "b".repeat(64),
        "start",
        {},
      );
      let record = await service.participant(first.user.id),
        catalog = await service.catalog(),
        data = service.data(catalog, [record.user]);
      const base = record.progress.visitorRounds[0];
      assert.equal(base.length, 2);
      const c = data.challenges.find((c) => c.id === base[0])!;
      assert.equal(
        data.projects.find((p) => p.id === c.projectId)?.specialty,
        "Ciberseguridad",
      );
      const answers: Answers = {
        code: c.code!,
        ...Object.fromEntries(
          c.questions!.map((q, i) => [
            q.id,
            String(
              i === 0
                ? (q.correctIndex + 1) % q.options.length
                : q.correctIndex,
            ),
          ]),
        ),
      };
      const response = await service.command(
        first.user.id,
        first.user.id,
        randomUUID(),
        "c".repeat(64),
        "answer",
        { challengeId: c.id, answers },
      );
      assert.equal(
        (response.result as Record<string, unknown>).outcome,
        "incorrect",
      );
      record = await service.participant(first.user.id);
      assert.equal(record.progress.failedExtras.length, 1);
      assert.equal(record.progress.visitorRounds[0].length, 2);
      assert.equal(record.progress.extraIds.length, 0);
      assert.equal(record.progress.completed.length, 0);
    },
  );
  await t.test(
    "idempotencia, colisiones de solicitud y votos atómicos sin doble gasto",
    async () => {
      const request = randomUUID(),
        fingerprint = "d".repeat(64);
      const firstManual = await service.command(
        first.user.id,
        adminId,
        request,
        fingerprint,
        "manual",
        {},
      );
      const repeated = await service.command(
        first.user.id,
        adminId,
        request,
        fingerprint,
        "manual",
        {},
      );
      assert.deepEqual(firstManual.result, repeated.result);
      assert.equal(
        (await service.participant(first.user.id)).progress.manualTickets
          .length,
        1,
      );
      await assert.rejects(
        () =>
          service.command(
            first.user.id,
            adminId,
            request,
            "e".repeat(64),
            "manual",
            {},
          ),
        (e: unknown) =>
          e instanceof BackendError && e.code === "idempotency_conflict",
      );
      const results = await Promise.allSettled([
        service.command(
          first.user.id,
          first.user.id,
          randomUUID(),
          "1".repeat(64),
          "vote",
          { projectId: "agua" },
        ),
        service.command(
          first.user.id,
          first.user.id,
          randomUUID(),
          "2".repeat(64),
          "vote",
          { projectId: "energia" },
        ),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        (await service.participant(first.user.id)).progress.votes.length,
        1,
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            "select count(*)::integer n from camino.votes",
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "CAS impide actualizaciones perdidas y asignación ajena",
    async () => {
      const record = await service.participant(first.user.id),
        catalog = await service.catalog(),
        data = service.data(catalog, [record.user]);
      const next = executeCommand(data, record.progress, "manual", {}, adminId);
      const params = {
        p_id: first.user.id,
        p_expected: record.version,
        p_catalog_version: catalog.version,
        p_progress: next.progress,
        p_projection: projection(data, next.progress),
        p_actor: adminId,
        p_result: { operation: "manual" },
      };
      await store.rpc("camino_commit", {
        ...params,
        p_request: randomUUID(),
        p_hash: "3".repeat(64),
      });
      await assert.rejects(
        () =>
          store.rpc("camino_commit", {
            ...params,
            p_request: randomUUID(),
            p_hash: "4".repeat(64),
          }),
        (e: unknown) =>
          e instanceof BackendError && e.code === "revision_conflict",
      );
      const other = await register();
      await assert.rejects(
        () =>
          service.command(
            first.user.id,
            other.user.id,
            randomUUID(),
            "5".repeat(64),
            "manual",
            {},
          ),
        (e: unknown) => e instanceof BackendError && e.code === "forbidden",
      );
    },
  );
  await t.test(
    "rifa uniforme por tiquete, ganadores no repetidos, persistencia e idempotencia",
    async () => {
      const request = randomUUID(),
        draw = (await service.draw(
          adminId,
          request,
          "6".repeat(64),
          "Premio de prueba",
        )) as { ticketId: string; ticketCode: string };
      assert.match(draw.ticketCode, /^M-[A-F0-9]{4}-00[12]$/);
      assert.deepEqual(
        await service.draw(
          adminId,
          request,
          "6".repeat(64),
          "Premio de prueba",
        ),
        draw,
      );
      const next = (await service.draw(
        adminId,
        randomUUID(),
        "7".repeat(64),
        "Otro",
      )) as { ticketId: string };
      assert.notEqual(next.ticketId, draw.ticketId);
      assert.equal(await store.rpc("camino_raffle_count"), 0);
      assert.equal(
        (await service.participant(first.user.id)).progress.votes.length,
        1,
      );
    },
  );
  await t.test(
    "admisión conserva cuotas de especialidad y niveles, y premios",
    async () => {
      const user = await register("admission", "Desarrollo Web");
      await service.command(
        user.user.id,
        user.user.id,
        randomUUID(),
        "8".repeat(64),
        "start",
        {},
      );
      let record = await service.participant(user.user.id),
        catalog = await service.catalog(),
        data = service.data(catalog, [record.user]);
      assert.equal(record.progress.routeIds.length, 5);
      const projects = record.progress.routeIds
        .map((id) =>
          data.projects.find(
            (p) => p.id === data.challenges.find((c) => c.id === id)?.projectId,
          ),
        )
        .filter(Boolean);
      assert.equal(
        projects.filter((p) => p!.specialty === "Desarrollo Web").length,
        3,
      );
      assert.ok(
        projects.some(
          (p) => p!.specialty === "Desarrollo Web" && p!.level === 10,
        ),
      );
      assert.ok(
        projects.some(
          (p) => p!.specialty === "Desarrollo Web" && p!.level === 11,
        ),
      );
      for (const id of record.progress.routeIds) {
        const c = data.challenges.find((c) => c.id === id)!;
        const answers: Answers =
          c.kind === "freeform"
            ? {
                projectName: "Proyecto",
                level: "Décimo",
                description: "Aprendí nuevas ideas para nuestra comunidad.",
              }
            : c.kind === "saint"
              ? { saintChoice: String(saintQuestion(c).correctIndex) }
              : {
                  code: c.code!,
                  ...Object.fromEntries(
                    (c.questions ?? []).map((q) => [
                      q.id,
                      String(q.correctIndex),
                    ]),
                  ),
                };
        await service.command(
          user.user.id,
          user.user.id,
          randomUUID(),
          requestHash("POST", id, answers),
          "answer",
          { challengeId: id, answers },
        );
      }
      record = await service.participant(user.user.id);
      assert.equal(record.progress.completed.length, 5);
      assert.equal((await service.view(record)).stats.tickets, 1);
    },
  );
  await db.close();
});
