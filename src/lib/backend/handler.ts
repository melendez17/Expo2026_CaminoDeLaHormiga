import { randomUUID, randomInt } from "node:crypto";
import { z } from "zod";
import { BackendService } from "./service";
import { BackendError } from "./errors";
import {
  activateInput,
  tokenLoginInput,
  answerInput,
  assignmentInput,
  commandInput,
  createUserInput,
  emailAccessInput,
  manualInput,
  profileInput,
  raffleInput,
  raffleSettingsInput,
  rulesInput,
  rotateInput,
  surveyInput,
  updateUserInput,
  verifyEmailInput,
  voteInput,
  requestId,
} from "./contracts";
import {
  credentialHash,
  encrypt,
  enforceOrigin,
  equalSecret,
  hash,
  readCookie,
  readJson,
  requestHash,
  secret,
  sessionCookieName,
} from "./security";
import type { ParticipantRecord, Profile } from "./store";
import { replacementCandidates } from "../admin-assignments";
import { parseProgress, storageKey, type LocalData } from "../local-game";
import { csvField } from "../local-admin";
import { raffleKey, type RaffleDraw } from "../local-tickets";
export type HandlerDependencies = {
  service: BackendService;
  verifyAdmin: (request: Request) => Promise<string>;
  production: boolean;
  emailEnabled: boolean;
  jobsSecret?: string;
  dispatchMail?: () => Promise<unknown>;
  createAdmin?: (
    input: {
      email: string;
      firstName: string;
      firstSurname: string;
      secondSurname: string;
    },
    actor: string,
    request: string,
    hash: string,
  ) => Promise<unknown>;
};
const id = z.uuid(),
  pagination = z.object({
    offset: z.coerce.number().int().min(0).max(100000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(100).default(""),
  });
export function createBackendHandler(deps: HandlerDependencies) {
  const service = deps.service;
  return async function handle(request: Request): Promise<Response> {
    const trace = randomUUID();
    const json = (
      body: unknown,
      status = 200,
      extra: Record<string, string> = {},
    ) =>
      Response.json(body, {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-Request-Id": trace,
          Vary: "Cookie, Authorization",
          ...extra,
        },
      });
    const sessionCookie = (value: string, maxAge: number) =>
      `${sessionCookieName(deps.production)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${deps.production ? "; Secure" : ""}`;
    async function participant() {
      const token = readCookie(request, sessionCookieName(deps.production));
      if (!token)
        throw new BackendError(
          401,
          "authentication_required",
          "Inicia sesión para continuar.",
        );
      const record = await service.store.rpc<ParticipantRecord | null>(
        "camino_actor",
        { p_session_hash: hash(token) },
      );
      if (!record || record.user.role === "admin")
        throw new BackendError(
          401,
          "invalid_session",
          "Tu sesión venció o fue revocada.",
        );
      return record;
    }
    async function admin() {
      const raw = readCookie(request, sessionCookieName(deps.production));
      const actor = raw
        ? await service.store.rpc<ParticipantRecord | null>("camino_actor", {
            p_session_hash: hash(raw),
          })
        : await service.store.rpc<ParticipantRecord | null>("camino_actor", {
            p_auth_id: await deps.verifyAdmin(request),
          });
      if (!actor || !actor.user.active)
        throw new BackendError(
          401,
          "invalid_session",
          "Tu sesión venció o fue revocada.",
        );
      if (actor.user.role !== "admin")
        throw new BackendError(
          403,
          "forbidden",
          "Tu cuenta no tiene permiso administrativo.",
        );
      return actor.user;
    }
    const network =
      process.env.TRUST_PROXY === "true"
        ? (request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown")
        : "shared";
    try {
      const url = new URL(request.url),
        method = request.method,
        path = url.pathname.replace(/^\/api\/v1\/?/, "").replace(/\/$/, "");
      if (!url.pathname.startsWith("/api/v1/"))
        throw new BackendError(404, "not_found", "Endpoint no encontrado.");
      if (path === "internal/jobs" && method === "POST") {
        if (
          !deps.jobsSecret ||
          !equalSecret(
            request.headers.get("authorization") ?? "",
            `Bearer ${deps.jobsSecret}`,
          )
        )
          throw new BackendError(
            401,
            "authentication_required",
            "Acceso no permitido.",
          );
        const cleanup = await service.store.rpc("camino_cleanup");
        const mail =
          deps.emailEnabled && deps.dispatchMail
            ? await deps.dispatchMail()
            : { disabled: true };
        return json({ cleanup, mail });
      }
      if (!["GET", "HEAD"].includes(method))
        enforceOrigin(request, service.config.origin);
      if (path === "health" && method === "GET")
        return json({ ok: true, apiVersion: 1 });
      if (path === "catalog" && method === "GET") {
        const c = await service.catalog(),
          d = c.catalog;
        return json(
          {
            version: c.version,
            projects: d.projects,
            agenda: d.agenda,
            settings: {
              title: d.settings.title,
              radioUrl: d.settings.radioUrl,
              agendaNote: d.settings.agendaNote,
            },
            assignmentRules: d.assignmentRules,
            votingOpen: c.votingOpen,
          },
          200,
          {
            "Cache-Control": "public, max-age=0, s-maxage=10",
            Vary: "Accept-Encoding",
          },
        );
      }
      if (path === "leaderboard" && method === "GET") {
        const page = pagination.parse(Object.fromEntries(url.searchParams));
        return json(
          await service.store.rpc("camino_leaderboard", {
            p_offset: page.offset,
            p_limit: page.limit,
          }),
          200,
          {
            "Cache-Control": "public, max-age=0, s-maxage=10",
            Vary: "Accept-Encoding",
          },
        );
      }
      if (path === "auth/login" && method === "POST") {
        // Shared school Wi-Fi must allow the attendance peak; only trust a client
        // IP when the hosting proxy replaces the forwarded header (see setup).
        await service.rate(
          "login:network:" + network,
          network === "shared" ? 3000 : 30,
        );
        const input = await readJson(request, tokenLoginInput);
        await service.rate("login:token:" + input.token, 6, 300);
        const raw = secret();
        const participantId = await service.store.rpc<string | null>(
          "camino_login_token",
          {
            p_token: input.token,
            p_session_hash: hash(raw),
            p_expires: new Date(
              Date.now() + service.config.sessionSeconds * 1000,
            ).toISOString(),
          },
        );
        if (!participantId)
          throw new BackendError(
            401,
            "invalid_credential",
            "El token no es válido o el usuario está inactivo.",
          );
        return json({ ok: true }, 200, {
          "Set-Cookie": sessionCookie(raw, service.config.sessionSeconds),
        });
      }
      if (path === "auth/activate" && method === "POST") {
        await service.rate("activate:network:" + network, 3000);
        const input = await readJson(request, activateInput);
        await service.rate("activate:credential:" + hash(input.credential), 10);
        const raw = secret(),
          expires = new Date(
            Date.now() + service.config.sessionSeconds * 1000,
          ).toISOString();
        const user = await service.store.rpc<string | null>("camino_activate", {
          p_claim_hash: credentialHash(input.credential, service.config.pepper),
          p_session_hash: hash(raw),
          p_expires: expires,
        });
        if (!user)
          throw new BackendError(
            401,
            "invalid_credential",
            "El acceso no es válido, ya fue utilizado o venció.",
          );
        return json({ ok: true }, 200, {
          "Set-Cookie": sessionCookie(raw, service.config.sessionSeconds),
        });
      }
      if (path === "auth/request-email" && method === "POST") {
        if (!deps.emailEnabled)
          throw new BackendError(
            503,
            "email_disabled",
            "El acceso por correo todavía no está configurado.",
          );
        const input = await readJson(request, emailAccessInput);
        await service.rate("email:network:" + network, 3000);
        await service.rate("email:target:" + input.email, 3, 900);
        const challengeId = randomUUID(),
          code = String(randomInt(100000000)).padStart(8, "0"),
          expires = new Date(Date.now() + 600000).toISOString();
        const envelope = encrypt(
          {
            to: input.email,
            subject: "Tu acceso al Camino de la Hormiga",
            text: `Tu código de acceso es ${code}. Vence en 10 minutos y se puede usar una sola vez. Si no solicitaste este acceso, ignora el mensaje.`,
          },
          service.config.encryptionKey,
        );
        await service.store.rpc("camino_queue_email", {
          p_id: challengeId,
          p_email: input.email,
          p_token: input.token,
          p_code_hash: credentialHash(
            `otp:${challengeId}:${code}`,
            service.config.pepper,
          ),
          p_envelope: envelope,
          p_expires: expires,
        });
        return json({ accepted: true, challengeId, expiresIn: 600 });
      }
      if (path === "auth/verify-email" && method === "POST") {
        const input = await readJson(request, verifyEmailInput);
        await service.rate("verify:network:" + network, 3000);
        await service.rate("verify:" + input.challengeId, 10, 600);
        const raw = secret();
        const user = await service.store.rpc<string | null>(
          "camino_verify_email",
          {
            p_id: input.challengeId,
            p_code_hash: credentialHash(
              `otp:${input.challengeId}:${input.code}`,
              service.config.pepper,
            ),
            p_session_hash: hash(raw),
            p_expires: new Date(
              Date.now() + service.config.sessionSeconds * 1000,
            ).toISOString(),
          },
        );
        if (!user)
          throw new BackendError(
            401,
            "invalid_credential",
            "El código no es válido o venció.",
          );
        return json({ ok: true }, 200, {
          "Set-Cookie": sessionCookie(raw, service.config.sessionSeconds),
        });
      }
      if (path === "auth/logout" && method === "POST") {
        const raw = readCookie(request, sessionCookieName(deps.production));
        if (raw)
          await service.store.rpc("camino_logout", {
            p_session_hash: hash(raw),
          });
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
      }
      if ((path === "me" || path === "me/challenges") && method === "GET") {
        const record = await participant(),
          view = await service.view(record);
        return json(
          path === "me"
            ? view
            : {
                version: view.version,
                challenges: view.challenges,
                failedAttempts: view.failedAttempts,
              },
        );
      }
      if (path === "me/export" && method === "GET") {
        const record = await participant();
        return json(await service.view(record), 200, {
          "Content-Disposition": 'attachment; filename="mi-avance.json"',
        });
      }
      const commands: Record<string, string> = {
        "me/start": "start",
        "me/next-round": "next",
        "me/answers": "answer",
        "me/survey": "survey",
        "me/votes": "vote",
      };
      if (commands[path] && method === "POST") {
        const record = await participant();
        await service.rate("command:" + record.user.id, 90);
        const schema =
          path === "me/answers"
            ? answerInput
            : path === "me/survey"
              ? surveyInput
              : path === "me/votes"
                ? voteInput
                : commandInput;
        const input = await readJson(request, schema as typeof answerInput);
        return json(
          await service.command(
            record.user.id,
            record.user.id,
            input.requestId,
            requestHash(method, path, input),
            commands[path],
            input,
          ),
        );
      }
      if (path.startsWith("admin/")) {
        const actor = await admin();
        await service.rate("admin:" + actor.id, 180);
        const page = pagination.parse(Object.fromEntries(url.searchParams));
        if (path === "admin/me" && method === "GET")
          return json({ user: actor, mfaRequired: false });
        if (path === "admin/users" && method === "GET") {
          const list = await service.listUsers(
            page.offset,
            page.limit,
            page.search,
          );
          return json({
            ...list,
            items: list.items.map(({ progress, progressVersion, ...user }) => ({
              ...user,
              progressVersion,
            })),
          });
        }
        if (path === "admin/users" && method === "POST") {
          const input = await readJson(request, createUserInput);
          if (input.delivery !== "card" && !deps.emailEnabled)
            throw new BackendError(
              503,
              "email_disabled",
              "Configura el correo antes de seleccionar esta entrega.",
            );
          return json(
            await service.register(
              input,
              actor.id,
              input.requestId,
              requestHash(method, path, input),
            ),
            201,
          );
        }
        const userMatch = path.match(
          /^admin\/users\/([0-9a-f-]+)(?:\/(assignments|replacements|credentials))?$/i,
        );
        if (userMatch) {
          const userId = id.parse(userMatch[1]),
            action = userMatch[2];
          if (!action && method === "GET") {
            const record = await service.participant(userId);
            await service.store.rpc("camino_audit_read", {
              p_actor: actor.id,
              p_action: "participant.read",
              p_target: userId,
              p_metadata: {},
            });
            return json({
              profile: record.user,
              progress: record.progress,
              state: await service.view(record),
            });
          }
          if (!action && (method === "PATCH" || method === "DELETE")) {
            const schema =
              method === "DELETE"
                ? z
                    .object({
                      requestId,
                      expectedVersion: z.number().int().nonnegative(),
                    })
                    .strict()
                : updateUserInput;
            const input = await readJson(request, schema);
            return json(
              await service.updateProfile(
                userId,
                { ...input, ...(method === "DELETE" ? { active: false } : {}) },
                input.expectedVersion,
                actor.id,
                input.requestId,
                requestHash(method, path, input),
              ),
            );
          }
          if (action === "credentials" && method === "POST") {
            const input = await readJson(request, rotateInput);
            return json(
              await service.rotate(
                userId,
                actor.id,
                input.requestId,
                requestHash(method, path, input),
                input.reason,
              ),
            );
          }
          if (action === "assignments" && method === "POST") {
            const input = await readJson(request, assignmentInput);
            if (
              (["replace", "remove"].includes(input.mode) && !input.fromId) ||
              (["replace", "add"].includes(input.mode) && !input.category)
            )
              throw new BackendError(
                400,
                "invalid_assignment",
                "Selecciona el reto y la categoría necesarios.",
              );
            return json(
              await service.command(
                userId,
                actor.id,
                input.requestId,
                requestHash(method, path, input),
                "assignment",
                input,
              ),
            );
          }
          if (action === "replacements" && method === "GET") {
            const [catalog, record] = await Promise.all([
                service.catalog(),
                service.participant(userId),
              ]),
              data = service.data(catalog, [record.user]);
            const category = z
              .string()
              .max(150)
              .parse(url.searchParams.get("category"));
            const level = url.searchParams.get("level");
            if (level && !["10", "11"].includes(level))
              throw new BackendError(400, "invalid_level", "Nivel no válido.");
            const candidates = replacementCandidates(
              data,
              parseProgress(data, userId, record.progress),
              url.searchParams.get("fromId"),
              category,
              level ? (Number(level) as 10 | 11) : undefined,
            );
            return json({
              version: record.version,
              candidates: candidates.map((c) => ({
                id: c.id,
                title: c.title,
                buildingId: c.buildingId,
                projectId: c.projectId,
              })),
            });
          }
        }
        if (path === "admin/catalog" && method === "GET") {
          const c = await service.catalog();
          return json({
            version: c.version,
            catalog: c.catalog,
            votingOpen: c.votingOpen,
            raffleOpen: c.raffleOpen,
          });
        }
        const content = path.match(
          /^admin\/(projects|challenges|agenda)(?:\/([^/]+))?$/,
        );
        if (content && ["POST", "PUT", "DELETE"].includes(method)) {
          const input = await readJson(
            request,
            z
              .object({
                requestId,
                expectedVersion: z.number().int().positive(),
                value: z.unknown().optional(),
              })
              .strict(),
            262144,
          );
          const operation =
            method === "POST"
              ? "create"
              : method === "PUT"
                ? "update"
                : "delete";
          if (operation !== "create" && !content[2])
            throw new BackendError(
              400,
              "id_required",
              "Falta el identificador.",
            );
          return json(
            await service.updateCatalog(
              {
                resource: content[1],
                id: content[2],
                operation,
                value: input.value,
                expectedVersion: input.expectedVersion,
              },
              actor.id,
              input.requestId,
              requestHash(method, path, input),
            ),
            method === "POST" ? 201 : 200,
          );
        }
        if (path === "admin/assignment-rules" && method === "PUT") {
          const input = await readJson(request, rulesInput);
          return json(
            await service.updateCatalog(
              {
                resource: "assignmentRules",
                operation: "update",
                value: input.assignmentRules,
                expectedVersion: input.expectedVersion,
              },
              actor.id,
              input.requestId,
              requestHash(method, path, input),
            ),
          );
        }
        if (path === "admin/settings" && method === "PATCH") {
          const input = await readJson(request, raffleSettingsInput);
          const { requestId: ignored, expectedVersion, ...flags } = input;
          return json(
            await service.updateCatalog(
              { resource: "settings", operation: "update", expectedVersion },
              actor.id,
              input.requestId,
              requestHash(method, path, input),
              flags,
            ),
          );
        }
        if (path === "admin/tickets" && method === "POST") {
          const input = await readJson(request, manualInput);
          const user = await service.store.rpc<Profile | null>(
            "camino_profile_lookup",
            { p_token: input.token },
          );
          if (!user || user.role === "admin")
            throw new BackendError(
              404,
              "not_found",
              "Participante no disponible.",
            );
          return json(
            await service.command(
              user.id,
              actor.id,
              input.requestId,
              requestHash(method, path, input),
              "manual",
              input,
            ),
            201,
          );
        }
        if (path === "admin/raffles" && method === "POST") {
          const input = await readJson(request, raffleInput);
          return json(
            await service.draw(
              actor.id,
              input.requestId,
              requestHash(method, path, input),
              input.prize,
            ),
            201,
          );
        }
        if (
          ["admin/tickets", "admin/raffles", "admin/audit"].includes(path) &&
          method === "GET"
        )
          return json(
            await service.store.rpc("camino_admin_list", {
              p_kind: path.split("/")[1],
              p_offset: page.offset,
              p_limit: page.limit,
              p_search: page.search,
            }),
          );
        if (path === "admin/metrics" && method === "GET")
          return json(await service.store.rpc("camino_metrics"));
        if (path === "admin/staff" && method === "POST") {
          if (!deps.createAdmin)
            throw new BackendError(
              503,
              "admin_creation_disabled",
              "La creación administrativa no está configurada.",
            );
          const input = await readJson(
            request,
            profileInput
              .pick({
                email: true,
                firstName: true,
                firstSurname: true,
                secondSurname: true,
              })
              .extend({ requestId })
              .strict(),
          );
          return json(
            await deps.createAdmin(
              input,
              actor.id,
              input.requestId,
              requestHash(method, path, input),
            ),
            201,
          );
        }
        if (
          (path === "admin/export" || path === "admin/backup") &&
          method === "GET"
        ) {
          const [catalog, records] = await Promise.all([
            service.catalog(),
            service.allUsers(),
          ]);
          const format =
            path === "admin/backup"
              ? "xlsx"
              : (url.searchParams.get("format") ?? "csv");
          if (!["csv", "json", "xlsx"].includes(format))
            throw new BackendError(400, "invalid_format", "Formato no válido.");
          await service.store.rpc("camino_audit_read", {
            p_actor: actor.id,
            p_action: "export.generated",
            p_target: null,
            p_metadata: { format, participants: records.length },
          });
          if (format === "csv") {
            const header = [
              "ID",
              "Nombre",
              "Correo",
              "Rol",
              "Área",
              "Token",
              "Completados",
              "Tiquetes",
              "Votos emitidos",
              "Votos disponibles",
            ];
            const rows = [
              header,
              ...records.map((user) => [
                user.id,
                user.name,
                user.email,
                user.role,
                user.area,
                user.token,
                user.progress.completed.length,
                user.stats?.tickets ?? 0,
                user.progress.votes.length,
                user.stats?.votesAvailable ?? 0,
              ]),
            ];
            return new Response(
              "\ufeff" +
                rows.map((row) => row.map(csvField).join(",")).join("\r\n"),
              {
                headers: {
                  "Content-Type": "text/csv; charset=utf-8",
                  "Content-Disposition":
                    'attachment; filename="participantes.csv"',
                  "Cache-Control": "private, no-store",
                  "X-Content-Type-Options": "nosniff",
                },
              },
            );
          }
          if (format === "json")
            return json(
              {
                exportedAt: new Date().toISOString(),
                catalog: catalog.catalog,
                users: records,
              },
              200,
              {
                "Content-Disposition":
                  'attachment; filename="datos-expotec.json"',
              },
            );
          if (format !== "xlsx")
            throw new BackendError(400, "invalid_format", "Formato no válido.");
          const data = service.data(catalog, records),
            values = new Map(
              records.map((user) => [
                storageKey(data, user.id),
                JSON.stringify(user.progress),
              ]),
            );
          const draws: RaffleDraw[] = [];
          for (let offset = 0; ; offset += 1000) {
            const batch = await service.store.rpc<{
              items: Record<string, unknown>[];
            }>("camino_admin_list", {
              p_kind: "raffles",
              p_offset: offset,
              p_limit: 1000,
              p_search: "",
            });
            for (const row of batch.items)
              draws.push({
                id: String(row.id),
                ticketId: String(row.ticket_id),
                ticketCode: String(row.ticketCode),
                winnerId: String(row.winnerId),
                winnerName: String(row.winnerName),
                source: row.source === "manual" ? "manual" : "digital",
                at: new Date(String(row.created_at)).toISOString(),
                actorId: String(row.actor_id),
                poolSize: Number(row.pool_size),
                prize: String(row.prize),
              });
            if (batch.items.length < 1000) break;
          }
          values.set(
            raffleKey(data),
            JSON.stringify({
              version: 1,
              dataVersion: data.settings.dataVersion,
              draws,
            }),
          );
          const { createExcelBackup } = await import("../excel-backup");
          const bytes = await createExcelBackup(data, {
            getItem: (key) => values.get(key) ?? null,
          });
          return new Response(new Uint8Array(bytes), {
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition":
                'attachment; filename="respaldo-expotec.xlsx"',
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        }
      }
      throw new BackendError(404, "not_found", "Endpoint no encontrado.");
    } catch (error) {
      if (error instanceof BackendError)
        return json(
          {
            error: { code: error.code, message: error.message },
            requestId: trace,
          },
          error.status,
        );
      if (error instanceof z.ZodError)
        return json(
          {
            error: {
              code: "invalid_input",
              message: "Revisa los campos de la solicitud.",
              fields: error.issues.slice(0, 8).map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
              })),
            },
            requestId: trace,
          },
          400,
        );
      console.error("Backend request failed", {
        requestId: trace,
        type: error instanceof Error ? error.name : "unknown",
      });
      return json(
        {
          error: {
            code: "internal_error",
            message: "No se pudo completar la operación.",
          },
          requestId: trace,
        },
        500,
      );
    }
  };
}
