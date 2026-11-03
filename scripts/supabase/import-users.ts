import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { args, service, text } from "./common";
import { profileInput } from "../../src/lib/backend/contracts";
import { canonicalJson, requestHash } from "../../src/lib/backend/security";
import {
  localDataSchema,
  parseProgress,
  storageKey,
  type LocalProgress,
  type LocalUser,
} from "../../src/lib/local-game";
import { restoreCompatibleProgress } from "../../src/lib/progress-storage";
import { projection } from "../../src/lib/backend/domain";
function stableId(value: string) {
  const b = createHash("sha256").update(value).digest().subarray(0, 16);
  b[6] = (b[6] & 15) | 80;
  b[8] = (b[8] & 63) | 128;
  const s = b.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
async function main() {
  const raw = JSON.parse(readFileSync(text("file"), "utf8"));
  const list = Array.isArray(raw) ? raw : (raw.users ?? raw.catalog?.users);
  if (!Array.isArray(list))
    throw Error("Se esperaba un arreglo de usuarios o un catálogo JSON.");
  const entries = list
    .filter((u: { role?: string }) => u.role !== "admin")
    .map((u: Record<string, unknown>) => ({
      old: u,
      input: profileInput.parse({
        firstName: u.firstName,
        firstSurname: u.firstSurname,
        secondSurname: u.secondSurname,
        email: u.email,
        role: u.role,
        area: u.area,
        consent: true,
      }),
    }));
  const emails = new Set<string>();
  for (const entry of entries) {
    if (emails.has(entry.input.email))
      throw Error(
        "El archivo contiene correos repetidos. Corrígelo antes de importar.",
      );
    emails.add(entry.input.email);
  }
  // Validate every historical snapshot BEFORE creating anyone. This is a privileged,
  // trusted migration, never an endpoint for participant-supplied progress.
  const historical = new Map<string, LocalProgress>();
  let sourceCatalog: ReturnType<typeof localDataSchema.parse> | undefined;
  if (args["include-progress"]) {
    if (!raw.catalog && !raw.projects)
      throw Error(
        "El avance requiere catálogo y storage del respaldo JSON privado.",
      );
    sourceCatalog = localDataSchema.parse(raw.catalog ?? raw);
    for (const entry of entries) {
      const oldId = String(entry.old.id ?? "");
      const snapshot = raw.storage?.[storageKey(sourceCatalog, oldId)];
      if (snapshot)
        historical.set(
          oldId,
          restoreCompatibleProgress(
            sourceCatalog,
            oldId,
            typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot,
          ),
        );
    }
  }
  console.log(
    `${entries.length} perfiles y ${historical.size} avances válidos.`,
  );
  if (!args.apply) {
    console.log("Validación sin cambios. No se inventan correos ni apellidos.");
    return;
  }
  const actor = text("actor"),
    output = text("credentials-output");
  if (existsSync(output))
    throw Error(
      "El archivo de credenciales ya existe. Usa otro nombre para conservarlo.",
    );
  const { service: backend, store } = service(),
    catalog = await backend.catalog();
  if (sourceCatalog) {
    const { users: ignored, ...source } = sourceCatalog;
    if (canonicalJson(source) !== canonicalJson(catalog.catalog)) {
      throw Error(
        "El catálogo de destino debe coincidir con el respaldo antes de importar avances. Inicializa primero ese catálogo.",
      );
    }
  }
  const credentials: { oldId: string; user: LocalUser; access: unknown }[] = [];
  for (const entry of entries) {
    const request = stableId(
      `import:${catalog.catalog.settings.dataVersion}:${entry.input.email}`,
    );
    const result = (await backend.register(
      entry.input,
      actor,
      request,
      requestHash("CLI", "import/users", entry.input),
    )) as { user: LocalUser; access: unknown };
    credentials.push({ oldId: String(entry.old.id ?? ""), ...result });
    writeFileSync(output, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });
  }
  const data = backend.data(
    catalog,
    credentials.map((c) => c.user),
  );
  for (const entry of credentials) {
    const old = historical.get(entry.oldId);
    if (!old) continue;
    const next: LocalProgress = {
      ...old,
      userId: entry.user.id,
      dataVersion: data.settings.dataVersion,
      manualTickets: old.manualTickets.map((t) => ({ ...t, actorId: actor })),
      assignmentEdits: old.assignmentEdits.map((edit) => ({
        ...edit,
        actorId: actor,
      })),
    };
    const progress = parseProgress(data, entry.user.id, next),
      record = await backend.participant(entry.user.id);
    const request = stableId(
      `import-progress:${data.settings.dataVersion}:${entry.user.email}`,
    );
    const fingerprint = requestHash("CLI", "import/progress", progress);
    if (await backend.cached(actor, request, fingerprint)) continue;
    await store.rpc("camino_commit", {
      p_id: entry.user.id,
      p_expected: record.version,
      p_catalog_version: catalog.version,
      p_progress: progress,
      p_projection: projection(data, progress),
      p_actor: actor,
      p_request: request,
      p_hash: fingerprint,
      p_result: { operation: "trusted-import" },
    });
  }
  console.log(
    "Importación completada. Credenciales privadas guardadas solo en el archivo indicado. Protégelo y elimínalo después de entregar los accesos.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo importar.",
  );
  process.exitCode = 1;
});
