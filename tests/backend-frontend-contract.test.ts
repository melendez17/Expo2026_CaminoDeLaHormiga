import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backendFixture, registration } from "./backend-support";
import { createBackendHandler } from "../src/lib/backend/handler";
import { BackendError } from "../src/lib/backend/errors";
import { hash } from "../src/lib/backend/security";
test("contrato de frontend: sesión, catálogo seguro, filtros globales y administración completa", async () => {
  const f = await backendFixture();
  try {
    const handle = createBackendHandler({
      service: f.service,
      production: false,
      emailEnabled: false,
      verifyAdmin: async () => {
        throw new BackendError(
          401,
          "authentication_required",
          "Inicia sesión.",
        );
      },
      createAdmin: (input, actor, request, fingerprint) =>
        f.service.createAdmin(input, actor, request, fingerprint),
    });
    const send = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie?: string,
      expectedUser?: string,
    ) =>
      handle(
        new Request(f.config.origin + "/api/v1/" + path, {
          method,
          headers: {
            Origin: f.config.origin,
            "content-type": "application/json",
            ...(cookie ? { cookie } : {}),
            ...(expectedUser ? { "X-Camino-User": expectedUser } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    const login = await send("auth/login", "POST", { token: "ADM1" }),
      cookie = login.headers.get("set-cookie")!.split(";")[0];
    const session = await send("auth/session", "GET", undefined, cookie);
    assert.equal(session.status, 200);
    assert.equal((await session.json()).user.role, "admin");
    assert.equal((await send("auth/session")).status, 401);
    const catalog = await send("catalog");
    const publicCatalog = await catalog.json();
    assert.equal(publicCatalog.settings.extraEvery, 2);
    assert.equal(publicCatalog.users, undefined);
    assert.equal(publicCatalog.challenges, undefined);
    const adminCatalog = await (
      await send("admin/catalog", "GET", undefined, cookie)
    ).json();
    assert.equal(adminCatalog.admins[0].id, f.adminId);
    const user = await f.service.register(
      registration("paged@example.test"),
      f.adminId,
      randomUUID(),
      hash("paged"),
    );
    const createdRead = await (
      await send("admin/catalog", "GET", undefined, cookie)
    ).json();
    assert.equal(createdRead.lastCreated.id, user.user.id);
    const visitorLogin = await send("auth/login", "POST", {
      token: user.user.token,
    });
    const visitorCookie = visitorLogin.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (
        await send(
          "me/start",
          "POST",
          { requestId: randomUUID() },
          visitorCookie,
          f.adminId,
        )
      ).status,
      409,
    );
    assert.equal(
      (await f.service.participant(user.user.id)).progress.startedAt,
      null,
    );
    assert.equal(
      (await send("admin/users", "GET", undefined, visitorCookie, f.adminId))
        .status,
      409,
    );
    assert.equal(
      (await send("auth/logout", "POST", {}, visitorCookie, f.adminId)).status,
      409,
    );
    assert.equal(
      (await send("auth/session", "GET", undefined, visitorCookie)).status,
      200,
    );
    let users = await (
      await send(
        "admin/users?limit=1&status=Sin%20activar&sort=name",
        "GET",
        undefined,
        cookie,
      )
    ).json();
    assert.equal(users.total, 1);
    assert.equal(users.items[0].startedAt, null);
    assert.equal(users.items[0].progress, undefined);
    await f.service.command(
      user.user.id,
      user.user.id,
      randomUUID(),
      hash("start-paged"),
      "start",
      {},
    );
    users = await (
      await send("admin/users?status=En%20proceso", "GET", undefined, cookie)
    ).json();
    assert.equal(users.total, 1);
    assert.ok(users.items[0].startedAt);
    const staff = await (
      await send(
        "admin/staff",
        "POST",
        {
          requestId: randomUUID(),
          firstName: "Admin",
          firstSurname: "Segundo",
          secondSurname: "Colegio",
          email: "staff-edit@example.test",
        },
        cookie,
      )
    ).json();
    const patch = await send(
      "admin/staff/" + staff.id,
      "PATCH",
      { requestId: randomUUID(), expectedVersion: 0, firstName: "Editado" },
      cookie,
    );
    assert.equal(patch.status, 200);
    assert.equal((await patch.json()).firstName, "Editado");
    const conflict = await send(
      "admin/staff/" + staff.id,
      "PATCH",
      { requestId: randomUUID(), expectedVersion: 0, firstName: "Obsoleto" },
      cookie,
    );
    assert.equal(conflict.status, 409);
    const ownDelete = await send(
      "admin/staff/" + f.adminId,
      "DELETE",
      { requestId: randomUUID(), expectedVersion: 0 },
      cookie,
    );
    assert.equal(ownDelete.status, 403);
    const deleted = await send(
      "admin/staff/" + staff.id,
      "DELETE",
      { requestId: randomUUID(), expectedVersion: 1 },
      cookie,
    );
    assert.equal(deleted.status, 200);
    assert.equal(
      (await send("auth/login", "POST", { token: staff.token })).status,
      401,
    );
    assert.equal(
      (await send("admin/raffle-status", "GET", undefined, cookie)).status,
      200,
    );
  } finally {
    await f.db.close();
  }
});
