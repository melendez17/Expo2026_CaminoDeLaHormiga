import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backendFixture, registration } from "./backend-support";
import { createBackendHandler } from "../src/lib/backend/handler";
import { requestHash, hash } from "../src/lib/backend/security";
test("acceso por token: reutilizable, privado, limitado y con permisos por rol", async (t) => {
  const f = await backendFixture();
  try {
    const visitor = await f.service.register(
      registration("token@example.test"),
      f.adminId,
      randomUUID(),
      hash("register-token"),
    );
    const admission = await f.service.register(
      registration("admission-token@example.test", "admission", "school"),
      f.adminId,
      randomUUID(),
      hash("register-admission-token"),
    );
    const handle = createBackendHandler({
      service: f.service,
      production: true,
      emailEnabled: false,
      createAdmin: (input, actor, request, fingerprint) =>
        f.service.createAdmin(input, actor, request, fingerprint),
      verifyAdmin: async () => {
        throw Error("No JWT supplied");
      },
    });
    const login = (token: string, origin = f.config.origin) =>
      handle(
        new Request(f.config.origin + "/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({ token }),
        }),
      );
    let cookie = "";
    await t.test(
      "token solo, normalizado y repetible crea cookie segura sin correo ni QR",
      async () => {
        assert.deepEqual(visitor.login, {
          method: "token",
          token: visitor.user.token,
        });
        const first = await login(" " + visitor.user.token.toLowerCase() + " ");
        assert.equal(first.status, 200);
        assert.deepEqual(await first.json(), { ok: true });
        const header = first.headers.get("set-cookie")!;
        assert.match(header, /^__Host-camino_session=/);
        assert.match(header, /HttpOnly/);
        assert.match(header, /SameSite=Strict/);
        assert.match(header, /Secure/);
        assert.match(first.headers.get("cache-control")!, /no-store/);
        cookie = header.split(";")[0];
        const again = await login(visitor.user.token);
        assert.equal(again.status, 200);
        assert.notEqual(again.headers.get("set-cookie"), header);
        const me = await handle(
          new Request(f.config.origin + "/api/v1/me", { headers: { cookie } }),
        );
        assert.equal(me.status, 200);
        assert.equal((await me.json()).user.id, visitor.user.id);
        assert.equal((await login(admission.user.token)).status, 200);
      },
    );
    await t.test("CSRF y formatos inválidos se rechazan", async () => {
      assert.equal(
        (await login(visitor.user.token, "https://attacker.test")).status,
        403,
      );
      assert.equal((await login("AD-1")).status, 400);
      assert.equal(
        await f.store.rpc("camino_login_token", {
          p_token: "AD-1",
          p_session_hash: hash("forbidden-admin"),
          p_expires: new Date(Date.now() + 60000).toISOString(),
        }),
        null,
      );
    });
    await t.test(
      "admin entra por token, gestiona el panel y crea otro admin sin Auth, correo ni MFA",
      async () => {
        const response = await login("adm1");
        assert.equal(response.status, 200);
        const adminCookie = response.headers.get("set-cookie")!.split(";")[0];
        const request = (
          path: string,
          method = "GET",
          input?: unknown,
          cookieValue = adminCookie,
        ) =>
          handle(
            new Request(f.config.origin + "/api/v1/" + path, {
              method,
              headers: {
                cookie: cookieValue,
                origin: f.config.origin,
                "content-type": "application/json",
              },
              body: input ? JSON.stringify(input) : undefined,
            }),
          );
        const me = await request("admin/me");
        assert.equal(me.status, 200);
        assert.equal((await me.json()).mfaRequired, false);
        assert.equal((await request("admin/users")).status, 200);
        assert.equal(
          (await request("admin/users", "GET", undefined, cookie)).status,
          403,
        );
        assert.equal((await request("me")).status, 401);
        const adminInput = {
          firstName: "Admin",
          firstSurname: "Nuevo",
          secondSurname: "Colegio",
          email: "admin-token@example.test",
          requestId: randomUUID(),
        };
        const created = await request("admin/staff", "POST", adminInput);
        assert.equal(created.status, 201);
        const newAdmin = (await created.json()) as {
          id: string;
          token: string;
        };
        const retry = await request("admin/staff", "POST", adminInput);
        assert.equal(retry.status, 201);
        assert.equal((await retry.json()).id, newAdmin.id);

        const identity = await f.db.query<{ auth_user_id: string | null }>(
          "select auth_user_id from camino.profiles where id=$1",
          [newAdmin.id],
        );
        assert.equal(identity.rows[0].auth_user_id, null);
        const second = await login(newAdmin.token);
        assert.equal(second.status, 200);
        const secondCookie = second.headers.get("set-cookie")!.split(";")[0];
        assert.equal(
          (await request("admin/metrics", "GET", undefined, secondCookie))
            .status,
          200,
        );
        await f.db.query(
          "update camino.profiles set active=false where id=$1",
          [newAdmin.id],
        );
        assert.equal((await login(newAdmin.token)).status, 401);
        assert.equal(
          (await request("admin/me", "GET", undefined, secondCookie)).status,
          401,
        );
      },
    );
    await t.test(
      "baja revoca sesiones y el mismo token ya no inicia sesión",
      async () => {
        const record = await f.service.participant(visitor.user.id);
        await f.service.updateProfile(
          visitor.user.id,
          { active: false },
          record.user.version,
          f.adminId,
          randomUUID(),
          hash("deactivate-token-user"),
        );
        assert.equal((await login(visitor.user.token)).status, 401);
        assert.equal(
          (
            await handle(
              new Request(f.config.origin + "/api/v1/me", {
                headers: { cookie },
              }),
            )
          ).status,
          401,
        );
      },
    );
    await t.test(
      "un token inexistente no filtra perfiles y tiene límite persistente de intentos",
      async () => {
        const used = await f.db.query<{ public_token: string }>(
          "select public_token from camino.profiles",
        );
        const unknown = Array.from({ length: 65536 }, (_, n) =>
          n.toString(16).toUpperCase().padStart(4, "0"),
        ).find(
          (token) => !used.rows.some((row) => row.public_token === token),
        )!;
        for (let n = 0; n < 6; n++) {
          const response = await login(unknown);
          assert.equal(response.status, 401);
          assert.equal(
            JSON.stringify(await response.json()).includes("@"),
            false,
          );
        }
        assert.equal((await login(unknown)).status, 429);
        await f.db.exec("set role anon");
        await assert.rejects(
          () =>
            f.db.query(
              "select public.camino_login_token('ABCD',$1,now()+interval '1 hour')",
              [hash("anonymous")],
            ),
          /permission denied/,
        );
        await f.db.exec("reset role");
      },
    );
  } finally {
    await f.db.close();
  }
});

test("primer admin por token se crea sin ninguna cuenta Auth y solo una vez", async () => {
  const f = await backendFixture();
  try {
    await f.db.exec(
      "delete from camino.audit; delete from camino.profiles; delete from auth.users;",
    );
    const profile = {
      id: randomUUID(),
      firstName: "Admin",
      firstSurname: "Inicial",
      secondSurname: "Colegio",
      email: "primero@example.test",
      token: "F01C",
    };
    const created = await f.store.rpc<{ id: string; token: string }>(
      "camino_bootstrap_token_admin",
      { p_profile: profile },
    );
    assert.equal(created.id, profile.id);
    assert.equal(created.token, profile.token);
    const auth = await f.db.query<{ n: number }>(
      "select count(*)::integer n from auth.users",
    );
    assert.equal(auth.rows[0].n, 0);
    await assert.rejects(() =>
      f.store.rpc("camino_bootstrap_token_admin", {
        p_profile: {
          ...profile,
          id: randomUUID(),
          email: "otro@example.test",
          token: "F01D",
        },
      }),
    );
  } finally {
    await f.db.close();
  }
});
