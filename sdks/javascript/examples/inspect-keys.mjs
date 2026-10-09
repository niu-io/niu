import { NiuAdminClient } from '../dist/index.js';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error('Missing configuration');
  return value;
};

try {
  const admin = new NiuAdminClient({
    adminToken: required('NIU_ADMIN_TOKEN'),
    baseURL: required('NIU_ADMIN_BASE_URL'),
  });
  const { data } = await admin.listWorkspaceKeys({
    organizationId: required('NIU_ORGANIZATION_ID'),
    // Compatibility API field: this identifies the Niu workspace.
    projectId: required('NIU_WORKSPACE_ID'),
  });
  const keys = data.map(key => ({
    name: key.name,
    status: key.revoked ? 'Revoked' : key.expired ? 'Expired' : 'Active',
    allowedModels: key.allowed_models,
    expiresAt: new Date(key.expires_at_ms).toISOString(),
    activityAvailable: key.last_used_at_ms !== undefined,
    lastDispatchAt: key.last_used_at_ms == null ? null : new Date(key.last_used_at_ms).toISOString(),
  }));
  console.log(JSON.stringify({ keys }, null, 2));
} catch (error) {
  const status = Number.isInteger(error?.status) ? ` (HTTP ${error.status})` : '';
  console.error(`Workspace key inspection failed${status}. Check the endpoint, workspace scope and read credential.`);
  process.exitCode = 1;
}
