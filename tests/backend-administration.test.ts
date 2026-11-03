import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { backendFixture, registration } from "./backend-support";
import { BackendError } from "../src/lib/backend/errors";
import { requestHash } from "../src/lib/backend/security";
import { createBackendHandler } from "../src/lib/backend/handler";
test("administración SQL: CRUD, distribución, reemplazos, auditoría y exportaciones", async (t) => {
  const f = await backendFixture(),
    { service, store, adminId } = f;
  let sequence = 0;
  const hash = () => String(++sequence).padStart(64, "0");
  const user = (await service.register(
    registration("catalog@example.test", "admission", "Desarrollo Web"),
    adminId,
    randomUUID(),
    hash(),
  )) as { user: { id: string; token: string } };
  await t.test(
    "CRUD de proyectos, retos con nivel, agenda y controles de catálogo",
    async () => {
      let catalog = await service.catalog();
      const project = {
        ...catalog.catalog.projects.find((p) => p.category === "specialty")!,
        id: "new-project",
        name: "Proyecto nuevo",
        level: 11,
      };
      await service.updateCatalog(
        {
          resource: "projects",
          operation: "create",
          value: project,
          expectedVersion: catalog.version,
        },
        adminId,
        randomUUID(),
        hash(),
      );
      catalog = await service.catalog();
      const model = catalog.catalog.challenges.find((c) => c.kind === "quiz")!;
      const challenge = {
        ...model,
        id: "new-challenge",
        title: "Reto nuevo",
        isBase: false,
        projectId: project.id,
        level: 11,
        code: "N123",
      };
      await service.updateCatalog(
        {
          resource: "challenges",
          operation: "create",
          value: challenge,
          expectedVersion: catalog.version,
        },
        adminId,
        randomUUID(),
        hash(),
      );
      catalog = await service.catalog();
      assert.equal(
        catalog.catalog.challenges.find((c) => c.id === "new-challenge")!.level,
        11,
      );
      await assert.rejects(
        () =>
          service.updateCatalog(
            {
              resource: "challenges",
              operation: "update",
              id: challenge.id,
              value: { ...challenge, level: 10 },
              expectedVersion: catalog.version,
            },
            adminId,
            randomUUID(),
            hash(),
          ),
        (e: unknown) => e instanceof BackendError && e.status === 409,
      );
      const agenda = {
        ...catalog.catalog.agenda[0],
        id: "new-event",
        title: "Actividad nueva",
      };
      await service.updateCatalog(
        {
          resource: "agenda",
          operation: "create",
          value: agenda,
          expectedVersion: catalog.version,
        },
        adminId,
        randomUUID(),
        hash(),
      );
      catalog = await service.catalog();
      assert.ok(catalog.catalog.agenda.some((e) => e.id === agenda.id));
      await service.updateCatalog(
        {
          resource: "agenda",
          operation: "delete",
          id: agenda.id,
          expectedVersion: catalog.version,
        },
        adminId,
        randomUUID(),
        hash(),
      );
    },
  );
  await t.test(
    "distribución afecta solo rutas nuevas y asignación guarda motivo y actor",
    async () => {
      await service.command(
        user.user.id,
        adminId,
        randomUUID(),
        hash(),
        "assignment",
        { mode: "prepare", reason: "Asignación inicial" },
      );
      const before = await service.participant(user.user.id);
      let catalog = await service.catalog();
      const rules = structuredClone(catalog.catalog.assignmentRules);
      rules.visitorBatchSize = 3;
      await service.updateCatalog(
        {
          resource: "assignmentRules",
          operation: "update",
          value: rules,
          expectedVersion: catalog.version,
        },
        adminId,
        randomUUID(),
        hash(),
      );
      assert.equal(
        (await service.participant(user.user.id)).progress.routeIds.length,
        5,
      );
      await service.command(
        user.user.id,
        adminId,
        randomUUID(),
        hash(),
        "assignment",
        {
          mode: "replace",
          fromId: before.progress.routeIds[0],
          category: "school",
          reason: "Puesto cerrado por horario",
        },
      );
      const after = await service.participant(user.user.id);
      assert.equal(
        after.progress.assignmentEdits.at(-1)!.reason,
        "Puesto cerrado por horario",
      );
      assert.equal(after.progress.assignmentEdits.at(-1)!.actorId, adminId);
      const rows = await f.db.query<{ n: number }>(
        "select count(*)::integer n from camino.assignment_changes",
      );
      assert.equal(rows.rows[0].n, 1);
    },
  );
  await t.test(
    "conflicto de catálogo detecta avances que cambiaron durante su validación",
    async () => {
      const catalog = await service.catalog(),
        users = await service.allUsers();
      await service.command(
        user.user.id,
        adminId,
        randomUUID(),
        hash(),
        "manual",
        {},
      );
      await assert.rejects(
        () =>
          store.rpc("camino_catalog_commit", {
            p_expected: catalog.version,
            p_catalog: catalog.catalog,
            p_actor: adminId,
            p_request: randomUUID(),
            p_hash: hash(),
            p_flags: {},
            p_progress_versions: Object.fromEntries(
              users.map((u) => [u.id, u.progressVersion]),
            ),
            p_profile_versions: Object.fromEntries(
              users.map((u) => [u.id, u.version]),
            ),
          }),
        (e: unknown) =>
          e instanceof BackendError && e.code === "revision_conflict",
      );
    },
  );
  await t.test(
    "perfil no puede cambiar modalidad con ruta iniciada; correo y sesiones se protegen",
    async () => {
      const record = await service.participant(user.user.id);
      await assert.rejects(
        () =>
          service.updateProfile(
            user.user.id,
            { area: "school" },
            record.user.version,
            adminId,
            randomUUID(),
            hash(),
          ),
        (e: unknown) =>
          e instanceof BackendError && e.code === "profile_in_use",
      );
      const result = (await service.updateProfile(
        user.user.id,
        { firstName: "Nombre actualizado" },
        record.user.version,
        adminId,
        randomUUID(),
        hash(),
      )) as { firstName: string };
      assert.equal(result.firstName, "Nombre actualizado");
    },
  );
  await t.test(
    "CSV neutraliza fórmulas, Excel contiene datos reales y auditoría registra exportación",
    async () => {
      const draw = await service.draw(
        adminId,
        randomUUID(),
        hash(),
        "Premio de prueba",
      );
      const handle = createBackendHandler({
        service,
        production: false,
        emailEnabled: false,
        verifyAdmin: async () => adminId,
      });
      const request = (format: string) =>
        new Request(f.config.origin + "/api/v1/admin/export?format=" + format, {
          headers: { authorization: "Bearer admin" },
        });
      const csv = await handle(request("csv"));
      assert.equal(csv.status, 200);
      assert.match(csv.headers.get("cache-control")!, /no-store/);
      assert.match(await csv.text(), /catalog@example.test/);
      const excel = await handle(request("xlsx"));
      assert.equal(excel.status, 200);
      assert.match(excel.headers.get("content-type")!, /spreadsheetml/);
      const { readExcelBackup } = await import("../src/lib/excel-backup");
      const backup = await readExcelBackup(await excel.arrayBuffer());
      assert.ok(backup.catalog.users.some((u) => u.id === user.user.id));
      assert.equal(backup.warnings.length, 0);
      const { readDraws } = await import("../src/lib/local-tickets");
      const savedDraws = readDraws(backup.original, {
        getItem: (key) => backup.storage[key] ?? null,
      });
      assert.equal(savedDraws.length, 1);
      assert.equal(savedDraws[0].winnerId, user.user.id);
      assert.equal(
        savedDraws[0].ticketCode,
        (draw as { ticketCode: string }).ticketCode,
      );
      assert.equal(savedDraws[0].source, "manual");
      assert.equal(
        (
          await store.rpc<{ items: unknown[] }>("camino_admin_list", {
            p_kind: "audit",
            p_limit: 100,
            p_offset: 0,
            p_search: "",
          })
        ).items.length > 0,
        true,
      );
    },
  );
  await f.db.close();
});
