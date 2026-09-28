import { useOutletContext } from 'react-router';
import type { FormEvent } from 'react';

export type CatalogMetadata = { name?: string | null; description?: string | null; context_length?: number | null; max_completion_tokens?: number | null; input_modalities?: string[]; output_modalities?: string[]; input_price?: string | null; output_price?: string | null };
export type RoutePricing = { currency: string; api_prompt_rate: number; api_completion_rate: number; cash_prompt_rate: number; cash_completion_rate: number; max_input_tokens: number; max_output_tokens: number };
export type Model = { catalog?: CatalogMetadata; id: string; provider?: string; upstream_model?: string; public_catalog: boolean; route_pricing?: RoutePricing | null };
export type Health = { status: string; model_count?: number };
export type GatewayStatus = 'online' | 'offline' | 'checking';
export type Organization = { id: string; name: string };
export type Workspace = { id: string; name: string; organization_id: string; organization_name: string };
export type SessionChatKey = {
  id: string;
  name: string;
  token: string;
  allowedModels: string[];
  organizationId: string;
  projectId: string;
};
export type WorkspaceProblem =
  | { kind: 'api'; endpoint: string; status: number }
  | { kind: 'missing'; workspace: string }
  | { kind: 'network' }
  | { kind: 'response' };
export type AdminSession = {
  kind: 'installation' | 'operator';
  provider_memberships?: { id: string; name: string; role: 'manager' | 'viewer' }[];
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
  organizations: Organization[];
  organization: Organization | null;
  selectOrganization: (organization: Organization) => void;
  workspaces: Workspace[];
  workspace: Workspace | null;
  workspaceLoading: boolean;
  workspaceError: WorkspaceProblem | null;
  selectWorkspace: (workspace: Workspace) => void;
  createWorkspace: (name: string, organizationId?: string) => Promise<Workspace>;
  chatKeys: SessionChatKey[];
  rememberChatKey: (key: SessionChatKey) => void;
  forgetChatKey: (id: string) => void;
  draftToken: string;
  setDraftToken: (value: string) => void;
  models: Model[];
  health: Health | null;
  gatewayStatus: GatewayStatus;
  error: string;
  signOut: () => void;
  connect: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
};

export function useConsoleContext() {
  return useOutletContext<ConsoleContext>();
}
