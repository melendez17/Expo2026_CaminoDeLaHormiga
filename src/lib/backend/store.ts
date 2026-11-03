import type { LocalData, LocalProgress, LocalUser } from "../local-game";
export type Profile = LocalUser & {
  active: boolean;
  version: number;
  createdAt: string;
};
export type ParticipantRecord = {
  user: Profile;
  progress: LocalProgress;
  version: number;
  stats?: Record<string, unknown>;
};
export type CatalogRecord = {
  version: number;
  catalog: Omit<LocalData, "users">;
  admins: Profile[];
  votingOpen: boolean;
  raffleOpen: boolean;
};
export interface BackendStore {
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
}
