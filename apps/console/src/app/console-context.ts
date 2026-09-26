import { useOutletContext } from 'react-router';
import type { FormEvent } from 'react';

export type Model = { id: string; provider: string; upstream_model: string; public_catalog: boolean };
export type Health = { status: string; model_count: number };
export type GatewayStatus = 'online' | 'offline' | 'checking';

export type ConsoleContext = {
  token: string;
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
