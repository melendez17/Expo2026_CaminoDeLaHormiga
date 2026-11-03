import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backendFixture, registration } from "./backend-support";
import { createBackendHandler } from "../src/lib/backend/handler";
import { BackendError } from "../src/lib/backend/errors";
import { decrypt, requestHash } from "../src/lib/backend/security";
import { saintQuestion, type Answers } from "../src/lib/local-game";
test("API v1 real sobre PostgreSQL: permisos, cookies, privacidad y flujos completos", async (t) => {
  const f = await backendFixture();
  const handle = createBackendHandler({
    service: f.service,
    production: true,
    emailEnabled: true,
    jobsSecret: "test-jobs-secret-12345678901234567890",
    verifyAdmin: async (req) => {
      if (req.headers.get("authorization") !== "Bearer test-admin")
        throw new BackendError(
          401,
          "authentication_required",
          "Inicia sesión.",
        );
      return f.adminId;
    },
  });
  const send = async (
    path: string,
    method = "GET",
    input?: unknown,
    options: {
      cookie?: string;
      admin?: boolean;
      origin?: string;
      headers?: Record<string, string>;
    } = {},
  ) =>
    handle(
      new Request(f.config.origin + "/api/v1/" + path, {
        method,
        headers: {
          ...(method !== "GET"
            ? {
                "content-type": "application/json",
                origin: options.origin ?? f.config.origin,
              }
            : {}),
          ...(options.admin ? { authorization: "Bearer test-admin" } : {}),
          ...(options.cookie ? { cookie: options.cookie } : {}),
          ...options.headers,
        },
        body: input === undefined ? undefined : JSON.stringify(input),
      }),
    );
  const register = async (email: string) => {
    const response = await send(
      "admin/users",
      "POST",
      { ...registration(email), requestId: randomUUID() },
      { admin: true },
    );
    assert.equal(response.status, 201);
    return (await response.json()) as {
      user: { id: string; token: string };
      access: { credential: string };
      delivery: string;
    };
  };
  let alice: Awaited<ReturnType<typeof register>>,
    bob: Awaited<ReturnType<typeof register>>,
    cookie = "";
  await t.test(
    "registro solo administrativo, validación, CSRF y límites de cuerpo",
    async () => {
      assert.equal(
        (
          await send("admin/users", "POST", {
            ...registration(),
            requestId: randomUUID(),
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await send(
            "admin/users",
            "POST",
            { ...registration(), requestId: randomUUID() },
            { admin: true, origin: "https://attacker.test" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await send(
            "admin/users",
            "POST",
            { ...registration(), role: "admin", requestId: randomUUID() },
            { admin: true },
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await send(
            "admin/users",
            "POST",
            {
              ...registration(),
              firstName: "x".repeat(20000),
              requestId: randomUUID(),
            },
            { admin: true },
          )
        ).status,
        413,
      );
      alice = await register("alice@example.test");
      bob = await register("bob@example.test");
      assert.equal(
        (
          await send(
            "admin/users",
            "POST",
            {
              ...registration(" ALICE@example.test "),
              requestId: randomUUID(),
            },
            { admin: true },
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "el enlace heredado conserva su formato y uso único, independiente del login por token",
    async () => {
      assert.equal(
        (await send("auth/activate", "POST", { credential: alice.user.token }))
          .status,
        400,
      );
      const response = await send("auth/activate", "POST", {
        credential: alice.access.credential,
      });
      assert.equal(response.status, 200);
      const header = response.headers.get("set-cookie")!;
      assert.match(header, /^__Host-camino_session=/);
      assert.match(header, /HttpOnly/);
      assert.match(header, /SameSite=Strict/);
      assert.match(header, /Secure/);
      cookie = header.split(";")[0];
      assert.equal(
        (
          await send("auth/activate", "POST", {
            credential: alice.access.credential,
          })
        ).status,
        401,
      );
      assert.equal((await send("me")).status, 401);
    },
  );
  await t.test(
    "catálogo sin correos, usuarios, códigos o claves de respuesta; sin consulta ajena por ID",
    async () => {
      const response = await send("catalog"),
        catalog = await response.json();
      assert.equal(response.status, 200);
      assert.equal(catalog.users, undefined);
      assert.equal(catalog.challenges, undefined);
      assert.ok(!JSON.stringify(catalog).includes("alice@example.test"));
      const own = await send("me?userId=" + bob.user.id, "GET", undefined, {
          cookie,
        }),
        view = await own.json();
      assert.equal(view.user.id, alice.user.id);
      assert.equal(view.challenges.length, 0);
      assert.match(own.headers.get("cache-control")!, /no-store/);
      assert.equal(
        (await send("admin/users/" + bob.user.id, "GET", undefined, { cookie }))
          .status,
        401,
      );
    },
  );
  await t.test(
    "inicio, respuestas no autorizadas, fallo con evidencia y sin claves futuras",
    async () => {
      let response = await send(
        "me/start",
        "POST",
        { requestId: randomUUID() },
        { cookie },
      );
      assert.equal(response.status, 200);
      let body = await response.json();
      assert.equal(body.state.challenges.length, 2);
      for (const c of body.state.challenges) {
        assert.equal(c.code, undefined);
        assert.equal(c.answer, undefined);
        for (const q of c.questions ?? [])
          assert.equal(q.correctIndex, undefined);
      }
      const original = body.state.challenges.find(
          (c: { questions?: unknown[] }) => c.questions?.length,
        ),
        real = (await f.service.catalog()).catalog.challenges.find(
          (c) => c.id === original.id,
        )!;
      const answers: Answers = {
        code: real.code!,
        ...Object.fromEntries(
          real.questions!.map((q, i) => [
            q.id,
            String(
              i === 0
                ? (q.correctIndex + 1) % q.options.length
                : q.correctIndex,
            ),
          ]),
        ),
      };
      assert.equal(
        (
          await send(
            "me/answers",
            "POST",
            {
              requestId: randomUUID(),
              challengeId: original.id,
              participantId: bob.user.id,
              answers,
            },
            { cookie },
          )
        ).status,
        400,
      );
      response = await send(
        "me/answers",
        "POST",
        { requestId: randomUUID(), challengeId: original.id, answers },
        { cookie },
      );
      assert.equal(response.status, 200);
      body = await response.json();
      assert.equal(body.result.outcome, "incorrect");
      assert.equal(body.state.progress.visitorRounds[0].length, 2);
      assert.equal(body.state.progress.extraIds.length, 0);
      assert.equal(body.state.failedAttempts.length, 1);
      assert.equal(
        body.state.failedAttempts[0].details[0].correctAnswer,
        real.questions![0].options[real.questions![0].correctIndex],
      );
      assert.equal(
        (
          await send(
            "me/answers",
            "POST",
            { requestId: randomUUID(), challengeId: original.id, answers },
            { cookie },
          )
        ).status,
        403,
      );
    },
  );
  await t.test(
    "tiquetes y votos son idempotentes, el ranking no expone personas",
    async () => {
      const input = { requestId: randomUUID(), token: alice.user.token };
      const first = await send("admin/tickets", "POST", input, { admin: true });
      assert.equal(first.status, 201);
      assert.equal(
        (await first.json()).result.ticketCode,
        `M-${alice.user.token}-001`,
      );
      assert.equal(
        (await send("admin/tickets", "POST", input, { admin: true })).status,
        201,
      );
      const vote = { requestId: randomUUID(), projectId: "agua" };
      assert.equal(
        (await send("me/votes", "POST", vote, { cookie })).status,
        200,
      );
      assert.equal(
        (await send("me/votes", "POST", vote, { cookie })).status,
        200,
      );
      assert.equal(
        (
          await send(
            "me/votes",
            "POST",
            { requestId: randomUUID(), projectId: "energia" },
            { cookie },
          )
        ).status,
        409,
      );
      const ranking = await (await send("leaderboard")).json();
      assert.equal(ranking.votes, 1);
      assert.equal(ranking.items[0].id, "agua");
      assert.ok(!JSON.stringify(ranking).includes("alice@example.test"));
    },
  );
  await t.test(
    "correo anti-enumeración, secreto cifrado y OTP con intentos limitados",
    async () => {
      const unknown = await (
        await send("auth/request-email", "POST", {
          email: "missing@example.test",
          token: "FFFF",
        })
      ).json();
      assert.equal(unknown.accepted, true);
      const response = await send("auth/request-email", "POST", {
        email: "bob@example.test",
        token: bob.user.token,
      });
      assert.equal(response.status, 200);
      const challenge = await response.json();
      const queued = await f.db.query<{ envelope: string }>(
        "select envelope from camino.mail_outbox order by created_at desc limit 1",
      );
      const message = decrypt<{ text: string }>(
          queued.rows[0].envelope,
          f.config.encryptionKey,
        ),
        code = message.text.match(/\b\d{8}\b/)![0];
      assert.ok(!queued.rows[0].envelope.includes(code));
      for (let i = 0; i < 5; i++)
        assert.equal(
          (
            await send("auth/verify-email", "POST", {
              challengeId: challenge.challengeId,
              code: code === "00000000" ? "00000001" : "00000000",
            })
          ).status,
          401,
        );
      assert.equal(
        (
          await send("auth/verify-email", "POST", {
            challengeId: challenge.challengeId,
            code,
          })
        ).status,
        401,
      );
      const next = await (
          await send("auth/request-email", "POST", {
            email: "bob@example.test",
            token: bob.user.token,
          })
        ).json(),
        queue = await f.db.query<{ envelope: string }>(
          "select envelope from camino.mail_outbox order by created_at desc limit 1",
        );
      const nextCode = decrypt<{ text: string }>(
        queue.rows[0].envelope,
        f.config.encryptionKey,
      ).text.match(/\b\d{8}\b/)![0];
      assert.equal(
        (
          await send("auth/verify-email", "POST", {
            challengeId: next.challengeId,
            code: nextCode,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await send("auth/verify-email", "POST", {
            challengeId: next.challengeId,
            code: nextCode,
          })
        ).status,
        401,
      );
    },
  );
  await t.test(
    "baja revoca sesiones, trabajos internos requieren secreto y exportación exige admin",
    async () => {
      assert.equal(
        (await send("admin/backup", "GET", undefined, { cookie })).status,
        401,
      );
      assert.equal((await send("internal/jobs", "POST", {})).status, 401);
      const response = await send(
        "admin/users/" + alice.user.id,
        "DELETE",
        { requestId: randomUUID(), expectedVersion: 0 },
        { admin: true },
      );
      assert.equal(response.status, 200);
      assert.equal(
        (await send("me", "GET", undefined, { cookie })).status,
        401,
      );
      assert.equal(
        (
          await send("internal/jobs", "POST", undefined, {
            headers: {
              authorization: "Bearer test-jobs-secret-12345678901234567890",
            },
          })
        ).status,
        200,
      );
    },
  );
  await f.db.close();
});
