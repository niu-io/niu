import { NiuAdminClient } from '../dist/index.js';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const client = new NiuAdminClient({
  adminToken: required('NIU_ADMIN_TOKEN'),
  baseURL: required('NIU_ADMIN_BASE_URL'),
});
const scope = {
  organizationId: required('NIU_ORGANIZATION_ID'),
  projectId: required('NIU_WORKSPACE_ID'),
};
// Synthetic fixture only. The endpoint does not activate rules or call a model.
const result = await client.previewGuardrailInput(scope, {
  protocol: 'chat',
  rules: [{ pattern: 'synthetic-secret', action: 'block' }],
  request: { messages: [{ role: 'user', content: 'Test synthetic-secret' }] },
});
if (result.outcome !== 'blocked' || result.enforcement !== false || result.synthetic !== true) {
  throw new Error('Unexpected synthetic inspection outcome');
}
console.log(JSON.stringify(result, null, 2));
