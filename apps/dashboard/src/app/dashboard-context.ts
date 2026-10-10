import { useOutletContext } from 'react-router';
import type { FormEvent } from 'react';

export type CatalogMetadata = { name?: string | null; description?: string | null; context_length?: number | null; max_completion_tokens?: number | null; input_modalities?: string[]; output_modalities?: string[] };
export type CustomerPricing = {currency:string; unit:'nanounits_per_million_tokens'; prompt_rate:string; cached_prompt_rate?:string|null; completion_rate:string};
export type Model = { customer_pricing?: CustomerPricing | null; catalog?: CatalogMetadata; id: string; provider?: string; upstream_model?: string; public_catalog: boolean };
export type Health = { status: string; model_count?: number };
export type GatewayStatus = 'online' | 'offline' | 'checking';
export type Organization = { id: string; name: string };
export type MemberProfile = {name:string; email:string | null; avatar_data_url:string | null; revision:number};
export type Workspace = { id: string; is_default?: boolean; created_at_ms?: number; active_key_count?: number; requests_30d?: number; requests_by_day?: Array<{start_ms: number; request_count: number}>; last_request_at_ms?: number | null; name: string; organization_id: string; organization_name: string };
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
  profile?: MemberProfile | null;
  kind: 'installation' | 'operator';
  provider_memberships?: { id: string; name: string; role: 'manager' | 'viewer' }[];
  operator: null | {
    id: string;
    role: 'owner' | 'admin' | 'viewer';
    organization_id: string;
    project_id: string | null;
  };
  permissions: { read: boolean; write: boolean; manage_operators: boolean; platform_admin?: boolean };
};

export type DashboardContext = {
  appearance?: {ready:boolean; saving:boolean; error:string; reload:()=>void};
  token: string;
  session: AdminSession | null;
  organizations: Organization[];
  organization: Organization | null;
  selectOrganization: (organization: Organization) => void;
  workspaces: Workspace[];
  workspace: Workspace | null;
  workspaceLoading: boolean;
  reloadWorkspaces: () => void;
  workspaceError: WorkspaceProblem | null;
  selectWorkspace: (workspace: Workspace) => void;
  createWorkspace: (name: string, organizationId?: string) => Promise<Workspace>;
  renameWorkspace: (workspace: Workspace, name: string) => Promise<Workspace>;
  deleteWorkspace: (workspace: Workspace) => Promise<void>;
  chatKeys: SessionChatKey[];
  rememberChatKey: (key: SessionChatKey) => void;
  forgetChatKey: (id: string) => void;
  draftToken: string;
  setDraftToken: (value: string) => void;
  models: Model[];
  modelsLoading?: boolean;
  modelsError?: string;
  health: Health | null;
  gatewayStatus: GatewayStatus;
  error: string;
  signOut: () => void;
  connect: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  connectWithToken: (credential: string) => Promise<void>;
  refreshModels: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
};

export function useDashboardContext() {
  return useOutletContext<DashboardContext>();
}
