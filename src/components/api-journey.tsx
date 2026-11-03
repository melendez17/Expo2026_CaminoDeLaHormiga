"use client";
import { notifyAction } from "@/lib/action-feedback";
import { ruleDescription } from "@/lib/assignment-rules";
import type { FailedAttempt } from "@/lib/failed-attempts";
import { Fragment, useEffect, useRef, useState } from "react";
import { LoadingScreen } from "./loading-screen";
import { AntMascot } from "./ant-mascot";
import {
  FailedChallengeCard,
  FailedChallengeReview,
} from "./failed-challenge-card";
import { IncorrectAnswerNotice } from "./incorrect-answer-notice";
import { FullCampusMap } from "./full-campus-map";
import { CampusMap } from "./campus-map";
import { AppIcon, PinIcon } from "./icons";
import { AppNavigation } from "./app-navigation";
import { ChallengeCard } from "./challenge-card";
import { EventAgenda } from "./event-agenda";
import { projectLabel, isAdmissionRole } from "@/lib/taxonomy";
import { VoteHistory } from "./vote-history";
import { VisitorProjectLeaders } from "./visitor-project-leaders";
import { PageIntro } from "./page-intro";
import { RemoteAdmin } from "./remote-admin";
import {
  api,
  bindApiUser,
  ranking,
  displayData,
  displayProgress,
  downloadApi,
  forgetPendingActions,
  isUnauthorized,
  type PublicCatalog,
  type ParticipantState,
  type RankedProject,
} from "@/lib/remote-api";
import { ApiClientError } from "@/lib/api-client";
import campus from "@/lib/campus.json";
import {
  availableProjects,
  routeChallenges,
  currentVisitorRound,
  saintQuestion,
  normalize,
  type Answers,
  type LocalChallenge,
  type LocalUser,
} from "@/lib/local-game";

type Section = "route" | "dashboard" | "votes" | "agenda" | "map";
const names: Record<string, string> = campus.names;

