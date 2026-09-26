import { useOutletContext } from 'react-router';
import type { FormEvent } from 'react';

export type Model = { id: string; provider?: string; upstream_model?: string; public_catalog: boolean };
export type Health = { status: string; model_count: number };
export type GatewayStatus = 'online' | 'offline' | 'checking';
export type AdminSession = {
  kind: 'installation' | 'operator';
  operator: null | {
    id: string;
    role: 'owner' | 'admin' | 'viewer';
    organization_id: string;
    project_id: string | null;
  };
  permissions: { read: boolean; write: boolean; manage_operators: boolean };
};

export type ConsoleContext = {
  token: string;
  session: AdminSession | null;
  draftToken: string;
  setDraftToken: (value: string) => void;
  models: Model[];
  health: Health | null;
  gatewayStatus: GatewayStatus;
  error: string;
  connect: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  disconnect: () => void;
};

export function useConsoleContext() {
  return useOutletContext<ConsoleContext>();
}
