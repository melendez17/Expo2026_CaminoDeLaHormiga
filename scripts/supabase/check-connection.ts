import { connection } from "./common";
async function main() {
  const { store } = connection();
  const catalog = await store.rpc<{
    version: number;
    catalog: { projects: unknown[]; challenges: unknown[]; agenda: unknown[] };
  } | null>("camino_catalog");
  if (!catalog)
    throw Error("Conexión válida, pero falta inicializar el catálogo.");
  console.log(
    JSON.stringify({
      connected: true,
      catalogVersion: catalog.version,
      projects: catalog.catalog.projects.length,
      challenges: catalog.catalog.challenges.length,
      agenda: catalog.catalog.agenda.length,
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo conectar.",
  );
  process.exitCode = 1;
});
