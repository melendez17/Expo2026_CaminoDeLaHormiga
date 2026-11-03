import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertVerifiedAdminClaims,
  canonicalJson,
  credentialHash,
  decrypt,
  encrypt,
  enforceOrigin,
  equalSecret,
  hash,
  readCookie,
  readJson,
  requestHash,
  sessionCookieName,
} from "../src/lib/backend/security";
import { profileInput } from "../src/lib/backend/contracts";
import { BackendError } from "../src/lib/backend/errors";
test("normalización de correo, nombres separados y prohibición de privilegios enviados por el usuario", () => {
  const input = {
    firstName: " Ana ",
    firstSurname: " Prueba ",
    secondSurname: " Colegio ",
    email: " ANA@EXAMPLE.TEST ",
    role: "visitor",
    area: "school",
    consent: true,
  };
  assert.equal(profileInput.parse(input).email, "ana@example.test");
  assert.equal(profileInput.parse(input).firstName, "Ana");
  assert.throws(() => profileInput.parse({ ...input, role: "admin" }));
  assert.throws(() => profileInput.parse({ ...input, firstSurname: "" }));
  assert.throws(() =>
    profileInput.parse({ ...input, auth_user_id: "attacker" }),
  );
});
test("huellas canónicas, HMAC con secreto y cifrado autenticado", () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }));
  assert.equal(
    requestHash("POST", "/me/votes", { a: 1, b: 2 }),
    requestHash("POST", "/me/votes", { b: 2, a: 1 }),
  );
  assert.notEqual(
    credentialHash("AAAA", "pepper-1"),
    credentialHash("AAAA", "pepper-2"),
  );
  const key = "ab".repeat(32),
    a = encrypt({ credential: "private" }, key),
    b = encrypt({ credential: "private" }, key);
  assert.notEqual(a, b);
  assert.deepEqual(decrypt(a, key), { credential: "private" });
  assert.throws(() => decrypt(a, "cd".repeat(32)));
  const changed = Buffer.from(a, "base64url");
  changed[30] ^= 1;
  assert.throws(() => decrypt(changed.toString("base64url"), key));
  assert.ok(equalSecret("test", "test"));
  assert.ok(!equalSecret("test", "tests"));
});
test("CSRF, cookies estrictas y cuerpo limitado incluso sin content-length", async () => {
  assert.throws(() =>
    enforceOrigin(
      new Request("https://school.test", {
        headers: { origin: "https://other.test" },
      }),
      "https://school.test",
    ),
  );
  assert.throws(() =>
    enforceOrigin(
      new Request("https://school.test", {
        headers: {
          origin: "https://school.test",
          "sec-fetch-site": "cross-site",
        },
      }),
      "https://school.test",
    ),
  );
  const name = sessionCookieName(true);
  assert.equal(name, "__Host-camino_session");
  assert.equal(
    readCookie(
      new Request("https://school.test", {
        headers: { cookie: name + "=" + "a".repeat(43) },
      }),
      name,
    ),
    "a".repeat(43),
  );
  assert.equal(
    readCookie(
      new Request("https://school.test", {
        headers: { cookie: name + "=AAAA" },
      }),
      name,
    ),
    null,
  );
  assert.equal(
    readCookie(
      new Request("https://school.test", {
        headers: {
          cookie: `${name}=${"a".repeat(43)}; ${name}=${"b".repeat(43)}`,
        },
      }),
      name,
    ),
    null,
  );
  const schema = { parse: (v: unknown) => v };
  await assert.rejects(
    () =>
      readJson(
        new Request("https://school.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ a: "x".repeat(300) }),
        }),
        schema,
        100,
      ),
    (e: unknown) => e instanceof BackendError && e.status === 413,
  );
  await assert.rejects(
    () =>
      readJson(
        new Request("https://school.test", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "{}",
        }),
        schema,
      ),
    (e: unknown) => e instanceof BackendError && e.status === 415,
  );
});
test("claims administrativos requieren identidad e issuer verificados y segundo factor", () => {
  const issuer = "https://project.supabase.co/auth/v1",
    payload = {
      sub: "verified-user",
      iss: issuer,
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 60,
      aal: "aal2",
    },
    token = (value: unknown) =>
      "header." +
      Buffer.from(JSON.stringify(value)).toString("base64url") +
      ".signature";
  assert.doesNotThrow(() =>
    assertVerifiedAdminClaims(token(payload), "verified-user", issuer),
  );
  assert.throws(
    () =>
      assertVerifiedAdminClaims(
        token({ ...payload, aal: "aal1" }),
        "verified-user",
        issuer,
      ),
    (e: unknown) => e instanceof BackendError && e.code === "mfa_required",
  );
  assert.throws(() =>
    assertVerifiedAdminClaims(token(payload), "different-user", issuer),
  );
  assert.throws(() =>
    assertVerifiedAdminClaims(
      token({ ...payload, iss: "https://attacker.test" }),
      "verified-user",
      issuer,
    ),
  );
  assert.throws(() =>
    assertVerifiedAdminClaims(
      token({ ...payload, exp: 0 }),
      "verified-user",
      issuer,
    ),
  );
});

test("el adaptador conserva requestId al perderse una respuesta y permite reintento sin duplicar", async () => {
  const { createApiClient, ApiClientError } =
    await import("../src/lib/api-client");
  const previous = globalThis.fetch,
    seen = new Set<string>();
  let commits = 0,
    first = true;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (!seen.has(body.requestId)) {
      seen.add(body.requestId);
      commits++;
    }
    if (first) {
      first = false;
      throw new TypeError("Lost response");
    }
    return Response.json({ commits });
  };
  try {
    const client = createApiClient();
    let id = "";
    try {
      await client.vote("agua");
      assert.fail("Debe simular pérdida de respuesta");
    } catch (error) {
      assert.ok(error instanceof ApiClientError);
      assert.equal(error.code, "network_error");
      id = error.requestId!;
      assert.match(id, /^[0-9a-f-]{36}$/);
    }
    assert.deepEqual(await client.vote("agua", id), { commits: 1 });
    assert.equal(commits, 1);
  } finally {
    globalThis.fetch = previous;
  }
});

test("diagnóstico CLI conserva el código SQL sin volcar filas, claves o correos", async () => {
  const { databaseDiagnostic } =
    await import("../scripts/supabase/diagnostics");
  const output = databaseDiagnostic("camino_initialize", {
    code: "42501",
    message:
      "permission denied for schema camino; persona@example.com; Bearer secreto; sb_secret_prueba_larga",
  });
  assert.match(output, /42501/);
  assert.match(output, /schema camino/);
  assert.equal(output.includes("persona@example.com"), false);
  assert.equal(output.includes("Bearer secreto"), false);
  assert.equal(output.includes("sb_secret_prueba_larga"), false);
  const invalid = databaseDiagnostic("camino_initialize", {
    code: "22P02",
    message: 'invalid input syntax for type integer: "123456"',
  });
  assert.equal(invalid.includes("123456"), false);
});
