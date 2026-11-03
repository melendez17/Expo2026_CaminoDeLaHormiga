import { randomUUID, randomInt } from "node:crypto";
import {
  localDataSchema,
  freshProgress,
  parseProgress,
  summary,
  storageKey,
  type LocalData,
  type LocalProgress,
  type LocalUser,
} from "../local-game";
import { validateCatalogChange } from "../local-admin";
import { validateRuleCapacity } from "../admin-assignments";
import {
  executeCommand,
  participantData,
  participantView,
  projection,
} from "./domain";
import { BackendError } from "./errors";
import {
  secret,
  publicToken,
  credentialHash,
  encrypt,
  decrypt,
} from "./security";
import type {
  BackendStore,
  CatalogRecord,
  ParticipantRecord,
  Profile,
} from "./store";
import type { Registration } from "./contracts";
export type ServiceConfiguration = {
  pepper: string;
  encryptionKey: string;
  origin: string;
  sessionSeconds: number;
};
export class BackendService {
  constructor(
    readonly store: BackendStore,
    readonly config: ServiceConfiguration,
  ) {}
  async catalog() {
    const value = await this.store.rpc<CatalogRecord | null>("camino_catalog");
    if (!value)
      throw new BackendError(
        503,
        "catalog_missing",
        "Inicializa el catálogo de la aplicación.",
      );
    return value;
  }
  async participant(id: string) {
    const value = await this.store.rpc<ParticipantRecord | null>(
      "camino_participant",
      { p_id: id },
    );
    if (!value)
      throw new BackendError(404, "not_found", "Participante no disponible.");
    return value;
  }
  data(catalog: CatalogRecord, users: LocalUser[]) {
    return participantData(catalog.catalog, [...catalog.admins, ...users]);
  }
  async cached(actor: string, request: string, hash: string) {
    return this.store.rpc<Record<string, unknown> | null>("camino_request", {
      p_actor: actor,
      p_request: request,
      p_hash: hash,
    });
  }
  async view(record: ParticipantRecord) {
    const catalog = await this.catalog();
    const data = this.data(catalog, [record.user]);
    return participantView(
      data,
      record.user,
      parseProgress(data, record.user.id, record.progress),
      record.version,
      catalog.version,
    );
  }
  async createAdmin(
    input: Pick<
      Registration,
      "firstName" | "firstSurname" | "secondSurname" | "email"
    >,
    actor: string,
    request: string,
    fingerprint: string,
  ) {
    const cached = await this.cached(actor, request, fingerprint);
    if (cached) return cached;
    const id = randomUUID();
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        return await this.store.rpc<Profile>("camino_add_admin", {
          p_id: id,
          p_first: input.firstName,
          p_surname1: input.firstSurname,
          p_surname2: input.secondSurname,
          p_email: input.email,
          p_token: publicToken(),
          p_actor: actor,
          p_request: request,
          p_hash: fingerprint,
        });
      } catch (error) {
        if (error instanceof BackendError && error.code === "token_collision")
          continue;
        throw error;
      }
    }
    throw new BackendError(
      503,
      "token_capacity",
      "No se pudo reservar un token único para el administrador.",
    );
  }
  async register(
    input: Registration & { delivery?: "card" | "email" | "both" },
    actor: string,
    request: string,
    hash: string,
  ) {
    const cached = await this.cached(actor, request, hash);
    if (cached) return this.registrationResponse(cached);
    const catalog = await this.catalog(),
      id = randomUUID();
    for (let attempt = 0; attempt < 12; attempt++) {
      const token = publicToken(),
        credential = secret(),
        expiresAt = new Date(Date.now() + 86400000).toISOString();
      const user: LocalUser = {
        id,
        firstName: input.firstName,
        firstSurname: input.firstSurname,
        secondSurname: input.secondSurname,
        name: [input.firstName, input.firstSurname, input.secondSurname].join(
          " ",
        ),
        email: input.email,
        role: input.role,
        area: input.area,
        token,
      };
      const data = this.data(catalog, [user]),
        progress = freshProgress(data, id);
      const access = {
        credential,
        url: `${this.config.origin}/#access=${credential}`,
        expiresAt,
        oneTime: true,
      };
      const delivery = input.delivery ?? "card";
      const response = {
        user,
        accessEnvelope: encrypt(access, this.config.encryptionKey),
        delivery: delivery === "card" ? "card" : "queued",
      };
      const mailEnvelope =
        delivery === "card"
          ? null
          : encrypt(
              {
                to: input.email,
                subject: "Tu acceso al Camino de la Hormiga",
                text: `Tu token de acceso es ${token}. Entra en ${this.config.origin}/ e ingresa el token. No lo compartas: permite acceder a tu recorrido.`,
              },
              this.config.encryptionKey,
            );
      try {
        const saved = await this.store.rpc<Record<string, unknown>>(
          "camino_register",
          {
            p_profile: user,
            p_progress: progress,
            p_claim_hash: credentialHash(credential, this.config.pepper),
            p_expires: expiresAt,
            p_actor: actor,
            p_request: request,
            p_hash: hash,
            p_response: response,
            p_mail_envelope: mailEnvelope,
          },
        );
        return this.registrationResponse(saved);
      } catch (error) {
        if (error instanceof BackendError && error.code === "token_collision")
          continue;
        throw error;
      }
    }
    throw new BackendError(
      503,
      "token_capacity",
      "No se pudo reservar un código corto único.",
    );
  }
  registrationResponse(value: Record<string, unknown>) {
    const { accessEnvelope, ...safe } = value;
    return {
      ...safe,
      login: { method: "token", token: (safe.user as LocalUser).token },
      user: safe.user as LocalUser,
      access: decrypt(String(accessEnvelope), this.config.encryptionKey) as {
        credential: string;
        url: string;
        expiresAt: string;
        oneTime: boolean;
      },
    };
  }
  async rotate(
    id: string,
    actor: string,
    request: string,
    hash: string,
    reason = "Reemisión solicitada",
  ) {
    const cached = await this.cached(actor, request, hash);
    if (cached) return this.registrationResponse(cached);
    const credential = secret(),
      expiresAt = new Date(Date.now() + 86400000).toISOString(),
      record = await this.participant(id);
    const response = {
      user: record.user,
      accessEnvelope: encrypt(
        {
          credential,
          url: `${this.config.origin}/#access=${credential}`,
          expiresAt,
          oneTime: true,
        },
        this.config.encryptionKey,
      ),
    };
    return this.registrationResponse(
      await this.store.rpc<Record<string, unknown>>(
        "camino_rotate_credential",
        {
          p_id: id,
          p_claim_hash: credentialHash(credential, this.config.pepper),
          p_expires: expiresAt,
          p_actor: actor,
          p_request: request,
          p_hash: hash,
          p_response: response,
          p_reason: reason,
        },
      ),
    );
  }
  async command(
    id: string,
    actor: string,
    request: string,
    hash: string,
    command: string,
    input: Record<string, unknown>,
  ): Promise<{
    version?: unknown;
    result?: unknown;
    state: ReturnType<typeof participantView>;
  }> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cached = await this.cached(actor, request, hash);
      if (cached) {
        const current = await this.participant(id);
        return { ...cached, state: await this.view(current) };
      }
      const [catalog, record] = await Promise.all([
        this.catalog(),
        this.participant(id),
      ]);
      if (!record.user.active)
        throw new BackendError(404, "not_found", "Participante no disponible.");
      const isAdmin = catalog.admins.some(
        (user) => user.id === actor && user.active,
      );
      if (
        (actor !== id || ["manual", "assignment"].includes(command)) &&
        !isAdmin
      )
        throw new BackendError(
          403,
          "forbidden",
          "Esta operación requiere permiso administrativo.",
        );
      const data = this.data(catalog, [record.user]);
      const progress = parseProgress(data, id, record.progress),
        next = executeCommand(data, progress, command, input, actor);
      try {
        const committed = await this.store.rpc<Record<string, unknown>>(
          "camino_commit",
          {
            p_id: id,
            p_expected: record.version,
            p_catalog_version: catalog.version,
            p_progress: next.progress,
            p_projection: projection(data, next.progress),
            p_actor: actor,
            p_request: request,
            p_hash: hash,
            p_result: { ...next.result, operation: command },
          },
        );
        return {
          ...committed,
          state: participantView(
            data,
            record.user,
            next.progress,
            Number(committed.version),
            catalog.version,
          ),
        };
      } catch (error) {
        if (error instanceof BackendError && error.code === "revision_conflict")
          continue;
        throw error;
      }
    }
    throw new BackendError(
      409,
      "revision_conflict",
      "Hay otra operación en curso. Reintenta con el mismo requestId.",
    );
  }
  async listUsers(offset = 0, limit = 50, search = "") {
    return this.store.rpc<{
      total: number;
      items: (Profile & {
        progress: LocalProgress;
        progressVersion: number;
        stats?: Record<string, unknown>;
      })[];
    }>("camino_admin_list", {
      p_kind: "users",
      p_offset: offset,
      p_limit: limit,
      p_search: search,
    });
  }
  async allUsers() {
    const users: (Profile & {
      progress: LocalProgress;
      progressVersion: number;
      stats?: Record<string, unknown>;
    })[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await this.listUsers(offset, 500);
      users.push(...page.items);
      if (page.items.length < 500) return users;
    }
  }
  async updateProfile(
    id: string,
    patch: Record<string, unknown>,
    expectedVersion: number,
    actor: string,
    request: string,
    hash: string,
  ) {
    const cached = await this.cached(actor, request, hash);
    if (cached) return cached;
    const [catalog, record] = await Promise.all([
      this.catalog(),
      this.participant(id),
    ]);
    const { requestId, expectedVersion: ignored, ...changes } = patch;
    const user = { ...record.user, ...changes } as Profile;
    user.name = [user.firstName, user.firstSurname, user.secondSurname].join(
      " ",
    );
    const next = this.data(catalog, [user]);
    try {
      parseProgress(next, id, record.progress);
      if (
        record.progress.startedAt &&
        (record.user.role !== user.role || record.user.area !== user.area)
      )
        throw Error(
          "La persona ya inició su recorrido. Conserva su rol y área y usa las asignaciones individuales.",
        );
    } catch (error) {
      throw new BackendError(
        409,
        "profile_in_use",
        error instanceof Error ? error.message : "El perfil ya tiene progreso.",
      );
    }
    return this.store.rpc("camino_update_profile", {
      p_id: id,
      p_expected: expectedVersion,
      p_profile: user,
      p_progress: record.progress,
      p_actor: actor,
      p_request: request,
      p_hash: hash,
    });
  }
  async updateCatalog(
    input: {
      resource: string;
      operation: string;
      id?: string;
      value?: unknown;
      expectedVersion: number;
    },
    actor: string,
    request: string,
    hash: string,
    flags?: Record<string, unknown>,
  ) {
    const cached = await this.cached(actor, request, hash);
    if (cached) return cached;
    const catalog = await this.catalog();
    if (catalog.version !== input.expectedVersion)
      throw new BackendError(
        409,
        "revision_conflict",
        "El catálogo cambió. Vuelve a cargarlo.",
      );
    const records = await this.allUsers(),
      users = records.map(({ progress, progressVersion, ...user }) => user),
      previous = this.data(catalog, users),
      next = structuredClone(previous);
    if (input.resource === "assignmentRules")
      next.assignmentRules = input.value as LocalData["assignmentRules"];
    else if (["projects", "challenges", "agenda"].includes(input.resource)) {
      const resource = input.resource as "projects" | "challenges" | "agenda";
      const list = next[resource] as { id: string }[];
      if (input.operation === "delete") {
        if (!input.id || !list.some((item) => item.id === input.id))
          throw new BackendError(404, "not_found", "Registro no disponible.");
        next[resource] = list.filter((item) => item.id !== input.id) as never;
      } else {
        const value = input.value as { id?: string } | undefined;
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new BackendError(400, "invalid_data", "Falta el registro.");
        const id =
          input.operation === "create" ? (value.id ?? randomUUID()) : input.id;
        if (!id) throw new BackendError(400, "invalid_data", "Falta el ID.");
        if (input.operation === "create" && list.some((item) => item.id === id))
          throw new BackendError(
            409,
            "duplicate",
            "El identificador ya existe.",
          );
        if (
          input.operation === "update" &&
          !list.some((item) => item.id === id)
        )
          throw new BackendError(404, "not_found", "Registro no disponible.");
        next[resource] = (
          input.operation === "create"
            ? [...list, { ...value, id }]
            : list.map((item) => (item.id === id ? { ...value, id } : item))
        ) as never;
      }
      if (resource === "agenda") next.agendaManaged = true;
    } else if (!flags)
      throw new BackendError(400, "invalid_resource", "Recurso no válido.");
    let validated: LocalData;
    try {
      const storage = new Map(
        records.map((user) => [
          storageKey(previous, user.id),
          JSON.stringify(user.progress),
        ]),
      );
      validated = validateCatalogChange(previous, next, actor, {
        getItem: (key) => storage.get(key) ?? null,
      });
      if (input.resource === "assignmentRules") validateRuleCapacity(validated);
    } catch (error) {
      throw new BackendError(
        409,
        "catalog_in_use",
        error instanceof Error ? error.message : "El catálogo no es válido.",
      );
    }
    const { users: ignored, ...document } = validated;
    return this.store.rpc("camino_catalog_commit", {
      p_expected: input.expectedVersion,
      p_catalog: document,
      p_actor: actor,
      p_request: request,
      p_hash: hash,
      p_flags: flags ?? {},
      p_progress_versions: Object.fromEntries(
        records.map((user) => [user.id, user.progressVersion]),
      ),
      p_profile_versions: Object.fromEntries(
        records.map((user) => [user.id, user.version]),
      ),
    });
  }
  async draw(actor: string, request: string, hash: string, prize: string) {
    const cached = await this.cached(actor, request, hash);
    if (cached) return cached;
    for (let attempt = 0; attempt < 4; attempt++) {
      const count = await this.store.rpc<number>("camino_raffle_count");
      if (!count)
        throw new BackendError(409, "no_tickets", "No hay tiquetes elegibles.");
      try {
        return await this.store.rpc("camino_draw", {
          p_actor: actor,
          p_request: request,
          p_hash: hash,
          p_expected: count,
          p_offset: randomInt(count),
          p_prize: prize,
        });
      } catch (error) {
        if (error instanceof BackendError && error.code === "revision_conflict")
          continue;
        throw error;
      }
    }
    throw new BackendError(
      409,
      "revision_conflict",
      "Cambió el conjunto de tiquetes. Reintenta con el mismo requestId.",
    );
  }
  async rate(key: string, limit: number, seconds = 60) {
    if (
      !(await this.store.rpc<boolean>("camino_rate", {
        p_key: credentialHash("rate:" + key, this.config.pepper),
        p_limit: limit,
        p_seconds: seconds,
      }))
    )
      throw new BackendError(
        429,
        "rate_limited",
        "Demasiados intentos. Espera un momento.",
      );
  }
}
