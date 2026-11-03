"use client";
import { useAdminRemote } from "@/lib/admin-remote-context";
import {
  RemoteOverview,
  RemoteTickets,
  RemoteBackup,
} from "./remote-admin-sections";
import { AdminPagination } from "./admin-pagination";
import { notifyAction } from "@/lib/action-feedback";
import { useEffect, useState, useRef } from "react";
import { adminRows, csvField, generateUserToken } from "@/lib/local-admin";
import {
  saintQuestion,
  normalize,
  type LocalChallenge,
  type LocalData,
  type LocalUser,
} from "@/lib/local-game";
import campus from "@/lib/campus.json";
import { PageIntro } from "./page-intro";
import { PlaceTag } from "./icons";
import { AppNavigation } from "./app-navigation";
import { AdminOverview } from "./admin-overview";
import { ExcelBackup } from "./excel-backup";
import { AdminAssignments } from "./admin-assignments";
import { AdminTickets } from "./admin-tickets";
import {
  roles,
  roleLabel,
  participantAreas,
  areaLabel,
  projectCategories,
  projectLabel,
  specialties,
  levelLabel,
  type ProjectLevel,
  type ProjectCategory,
} from "@/lib/taxonomy";
import { ParticipantAnswers } from "./participant-answers";

type Resource = "users" | "challenges" | "projects" | "agenda";
type Tab = "overview" | Resource | "backup" | "tickets" | "assignments";
type Editor = {
  resource: Resource;
  id: string | null;
  record?:
    | LocalData["users"][number]
    | LocalData["projects"][number]
    | LocalData["challenges"][number]
    | LocalData["agenda"][number];
};
const names: Record<string, string> = campus.names;
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function LocalAdmin({
  data,
  actor,
  onLogout,
  onSave,
  onRestored,
}: {
  data: LocalData;
  actor: LocalUser;
  onLogout: () => void;
  onSave: (next: LocalData) => void;
  onRestored: (next: LocalData) => void;
}) {
  const remote = useAdminRemote();
  const draftId = useRef(""),
    draftVersion = useRef<number | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(
    null,
  );
  const lastCreatedKey = `camino-last-created-user:${data.settings.dataVersion}`;
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(() =>
    remote ? null : localStorage.getItem(lastCreatedKey),
  );
  const lastCreated = remote?.lastCreated
    ? (remote.lastCreated as LocalUser & { active?: boolean }).active === false
      ? undefined
      : remote.lastCreated
    : data.users.find((user) => user.id === lastCreatedId);
  const [userView, setUserView] = useState<"answers" | "assignments" | null>(
    null,
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [kind, setKind] = useState<LocalChallenge["kind"]>("freeform");
  const [challengeSpecialty, setChallengeSpecialty] =
    useState<string>("Desarrollo Web");
  const [challengeLevel, setChallengeLevel] = useState<10 | 11>(10);
  const [challengeProjectId, setChallengeProjectId] = useState("");
  const [editingRole, setEditingRole] = useState<LocalUser["role"]>("visitor");
  const [projectLevel, setProjectLevel] = useState<ProjectLevel>(10);
  const [projectCategory, setProjectCategory] =
    useState<ProjectCategory>("specialty");
  const [projectSpecialty, setProjectSpecialty] =
    useState<string>("Desarrollo Web");
  const [remove, setRemove] = useState<{
    resource: Resource;
    id: string;
    title: string;
  } | null>(null);
  const setMessage = notifyAction;
  const [error, setError] = useState("");
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => {
      refresh((n) => n + 1);
      setLastCreatedId(localStorage.getItem(lastCreatedKey));
    };
    if (remote) return;
    window.addEventListener("storage", update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("focus", update);
    };
  }, [lastCreatedKey]);
  useEffect(() => {
    if (userView) {
      const back =
        document.querySelector<HTMLButtonElement>(".admin-back-users");
      back?.focus();
      back?.scrollIntoView({ block: "start" });
    }
  }, [userView, selectedParticipant]);
  useEffect(() => {
    if (editor?.resource === "agenda")
      document
        .querySelector(".admin-editor")
        ?.scrollIntoView({ block: "start" });
  }, [editor]);
  const rows = remote ? remote.rows : adminRows(data, localStorage);
  const item = editor?.id
    ? (editor.record ??
      data[editor.resource].find((entry) => entry.id === editor.id))
    : null;
  const user = editor?.resource === "users" ? (item as LocalUser | null) : null;
  const challenge =
    editor?.resource === "challenges" ? (item as LocalChallenge | null) : null;
  const agendaEvent =
    editor?.resource === "agenda"
      ? (item as LocalData["agenda"][number] | null)
      : null;
  const project =
    editor?.resource === "projects"
      ? (item as LocalData["projects"][number] | null)
      : null;

  async function attempt(action: () => void | Promise<void>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el cambio.",
      );
    }
  }
  function changeTab(next: Tab) {
    if (remote) {
      remote.clearSelection();
      remote.setStatus("");
      remote.setSort("name");
      remote.setSize(50);
      remote.setSearch("");
      remote.setPage(1);
    }
    setTab(next);
    setUserView(null);
    setSelectedParticipant(null);
    setEditor(null);
    setRemove(null);
    setSearch("");
    setError("");
    setMessage("");
  }
  function showUserDetail(id: string, view: "answers" | "assignments") {
    if (tab !== "users") changeTab("users");
    else {
      setEditor(null);
      setRemove(null);
      setError("");
      setMessage("");
    }
    setSelectedParticipant(id);
    setUserView(view);
    if (remote) void attempt(() => remote.select(id));
  }
  function showAnswers(id: string) {
    showUserDetail(id, "answers");
  }
  function showAssignments(id: string) {
    showUserDetail(id, "assignments");
  }
  function open(resource: Resource, id: string | null) {
    draftVersion.current = remote
      ? resource === "users"
        ? (
            data.users.find((u) => u.id === id) as
              (LocalUser & { version: number }) | undefined
          )?.version
        : remote.catalogVersion
      : undefined;
    draftId.current = id ?? crypto.randomUUID();
    setError("");
    setMessage("");
    setRemove(null);
    setEditor({
      resource,
      id,
      record: id
        ? structuredClone(data[resource].find((entry) => entry.id === id))
        : undefined,
    });
    if (resource === "users")
      setEditingRole(data.users.find((u) => u.id === id)?.role ?? "visitor");
    if (resource === "projects") {
      const p = data.projects.find((p) => p.id === id);
      setProjectLevel(p?.level ?? 10);
      setProjectCategory(p?.category ?? "specialty");
      setProjectSpecialty(
        p?.category === "specialty" ? p.specialty : "Desarrollo Web",
      );
    }
    if (resource === "challenges") {
      const c = data.challenges.find((c) => c.id === id),
        p = data.projects.find((p) => p.id === c?.projectId);
      setKind(c?.kind ?? "freeform");
      setChallengeSpecialty(
        p?.category === "specialty" ? p.specialty : "Desarrollo Web",
      );
      setChallengeLevel((c?.level ?? p?.level) === 11 ? 11 : 10);
      setChallengeProjectId(c?.projectId ?? "");
    }
  }
  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    const values = new FormData(e.currentTarget);
    const text = (key: string) => String(values.get(key) ?? "").trim();
    void attempt(async () => {
      const id = editor.id ?? (remote ? draftId.current : crypto.randomUUID());
      const next = structuredClone(data);
      if (editor.resource === "users") {
        if (text("role") !== "admin" && !text("area"))
          throw Error("Selecciona un área de afinidad para el participante.");
        const firstName = text("firstName"),
          firstSurname = text("firstSurname"),
          secondSurname = text("secondSurname");
        if (!firstName || !firstSurname || !secondSurname)
          throw Error("Completa el nombre y ambos apellidos.");
        const value: LocalUser = {
          id,
          name: [firstName, firstSurname, secondSurname].join(" "),
          firstName,
          firstSurname,
          secondSurname,
          email: text("email").toLowerCase(),
          token:
            user?.token ?? (remote ? "0000" : generateUserToken(data.users)),
          role: text("role") as LocalUser["role"],
          ...(remote && user
            ? { active: user.id === actor.id || values.get("active") === "on" }
            : {}),
          ...(text("role") !== "admin" ? { area: text("area") } : {}),
        };
        next.users =
          editor.id && next.users.some((entry) => entry.id === id)
            ? next.users.map((u) => (u.id === id ? value : u))
            : [...next.users, value];
      } else if (editor.resource === "agenda") {
        const day = text("day");
        const value: LocalData["agenda"][number] = {
          id,
          title: text("title"),
          description: text("description"),
          day,
          dayNumber: (
            { Viernes: 13, Sábado: 14, Domingo: 15 } as Record<string, number>
          )[day],
          category: text("category") as LocalData["agenda"][number]["category"],
          time: text("time"),
          ...(text("endTime") ? { endTime: text("endTime") } : {}),
          buildingId: text("buildingId"),
        };
        next.agenda =
          editor.id && next.agenda.some((entry) => entry.id === id)
            ? next.agenda.map((event) => (event.id === id ? value : event))
            : [...next.agenda, value];
        next.agendaManaged = true;
      } else if (editor.resource === "projects") {
        const value = {
          id,
          name: text("name"),
          active: values.get("active") === "on",
          buildingId:
            projectCategory === "specialty"
              ? specialties.find((s) => s.name === projectSpecialty)!.buildingId
              : text("buildingId"),
          category: projectCategory,
          level: projectLevel,
          specialty:
            projectCategory === "specialty"
              ? projectSpecialty
              : projectCategories.find((c) => c.value === projectCategory)!
                  .label,
          description: text("description"),
        };
        next.projects =
          editor.id && next.projects.some((entry) => entry.id === id)
            ? next.projects.map((p) => (p.id === id ? value : p))
            : [...next.projects, value];
      } else {
        const value: LocalChallenge = {
          id,
          title: text("title"),
          description: text("description"),
          buildingId: text("buildingId"),
          kind,
          isBase: challenge?.isBase ?? false,
        };
        if (kind === "freeform" && text("projectId"))
          value.projectId = text("projectId");
        if (challenge?.badge) value.badge = challenge.badge;
        if (kind === "quiz" || kind === "code")
          value.code = text("code").toUpperCase();
        if (kind === "saint") {
          const options = text("saintOptions")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          const correctIndex = Number(text("saintCorrect")) - 1;
          value.questions = [
            { id: "saint", prompt: text("saintPrompt"), options, correctIndex },
          ];
          value.answer = options[correctIndex];
        }
        if (kind === "quiz") {
          const project = data.projects.find(
            (p) => p.id === challengeProjectId,
          );
          if (
            !project ||
            project.category !== "specialty" ||
            project.specialty !== challengeSpecialty ||
            project.level !== challengeLevel
          )
            throw Error(
              "Selecciona un proyecto de la especialidad y nivel indicados.",
            );
          value.projectId = project.id;
          value.level = challengeLevel;
          value.buildingId = project.buildingId;
          value.questions = [0, 1].map((index) => ({
            id:
              challenge?.questions?.[index]?.id ??
              (index === 0 ? "objective" : "technical"),
            prompt: text(`q${index}Prompt`),
            options: text(`q${index}Options`)
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
            correctIndex: Number(text(`q${index}Correct`)) - 1,
          }));
        }
        next.challenges =
          editor.id && next.challenges.some((entry) => entry.id === id)
            ? next.challenges.map((c) => (c.id === id ? value : c))
            : [...next.challenges, value];
      }
      if (remote) {
        const saved = await remote.save(next, draftVersion.current, {
          resource: editor.resource,
          id: editor.id,
          draftId: id,
        });
        if (saved && editor.resource === "users" && !editor.id)
          setLastCreatedId(saved.id);
        setEditor(null);
        setMessage(
          saved
            ? `Usuario guardado. Token de acceso: ${saved.token}.`
            : "Cambio guardado en el servidor.",
        );
      } else {
        onSave(next);
        if (editor.resource === "users" && !editor.id) {
          setLastCreatedId(id);
          try {
            localStorage.setItem(lastCreatedKey, id);
          } catch {}
        }
        setEditor(null);
        setMessage(
          editor.resource === "users" && !editor.id
            ? `Usuario creado. Token de acceso: ${next.users.find((u) => u.id === id)!.token}.`
            : "Cambio guardado.",
        );
      }
    });
  }
  function removeEntry() {
    if (!remove) return;
    void attempt(async () => {
      if (remote) {
        await remote.remove(remove.resource, remove.id);
        setRemove(null);
        setMessage("Registro actualizado en el servidor.");
        return;
      }
      const next = structuredClone(data);
      if (remove.resource === "users")
        next.users = next.users.filter((u) => u.id !== remove.id);
      if (remove.resource === "projects")
        next.projects = next.projects.filter((p) => p.id !== remove.id);
      if (remove.resource === "challenges")
        next.challenges = next.challenges.filter((c) => c.id !== remove.id);
      if (remove.resource === "agenda") {
        next.agenda = next.agenda.filter((event) => event.id !== remove.id);
        next.agendaManaged = true;
      }
      onSave(next);
      setRemove(null);
      setMessage("Registro eliminado del catálogo local.");
    });
  }
  async function report() {
    if (remote) {
      const { downloadApi } = await import("@/lib/remote-api");
      await downloadApi("/admin/export?format=csv", "participantes.csv");
      setMessage("CSV descargado.");
      return;
    }
    const header = [
      "Nombre",
      "Correo electrónico",
      "Rol",
      "Área de afinidad",
      "Estado",
      "Retos",
      "Tiquetes",
      "Votos emitidos",
      "Votos disponibles",
      "Encuesta",
    ];
    const csv = [
      header,
      ...rows.map((r) => [
        r.user.name,
        r.user.email ?? "",
        roleLabel(r.user.role),
        r.user.area ? areaLabel(r.user.area) : "",
        r.status,
        r.progress?.completed.length ?? "",
        r.stats?.tickets ?? "",
        r.progress?.votes.length ?? "",
        r.stats?.votesAvailable ?? "",
        r.progress?.survey ? "Completada" : "Pendiente",
      ]),
    ]
      .map((row) => row.map(csvField).join(","))
      .join("\r\n");
    download("metricas-demo.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
    setMessage("Métricas descargadas en CSV.");
  }
  const field = (
    label: string,
    name: string,
    defaultValue = "",
    required = true,
  ) => (
    <label>
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={
          ["firstName", "firstSurname", "secondSurname"].includes(name)
            ? 100
            : 160
        }
      />
    </label>
  );
  const location = (value = "7") => (
    <label>
      Edificio
      <select name="buildingId" aria-label="Edificio" defaultValue={value}>
        {Object.entries(names).map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div
      className={`local-app admin-local ${tab === "overview" ? "admin-overview-active" : ""}`}
    >
      <header className="local-header">
        <a
          className="brand admin-school-brand"
          href="/"
          aria-label="CEDES Don Bosco, inicio"
        >
          <img
            src="/brand/cedes-don-bosco-white.png"
            alt="CEDES Don Bosco"
            width="2048"
            height="661"
          />
        </a>
        <div className="local-account">
          <span>
            {actor.name}
            <small>
              {remote ? "Administrador" : "Administrador de prueba"}
            </small>
          </span>
          <button disabled={remote?.busy} onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>
      <AppNavigation
        label={remote ? "Administración" : "Administración local"}
        admin
        items={
          [
            { id: "overview", title: "Resumen", icon: "dashboard" },
            { id: "users", title: "Usuarios", icon: "users" },
            { id: "challenges", title: "Retos", icon: "route" },
            { id: "projects", title: "Proyectos", icon: "projects" },
            { id: "assignments", title: "Asignación", icon: "route" },
            { id: "agenda", title: "Agenda", icon: "agenda" },
            { id: "tickets", title: "Tiquetes", icon: "ticket" },
            { id: "backup", title: "Respaldo", icon: "backup" },
          ] as const
        }
        active={tab}
        onChange={changeTab}
      />
      <main
        className="local-content"
        aria-busy={remote?.busy}
        inert={remote?.busy || undefined}
      >
        <div className="local-section admin-container">
          <div className="admin-title-row">
            <PageIntro
              eyebrow="PANEL DE ADMINISTRACIÓN"
              sequence="01"
              title={
                {
                  overview: "Resumen",
                  users: "Usuarios",
                  projects: "Proyectos",
                  challenges: "Retos",
                  tickets: "Tiquetes",
                  agenda: "Agenda",
                  assignments: "Asignación",
                  backup: "Respaldo",
                }[tab]
              }
              description={
                remote
                  ? "Gestiona el catálogo y consulta la participación registrada en el servidor."
                  : "Gestiona el catálogo y consulta las pruebas realizadas en este navegador."
              }
            />
            {tab === "overview" && (
              <div className="admin-overview-actions">
                <button
                  onClick={() =>
                    void attempt(async () => {
                      if (remote) await remote.refresh();
                      else refresh((n) => n + 1);
                      setMessage("Métricas actualizadas.");
                    })
                  }
                >
                  Actualizar métricas
                </button>
                <button onClick={() => attempt(report)}>Descargar CSV</button>
              </div>
            )}
          </div>
          {remote ? (
            <p className="admin-local-note is-connected">
              Conectado al servidor. Los cambios confirmados se comparten entre
              dispositivos.
            </p>
          ) : (
            <p className="admin-local-note">
              Modo local de prueba: los cambios solo se guardan en este
              navegador.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {tab === "assignments" && (
            <AdminAssignments
              data={data}
              actor={actor}
              onSave={onSave}
              onChanged={() => refresh((n) => n + 1)}
            />
          )}
          {tab === "tickets" &&
            (remote ? (
              <RemoteTickets />
            ) : (
              <AdminTickets
                data={data}
                actor={actor}
                onIssued={() => refresh((n) => n + 1)}
              />
            ))}
          {tab === "overview" &&
            (remote ? (
              <RemoteOverview data={data} onAnswers={showAnswers} />
            ) : (
              <AdminOverview data={data} rows={rows} onAnswers={showAnswers} />
            ))}
          {((tab === "users" && !userView) ||
            tab === "challenges" ||
            tab === "projects" ||
            tab === "agenda") && (
            <>
              <div className="admin-section-top">
                <h2>
                  {tab === "users"
                    ? remote
                      ? "Usuarios"
                      : "Usuarios de prueba"
                    : tab === "challenges"
                      ? "Catálogo de retos"
                      : tab === "agenda"
                        ? "Programación de ExpoTEC"
                        : "Proyectos para votar"}
                </h2>
                <button className="primary" onClick={() => open(tab, null)}>
                  {tab === "users"
                    ? "Nuevo usuario"
                    : tab === "challenges"
                      ? "Nuevo reto"
                      : tab === "agenda"
                        ? "Nueva actividad"
                        : "Nuevo proyecto"}
                </button>
              </div>
              {tab === "users" && lastCreated && (
                <section
                  className="last-created-user"
                  aria-label="Último usuario creado"
                >
                  <div>
                    <h3>Último usuario creado</h3>
                    <p>
                      <strong>{lastCreated.name}</strong>
                    </p>
                    <small>
                      {roleLabel(lastCreated.role)}
                      {lastCreated.area && ` · ${areaLabel(lastCreated.area)}`}
                    </small>
                  </div>
                  <div className="last-created-token">
                    <span>Token de acceso</span>
                    <code>{lastCreated.token}</code>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            lastCreated.token,
                          );
                          setMessage("Token copiado.");
                        } catch {
                          setError(
                            "No se pudo copiar el token. Puedes seleccionarlo y copiarlo manualmente.",
                          );
                        }
                      }}
                    >
                      Copiar token
                    </button>
                  </div>
                </section>
              )}
              {editor && (
                <section
                  className="admin-editor"
                  key={`${editor.resource}-${editor.id ?? "new"}`}
                >
                  <h3>{editor.id ? "Editar registro" : "Crear registro"}</h3>
                  <form onSubmit={save}>
                    {editor.resource === "users" && (
                      <>
                        {field(
                          "Nombre",
                          "firstName",
                          user?.firstName ?? user?.name,
                        )}
                        {field(
                          "Apellido 1",
                          "firstSurname",
                          user?.firstSurname,
                        )}
                        {field(
                          "Apellido 2",
                          "secondSurname",
                          user?.secondSurname,
                        )}
                        <label>
                          Correo electrónico
                          <input
                            name="email"
                            type="email"
                            autoComplete="email"
                            defaultValue={user?.email ?? ""}
                            required
                            maxLength={254}
                          />
                        </label>
                        {user ? (
                          <p>
                            Token de acceso: <strong>{user.token}</strong>
                          </p>
                        ) : (
                          <p className="muted">
                            El token de acceso se generará automáticamente al
                            guardar.
                          </p>
                        )}
                        {remote && user && (
                          <label>
                            <input
                              name="active"
                              type="checkbox"
                              defaultChecked={
                                (user as LocalUser & { active?: boolean })
                                  .active !== false
                              }
                              disabled={user.id === actor.id}
                            />
                            Usuario activo
                          </label>
                        )}
                        <label>
                          Rol
                          <select
                            aria-label="Rol"
                            name="role"
                            value={editingRole}
                            onChange={(e) =>
                              setEditingRole(
                                e.target.value as LocalUser["role"],
                              )
                            }
                          >
                            {roles
                              .filter(
                                (role) =>
                                  !remote ||
                                  !user ||
                                  (user.role === "admin"
                                    ? role.value === "admin"
                                    : role.value !== "admin"),
                              )
                              .map((role) => (
                                <option key={role.value} value={role.value}>
                                  {role.label}
                                </option>
                              ))}
                          </select>
                        </label>
                        {editingRole !== "admin" && (
                          <label>
                            Área de afinidad
                            <select
                              name="area"
                              aria-label="Área de afinidad"
                              defaultValue={user?.area ?? ""}
                              required
                            >
                              <option value="">Selecciona un área</option>
                              {participantAreas.map((a) => (
                                <option key={a.value} value={a.value}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <p className="muted">
                          El rol determina el acceso y la encuesta. El área de
                          afinidad determina los retos para Visitante y
                          Admisión.
                        </p>
                        {user?.id === actor.id && (
                          <p>Tu propio acceso debe conservar el rol Admin.</p>
                        )}
                      </>
                    )}
                    {editor.resource === "agenda" && (
                      <>
                        {field(
                          "Nombre de la actividad",
                          "title",
                          agendaEvent?.title,
                        )}
                        <label>
                          Día
                          <select
                            name="day"
                            aria-label="Día"
                            defaultValue={agendaEvent?.day ?? "Viernes"}
                            required
                          >
                            <option value="Viernes">
                              Viernes 13 de noviembre
                            </option>
                            <option value="Sábado">
                              Sábado 14 de noviembre
                            </option>
                            <option value="Domingo">
                              Domingo 15 de noviembre
                            </option>
                          </select>
                        </label>
                        <label>
                          Hora de inicio
                          <input
                            type="time"
                            name="time"
                            defaultValue={agendaEvent?.time ?? "09:00"}
                            required
                          />
                        </label>
                        <label>
                          Hora de finalización (opcional)
                          <input
                            type="time"
                            name="endTime"
                            defaultValue={agendaEvent?.endTime ?? ""}
                          />
                        </label>
                        <label>
                          Categoría de la actividad
                          <select
                            name="category"
                            aria-label="Categoría de la actividad"
                            defaultValue={agendaEvent?.category ?? "general"}
                          >
                            <option value="general">General</option>
                            <option value="pastoral">Pastoral</option>
                            <option value="radio">CEDES Radio</option>
                          </select>
                        </label>
                        {location(agendaEvent?.buildingId)}
                        <label>
                          Descripción de la actividad
                          <textarea
                            name="description"
                            defaultValue={agendaEvent?.description ?? ""}
                            maxLength={1000}
                            required
                          />
                        </label>
                        <p className="muted">
                          Los horarios son de Costa Rica. La agenda se
                          actualizará al guardar.
                        </p>
                      </>
                    )}
                    {editor.resource === "projects" && (
                      <>
                        {field("Nombre del proyecto", "name", project?.name)}
                        <label className="project-availability">
                          <input
                            type="checkbox"
                            name="active"
                            defaultChecked={project?.active !== false}
                          />
                          Disponible para nuevas asignaciones
                        </label>
                        <p className="muted">
                          Desmarca si el puesto cerró. Los retos ya asignados se
                          conservan; puedes cambiarlos en Usuarios → Asignación.
                        </p>
                        <label>
                          Área del proyecto
                          <select
                            aria-label="Área del proyecto"
                            value={projectCategory}
                            onChange={(e) => {
                              const category = e.target
                                .value as ProjectCategory;
                              setProjectCategory(category);
                              setProjectLevel(
                                category === "pasitos"
                                  ? "preescolar"
                                  : category === "school"
                                    ? 1
                                    : category === "third_cycle"
                                      ? 7
                                      : 10,
                              );
                            }}
                          >
                            {projectCategories.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Nivel del proyecto
                          <select
                            aria-label="Nivel del proyecto"
                            value={String(projectLevel)}
                            onChange={(e) =>
                              setProjectLevel(
                                e.target.value === "preescolar"
                                  ? "preescolar"
                                  : Number(e.target.value),
                              )
                            }
                          >
                            {(projectCategory === "pasitos"
                              ? (["preescolar"] as const)
                              : projectCategory === "school"
                                ? [1, 2, 3, 4, 5, 6]
                                : projectCategory === "third_cycle"
                                  ? [7, 8, 9]
                                  : [10, 11]
                            ).map((level) => (
                              <option key={level} value={level}>
                                {levelLabel(level as ProjectLevel)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {projectCategory === "specialty" ? (
                          <>
                            <label>
                              Especialidad
                              <select
                                aria-label="Especialidad"
                                value={projectSpecialty}
                                onChange={(e) =>
                                  setProjectSpecialty(e.target.value)
                                }
                              >
                                {specialties.map((s) => (
                                  <option key={s.name} value={s.name}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <p>
                              Edificio:{" "}
                              <strong>
                                {
                                  names[
                                    specialties.find(
                                      (s) => s.name === projectSpecialty,
                                    )!.buildingId
                                  ]
                                }
                              </strong>
                            </p>
                          </>
                        ) : (
                          location(
                            project?.buildingId ??
                              (projectCategory === "pasitos"
                                ? "8"
                                : projectCategory === "school"
                                  ? "3"
                                  : "10"),
                          )
                        )}
                        <label>
                          Descripción
                          <textarea
                            name="description"
                            defaultValue={project?.description}
                            maxLength={1000}
                            required
                          />
                        </label>
                      </>
                    )}
                    {editor.resource === "challenges" && (
                      <>
                        {field("Título del reto", "title", challenge?.title)}
                        {kind === "freeform" && (
                          <label>
                            Proyecto relacionado (opcional)
                            <select
                              aria-label="Proyecto relacionado"
                              name="projectId"
                              defaultValue={challenge?.projectId ?? ""}
                            >
                              <option value="">Sin proyecto específico</option>
                              {data.projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {kind !== "quiz" && location(challenge?.buildingId)}
                        <label>
                          Descripción
                          <textarea
                            name="description"
                            defaultValue={challenge?.description}
                            maxLength={1000}
                            required
                          />
                        </label>
                        <label>
                          Tipo de reto
                          <select
                            name="challengeKind"
                            value={kind}
                            onChange={(e) =>
                              setKind(e.target.value as LocalChallenge["kind"])
                            }
                          >
                            <option value="freeform">Formulario libre</option>
                            <option value="quiz">
                              Especialidad: dos preguntas y código
                            </option>
                            <option value="code">
                              Código de stand / photobooth
                            </option>
                            <option value="saint">
                              Santo del edificio · Marque con X
                            </option>
                          </select>
                        </label>
                        <p className="muted">
                          {challenge?.isBase
                            ? "Reto base del recorrido general de visitantes."
                            : "Los retos vinculados a proyectos se asignan como visitas. Solo códigos de puestos y santos sin proyecto son retos extra."}{" "}
                          Las reglas de retos con respuestas guardadas se
                          conservan.
                        </p>
                        {(kind === "quiz" || kind === "code") && (
                          <label>
                            Código del stand
                            <input
                              name="code"
                              defaultValue={challenge?.code ?? ""}
                              pattern="[A-Za-z0-9]{4}"
                              maxLength={4}
                              minLength={4}
                              required
                            />
                          </label>
                        )}
                        {kind === "saint" && (
                          <fieldset>
                            <legend>Santo del edificio · Marque con X</legend>
                            {field(
                              "Pregunta del santo",
                              "saintPrompt",
                              challenge
                                ? saintQuestion(challenge).prompt
                                : "¿Qué santo da nombre a este edificio?",
                            )}
                            <label>
                              Opciones del santo (una por línea, entre 2 y 6)
                              <textarea
                                name="saintOptions"
                                defaultValue={
                                  challenge?.kind === "saint"
                                    ? saintQuestion(challenge).options.join(
                                        "\n",
                                      )
                                    : ""
                                }
                                maxLength={1000}
                                required
                              />
                            </label>
                            <label>
                              Número de la opción correcta del santo (desde 1)
                              <input
                                name="saintCorrect"
                                type="number"
                                min={1}
                                max={6}
                                defaultValue={
                                  challenge?.kind === "saint"
                                    ? saintQuestion(challenge).correctIndex + 1
                                    : 1
                                }
                                required
                              />
                            </label>
                            <p className="muted">
                              Si la respuesta es incorrecta, se guarda el
                              intento y se asigna otro reto extra disponible,
                              sin sumar un reto completado.
                            </p>
                          </fieldset>
                        )}
                        {kind === "quiz" && (
                          <>
                            <label>
                              Especialidad del reto
                              <select
                                aria-label="Especialidad del reto"
                                value={challengeSpecialty}
                                onChange={(e) => {
                                  setChallengeSpecialty(e.target.value);
                                  setChallengeProjectId("");
                                }}
                              >
                                {specialties.map((s) => (
                                  <option key={s.name} value={s.name}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Nivel del reto
                              <select
                                aria-label="Nivel del reto"
                                value={challengeLevel}
                                onChange={(e) => {
                                  setChallengeLevel(
                                    Number(e.target.value) as 10 | 11,
                                  );
                                  setChallengeProjectId("");
                                }}
                              >
                                <option value={10}>Décimo</option>
                                <option value={11}>Undécimo</option>
                              </select>
                            </label>
                            <label>
                              Proyecto
                              <select
                                aria-label="Proyecto del reto"
                                name="projectId"
                                value={challengeProjectId}
                                onChange={(e) =>
                                  setChallengeProjectId(e.target.value)
                                }
                                required
                              >
                                <option value="">Selecciona un proyecto</option>
                                {data.projects
                                  .filter(
                                    (p) =>
                                      p.category === "specialty" &&
                                      p.specialty === challengeSpecialty &&
                                      p.level === challengeLevel,
                                  )
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} · {levelLabel(p.level)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <p className="muted">
                              El nivel y la especialidad deben coincidir con el
                              proyecto. Si no aparece, créalo en Proyectos con
                              esos datos. Edificio:{" "}
                              {
                                names[
                                  specialties.find(
                                    (s) => s.name === challengeSpecialty,
                                  )!.buildingId
                                ]
                              }
                              .
                            </p>
                            {[0, 1].map((index) => (
                              <fieldset key={index}>
                                <legend>
                                  {index === 0
                                    ? "Pregunta del objetivo"
                                    : "Pregunta técnica"}
                                </legend>
                                {field(
                                  "Pregunta",
                                  `q${index}Prompt`,
                                  challenge?.questions?.[index]?.prompt,
                                )}
                                <label>
                                  Opciones (una por línea, entre 2 y 6)
                                  <textarea
                                    name={`q${index}Options`}
                                    defaultValue={
                                      challenge?.questions?.[
                                        index
                                      ]?.options.join("\n") ?? ""
                                    }
                                    required
                                    maxLength={1000}
                                  />
                                </label>
                                <label>
                                  Número de la opción correcta (desde 1)
                                  <input
                                    name={`q${index}Correct`}
                                    type="number"
                                    min={1}
                                    max={6}
                                    defaultValue={
                                      (challenge?.questions?.[index]
                                        ?.correctIndex ?? 0) + 1
                                    }
                                    required
                                  />
                                </label>
                              </fieldset>
                            ))}
                          </>
                        )}
                      </>
                    )}
                    <div className="admin-form-actions">
                      <button
                        type="submit"
                        disabled={remote?.busy}
                        className="primary"
                      >
                        {remote?.busy ? "Guardando…" : "Guardar cambios"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditor(null);
                          setError("");
                        }}
                      >
                        Cancelar edición
                      </button>
                    </div>
                  </form>
                </section>
              )}
              {remove && (
                <section className="reset-confirm">
                  <p>
                    {remote && remove.resource === "users"
                      ? `¿Desactivar «${remove.title}»? Se conservarán sus respuestas, votos y tiquetes.`
                      : `¿Eliminar «${remove.title}» del catálogo? Si el registro está en uso, se bloqueará para conservar sus referencias.`}
                  </p>
                  <button disabled={remote?.busy} onClick={removeEntry}>
                    {remote && remove.resource === "users"
                      ? "Confirmar desactivación"
                      : "Confirmar eliminación"}
                  </button>
                  <button onClick={() => setRemove(null)}>Cancelar</button>
                </section>
              )}
              <label className="project-search">
                Buscar en el catálogo
                <input
                  type="search"
                  value={tab === "users" && remote ? remote.search : search}
                  onChange={(e) => {
                    if (tab === "users" && remote)
                      remote.setSearch(e.target.value);
                    else setSearch(e.target.value);
                  }}
                />
              </label>
              <div className="admin-record-list">
                {(tab === "users" && remote
                  ? [
                      ...data.users.filter(
                        (u) =>
                          u.role === "admin" &&
                          normalize(JSON.stringify(u)).includes(
                            normalize(remote.search),
                          ),
                      ),
                      ...remote.users,
                    ]
                  : data[tab]
                )
                  .filter((entry) =>
                    tab === "users" && remote
                      ? true
                      : normalize(JSON.stringify(entry)).includes(
                          normalize(search),
                        ),
                  )
                  .map((entry) => {
                    const title = "title" in entry ? entry.title : entry.name;
                    const relatedProject =
                      "projectId" in entry
                        ? data.projects.find((p) => p.id === entry.projectId)
                        : undefined;
                    return (
                      <article key={entry.id}>
                        <div>
                          <h3>{title}</h3>
                          {"token" in entry && (
                            <p>
                              Token: <b>{entry.token}</b> ·{" "}
                              {roleLabel(entry.role)}
                              {entry.area && ` · ${areaLabel(entry.area)}`}
                            </p>
                          )}
                          {"token" in entry && entry.email && (
                            <p>{entry.email}</p>
                          )}
                          {"active" in entry && entry.active === false && (
                            <span className="participant-status status-inactive">
                              Usuario inactivo
                            </span>
                          )}
                          {"specialty" in entry && (
                            <p className="project-classification">
                              {projectLabel(entry)}
                              {entry.active === false && " · No disponible"}
                            </p>
                          )}
                          {relatedProject && (
                            <p className="project-classification">
                              {projectLabel(relatedProject)}
                            </p>
                          )}
                          {"time" in entry && (
                            <p>
                              {entry.day} {entry.dayNumber} · {entry.time}
                              {entry.endTime && ` – ${entry.endTime}`} ·{" "}
                              {
                                {
                                  general: "General",
                                  pastoral: "Pastoral",
                                  radio: "CEDES Radio",
                                }[entry.category]
                              }
                              <br />
                              {entry.description}
                            </p>
                          )}
                          {"buildingId" in entry && (
                            <PlaceTag>{names[entry.buildingId]}</PlaceTag>
                          )}
                          {"isBase" in entry && (
                            <small>
                              {entry.isBase ? "Reto base" : "Reto extra"}
                            </small>
                          )}
                        </div>
                        <div className="admin-record-actions">
                          {"token" in entry && entry.role !== "admin" && (
                            <button
                              onClick={() => showAssignments(entry.id)}
                              aria-label={`Asignación: ${title}`}
                            >
                              Asignación
                            </button>
                          )}
                          {"token" in entry && entry.role !== "admin" && (
                            <button
                              onClick={() => showAnswers(entry.id)}
                              aria-label={`Ver respuestas: ${title}`}
                            >
                              Ver respuestas
                            </button>
                          )}
                          <button
                            onClick={() => open(tab, entry.id)}
                            aria-label={`Editar: ${title}`}
                          >
                            Editar
                          </button>
                          <button
                            className="danger-button"
                            disabled={
                              !!remote &&
                              (entry.id === actor.id ||
                                ("active" in entry && entry.active === false))
                            }
                            onClick={() => {
                              setRemove({ resource: tab, id: entry.id, title });
                              setError("");
                            }}
                            aria-label={`${remote && "token" in entry ? "Desactivar" : "Eliminar"}: ${title}`}
                          >
                            {remote && "token" in entry
                              ? "Desactivar"
                              : "Eliminar"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
              {tab === "users" && remote && (
                <AdminPagination
                  page={remote.page}
                  pageCount={Math.max(
                    1,
                    Math.ceil(remote.usersTotal / remote.size),
                  )}
                  total={remote.usersTotal}
                  size={remote.size}
                  onChange={remote.setPage}
                  label="Páginas de usuarios"
                />
              )}
            </>
          )}
          {tab === "users" && userView && selectedParticipant && (
            <section className="admin-user-detail">
              <button
                className="admin-back-users"
                onClick={() => {
                  remote?.clearSelection();
                  setUserView(null);
                  setSelectedParticipant(null);
                }}
              >
                Volver a usuarios
              </button>
              {userView === "assignments" && (
                <header className="admin-user-detail-heading">
                  <h2>
                    {data.users.find((u) => u.id === selectedParticipant)?.name}
                  </h2>
                  <p>
                    Token:{" "}
                    <strong>
                      {
                        data.users.find((u) => u.id === selectedParticipant)
                          ?.token
                      }
                    </strong>
                  </p>
                </header>
              )}
              {userView === "answers" ? (
                <ParticipantAnswers
                  data={data}
                  rows={rows}
                  selectedId={selectedParticipant}
                />
              ) : (
                <AdminAssignments
                  key={selectedParticipant}
                  data={data}
                  actor={actor}
                  onSave={onSave}
                  onChanged={() => refresh((n) => n + 1)}
                  participantId={selectedParticipant}
                />
              )}
            </section>
          )}
          {tab === "backup" &&
            (remote ? (
              <RemoteBackup />
            ) : (
              <ExcelBackup data={data} actor={actor} onRestored={onRestored} />
            ))}
        </div>
      </main>
    </div>
  );
}
