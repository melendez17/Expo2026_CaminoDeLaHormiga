import { args, connection, readCatalog } from "./common";
import campus from "../../src/lib/campus.json";
async function main() {
  const catalog = readCatalog();
  console.log(
    `Catálogo válido: ${catalog.projects.length} proyectos, ${catalog.challenges.length} retos, ${catalog.agenda.length} actividades. No incluye usuarios de demostración.`,
  );
  if (!args.apply) {
    console.log(
      "Validación sin cambios. Usa --apply para inicializar la base configurada.",
    );
    return;
  }
  const { store } = connection();
  const existing = await store.rpc("camino_catalog");
  if (existing) {
    if (!args["replace-empty"])
      throw Error(
        "La base ya fue inicializada. Usa la API administrativa; --replace-empty solo funciona sin participantes.",
      );
    await store.rpc("camino_seed_catalog", { p_catalog: catalog });
  } else
    await store.rpc("camino_initialize", {
      p_catalog: catalog,
      p_buildings: campus.names,
    });
  console.log(
    "Catálogo inicializado. Se conservaron las restricciones de la base.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "No se pudo inicializar.",
  );
  process.exitCode = 1;
});