function ChallengeDialog({
  challenge,
  onClose,
  onComplete,
}: {
  challenge: LocalChallenge;
  onClose: () => void;
  onComplete: (answers: Answers) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal local-dialog"
      onCancel={(e) => {
        if (submittingRef.current) e.preventDefault();
        else onClose();
      }}
      aria-labelledby="challenge-title"
    >
      <div className="row">
        <span className="eyebrow">
          {challenge.kind === "quiz"
            ? "ESPECIALIDAD · MARCA CON X"
            : "UN NUEVO DESCUBRIMIENTO"}
        </span>
        <button
          type="button"
          disabled={submitting}
          onClick={onClose}
          aria-label="Cerrar reto"
        >
          <AppIcon name="close" />
        </button>
      </div>
      <h2 id="challenge-title">{challenge.title}</h2>
      <p>{challenge.description}</p>
      <form
        aria-busy={submitting}
        inert={submitting || undefined}
        onSubmit={async (e) => {
          e.preventDefault();
          if (submittingRef.current) return;
          submittingRef.current = true;
          setSubmitting(true);
          setError("");
          const answers = Object.fromEntries(
            new FormData(e.currentTarget),
          ) as Answers;
          try {
            await onComplete(answers);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            submittingRef.current = false;
            setSubmitting(false);
          }
        }}
      >
        {["quiz", "code"].includes(challenge.kind) && (
          <p className="muted">
            Si respondes incorrectamente, este reto quedará bloqueado y se
            sustituirá por otro, sin aumentar tus pendientes.
          </p>
        )}
        {challenge.kind === "freeform" && (
          <>
            <label>
              Nombre del proyecto
              <input
                name="projectName"
                minLength={2}
                maxLength={160}
                required
              />
            </label>
            <label>
              Nivel
              <input
                name="level"
                maxLength={80}
                required
                placeholder="Por ejemplo: quinto grado"
              />
            </label>
            <label>
              ¿Qué descubriste?
              <textarea
                name="description"
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
          </>
        )}
        {challenge.kind === "quiz" &&
          challenge.questions?.map((q, index) => (
            <fieldset key={q.id}>
              <legend>
                {index + 1}. {q.prompt}
              </legend>
              {q.options.map((option, i) => (
                <label className="radio-option quiz-option" key={i}>
                  <input type="radio" name={q.id} value={i} required />
                  <span className="answer-cross" aria-hidden="true">
                    <AppIcon name="close" width="15" height="15" />
                  </span>
                  <span>{option}</span>
                </label>
              ))}
            </fieldset>
          ))}
        {["quiz", "code"].includes(challenge.kind) && (
          <label>
            Código del stand
            <input
              name="code"
              maxLength={4}
              pattern="[A-Za-z0-9]{4}"
              required
              autoComplete="off"
              placeholder="4 caracteres"
            />
          </label>
        )}
        {challenge.kind === "saint" && (
          <fieldset>
            <legend>{saintQuestion(challenge).prompt}</legend>
            <p className="muted">
              Marca con X una opción. Si fallas, recibirás otro reto extra.
            </p>
            {saintQuestion(challenge).options.map((option, i) => (
              <label className="radio-option quiz-option" key={i}>
                <input type="radio" name="saintChoice" value={i} required />
                <span className="answer-cross" aria-hidden="true">
                  <AppIcon name="close" width="15" height="15" />
                </span>
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Guardando…" : "Completar reto"}
        </button>
      </form>
    </dialog>
  );
}

export function ApiJourney({ adminOnly = false }: { adminOnly?: boolean }) {
  const [restoring, setRestoring] = useState(true);
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null),
    [state, setState] = useState<ParticipantState | null>(null),
    [user, setUser] = useState<LocalUser | null>(null);
  const [token, setToken] = useState(""),
    [section, setSection] = useState<Section>("route"),
    [selected, setSelected] = useState<string | null>(null),
    [active, setActive] = useState<LocalChallenge | null>(null);
  const [filter, setFilter] = useState<"base" | "extra">("base"),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [search, setSearch] = useState(""),
    [projectArea, setProjectArea] = useState(""),
    [online, setOnline] = useState(true),
    [busy, setBusy] = useState(false);
  const [projectRanking, setRanking] = useState<RankedProject[]>([]),
    [reviewAttempt, setReviewAttempt] = useState<FailedAttempt | null>(null);
  const [failureNotice, setFailureNotice] = useState<{
    challenge: LocalChallenge;
    replacement: LocalChallenge;
    answers: Answers;
    corrections: ReturnType<
      typeof import("@/lib/failed-attempts").failedAttemptDetails
    >;
  } | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null),
    busyRef = useRef(false),
    identityRef = useRef<string | null>(null),
    generation = useRef(0);
  const setMessage = notifyAction;
  const data = catalog && state ? displayData(catalog, state) : null,
    progress = catalog && state ? displayProgress(state, catalog) : null;
  function clearSession() {
    setMessage("");
    setSection("route");
    setFilter("base");
    setSelected(null);
    setSearch("");
    setProjectArea("");
    generation.current++;
    identityRef.current = null;
    setUser(null);
    setState(null);
    setActive(null);
    setFailureNotice(null);
    setReviewAttempt(null);
    setVoteTarget(null);
    setRanking([]);
    forgetPendingActions();
  }
  useEffect(() => {
    bindApiUser(user?.id ?? null);
  }, [user?.id]);
  async function loadSession() {
    const saved = await api<{ user: LocalUser }>("/auth/session");
    if (adminOnly && saved.user.role !== "admin")
      throw new ApiClientError(
        403,
        "admin_only",
        "Este acceso es solo para administradores. Entra desde el inicio.",
      );
    const loaded =
      saved.user.role !== "admin" ? await api<ParticipantState>("/me") : null;
    const person = loaded?.user ?? saved.user;
    identityRef.current = person.id;
    bindApiUser(person.id);
    setState(loaded);
    setUser(person);
  }
  useEffect(() => {
    let alive = true;
    async function boot() {
      // Retire the demo worker and its public shell; production never caches private API responses.
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((r) => r.scope === location.origin + "/")
            .map((r) => r.unregister()),
        );
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith("camino-shell-"))
            .map((k) => caches.delete(k)),
        );
      }
      const initial = await api<PublicCatalog>("/catalog");
      if (!alive) return;
      setCatalog(initial);
      try {
        await loadSession();
      } catch (e) {
        if (e instanceof ApiClientError && e.code === "admin_only") {
          setError(e.message);
        } else if (!isUnauthorized(e)) throw e;
      }
    }
    void boot()
      .catch((e) => {
        if (alive)
          setLoadError(
            e instanceof Error
              ? e.message
              : "No se pudo conectar con el servidor.",
          );
      })
      .finally(() => {
        if (alive) setRestoring(false);
      });
    setOnline(navigator.onLine);
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    return () => {
      alive = false;
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
    };
  }, [adminOnly]);
  useEffect(() => {
    if (!user || user.role === "admin") return;
    let cancelled = false,
      refreshing = false;
    const refresh = async () => {
      if (cancelled || refreshing || busyRef.current || document.hidden) return;
      refreshing = true;
      const revision = generation.current;
      try {
        const p = await api<ParticipantState>("/me");
        const c =
          p.catalogVersion !== catalog?.version
            ? await api<PublicCatalog>("/catalog")
            : null;
        if (
          !cancelled &&
          revision === generation.current &&
          p.user.id === identityRef.current
        ) {
          if (c) setCatalog(c);
          setState(p);
          setUser(p.user);
        }
      } catch (e) {
        if (isUnauthorized(e)) {
          clearSession();
          setError("Tu sesión venció. Ingresa de nuevo.");
        }
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [user?.id, section, catalog?.version]);
  useEffect(() => {
    if (!user || section !== "votes") return;
    let cancelled = false;
    const refresh = () => {
      if (document.hidden) return;
      void ranking()
        .then((r) => {
          if (!cancelled) setRanking(r);
        })
        .catch((e) => {
          if (!cancelled) setError((e as Error).message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [section, user?.id]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [section, filter]);
  function changeSection(next: Section) {
    setSection(next);
    setError("");
    setVoteTarget(null);
  }
  async function act(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      if (isUnauthorized(e)) clearSession();
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function command(path: string, input: Record<string, unknown> = {}) {
    const result = await api<{
      state: ParticipantState;
      result?: Record<string, unknown>;
    }>(path, "POST", input);
    setState(result.state);
    setUser(result.state.user);
    return result;
  }
  function login(e: React.FormEvent) {
    e.preventDefault();
    void act(async () => {
      forgetPendingActions();
      await api("/auth/login", "POST", { token });
      try {
        await loadSession();
        setToken("");
      } catch (e) {
        try {
          await api("/auth/logout", "POST", {});
        } catch {}
        clearSession();
        throw e;
      }
    });
  }
  function logout() {
    void act(async () => {
      await api("/auth/logout", "POST", {});
      clearSession();
      setSection("route");
      setFilter("base");
      setSelected(null);
      setSearch("");
      setProjectArea("");
    });
  }
  const brand = (
    <a
      href="/"
      className="brand school-brand"
      aria-label="CEDES Don Bosco, inicio"
    >
      <img
        src="/brand/cedes-don-bosco-white.png"
        alt="CEDES Don Bosco"
        width="2048"
        height="661"
      />
    </a>
  );
  if (!catalog || restoring || loadError)
    return (
      <LoadingScreen message={loadError || undefined} busy={!loadError}>
        {loadError && (
          <>
            <p>
              Comprueba la conexión y la configuración del servidor. No se
              guardarán acciones localmente.
            </p>
            <button onClick={() => location.reload()}>
              Reintentar conexión
            </button>
          </>
        )}
      </LoadingScreen>
    );
  if (!user)
    return (
      <div className="local-login login-entry">
        <header className="local-header">
          {brand}
          <span className="local-pill">EXPOTEC</span>
        </header>
        <main className="login-layout">
          <section className="login-story">
            <span className="eyebrow">FERIA TECNOLÓGICA · CEDES DON BOSCO</span>
            <h1 className="login-event-wordmark" aria-label="ExpoTEC">
              <span>EXPO</span>
              <span>TEC</span>
            </h1>
            <h2 className="login-journey-title">El camino de la hormiga.</h2>
            <p>
              Innovación, tecnología y trabajo en equipo. Descubre el campus y
              construye tu propio camino, un reto a la vez.
            </p>
            <div className="login-perks">
              <span>⌖ Descubre lugares</span>
              <span>✦ Completa retos</span>
              <span>♡ Vota por tus favoritos</span>
            </div>
            <AntMascot className="login-ant" />
          </section>
          <section className="login-card">
            <span className="eyebrow">TU AVENTURA EMPIEZA AQUÍ</span>
            <h2>
              {adminOnly ? "Acceso del administrador" : "Ingresa con tu token"}
            </h2>
            <p>Usa el código de cuatro caracteres asignado a tu nombre.</p>
            <form onSubmit={login}>
              <label htmlFor="token">
                Token de acceso
                <input
                  id="token"
                  name="token"
                  value={token}
                  onChange={(e) => setToken(e.target.value.toUpperCase())}
                  maxLength={4}
                  pattern="[A-Z0-9]{4}"
                  required
                  autoComplete="off"
                  placeholder="Tu token"
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy || !online}>
                {busy ? "Ingresando…" : "Ingresar →"}
              </button>
            </form>
            {!online && <p role="alert">Necesitas conexión para ingresar.</p>}
            {adminOnly && (
              <a className="admin-participant-link" href="/">
                Ir al acceso de participantes →
              </a>
            )}
            <p className="local-footnote">
              Tu avance se guarda en el servidor para continuar desde otro
              dispositivo.
            </p>
          </section>
        </main>
      </div>
    );
  if (user.role === "admin")
    return (
      <RemoteAdmin
        actor={user}
        onLogout={logout}
        onExpired={() => {
          clearSession();
          setError("Tu sesión venció. Ingresa de nuevo.");
        }}
      />
    );
  if (!data || !progress || !state)
    return <LoadingScreen message="Cargando tu recorrido…" />;
  if (!progress.startedAt)
    return (
      <div className="local-login">
        <header className="local-header">
          {brand}
          <button disabled={busy} onClick={logout}>
            Cambiar usuario
          </button>
        </header>
        <main className="welcome-screen">
          <AntMascot className="welcome-mascot" />
          <span className="eyebrow">QUÉ BUENO TENERTE AQUÍ</span>
          <h1>Bienvenido, {user.name.split(" ")[0]}.</h1>
          <p>¿Quieres iniciar el camino de la hormiga?</p>
          <p className="muted">
            {user.role === "visitor"
              ? `Recibirás ${data.assignmentRules.visitorBatchSize} retos base${user.area ? `, uno de ${user.area} si hay disponibilidad` : ""} y los demás al azar. Después podrás generar retos adicionales de cualquier área. Cada dos completados te dan un tiquete.`
              : user.area
                ? `Tu ruta: ${ruleDescription(data.assignmentRules.admission[user.area], user.area)}.`
                : "El administrador debe asignarte un área para preparar tu ruta."}
            <br />
            Después puedes seguir explorando y ganar más tiquetes.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary start-button"
            disabled={busy || !online}
            onClick={() =>
              void act(async () => {
                await command("/me/start");
                setSection("route");
                setMessage("Camino iniciado. Tus retos están listos.");
              })
            }
          >
            Iniciar el camino →
          </button>
        </main>
      </div>
    );

  const stats = state.stats;
  const done = new Set(progress.completed.map((c) => c.challengeId));
  const assignedProjects = availableProjects(data, user.id);
  const visitorPairs = progress.visitorRounds.length > 0;
  const baseIds = progress.visitorRounds[0] ?? [];
  const route = visitorPairs
    ? baseIds
        .map((id) => data.challenges.find((c) => c.id === id)!)
        .filter(Boolean)
    : routeChallenges(data, progress);
  const additionalIds = new Set([
    ...progress.extraIds,
    ...progress.visitorRounds.slice(1, progress.visitorRoundIndex + 1).flat(),
  ]);
  const extras = data.challenges.filter((c) => additionalIds.has(c.id));
  const nextVisitorAvailable = visitorPairs && state.nextAvailable;
  const visitorPending =
    visitorPairs &&
    (currentVisitorRound(data, progress).some((c) => !done.has(c.id)) ||
      progress.extraIds.some((id) => !done.has(id)));
  const routeIds = new Set(route.map((c) => c.id));
  const remainingExtras = state.nextAvailable ? 1 : 0;
  const extraPending = extras.some((c) => !done.has(c.id));
  const baseComplete = visitorPairs
    ? route.length > 0 && route.every((c) => done.has(c.id))
    : stats.routeComplete;
  const displayed = filter === "base" ? route : extras;
  const attempts: FailedAttempt[] = state.failedAttempts.map((a) => ({
    ...a,
    challenge: a.challenge as LocalChallenge,
    answers: {},
    currentId: a.replacementId,
    details: a.details,
  }));
  const failuresHere = attempts.filter((attempt) =>
    filter === "extra"
      ? additionalIds.has(attempt.currentId)
      : !additionalIds.has(attempt.currentId),
  );
  const visibleIds = new Set(displayed.map((c) => c.id));

  const projectVoteCounts = new Map(
    projectRanking.map((project) => [project.id, project.votes]),
  );
  const projects = assignedProjects
    .filter(
      (p) =>
        (!projectArea || p.specialty === projectArea) &&
        normalize(p.name + " " + p.specialty).includes(normalize(search)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const specialties = [
    ...new Set(assignedProjects.map((p) => p.specialty)),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const badges: [string, boolean][] = [
    [
      "Paso Infantil",
      data.challenges.some((c) => c.badge === "infant" && done.has(c.id)),
    ],
    ["Descubridor", stats.base >= 3],
    [
      "Especialista",
      data.challenges.some((c) => c.kind === "quiz" && done.has(c.id)),
    ],
    [
      "Momento ExpoTEC",
      data.challenges.some((c) => c.badge === "moment" && done.has(c.id)),
    ],
    ["Hormiga de Oro", stats.routeComplete],
  ];
  function locate(id: string) {
    setSelected(id);
    setSection("route");
  }
  function renderMap() {
    return <CampusMap selected={selected} onSelect={setSelected} />;
  }

  return (
    <div className={`local-app journey-app section-${section}`}>
      <header className="local-header">
        {brand}
        <div className="local-account">
          <span>
            {user.name.split(" ")[0]}
            <small>{online ? "En línea" : "Sin conexión"}</small>
          </span>
          <button disabled={busy} onClick={logout}>
            Salir
          </button>
        </div>
      </header>
      <AppNavigation
        label="Navegación principal"
        items={
          [
            { id: "route", title: "Retos", icon: "route" },
            { id: "dashboard", title: "Mi resumen", icon: "dashboard" },
            { id: "votes", title: "Votar", icon: "votes" },
            { id: "agenda", title: "Agenda", icon: "agenda" },
            { id: "map", title: "Mapa completo", icon: "map" },
          ] as const
        }
        active={section}
        onChange={changeSection}
      />
      {!online && (
        <p role="alert" className="form-error">
          Sin conexión. Tus datos guardados se conservan; espera a recuperar la
          conexión para realizar acciones.
        </p>
      )}
      {error && (
        <div className="local-feedback is-error" role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              setMessage("");
            }}
            aria-label="Cerrar mensaje"
          >
            <AppIcon name="close" width="16" height="16" />
          </button>
        </div>
      )}
      {section === "route" && (
        <section className="route-hero" aria-label="Tu recorrido en ExpoTEC">
          <div>
            <p className="route-edition">
              01 <span /> FERIA TECNOLÓGICA · EXPOTEC 2026
            </p>
            <h1>
              TUS
              <br />
              <em>RETOS.</em>
            </h1>
            <p className="route-hero-description">
              {stats.routeComplete
                ? "¡Lo lograste! Sigue explorando para ganar más tiquetes."
                : "Completa tu ruta y gana tu primer tiquete."}
            </p>
          </div>
          <div className="route-hero-counts">
            <div>
              <span>COMPLETADOS</span>
              <strong>{String(stats.base).padStart(2, "0")}</strong>
            </div>
            <div>
              <span>META</span>
              <strong>{String(stats.baseTarget).padStart(2, "0")}</strong>
            </div>
          </div>
        </section>
      )}
      <main
        className={section === "route" ? "route-workspace" : "local-content"}
      >
        {section === "route" && (
          <>
            <div className="compact-map">
              {renderMap()}
              <div className="desktop-map-guide">
                <span className="map-guide-icon">
                  <PinIcon />
                </span>
                <div>
                  <h2>Tu siguiente parada, a un clic.</h2>
                  <p>
                    Usa el botón Ubicación de cualquier reto para ver dónde
                    realizarlo.
                  </p>
                  <button onClick={() => changeSection("map")}>
                    Abrir mapa completo
                    <AppIcon name="arrow" width="16" height="16" />
                  </button>
                </div>
              </div>
            </div>
            <div className="route-scroll" ref={scrollRef}>
              <section className="route-overview">
                <div className="route-heading">
                  <div>
                    <h1>Tu camino, {user.name.split(" ")[0]}.</h1>
                  </div>
                  <button
                    className="route-wallet"
                    onClick={() => changeSection("dashboard")}
                    aria-label="Ver mis tiquetes"
                  >
                    <AppIcon name="ticket" />
                    <strong>{stats.tickets}</strong>
                    <span>{stats.tickets === 1 ? "tiquete" : "tiquetes"}</span>
                  </button>
                </div>
                <div className="route-progress-head">
                  <span>Camino base</span>
                  <strong>
                    {stats.base}
                    <small>
                      {" "}
                      de {stats.baseTarget}{" "}
                      {stats.baseTarget === 1 ? "reto" : "retos"}
                    </small>
                  </strong>
                </div>
                <div className="local-route-progress">
                  <progress
                    value={stats.base}
                    max={stats.baseTarget}
                    aria-label="Retos base completados"
                  />
                  <span>
                    {stats.routeComplete
                      ? "¡Lo lograste! Sigue explorando para ganar más tiquetes."
                      : "Completa tu ruta y gana tu primer tiquete."}
                  </span>
                </div>
              </section>
              <div className="filter-tabs">
                <button
                  aria-pressed={filter === "base"}
                  onClick={() => setFilter("base")}
                >
                  Retos base · {stats.base}/{stats.baseTarget}
                </button>
                <button
                  aria-pressed={filter === "extra"}
                  onClick={() => setFilter("extra")}
                >
                  {visitorPairs ? "Retos adicionales" : "Retos extra"} ·{" "}
                  {stats.extra}
                </button>
              </div>
              <div className="challenge-list">
                {displayed.map((c, index) => (
                  <Fragment key={c.id}>
                    {failuresHere
                      .filter((attempt) => attempt.currentId === c.id)
                      .map((attempt) => (
                        <FailedChallengeCard
                          key={attempt.id}
                          attempt={attempt}
                          onReview={() => setReviewAttempt(attempt)}
                        />
                      ))}
                    <ChallengeCard
                      challenge={{ ...c, isBase: filter === "base" }}
                      index={index}
                      completed={done.has(c.id)}
                      busy={busy || !online}
                      requiredExtra={
                        !visitorPairs &&
                        filter === "base" &&
                        !!progress.routeIds.length &&
                        !c.projectId
                      }
                      specialty={
                        data.projects.find((p) => p.id === c.projectId)
                          ?.specialty
                      }
                      projectCategory={
                        data.projects.find((p) => p.id === c.projectId)
                          ?.category
                      }
                      projectLevel={
                        data.projects.find((p) => p.id === c.projectId)?.level
                      }
                      projectName={
                        visitorPairs || progress.routeIds.length
                          ? data.projects.find((p) => p.id === c.projectId)
                              ?.name
                          : undefined
                      }
                      place={names[c.buildingId]}
                      onLocate={() => setSelected(c.buildingId)}
                      onAnswer={() => {
                        setSelected(c.buildingId);
                        setActive(c);
                      }}
                    />
                  </Fragment>
                ))}
                {failuresHere
                  .filter((attempt) => !visibleIds.has(attempt.currentId))
                  .map((attempt) => (
                    <FailedChallengeCard
                      key={attempt.id}
                      attempt={attempt}
                      onReview={() => setReviewAttempt(attempt)}
                    />
                  ))}
              </div>
              {visitorPairs && filter === "extra" && (
                <section className="extras-card">
                  <h2>
                    {visitorPending
                      ? "Tu ronda, a tu ritmo"
                      : nextVisitorAvailable
                        ? "¡Ronda completada!"
                        : "¡Exploraste todos los retos!"}
                  </h2>
                  <p>
                    {visitorPending
                      ? "Completa los retos pendientes para recibir la siguiente ronda. Cada dos completados te dan un tiquete."
                      : nextVisitorAvailable
                        ? "Puedes votar con tus tiquetes o pedir otra ronda de retos, sin repetir los anteriores."
                        : "No quedan retos sin repetir. Tus tiquetes y votos se conservan."}
                  </p>
                  <button
                    className="primary"
                    disabled={
                      busy || !online || visitorPending || !nextVisitorAvailable
                    }
                    onClick={() =>
                      void act(async () => {
                        await command("/me/next-round");
                        setFilter("extra");
                        scrollRef.current?.scrollTo({ top: 0 });
                        setMessage(
                          "Nuevos retos adicionales asignados al azar.",
                        );
                      })
                    }
                  >
                    Recibir otros {data.assignmentRules.visitorBatchSize} retos
                  </button>
                </section>
              )}
              {!visitorPairs && filter === "extra" && (
                <section className="extras-card">
                  <h2>
                    {!stats.routeComplete
                      ? extras.length
                        ? "Tienes retos extra asignados"
                        : "Tu aventura apenas comienza"
                      : remainingExtras
                        ? "Siempre hay algo más por descubrir"
                        : "¡Exploraste todos los retos!"}
                  </h2>
                  <p>
                    {!stats.routeComplete
                      ? extras.length
                        ? "Puedes realizar ahora los extras asignados por una respuesta incorrecta. Los retos originales siguen pendientes; termina tu ruta base para generar nuevas rondas."
                        : "Termina tu ruta base para desbloquear retos adicionales."
                      : extraPending
                        ? "Completa los retos de esta ronda antes de generar la siguiente."
                        : remainingExtras
                          ? `Cada ${data.settings.extraEvery} retos extra te dan otro tiquete. Todavía hay retos por descubrir.`
                          : "Completaste los retos disponibles. El administrador puede agregar más actividades."}
                  </p>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !online ||
                      !stats.routeComplete ||
                      extraPending ||
                      !remainingExtras
                    }
                    onClick={() =>
                      void act(async () => {
                        await command("/me/next-round");
                        setMessage("Nuevos destinos añadidos a tu camino.");
                      })
                    }
                  >
                    Generar más retos
                  </button>
                </section>
              )}
              {baseComplete && filter === "base" && (
                <section className="extras-card">
                  <h2>¡Terminaste el camino base!</h2>
                  <p>
                    {visitorPairs
                      ? "Completaste tus retos base. Sigue explorando para ganar un tiquete por cada dos retos completados."
                      : "Tu primer tiquete ya está disponible. Puedes votar o seguir explorando."}
                  </p>
                  <div className="row">
                    <button
                      className="primary"
                      onClick={() => setFilter("extra")}
                    >
                      Descubrir más retos
                    </button>
                    <button onClick={() => changeSection("votes")}>
                      Ir a votar
                    </button>
                  </div>
                </section>
              )}
            </div>
          </>
        )}

        {section === "dashboard" && (
          <section className="local-section">
            <PageIntro
              eyebrow="CADA DESCUBRIMIENTO SUMA"
              title="Mi"
              accent="resumen."
              sequence="02"
              description={`Así va tu camino, ${user.name.split(" ")[0]}. Cada idea que descubres te lleva más lejos.`}
            />
            <div className="local-stats">
              <article>
                <span className="metric-icon">
                  <AppIcon name="ticket" />
                </span>
                <strong data-testid="ticket-count">{stats.tickets}</strong>
                <span>Tiquetes para la rifa</span>
              </article>
              <article>
                <span className="metric-icon">
                  <AppIcon name="votes" />
                </span>
                <strong data-testid="available-votes">
                  {stats.votesAvailable}
                </strong>
                <span>Votos disponibles</span>
              </article>
              <article>
                <span className="metric-icon">
                  <AppIcon name="check" />
                </span>
                <strong>{progress.completed.length}</strong>
                <span>Retos completados</span>
              </article>
              <article>
                <span className="metric-icon">
                  <AppIcon name="answers" />
                </span>
                <strong>{progress.votes.length}</strong>
                <span>Votos entregados</span>
              </article>
            </div>
            <p className="reward-rule">
              {visitorPairs
                ? "Cada 2 retos completados = 1 tiquete. No necesitas completar cinco retos base."
                : `Ruta base completada = ${data.settings.baseReward} tiquete · Cada ${data.settings.extraEvery} extras = otro.`}{" "}
              Votar conserva tus tiquetes para la rifa.
            </p>
            <section hidden aria-label="Tus insignias">
              <h2>Tus insignias</h2>
              <div className="badges">
                {badges.map(([name, unlocked]) => (
                  <div
                    key={name}
                    className={`badge ${unlocked ? "unlocked" : ""}`}
                  >
                    <span className="badge-symbol" aria-hidden="true">
                      <AppIcon
                        name={unlocked ? "award" : "lock"}
                        width="25"
                        height="25"
                      />
                    </span>
                    <strong>{name}</strong>
                    <small>{unlocked ? "Desbloqueada" : "Por descubrir"}</small>
                  </div>
                ))}
              </div>
            </section>
            {!!progress.manualTickets.length && (
              <p className="reward-rule">
                Incluye {progress.manualTickets.length}{" "}
                {progress.manualTickets.length === 1
                  ? "tiquete manual"
                  : "tiquetes manuales"}{" "}
                por participación en papel.
              </p>
            )}
            <h2>Tus votos</h2>
            {progress.votes.length ? (
              <VoteHistory data={data} votes={progress.votes} />
            ) : (
              <p className="empty">
                Aún no has votado.{" "}
                {visitorPairs
                  ? "Completa dos retos para conseguir tu primer voto."
                  : "Completa el camino base para conseguir tu primer voto."}
              </p>
            )}
            {stats.routeComplete && !progress.survey && (
              <section className="survey">
                <h2>
                  {isAdmissionRole(user.role)
                    ? "Tu encuesta de admisión"
                    : "Cuéntanos tu experiencia"}
                </h2>
                <p>
                  {isAdmissionRole(user.role)
                    ? "Completa la encuesta para cerrar tu proceso de admisión."
                    : "Tu opinión también forma parte del camino."}{" "}
                  Recibirás {data.settings.surveyBonus} tiquete de bono.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(async () => {
                      await command("/me/survey", {
                        expectations: String(f.get("expectations")).trim(),
                        interest: String(f.get("interest")).trim(),
                        satisfaction: Number(f.get("satisfaction")),
                      });
                      setMessage(
                        "Gracias por tu opinión. El bono se añadió a tu resumen.",
                      );
                    });
                  }}
                >
                  <label>
                    ¿Qué esperabas descubrir?
                    <textarea
                      name="expectations"
                      minLength={5}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <label>
                    ¿Qué área te interesa?
                    <input
                      name="interest"
                      minLength={2}
                      maxLength={160}
                      required
                    />
                  </label>
                  <label>
                    ¿Cómo fue tu experiencia?
                    <select name="satisfaction">
                      {[5, 4, 3, 2, 1].map((v) => (
                        <option value={v} key={v}>
                          {v} de 5
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="primary" disabled={busy || !online}>
                    Enviar encuesta
                  </button>
                </form>
              </section>
            )}
            {progress.survey && (
              <p className="feedback">
                Encuesta completada · Bono recibido
                {isAdmissionRole(user.role) ? " · Admisión completada" : ""}.
              </p>
            )}
            <div className="local-backup">
              <button
                disabled={busy || !online}
                onClick={() =>
                  void act(async () => {
                    await downloadApi("/me/export", "mi-avance.json");
                    setMessage("Avance descargado.");
                  })
                }
              >
                Descargar mi avance
              </button>
              <p>
                Los cambios se guardan en el servidor. No se pueden importar ni
                reiniciar premios desde el navegador.
              </p>
            </div>
          </section>
        )}

        {section === "votes" && (
          <section className="local-section">
            <PageIntro
              eyebrow="TU VOTO CUENTA"
              sequence="03"
              title="Tu proyecto"
              accent="favorito."
              description="Busca un proyecto por nombre y dale tu voto."
            />
            <VisitorProjectLeaders ranked={projectRanking} />
            <div className="voting-layout">
              <aside className="voting-aside">
                <div className="vote-balance">
                  <b>{stats.votesAvailable}</b>
                  <span>
                    votos disponibles
                    <small>
                      {stats.tickets} tiquetes siguen participando en la rifa
                    </small>
                  </span>
                </div>
                <div className="vote-explainer">
                  <h2>Cómo funciona</h2>
                  <p>
                    Un tiquete permite un voto. Puedes volver a votar por el
                    mismo equipo si tienes votos disponibles. Votar conserva tus
                    tiquetes para la rifa.
                  </p>
                </div>
              </aside>
              <div className="voting-catalog">
                <label className="project-search has-search-icon">
                  Buscar proyecto por nombre
                  <span className="search-field">
                    <AppIcon name="search" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setVoteTarget(null);
                      }}
                      placeholder="Por ejemplo: AquaSmart"
                    />
                  </span>
                </label>
                <div className="project-area-filter">
                  <span>Filtrar por área</span>
                  <div
                    className="filter-tabs"
                    role="group"
                    aria-label="Filtrar proyectos por área"
                  >
                    <button
                      aria-pressed={!projectArea}
                      onClick={() => {
                        setProjectArea("");
                        setVoteTarget(null);
                      }}
                    >
                      Todas · {assignedProjects.length}
                    </button>
                    {specialties.map((area) => (
                      <button
                        key={area}
                        aria-pressed={projectArea === area}
                        onClick={() => {
                          setProjectArea(area);
                          setVoteTarget(null);
                        }}
                      >
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="muted">
                  {projects.length}{" "}
                  {projects.length === 1
                    ? "proyecto encontrado"
                    : "proyectos encontrados"}{" "}
                  · Orden A–Z.
                </p>
                <div className="project-grid">
                  {projects.map((p) => (
                    <article className="local-project" key={p.id}>
                      <div className="project-identity">
                        <h2>{p.name}</h2>
                        <span className="project-area">{projectLabel(p)}</span>
                        <span
                          className="project-vote-total"
                          aria-label={`${p.name}: ${projectVoteCounts.get(p.id) ?? 0} votos en total`}
                        >
                          {projectVoteCounts.get(p.id) ?? 0}{" "}
                          {(projectVoteCounts.get(p.id) ?? 0) === 1
                            ? "voto"
                            : "votos"}
                        </span>
                      </div>
                      {voteTarget === p.id ? (
                        <div className="vote-confirm">
                          <p>¿Usar un voto para {p.name}?</p>
                          <div className="row">
                            <button
                              className="primary"
                              disabled={busy || !online || !catalog.votingOpen}
                              onClick={() =>
                                void act(async () => {
                                  await command("/me/votes", {
                                    projectId: p.id,
                                  });
                                  setVoteTarget(null);
                                  setMessage(
                                    `¡Voto para ${p.name}! Tu tiquete sigue en la rifa.`,
                                  );
                                  try {
                                    setRanking(await ranking());
                                  } catch {
                                    setError(
                                      "El voto se guardó, pero no se pudo actualizar el ranking. Se recargará automáticamente.",
                                    );
                                  }
                                })
                              }
                            >
                              Confirmar voto
                            </button>
                            <button onClick={() => setVoteTarget(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          className="primary project-vote-button"
                          disabled={
                            busy ||
                            !online ||
                            !catalog.votingOpen ||
                            stats.votesAvailable <= 0
                          }
                          onClick={() => setVoteTarget(p.id)}
                        >
                          Dar 1 voto
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                {!projects.length && (
                  <p className="empty">
                    No encontramos proyectos con ese nombre. Prueba con otra
                    palabra.
                  </p>
                )}
                {!stats.votesAvailable && (
                  <p className="reward-rule">
                    Completa{" "}
                    {visitorPairs
                      ? "dos retos"
                      : stats.routeComplete
                        ? "dos retos extra"
                        : "tu ruta base"}{" "}
                    para obtener otro voto.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {section === "agenda" && <EventAgenda data={data} onLocate={locate} />}
        {section === "map" && (
          <section className="local-section full-map">
            <PageIntro
              eyebrow="ENCUENTRA TU PRÓXIMO DESTINO"
              title="El campus"
              accent="completo."
              sequence="05"
              description="Un campus, muchas historias. Toca una zona o elige un edificio y explora en 3D o 2D."
            />
            <FullCampusMap
              data={data}
              progress={progress}
              selected={selected}
              onSelect={setSelected}
              onReturn={() => changeSection("route")}
            />
          </section>
        )}
      </main>
      {reviewAttempt && (
        <FailedChallengeReview
          attempt={reviewAttempt}
          place={names[reviewAttempt.challenge.buildingId]}
          replacementTitle={
            data.challenges.find((c) => c.id === reviewAttempt.currentId)
              ?.title ?? "Consulta tu recorrido actual"
          }
          onClose={() => setReviewAttempt(null)}
        />
      )}
      {failureNotice && (
        <IncorrectAnswerNotice
          {...failureNotice}
          onClose={() => setFailureNotice(null)}
          onContinue={() => {
            setActive(failureNotice.replacement);
            setFailureNotice(null);
          }}
        />
      )}
      {active && (
        <ChallengeDialog
          key={active.id}
          challenge={active}
          onClose={() => setActive(null)}
          onComplete={async (answers) => {
            if (busyRef.current) return;
            busyRef.current = true;
            generation.current++;
            setBusy(true);
            try {
              const result = await command("/me/answers", {
                challengeId: active.id,
                answers,
              });
              if (result.result?.outcome === "incorrect") {
                setMessage("");
                setError("");
                const attempt = result.state.failedAttempts.find(
                  (a) => a.challenge.id === active.id,
                )!;
                const replacement = result.state.challenges.find(
                  (c) => c.id === result.result?.replacementId,
                )!;
                setActive(null);
                setFailureNotice({
                  challenge: active,
                  replacement: replacement as LocalChallenge,
                  answers,
                  corrections: attempt.details,
                });
                setSelected(replacement.buildingId);
                setFilter(
                  result.state.progress.routeIds.includes(replacement.id) ||
                    result.state.progress.visitorRounds[0]?.includes(
                      replacement.id,
                    )
                    ? "base"
                    : "extra",
                );
              } else {
                setActive(null);
                setMessage(
                  result.state.stats.tickets > stats.tickets
                    ? "¡Reto completado! Ganaste un tiquete y un voto."
                    : "¡Reto completado! Tu avance quedó guardado.",
                );
              }
            } catch (e) {
              if (isUnauthorized(e)) clearSession();
              throw e;
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
