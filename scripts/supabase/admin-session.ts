import { writeFileSync, existsSync } from "node:fs";
import { args, connection, text } from "./common";
async function main() {
  const email = text("email"),
    output = text("output"),
    password = process.env.CAMINO_ADMIN_PASSWORD,
    code = process.env.CAMINO_TOTP_CODE;
  if (!password)
    throw Error(
      "Falta CAMINO_ADMIN_PASSWORD en el entorno temporal. Nunca lo pases como argumento.",
    );
  if (existsSync(output))
    throw Error("El archivo de salida ya existe. Usa otro nombre.");
  const { client } = connection(),
    login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session)
    throw Error("No se pudo autenticar la cuenta.");
  if (args.enroll) {
    const enrollment = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Camino ExpoTEC",
    });
    if (enrollment.error)
      throw Error(
        "No se pudo iniciar el alta TOTP. Revisa los factores en Supabase Auth.",
      );
    writeFileSync(output, enrollment.data.totp.qr_code, { mode: 0o600 });
    console.log(
      "QR TOTP guardado en el archivo privado indicado. Ábrelo localmente, escanéalo con tu autenticador y vuelve a ejecutar sin --enroll con un código TOTP. Elimina el QR después.",
    );
    return;
  }
  if (!code || !/^\d{6}$/.test(code))
    throw Error(
      "Falta CAMINO_TOTP_CODE con el código temporal del autenticador.",
    );
  const factors = await client.auth.mfa.listFactors();
  const factor =
    factors.data?.all.find(
      (f) => f.factor_type === "totp" && f.status === "verified",
    ) ?? factors.data?.all.find((f) => f.factor_type === "totp");
  if (!factor) throw Error("Primero inscribe TOTP con --enroll.");
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  if (verified.error) throw Error("El código TOTP no es válido.");
  const current = await client.auth.getSession();
  if (!current.data.session) throw Error("No se pudo recuperar la sesión.");
  writeFileSync(
    output,
    JSON.stringify(
      {
        accessToken: current.data.session.access_token,
        expiresAt: current.data.session.expires_at,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    "Sesión administrativa con MFA guardada en el archivo privado indicado. No se imprimió el token. Elimina el archivo al finalizar la prueba.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo autenticar.",
  );
  process.exitCode = 1;
});
