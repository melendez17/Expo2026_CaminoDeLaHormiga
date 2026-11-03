import { z } from "zod";
import { args, connection, text } from "./common";
async function main() {
  const id = z.uuid().parse(text("id")),
    email = z.email().parse(text("email").trim().toLowerCase()),
    first = text("first"),
    surname1 = text("surname1"),
    surname2 = text("surname2");
  if (!args.apply) {
    console.log(
      "Solicitud válida. Usa --apply tras crear y verificar la cuenta en Supabase Auth.",
    );
    return;
  }
  const { client, store } = connection();
  const auth = await client.auth.admin.getUserById(id);
  if (auth.error || auth.data.user?.email?.toLowerCase() !== email)
    throw Error(
      "El ID y el correo no corresponden a la cuenta de Supabase Auth.",
    );
  await store.rpc("camino_bootstrap_admin", {
    p_id: id,
    p_first: first,
    p_surname1: surname1,
    p_surname2: surname2,
    p_email: email,
  });
  console.log(
    "Administrador inicial creado. Activa TOTP/MFA antes de llamar a la API.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "No se pudo crear el administrador.",
  );
  process.exitCode = 1;
});
