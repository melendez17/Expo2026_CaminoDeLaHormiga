import { readFileSync } from "node:fs";
import { text } from "./common";
async function main() {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw Error("Falta APP_ORIGIN.");
  const account = JSON.parse(readFileSync(text("token-file"), "utf8"));
  const response = await fetch(origin + "/api/v1/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ token: account.token }),
    redirect: "error",
  });
  if (!response.ok)
    throw Error(
      `El acceso respondió ${response.status}. Revisa token y configuración.`,
    );
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw Error("No se recibió la sesión.");
  try {
    const me = await fetch(origin + "/api/v1/admin/me", {
      headers: { Cookie: cookie },
      redirect: "error",
    });
    if (!me.ok)
      throw Error(
        `La API respondió ${me.status}. Verifica que el token sea de admin.`,
      );
    const body = await me.json();
    console.log(
      JSON.stringify({
        connected: true,
        role: body.user.role,
        mfaRequired: body.mfaRequired,
      }),
    );
  } finally {
    await fetch(origin + "/api/v1/auth/logout", {
      method: "POST",
      headers: { Origin: origin, Cookie: cookie },
      redirect: "error",
    });
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo consultar la API.",
  );
  process.exitCode = 1;
});
