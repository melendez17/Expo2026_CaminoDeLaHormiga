"use client";
import { useAdminRemote } from "@/lib/admin-remote-context";
import { useState } from "react";
import type { adminRows } from "@/lib/local-admin";
import type { LocalData } from "@/lib/local-game";
import { roleLabel, areaLabel, isAdmissionRole } from "@/lib/taxonomy";
import { normalize } from "@/lib/local-game";
import { AppIcon } from "./icons";
import { ProjectLeaderboard } from "./project-leaderboard";
import { AdminPagination } from "./admin-pagination";
type Row = ReturnType<typeof adminRows>[number];
export function AdminOverview({
  data,
  rows,
  onAnswers,
}: {
  data: LocalData;
  rows: Row[];
  onAnswers: (id: string) => void;
}) {
  const remote = useAdminRemote();
  const [localSearch, setLocalSearch] = useState("");
  const search = remote?.search ?? localSearch,
    setSearch = remote?.setSearch ?? setLocalSearch;
  const [localStatus, setLocalStatus] = useState("");
  const status = remote?.status ?? localStatus,
    setStatus = remote?.setStatus ?? setLocalStatus;
  const [localSort, setLocalSort] = useState("name");
  const sort = remote?.sort ?? localSort,
    setSort = remote?.setSort ?? setLocalSort;
  const [localSize, setLocalSize] = useState(10);
  const size = remote?.size ?? localSize,
    setSize = remote?.setSize ?? setLocalSize;
  const [localPage, setLocalPage] = useState(1);
  const page = remote?.page ?? localPage,
    setPage = remote?.setPage ?? setLocalPage;
  const valid = rows.filter((r) => r.stats && (remote || r.progress));
  const completed =
    remote?.metrics.completed ??
    rows.filter((r) => r.status === "Completado").length;
  const started = remote
    ? remote.metrics.started - completed
    : rows.filter((r) => r.status === "En proceso").length;
  const inactive = remote
    ? remote.metrics.participants - remote.metrics.started
    : rows.filter((r) => r.status === "Sin activar").length;
  const invalid = remote ? 0 : rows.length - valid.length;
  const participantTotal = remote?.metrics.participants ?? rows.length;
  const tickets =
    remote?.metrics.tickets ?? valid.reduce((n, r) => n + r.stats!.tickets, 0);
  const votes = valid.flatMap((r) => r.progress?.votes ?? []);
  const voteCount = remote?.metrics.votes ?? votes.length;
  const percentage = participantTotal
    ? Math.round((completed / participantTotal) * 100)
    : 0;
  const filtered = remote
    ? rows
    : rows
        .filter(
          (r) =>
            (!status || r.status === status) &&
            normalize(r.user.name).includes(normalize(search)),
        )
        .sort(
          (a, b) =>
            (sort === "tickets"
              ? (b.stats?.tickets ?? 0) - (a.stats?.tickets ?? 0)
              : sort === "progress"
                ? (b.stats?.base ?? 0) - (a.stats?.base ?? 0)
                : 0) || a.user.name.localeCompare(b.user.name, "es"),
        );
  const pages = Math.max(
    1,
    Math.ceil((remote?.usersTotal ?? filtered.length) / size),
  );
  const current = Math.min(page, pages);
  const states = [
    ["", "Todos", participantTotal],
    ["Completado", "Completado", completed],
    ["En proceso", "En proceso", started],
    ["Sin activar", "Sin activar", inactive],
    ...(invalid ? [["Revisar datos", "Revisar datos", invalid]] : []),
  ] as [string, string, number][];
  return (
    <>
      <section className="admin-metrics" aria-labelledby="metrics-title">
        <h2 className="admin-numbered-title" id="metrics-title">
          <span>02</span>
          {remote ? "Métricas generales" : "Métricas locales"}
        </h2>
        <div className="completion-feature">
          <AppIcon className="completion-watermark" name="check" />
          <span className="completion-label">Completados</span>
          <div className="completion-value">
            <strong>{completed}</strong>
            <div>
              <h3>
                de {participantTotal}{" "}
                {participantTotal === 1 ? "participante" : "participantes"}
              </h3>
              <p>{percentage}% completó su primera ronda o ruta de admisión</p>
            </div>
          </div>
          <div
            className="participant-state-bar"
            role="img"
            aria-label={`${completed} completados, ${started} en proceso, ${inactive} sin activar${invalid ? `, ${invalid} por revisar` : ""}`}
          >
            {[
              [completed, "completed"],
              [started, "started"],
              [inactive, "inactive"],
              [invalid, "invalid"],
            ].map(
              ([count, state]) =>
                Number(count) > 0 && (
                  <span
                    key={state}
                    className={`state-${state}`}
                    style={{
                      width: `${(Number(count) / participantTotal) * 100}%`,
                    }}
                  />
                ),
            )}
          </div>
          <div className="participant-state-legend">
            <span>
              <i className="state-completed" />
              {completed} {completed === 1 ? "completado" : "completados"}
            </span>
            <span>
              <i className="state-started" />
              {started} en proceso
            </span>
            <span>
              <i className="state-inactive" />
              {inactive} sin activar
            </span>
            {!!invalid && (
              <span>
                <i className="state-invalid" />
                {invalid} por revisar
              </span>
            )}
          </div>
        </div>
        <div className="admin-reward-band">
          {[
            ["ticket", tickets, "Tiquetes", "Participan en la rifa"],
            ["votes", voteCount, "Votos emitidos", "Ya entregados"],
            ["votes", tickets - voteCount, "Votos disponibles", "Por usar"],
          ].map(([icon, value, title, detail]) => (
            <article key={title}>
              <span className="reward-band-icon">
                <AppIcon name={icon as "ticket" | "votes"} />
              </span>
              <strong>{value}</strong>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <p hidden={!!remote} className="admin-admissions">
          Admisiones completas:{" "}
          <strong>
            {
              valid.filter(
                (r) =>
                  isAdmissionRole(r.user.role) &&
                  r.progress?.survey &&
                  r.stats!.routeComplete,
              ).length
            }
          </strong>
        </p>
        {!!invalid && (
          <p className="form-error">
            Hay {invalid} progresos que necesitan revisión. Se excluyeron de los
            totales de premios y votos.
          </p>
        )}
      </section>
      <section
        className="participant-overview"
        aria-labelledby="participants-title"
      >
        <h2 className="admin-numbered-title" id="participants-title">
          <span>03</span>Estado por participante
        </h2>
        <div className="participant-toolbar">
          <label className="admin-search">
            <span className="sr-only">Buscar participante por nombre</span>
            <AppIcon name="search" />
            <input
              type="search"
              placeholder="Buscar participante por nombre"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span className="sr-only">Ordenar participantes</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="name">Nombre A–Z</option>
              <option value="tickets">Más tiquetes</option>
              <option value="progress">Mayor avance</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Participantes por página</span>
            <select
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[10, 25, 50].map((n) => (
                <option value={n} key={n}>
                  {n} por página
                </option>
              ))}
            </select>
          </label>
        </div>
        <div
          className="participant-filters"
          role="group"
          aria-label="Filtrar participantes por estado"
        >
          {states.map(([id, title, count]) => (
            <button
              key={id}
              aria-pressed={status === id}
              onClick={() => {
                setStatus(id);
                setPage(1);
              }}
            >
              {title} · {count}
            </button>
          ))}
        </div>
        <div
          className="admin-table-wrap"
          role="region"
          aria-label="Estado por participante"
          tabIndex={0}
        >
          <table className="admin-data-table participant-summary-table">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Estado</th>
                <th scope="col">Avance</th>
                <th scope="col">Tiquetes</th>
                <th scope="col">Votos disp.</th>
                <th scope="col">Respuestas</th>
              </tr>
            </thead>
            <tbody>
              {(remote
                ? filtered
                : filtered.slice((current - 1) * size, current * size)
              ).map((r) => (
                <tr key={r.user.id}>
                  <td>
                    <div className="participant-identity">
                      <span
                        className="participant-token"
                        aria-label={`Token: ${r.user.token}`}
                      >
                        {r.user.token}
                      </span>
                      <div>
                        <strong>{r.user.name}</strong>
                        <small className="participant-role">
                          {roleLabel(r.user.role)}
                          {r.user.area && ` · ${areaLabel(r.user.area)}`}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`participant-status ${r.error ? "status-invalid" : r.status === "Completado" ? "status-complete" : r.status === "En proceso" ? "status-started" : "status-inactive"}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.stats ? (
                      <div className="participant-progress">
                        <progress
                          max={r.stats.baseTarget}
                          value={r.stats.base}
                          aria-label={`Avance de ${r.user.name}`}
                        />
                        <span>
                          {r.stats.base}/{r.stats.baseTarget}
                        </span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <b>{r.stats?.tickets ?? "—"}</b>
                  </td>
                  <td>
                    <b>{r.stats?.votesAvailable ?? "—"}</b>
                  </td>
                  <td>
                    <button
                      onClick={() => onAnswers(r.user.id)}
                      aria-label={`Ver respuestas: ${r.user.name}`}
                    >
                      Ver respuestas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <p className="empty">
            No encontramos participantes con esos filtros.
          </p>
        )}
        <AdminPagination
          page={current}
          pageCount={pages}
          total={remote?.usersTotal ?? filtered.length}
          size={size}
          onChange={setPage}
          label="Páginas de participantes"
        />
      </section>
      <ProjectLeaderboard
        projects={data.projects}
        votes={votes}
        ranked={remote?.ranked}
      />
    </>
  );
}
