import { NiuAdminClient } from '../dist/index.js';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const admin = new NiuAdminClient({
  adminToken: required('NIU_ADMIN_TOKEN'),
  baseURL: required('NIU_ADMIN_BASE_URL'),
});
const scope = {
  organizationId: required('NIU_ORGANIZATION_ID'),
  // Compatibility API field: this identifies the Niu workspace.
  projectId: required('NIU_WORKSPACE_ID'),
};
// Read metadata only: never print policy patterns, request content or credentials.
const history = async read => {
  const entries = [];
  let cursor;
  for (;;) {
    const page = await read(cursor);
    entries.push(...page.data);
    if (page.next_cursor === null) return entries;
    if (!Number.isSafeInteger(page.next_cursor) || page.next_cursor < 1 ||
        (cursor !== undefined && page.next_cursor >= cursor)) {
      throw new Error('History returned a non-descending cursor');
    }
    cursor = page.next_cursor;
  }
};
const revisions = await history(cursor => admin.listWorkspaceGuardrailHistory(scope, cursor));
const keyId = process.env.NIU_KEY_ID;
const assignments = keyId
  ? await history(cursor => admin.listKeyGuardrailHistory(scope, keyId, cursor))
  : null;
console.log(JSON.stringify({
  workspacePolicyHistory: revisions.map(item => ({
    revision: item.revision, name: item.policy_name, active: item.active,
    changedBy: item.actor_name, changedAt: item.activated_at,
    restoredFromRevision: item.restored_from_revision,
  })),
  keyAssignmentHistory: assignments?.map(item => ({
    revision: item.assignment_revision, policyRevision: item.policy_revision,
    policyName: item.policy_name, changedBy: item.actor_name,
    changedAt: item.created_at,
  })) ?? null,
}, null, 2));
