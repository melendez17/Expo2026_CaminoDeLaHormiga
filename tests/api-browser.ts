import { chromium, type BrowserContext, type Page } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { backendFixture, registration } from "./backend-support";
import { createBackendHandler } from "../src/lib/backend/handler";
import { BackendError } from "../src/lib/backend/errors";
import { hash } from "../src/lib/backend/security";
import {
  saintQuestion,
  type LocalChallenge,
  type Answers,
} from "../src/lib/local-game";
async function main() {
  const base = process.env.BASE_URL ?? "http://localhost:3008",
    f = await backendFixture();
  f.config.origin = new URL(base).origin;
  const visitor = await f.service.register(
    registration("browser-api@example.test", "visitor", "Ciberseguridad"),
    f.adminId,
    randomUUID(),
    hash("browser-register"),
  );
  const handle = createBackendHandler({
    service: f.service,
    production: false,
    emailEnabled: false,
    verifyAdmin: async () => {
      throw new BackendError(401, "authentication_required", "Inicia sesión.");
    },
    createAdmin: (input, actor, request, fingerprint) =>
      f.service.createAdmin(input, actor, request, fingerprint),
  });
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors: string[] = [],
    calls: string[] = [];
  let localDataCalls = 0,
    dropManualReply = false;
  async function instrument(context: BrowserContext) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem("camino-local-user", "untrusted");
      } catch {}
    });
    context.on("page", (page) =>
      page.on("pageerror", (e) => errors.push(e.message)),
    );
    await context.route("**/data/*.json", (route) => {
      localDataCalls++;
      return route.abort();
    });
    await context.route("**/api/v1/**", async (route) => {
      const req = route.request(),
        method = req.method(),
        headers = await req.allHeaders();
      calls.push(method + " " + new URL(req.url()).pathname);
      try {
        const response = await handle(
          new Request(req.url(), {
            method,
            headers,
            body: ["GET", "HEAD"].includes(method)
              ? undefined
              : (req.postData() ?? undefined),
          }),
        );
        if (
          dropManualReply &&
          method === "POST" &&
          new URL(req.url()).pathname.endsWith("/admin/tickets")
        ) {
          dropManualReply = false;
          await route.abort("failed");
          return;
        }
        await route.fulfill({
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: Buffer.from(await response.arrayBuffer()),
        });
      } catch (e) {
        errors.push(String(e));
        await route.fulfill({ status: 500, body: "test adapter error" });
      }
    });
  }
  const login = async (page: Page, token: string) => {
    await page.getByLabel("Token de acceso").fill(token);
    await page.getByRole("button", { name: "Ingresar →", exact: true }).click();
  };
  const nav = (page: Page, name: string) =>
    page
      .getByRole("navigation", { name: "Navegación principal" })
      .getByRole("button", { name, exact: true });
  const adminNav = (page: Page, name: string) =>
    page.getByRole("navigation").getByRole("button", { name, exact: true });
  async function finish(page: Page, c: LocalChallenge, wrong = false) {
    await page
      .getByRole("button", { name: "Responder: " + c.title, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    assert.equal(
      await dialog.getByText("Ayuda para probar este reto").count(),
      0,
    );
    if (c.kind === "freeform") {
      await dialog.getByLabel("Nombre del proyecto").fill("Proyecto de prueba");
      await dialog.getByLabel("Nivel", { exact: true }).fill("Décimo");
      await dialog
        .getByLabel("¿Qué descubriste?")
        .fill("Aprendí a cuidar el agua y usar sensores.");
    }
    if (c.kind === "quiz")
      for (const [index, q] of (c.questions ?? []).entries())
        await dialog
          .locator(
            `input[name="${q.id}"][value="${wrong && index === 0 ? (q.correctIndex + 1) % q.options.length : q.correctIndex}"]`,
          )
          .check();
    if (c.kind === "quiz" || c.kind === "code")
      await dialog.getByLabel("Código del stand").fill(c.code!);
    if (c.kind === "saint")
      await dialog
        .locator(
          `input[name="saintChoice"][value="${wrong ? (saintQuestion(c).correctIndex + 1) % saintQuestion(c).options.length : saintQuestion(c).correctIndex}"]`,
        )
        .check();
    await dialog
      .getByRole("button", { name: "Completar reto", exact: true })
      .click();
  }
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    await instrument(context);
    const page = await context.newPage();
    await page.goto(base);
    await page.getByLabel("Token de acceso").waitFor();
    assert.equal(await page.getByText("Ver usuarios para probar").count(), 0);
    await login(page, visitor.user.token);
    await page.getByRole("heading", { name: "Bienvenido, Ana." }).waitFor();
    await page.getByRole("button", { name: "Iniciar el camino →" }).click();
    await page.locator(".challenge-card").first().waitFor();
    assert.equal(await page.locator(".challenge-card").count(), 2);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: "/tmp/api-connected-mobile.png",
      fullPage: true,
    });
    const state = await f.service.participant(visitor.user.id),
      quiz = f.catalog.challenges.find(
        (c) =>
          state.progress.visitorRounds[0].includes(c.id) && c.kind === "quiz",
      )!;
    await finish(page, quiz, true);
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("button", { name: "Volver a mis retos" }).click();
    await page.locator(".failed-challenge-card").waitFor();
    await page
      .getByRole("button", { name: "Revisar intento: " + quiz.title })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("heading", { name: quiz.title, exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Cerrar revisión", exact: true })
      .click();
    const updated = await f.service.participant(visitor.user.id);
    for (const id of updated.progress.visitorRounds[0]) {
      const c = f.catalog.challenges.find((c) => c.id === id)!;
      await finish(page, c);
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    }
    await nav(page, "Mi resumen").click();
    await page.getByTestId("ticket-count").filter({ hasText: "1" }).waitFor();
    assert.equal(await page.getByText("Importar mi progreso JSON").count(), 0);
    await nav(page, "Votar").click();
    await page
      .locator(".project-grid article")
      .first()
      .getByRole("button", { name: "Dar 1 voto" })
      .click();
    await page.getByRole("button", { name: "Confirmar voto" }).click();
    await page.getByText("¡Voto para", { exact: false }).waitFor();
    assert.equal(
      (await f.service.participant(visitor.user.id)).progress.votes.length,
      1,
    );
    await page.reload();
    await page.locator(".challenge-card").first().waitFor();
    await nav(page, "Mi resumen").click();
    assert.equal(await page.getByTestId("available-votes").innerText(), "0");
    await page
      .getByLabel("¿Qué esperabas descubrir?")
      .fill("Conocer proyectos de tecnología.");
    await page.getByLabel("¿Qué área te interesa?").fill("Desarrollo Web");
    await page.getByRole("button", { name: "Enviar encuesta" }).click();
    await page.getByText("Encuesta completada", { exact: false }).waitFor();
    assert.ok((await f.service.participant(visitor.user.id)).progress.survey);
    const ownDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar mi avance" }).click();
    assert.equal((await ownDownload).suggestedFilename(), "mi-avance.json");
    await nav(page, "Retos").click();
    await page.getByRole("button", { name: /^Retos adicionales/ }).click();
    await page.getByRole("button", { name: "Recibir otros 2 retos" }).click();
    await page.locator(".challenge-card").first().waitFor();
    assert.equal(
      (await f.service.participant(visitor.user.id)).progress.visitorRounds
        .length,
      2,
    );
    const other = await browser.newContext();
    await instrument(other);
    const second = await other.newPage();
    await second.goto(base);
    await login(second, visitor.user.token);
    await second.locator(".challenge-card.done").first().waitFor();
    assert.equal(await second.locator(".challenge-card.done").count(), 2);
    console.log(
      "PASS API participant: real PostgreSQL start/failure/evidence/replacement/ticket/vote, reload and second device; no local JSON.",
    );
    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    await instrument(adminContext);
    const admin = await adminContext.newPage();
    await admin.goto(base + "/admin");
    await login(admin, "ADM1");
    await admin.getByRole("heading", { name: "Métricas generales" }).waitFor();
    await admin.screenshot({
      path: "/tmp/api-connected-admin.png",
      fullPage: true,
    });
    await adminNav(admin, "Usuarios").click();
    await admin.getByRole("button", { name: "Nuevo usuario" }).click();
    const form = admin.locator(".admin-editor form");
    await form.getByLabel("Nombre", { exact: true }).fill("Nueva");
    await form.getByLabel("Apellido 1").fill("Persona");
    await form.getByLabel("Apellido 2").fill("API");
    await form
      .getByLabel("Correo electrónico")
      .fill("new-browser-api@example.test");
    await form.getByLabel("Área de afinidad").selectOption("school");
    await form.getByRole("button", { name: "Guardar cambios" }).click();
    await admin.getByText("Último usuario creado").waitFor();
    const found = (
      await f.service.listUsers(0, 50, "new-browser-api@example.test")
    ).items[0];
    assert.ok(found);
    assert.equal(found.area, "school");
    await admin
      .getByRole("button", { name: "Asignación: " + found.name, exact: true })
      .click();
    await admin
      .getByRole("button", { name: "Asignar retos iniciales" })
      .click();
    await admin.getByRole("heading", { name: /retos asignados/ }).waitFor();
    assert.ok((await f.service.participant(found.id)).progress.startedAt);
    await admin
      .getByRole("button", { name: /Cambiar asignación:/ })
      .first()
      .click();
    await admin.getByLabel("Tipo de reto de reemplazo").selectOption("extra");
    await admin.getByTestId("assignment-preview").waitFor();
    await admin.getByRole("button", { name: "Aplicar cambio" }).click();
    await admin
      .getByText("Asignación actualizada.", { exact: false })
      .waitFor();
    assert.equal(
      (await f.service.participant(found.id)).progress.assignmentEdits.length,
      1,
    );
    await adminNav(admin, "Agenda").click();
    await admin.getByRole("button", { name: "Nueva actividad" }).click();
    const agendaForm = admin.locator(".admin-editor form");
    await agendaForm
      .getByLabel("Nombre de la actividad")
      .fill("Agenda compartida API");
    await agendaForm
      .getByLabel("Descripción de la actividad")
      .fill("Actividad agregada desde administración.");
    await agendaForm.getByRole("button", { name: "Guardar cambios" }).click();
    await admin
      .getByRole("heading", { name: "Agenda compartida API", exact: true })
      .waitFor();
    await page.bringToFront();
    await nav(page, "Agenda").click();
    await page.getByRole("button", { name: /Viernes/ }).click();
    await page.getByText("Agenda compartida API", { exact: true }).waitFor();
    await adminNav(admin, "Tiquetes").click();
    await admin.getByLabel("Token del participante").fill(found.token);
    dropManualReply = true;
    await admin.getByRole("button", { name: "Crear", exact: true }).click();
    await admin
      .getByRole("alert")
      .filter({ hasText: "No se pudo confirmar" })
      .waitFor();
    await admin.getByRole("button", { name: "Crear", exact: true }).click();
    await admin
      .getByText("M-" + found.token + "-001", { exact: true })
      .waitFor();
    assert.equal(
      (await f.service.participant(found.id)).progress.manualTickets.length,
      1,
    );
    await admin.getByRole("button", { name: "Sortear ganador" }).click();
    await admin.getByRole("heading", { name: "Ganador del sorteo" }).waitFor();
    assert.equal(
      (
        await f.store.rpc<{ items: unknown[] }>("camino_admin_list", {
          p_kind: "raffles",
        })
      ).items.length,
      1,
    );
    await adminNav(admin, "Respaldo").click();
    const download = admin.waitForEvent("download");
    await admin
      .getByRole("button", { name: "Descargar respaldo Excel" })
      .click();
    assert.equal((await download).suggestedFilename(), "respaldo-expotec.xlsx");
    await adminNav(admin, "Usuarios").click();
    await admin
      .getByRole("button", {
        name: "Ver respuestas: " + visitor.user.name,
        exact: true,
      })
      .click();
    await admin
      .getByRole("heading", { name: "Respuestas por participante" })
      .waitFor();

    await adminNav(admin, "Asignación").click();
    await admin.getByLabel("Retos por ronda de visitantes").fill("3");
    await admin.getByRole("button", { name: "Guardar distribución" }).click();
    await admin.getByText("Distribución guardada.", { exact: false }).waitFor();
    assert.equal(
      (await f.service.catalog()).catalog.assignmentRules.visitorBatchSize,
      3,
    );
    assert.equal(
      (await f.service.participant(visitor.user.id)).progress.visitorRounds[0]
        .length,
      2,
    );
    await adminNav(admin, "Proyectos").click();
    await admin
      .getByRole("button", { name: "Nuevo proyecto", exact: true })
      .click();
    const projectForm = admin.locator(".admin-editor form");
    await projectForm.getByLabel("Nombre del proyecto").fill("Proyecto API UI");
    await projectForm.getByLabel("Nivel del proyecto").selectOption("11");
    await projectForm
      .getByLabel("Descripción", { exact: true })
      .fill("Proyecto de prueba creado desde la interfaz.");
    await projectForm.getByRole("button", { name: "Guardar cambios" }).click();
    await admin
      .getByRole("heading", { name: "Proyecto API UI", exact: true })
      .waitFor();
    const createdProject = (await f.service.catalog()).catalog.projects.find(
      (p) => p.name === "Proyecto API UI",
    )!;
    assert.equal(createdProject.level, 11);
    await adminNav(admin, "Retos").click();
    await admin
      .getByRole("button", { name: "Nuevo reto", exact: true })
      .click();
    const challengeForm = admin.locator(".admin-editor form");
    await challengeForm.getByLabel("Título del reto").fill("Reto API UI");
    await challengeForm
      .getByLabel("Descripción", { exact: true })
      .fill("Conoce este proyecto creado para probar la API.");
    await challengeForm.getByLabel("Tipo de reto").selectOption("quiz");
    await challengeForm.getByLabel("Nivel del reto").selectOption("11");
    await challengeForm
      .getByLabel("Proyecto del reto")
      .selectOption(createdProject.id);
    await challengeForm.getByLabel("Código del stand").fill("C123");
    for (const name of ["Pregunta del objetivo", "Pregunta técnica"]) {
      const group = challengeForm.getByRole("group", { name, exact: true });
      await group
        .getByLabel("Pregunta", { exact: true })
        .fill("¿Cuál opción es correcta?");
      await group
        .getByLabel("Opciones (una por línea, entre 2 y 6)")
        .fill("Primera opción\nSegunda opción");
      await group
        .getByLabel("Número de la opción correcta (desde 1)")
        .fill("2");
    }
    await challengeForm
      .getByRole("button", { name: "Guardar cambios" })
      .click();
    await admin
      .getByRole("heading", { name: "Reto API UI", exact: true })
      .waitFor();
    assert.equal(
      (await f.service.catalog()).catalog.challenges.find(
        (c) => c.title === "Reto API UI",
      )!.level,
      11,
    );
    await admin
      .getByRole("button", { name: "Eliminar: Reto API UI", exact: true })
      .click();
    await admin.getByRole("button", { name: "Confirmar eliminación" }).click();
    await admin
      .getByRole("heading", { name: "Reto API UI", exact: true })
      .waitFor({ state: "hidden" });
    await adminNav(admin, "Proyectos").click();
    await admin
      .getByRole("button", { name: "Eliminar: Proyecto API UI", exact: true })
      .click();
    await admin.getByRole("button", { name: "Confirmar eliminación" }).click();
    await admin
      .getByRole("heading", { name: "Proyecto API UI", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(
      (await f.service.catalog()).catalog.projects.some(
        (p) => p.id === createdProject.id,
      ),
      false,
    );
    await adminNav(admin, "Usuarios").click();
    await admin
      .getByRole("button", { name: "Editar: " + found.name, exact: true })
      .click();
    const editUser = admin.locator(".admin-editor form");
    await editUser.getByLabel("Nombre", { exact: true }).fill("Actualizada");
    await editUser.getByRole("button", { name: "Guardar cambios" }).click();
    await admin
      .getByRole("heading", { name: "Actualizada Persona API", exact: true })
      .waitFor();
    assert.equal(
      (await f.service.participant(found.id)).user.firstName,
      "Actualizada",
    );
    await admin
      .getByRole("button", {
        name: "Editar: Actualizada Persona API",
        exact: true,
      })
      .click();
    const staleForm = admin.locator(".admin-editor form");
    await staleForm
      .getByLabel("Nombre", { exact: true })
      .fill("Desactualizada");
    const beforeConcurrent = await f.service.participant(found.id);
    await f.service.updateProfile(
      found.id,
      { firstSurname: "Servidor" },
      beforeConcurrent.user.version,
      f.adminId,
      randomUUID(),
      hash("concurrent-edit"),
    );
    await staleForm.getByRole("button", { name: "Guardar cambios" }).click();
    await admin
      .getByRole("alert")
      .filter({ hasText: "Los datos cambiaron" })
      .waitFor();
    assert.equal(
      (await f.service.participant(found.id)).user.firstName,
      "Actualizada",
    );
    assert.equal(
      await staleForm.getByLabel("Nombre", { exact: true }).inputValue(),
      "Desactualizada",
    );
    await staleForm.getByRole("button", { name: "Cancelar edición" }).click();
    await admin
      .getByRole("button", {
        name: "Editar: Actualizada Servidor API",
        exact: true,
      })
      .click();
    const freshForm = admin.locator(".admin-editor form");
    await freshForm.getByLabel("Apellido 1").fill("Persona");
    await freshForm.getByRole("button", { name: "Guardar cambios" }).click();
    await admin
      .getByRole("heading", { name: "Actualizada Persona API", exact: true })
      .waitFor();
    await admin
      .getByRole("button", {
        name: "Desactivar: Actualizada Persona API",
        exact: true,
      })
      .click();
    await admin
      .getByRole("button", { name: "Confirmar desactivación" })
      .click();
    await admin.getByText("Usuario inactivo", { exact: true }).waitFor();
    assert.equal((await f.service.participant(found.id)).user.active, false);
    await admin
      .getByRole("button", {
        name: "Editar: Actualizada Persona API",
        exact: true,
      })
      .click();
    const reactivate = admin.locator(".admin-editor form");
    await reactivate.getByLabel("Usuario activo").check();
    await reactivate.getByRole("button", { name: "Guardar cambios" }).click();
    await admin
      .getByText("Usuario inactivo", { exact: true })
      .waitFor({ state: "hidden" });
    assert.equal((await f.service.participant(found.id)).user.active, true);
    await admin.reload();
    await admin.getByRole("heading", { name: "Métricas generales" }).waitFor();
    await adminNav(admin, "Usuarios").click();
    await admin
      .getByRole("region", { name: "Último usuario creado" })
      .waitFor();
    assert.equal(
      await admin.locator(".last-created-token code").innerText(),
      found.token,
    );
    console.log(
      "PASS API catalog CRUD, specialty grade, preserved routes on rule changes and user edit.",
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("camino-local-user")),
      "untrusted",
    );
    assert.equal(
      await page.evaluate(() => document.cookie.includes("camino_session")),
      false,
    );
    await admin.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.equal(localDataCalls, 0);
    const persistent = await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) =>
          key.startsWith("camino-local:") || key === "camino-local-catalog-v1",
      ),
    );
    assert.deepEqual(persistent, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS API admin: create, assignments, category replacement, shared agenda, manual ticket, raffle, real Excel, participant answers and no browser persistence.",
    );
    console.log("HTTP requests exercised:", new Set(calls).size);
  } catch (error) {
    console.error("Browser errors:", errors);
    const last = browser
      .contexts()
      .flatMap((c) => c.pages())
      .at(-1);
    if (last) {
      await last
        .screenshot({ path: "/tmp/api-browser-failure.png", fullPage: true })
        .catch(() => {});
      console.error(
        (
          await last
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(0, 3500),
      );
    }
    throw error;
  } finally {
    await browser.close();
    await f.db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
