import { readFileSync } from "node:fs";
import { args, text } from "./common";
async function main() {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw Error("Falta APP_ORIGIN.");
  const input = JSON.parse(readFileSync(text("session-file"), "utf8"));
  const response = await fetch(origin + "/api/v1/admin/me", {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    redirect: "error",
  });
  if (!response.ok)
    throw Error(
      `La API respondió ${response.status}. Verifica configuración, origen y MFA.`,
    );
  const body = await response.json();
  console.log(
    JSON.stringify({
      connected: true,
      role: body.user.role,
      mfaRequired: body.mfaRequired,
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo consultar la API.",
  );
  process.exitCode = 1;
});
