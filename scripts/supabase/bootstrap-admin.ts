import { randomUUID } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { args, connection, text } from "./common";
import { profileInput } from "../../src/lib/backend/contracts";
import { publicToken } from "../../src/lib/backend/security";
import { BackendError } from "../../src/lib/backend/errors";
async function main() {
  const input = profileInput
    .pick({
      firstName: true,
      firstSurname: true,
      secondSurname: true,
      email: true,
    })
    .parse({
      firstName: text("first"),
      firstSurname: text("surname1"),
      secondSurname: text("surname2"),
      email: text("email"),
    });
  if (!args.apply) {
    console.log(
      "Solicitud válida. El administrador ingresará directamente con su token, sin Supabase Auth ni MFA.",
    );
    return;
  }
  const output = text("token-output");
  if (existsSync(output))
    throw Error("El archivo de salida ya existe. Usa otro nombre.");
  const { store } = connection();
  const id = randomUUID();
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const result = await store.rpc("camino_bootstrap_token_admin", {
        p_profile: { ...input, id, token: publicToken() },
      });
      writeFileSync(output, JSON.stringify(result, null, 2), {
        mode: 0o600,
        flag: "wx",
      });
      console.log(
        "Primer administrador creado. Su token privado está en el archivo indicado; no se imprimió en consola.",
      );
      return;
    } catch (error) {
      if (error instanceof BackendError && error.code === "token_collision")
        continue;
      throw error;
    }
  }
  throw Error("No se pudo reservar un token único.");
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "No se pudo crear el administrador.",
  );
  process.exitCode = 1;
});
