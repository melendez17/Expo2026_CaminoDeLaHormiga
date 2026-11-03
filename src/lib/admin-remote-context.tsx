"use client";
import { createContext, useContext } from "react";
import type { LocalData, LocalProgress, LocalUser } from "./local-game";
import type { adminRows } from "./local-admin";
import type { UserRecord, Metrics, RankedProject } from "./remote-api";
export type AdminChange = {
  resource: "users" | "projects" | "challenges" | "agenda";
  id: string | null;
  draftId: string;
};
export type RemoteAdminTransport = {
  execute: <T>(
    path: string,
    method: string,
    input?: Record<string, unknown>,
  ) => Promise<T>;
  status: string;
  sort: string;
  size: number;
  setStatus: (value: string) => void;
  setSort: (value: string) => void;
  setSize: (value: number) => void;
  catalogVersion: number;
  clearSelection: () => void;
  lastCreated?: LocalUser;
  busy: boolean;
  rows: ReturnType<typeof adminRows>;
  users: UserRecord[];
  usersTotal: number;
  page: number;
  search: string;
  setPage: (page: number) => void;
  setSearch: (text: string) => void;
  refresh: () => Promise<void>;
  select: (id: string) => Promise<void>;
  save: (
    next: LocalData,
    expectedVersion?: number,
    change?: AdminChange,
  ) => Promise<LocalUser | undefined>;
  remove: (resource: string, id: string) => Promise<void>;
  assignment: (userId: string, input: Record<string, unknown>) => Promise<void>;
  metrics: Metrics;
  ranked: RankedProject[];
};
export const AdminRemoteContext = createContext<RemoteAdminTransport | null>(
  null,
);
export const useAdminRemote = () => useContext(AdminRemoteContext);
