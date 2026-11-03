"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LocalAdmin } from "./local-admin";
import { LoadingScreen } from "./loading-screen";
import {
  AdminRemoteContext,
  type RemoteAdminTransport,
  type AdminChange,
} from "@/lib/admin-remote-context";
import {
  api,
  ranking,
  isUnauthorized,
  type AdminCatalog,
  type UserRecord,
  type Metrics,
  type RankedProject,
  type Page,
} from "@/lib/remote-api";
import type { LocalData, LocalProgress, LocalUser } from "@/lib/local-game";
import type { Profile } from "@/lib/backend/store";
import { ApiClientError } from "@/lib/api-client";
import { ruleTotal } from "@/lib/assignment-rules";
export function RemoteAdmin({
  actor,
  onLogout,
  onExpired,
}: {
  actor: LocalUser;
  onLogout: () => void;
  onExpired: () => void;
}) {
  const [status, setStatus] = useState(""),
    [sort, setSort] = useState("name"),
    [size, setSize] = useState(50);
  const [snapshot, setSnapshot] = useState<AdminCatalog | null>(null),
    [users, setUsers] = useState<UserRecord[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [metrics, setMetrics] = useState<Metrics | null>(null),
    [ranked, setRanked] = useState<RankedProject[]>([]),
    [detail, setDetail] = useState<{
      profile: Profile;
      progress: LocalProgress;
      state: { stats: NonNullable<UserRecord["stats"]> };
    } | null>(null),
    [recent, setRecent] = useState<LocalUser | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    selectedId = useRef<string | null>(null),
    epoch = useRef(0),
    requestEpoch = useRef(0);
  const expire = useRef(onExpired);
  expire.current = onExpired;
  const load = useCallback(async () => {
    const request = ++requestEpoch.current;
    const [c, u, m, r] = await Promise.all([
      api<AdminCatalog>("/admin/catalog"),
      api<Page<UserRecord>>(
        "/admin/users?limit=" +
          size +
          "&offset=" +
          (page - 1) * size +
          "&search=" +
          encodeURIComponent(search) +
          "&status=" +
          encodeURIComponent(status) +
          "&sort=" +
          sort,
      ),
      api<Metrics>("/admin/metrics"),
      ranking(),
    ]);
    const id = selectedId.current;
    const selected = id
      ? await api<{
          profile: Profile;
          progress: LocalProgress;
          state: { stats: NonNullable<UserRecord["stats"]> };
        }>("/admin/users/" + id)
      : null;
    if (request !== requestEpoch.current) return;
    setSnapshot(c);
    if (c.lastCreated) setRecent(c.lastCreated);
    setUsers(u.items);
    setTotal(u.total);
    setMetrics(m);
    setRanked(r);
    setDetail(selected);
    setError("");
  }, [page, search, status, sort, size]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (cancelled || lock.current || document.hidden) return;
      void load().catch((e) => {
        if (!cancelled) {
          if (isUnauthorized(e)) expire.current();
          else setError((e as Error).message);
        }
      });
    };
    const debounce = setTimeout(refresh, 250);
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      cancelled = true;
      requestEpoch.current++;
      clearTimeout(debounce);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [load]);
  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    if (lock.current) throw Error("Espera a que termine la acción actual.");
    lock.current = true;
    epoch.current++;
    requestEpoch.current++;
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      try {
        await load();
      } catch (e) {
        if (isUnauthorized(e)) expire.current();
        else
          setError(
            "El cambio se guardó, pero no se pudo recargar la vista. Pulsa Actualizar métricas para reintentar.",
          );
      }
      return result;
    } catch (e) {
      if (isUnauthorized(e)) expire.current();
      else if (e instanceof ApiClientError && e.code === "revision_conflict") {
        try {
          await load();
        } catch {}
      }
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function select(id: string) {
    selectedId.current = id;
    setDetail(null);
    const request = ++epoch.current;
    const value = await api<NonNullable<typeof detail>>("/admin/users/" + id);
    if (request === epoch.current) setDetail(value);
  }
  async function save(
    next: LocalData,
    expectedVersion?: number,
    change?: AdminChange,
  ): Promise<LocalUser | undefined> {
    if (!snapshot) throw Error("Espera a que cargue el catálogo.");
    if (change) {
      const { resource, id, draftId } = change;
      const changed = next[resource].find((value) => value.id === draftId);
      if (!changed)
        throw Error("No se pudo leer el registro que estás editando.");
      return mutate(async () => {
        if (resource === "users") {
          const value = changed as LocalUser;
          const body = {
            firstName: value.firstName,
            firstSurname: value.firstSurname,
            secondSurname: value.secondSurname,
            email: value.email,
          };
          let saved: LocalUser;
          if (!id) {
            saved =
              value.role === "admin"
                ? await api<LocalUser>("/admin/staff", "POST", body)
                : (
                    await api<{ user: LocalUser }>("/admin/users", "POST", {
                      ...body,
                      role: value.role,
                      area: value.area,
                      consent: true,
                      delivery: "card",
                    })
                  ).user;
            setRecent(saved);
          } else {
            if (expectedVersion === undefined)
              throw Error("Vuelve a abrir el registro antes de guardar.");
            saved = await api<LocalUser>(
              value.role === "admin"
                ? "/admin/staff/" + id
                : "/admin/users/" + id,
              "PATCH",
              {
                ...body,
                ...(value.role === "admin"
                  ? {}
                  : { role: value.role, area: value.area }),
                ...(typeof (value as Profile).active === "boolean"
                  ? { active: (value as Profile).active }
                  : {}),
                expectedVersion,
              },
            );
            if (recent?.id === saved.id) setRecent(saved);
          }
          return saved;
        }
        await api(
          "/admin/" + resource + (id ? "/" + encodeURIComponent(id) : ""),
          id ? "PUT" : "POST",
          {
            expectedVersion: expectedVersion ?? snapshot.version,
            value: changed,
          },
        );
        return undefined;
      });
    }
    return mutate(async () => {
      await api("/admin/assignment-rules", "PUT", {
        expectedVersion: expectedVersion ?? snapshot.version,
        assignmentRules: next.assignmentRules,
      });
      return undefined;
    });
  }
  const allUsers = [
    ...(snapshot?.admins ?? []),
    ...(recent ? [recent] : []),
    ...users,
    ...(detail ? [detail.profile] : []),
  ];
  const unique = [...new Map(allUsers.map((u) => [u.id, u])).values()];
  const data = snapshot
    ? ({ ...snapshot.catalog, users: unique } as LocalData)
    : null;
  const rows: RemoteAdminTransport["rows"] = users.map((user) => {
    const selected = detail?.profile.id === user.id ? detail : null;
    const initial = {
      base: 0,
      baseTarget:
        user.role === "visitor"
          ? (snapshot?.catalog.assignmentRules.visitorBatchSize ?? 2)
          : snapshot && user.area
            ? ruleTotal(snapshot.catalog.assignmentRules.admission[user.area])
            : 5,
      extra: 0,
      routeComplete: false,
      digitalTickets: 0,
      manualTickets: 0,
      tickets: 0,
      votesAvailable: 0,
    };
    const stats =
      selected?.state.stats ??
      (user.stats && Object.keys(user.stats).length ? user.stats : initial);
    return {
      user,
      progress: selected?.progress ?? null,
      stats,
      error: null,
      status: stats.routeComplete
        ? "Completado"
        : user.startedAt
          ? "En proceso"
          : "Sin activar",
    };
  });
  if (detail && !rows.some((row) => row.user.id === detail.profile.id))
    rows.push({
      user: detail.profile,
      progress: detail.progress,
      stats: detail.state.stats,
      error: null,
      status: detail.state.stats.routeComplete
        ? "Completado"
        : detail.progress.startedAt
          ? "En proceso"
          : "Sin activar",
    });
  if (!snapshot || !metrics || !data)
    return (
      <LoadingScreen
        busy={!error}
        message={error || "Cargando administración…"}
      >
        {error && (
          <>
            <button
              onClick={() =>
                void load().catch((e) => setError((e as Error).message))
              }
            >
              Reintentar
            </button>
            <button onClick={onLogout}>Salir</button>
          </>
        )}
      </LoadingScreen>
    );
  const transport: RemoteAdminTransport = {
    catalogVersion: snapshot.version,
    lastCreated: recent ?? undefined,
    clearSelection: () => {
      selectedId.current = null;
      epoch.current++;
      requestEpoch.current++;
      setDetail(null);
    },
    execute: <T,>(
      path: string,
      method: string,
      input?: Record<string, unknown>,
    ) => mutate(() => api<T>(path, method, input)),
    busy,
    users,
    usersTotal: total,
    page,
    search,
    status,
    sort,
    size,
    setStatus: (value) => {
      setStatus(value);
      setPage(1);
    },
    setSort: (value) => {
      setSort(value);
      setPage(1);
    },
    setSize: (value) => {
      setSize(value);
      setPage(1);
    },
    setPage,
    setSearch: (text) => {
      setSearch(text);
      setPage(1);
    },
    rows,
    metrics,
    ranked,
    refresh: load,
    select,
    save,
    remove: (resource, id) =>
      mutate(async () => {
        if (resource === "users") {
          const record = unique.find((u) => u.id === id) as Profile;
          if (id === actor.id)
            throw Error("No puedes desactivar tu propio acceso.");
          await api(
            "/admin/" +
              (record.role === "admin" ? "staff" : "users") +
              "/" +
              id,
            "DELETE",
            { expectedVersion: record.version },
          );
        } else
          await api(
            "/admin/" + resource + "/" + encodeURIComponent(id),
            "DELETE",
            { expectedVersion: snapshot.version },
          );
        if (recent?.id === id) setRecent(null);
      }),
    assignment: (id, input) =>
      mutate(async () => {
        await api("/admin/users/" + id + "/assignments", "POST", input);
      }),
  };
  return (
    <AdminRemoteContext.Provider value={transport}>
      {error && (
        <div className="local-feedback is-error" role="alert">
          {error}
          <button
            onClick={() =>
              void load().catch((e) => setError((e as Error).message))
            }
          >
            Actualizar
          </button>
        </div>
      )}
      <LocalAdmin
        data={data}
        actor={snapshot.admins.find((a) => a.id === actor.id) ?? actor}
        onLogout={onLogout}
        onSave={(next) => {
          void save(next);
        }}
        onRestored={() => {}}
      />
    </AdminRemoteContext.Provider>
  );
}
