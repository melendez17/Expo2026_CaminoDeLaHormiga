"use client";
import { useEffect, useRef, useState } from "react";
import { useAdminRemote } from "@/lib/admin-remote-context";
import { api, downloadApi, type Page } from "@/lib/remote-api";
import { notifyAction } from "@/lib/action-feedback";
import { AdminOverview } from "./admin-overview";
import { AdminPagination } from "./admin-pagination";
import type { LocalData } from "@/lib/local-game";
import type { RaffleDraw } from "@/lib/local-tickets";
export function RemoteOverview({
  data,
  onAnswers,
}: {
  data: LocalData;
  onAnswers: (id: string) => void;
}) {
  const remote = useAdminRemote()!;
  return <AdminOverview data={data} rows={remote.rows} onAnswers={onAnswers} />;
}
export function RemoteBackup() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="admin-backup">
      <h2>Respaldo Excel</h2>
      <p>
        Descarga el catálogo, usuarios, respuestas, votos, tiquetes e historial
        de sorteos guardados en la base de datos.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await downloadApi("/admin/backup", "respaldo-expotec.xlsx");
            notifyAction("Respaldo Excel descargado desde el servidor.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparando respaldo…" : "Descargar respaldo Excel"}
      </button>
      <p className="muted">
        Para restaurar una base real, utiliza un respaldo PostgreSQL y el
        procedimiento del administrador. Importar un Excel local no modifica ni
        reemplaza los premios reales.
      </p>
    </section>
  );
}
type Ticket = {
  id: string;
  code: string;
  name: string;
  token: string;
  source: "manual" | "digital";
  winner: boolean;
  spent: boolean;
  issued_at: string;
};
type SavedDraw = RaffleDraw & { email?: string };
type HistoryDraw = {
  id: string;
  ticket_id: string;
  ticketCode: string;
  winnerName: string;
  winnerId: string;
  email: string;
  source: "manual" | "digital";
  prize: string;
  pool_size: number;
  created_at: string;
  actor_id: string;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("es-CR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(new Date(value));
export function RemoteTickets() {
  const remote = useAdminRemote()!,
    [token, setToken] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [tickets, setTickets] = useState<Page<Ticket>>({ items: [], total: 0 }),
    [history, setHistory] = useState<Page<HistoryDraw>>({
      items: [],
      total: 0,
    }),
    [eligible, setEligible] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [prize, setPrize] = useState(""),
    [result, setResult] = useState<SavedDraw | null>(null),
    [spinning, setSpinning] = useState(false);
  const lock = useRef(false),
    loadId = useRef(0);
  async function refresh() {
    const id = ++loadId.current;
    const [t, h, c] = await Promise.all([
      api<Page<Ticket>>(
        "/admin/tickets?limit=10&offset=" +
          (page - 1) * 10 +
          "&search=" +
          encodeURIComponent(search),
      ),
      api<Page<HistoryDraw>>(
        "/admin/raffles?limit=10&offset=" + (historyPage - 1) * 10,
      ),
      api<{ eligible: number }>("/admin/raffle-status"),
    ]);
    if (id === loadId.current) {
      setTickets(t);
      setHistory(h);
      setEligible(c.eligible);
    }
  }
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void refresh().catch((e) => {
        if (alive) setError((e as Error).message);
      });
    }, 250);
    const poll = setInterval(() => {
      if (!document.hidden && !lock.current)
        void refresh().catch((e) => {
          if (alive) setError((e as Error).message);
        });
    }, 30000);
    return () => {
      alive = false;
      loadId.current++;
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [page, historyPage, search]);
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
      try {
        await refresh();
      } catch {
        setError(
          "La acción se guardó. No se pudo actualizar el registro; vuelve a abrir Tiquetes para recargar.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  useEffect(() => {
    if (!spinning) return;
    const timer = setTimeout(
      () => {
        setSpinning(false);
        notifyAction("Sorteo finalizado. El resultado quedó guardado.");
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 100
        : 1400,
    );
    return () => clearTimeout(timer);
  }, [spinning]);
  return (
    <section className="admin-ticket-section">
      <h2>Tiquetes</h2>
      <p className="muted">
        Registro compartido entre dispositivos. Votar conserva la participación
        en la rifa.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="ticket-actions-grid tickets-only">
        <section className="ticket-issue-panel">
          <h3>Crear tiquete manual</h3>
          <p>
            Para retos realizados en papel. Cada tiquete incluye un voto
            disponible.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const saved = await remote.execute<{
                  result: { ticketCode: string };
                  state: { user: { name: string } };
                }>("/admin/tickets", "POST", { token });
                setToken("");
                notifyAction(
                  `Tiquete ${saved.result.ticketCode} creado para ${saved.state.user.name}.`,
                );
              });
            }}
          >
            <label>
              Token del participante
              <input
                value={token}
                onChange={(e) => setToken(e.target.value.toUpperCase())}
                minLength={4}
                maxLength={4}
                pattern="[A-Z0-9]{4}"
                required
                autoComplete="off"
              />
            </label>
            <button className="primary" disabled={busy || remote.busy}>
              {busy ? "Creando…" : "Crear"}
            </button>
          </form>
        </section>
      </div>
      <div className="ranking-list-heading">
        <h3>Registro de tiquetes</h3>
        <label className="admin-search">
          <span className="sr-only">Buscar tiquete</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Nombre, token o tiquete"
          />
        </label>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-data-table ticket-register">
          <thead>
            <tr>
              <th>Tiquete</th>
              <th>Participante</th>
              <th>Origen</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {tickets.items.map((t) => (
              <tr key={t.id}>
                <td>
                  <code>{t.code}</code>
                </td>
                <td>
                  {t.name}
                  <small>Token: {t.token}</small>
                </td>
                <td>
                  {t.source === "manual" ? "Manual · papel" : "Retos digitales"}
                  <small>{date(t.issued_at)}</small>
                </td>
                <td>
                  {t.winner ? "Ganador" : "No premiado"}
                  <small>
                    {t.spent ? "Voto utilizado" : "Voto disponible"}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!tickets.items.length && (
        <p className="empty">No hay tiquetes para esta búsqueda.</p>
      )}
      <AdminPagination
        page={page}
        pageCount={Math.max(1, Math.ceil(tickets.total / 10))}
        total={tickets.total}
        size={10}
        onChange={setPage}
        label="Páginas de tiquetes"
      />
      <section className="admin-raffle">
        <h2>Rifa aleatoria</h2>
        <p>
          Cada tiquete elegible tiene la misma probabilidad. El servidor realiza
          y guarda el sorteo; un tiquete ganador no vuelve a participar.
        </p>
        <div className="raffle-draw">
          <div>
            <h3>Tiquetes disponibles</h3>
            <p>
              <b>{eligible}</b> en total
            </p>
            <label>
              Premio
              <input
                aria-label="Premio de la rifa"
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                maxLength={120}
              />
            </label>
          </div>
          <button
            className="primary"
            disabled={busy || remote.busy || spinning || !eligible}
            onClick={() =>
              void run(async () => {
                const winner = await remote.execute<SavedDraw>(
                  "/admin/raffles",
                  "POST",
                  { prize: prize.trim() || "Sorteo ExpoTEC" },
                );
                setResult(winner);
                setSpinning(true);
              })
            }
          >
            {busy || spinning ? "Sorteando…" : "Sortear ganador"}
          </button>
        </div>
        <div
          className={`raffle-stage ${spinning ? "is-spinning" : ""}`}
          aria-busy={spinning}
        >
          <div className="raffle-stage-heading">
            <span>
              {spinning
                ? "Descubriendo al ganador"
                : result
                  ? "Tenemos un ganador"
                  : "¿Quién será el próximo ganador?"}
            </span>
            <small>RIFA EXPOTEC</small>
          </div>
          <div className="raffle-window">
            <div className="raffle-reel-ticket">
              <b>
                {spinning
                  ? "•••"
                  : (result?.ticketCode ?? "Tu próximo ganador")}
              </b>
              <span>
                {spinning
                  ? "El resultado ya está guardado"
                  : (result?.winnerName ?? "Digitales y manuales juntos")}
              </span>
            </div>
          </div>
        </div>
        {result && !spinning && (
          <div className="raffle-winner" role="status">
            <h3>Ganador del sorteo</h3>
            <strong>{result.winnerName}</strong>
            <p>
              Tiquete ganador: <code>{result.ticketCode}</code>
            </p>
            <p>
              {result.prize} · {date(result.at)}
            </p>
          </div>
        )}
        <h3>Historial de sorteos</h3>
        <div className="raffle-table">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Ganador</th>
                <th>Correo</th>
                <th>Tiquete</th>
                <th>Premio</th>
                <th>Tiquetes participantes</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((d) => (
                <tr key={d.id}>
                  <td>{date(d.created_at)}</td>
                  <td>{d.winnerName}</td>
                  <td>{d.email}</td>
                  <td>
                    <code>{d.ticketCode}</code>
                  </td>
                  <td>{d.prize}</td>
                  <td>{d.pool_size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!history.items.length && <p>Aún no hay sorteos.</p>}
        <AdminPagination
          page={historyPage}
          pageCount={Math.max(1, Math.ceil(history.total / 10))}
          total={history.total}
          size={10}
          onChange={setHistoryPage}
          label="Páginas de sorteos"
        />
      </section>
    </section>
  );
}
