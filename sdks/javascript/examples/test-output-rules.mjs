import { NiuAdminClient, NiuAPIError } from '../dist/index.js';

async function main() {
  const required = name => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const mode = process.env.NIU_OUTPUT_MODE ?? 'buffered_full';
  if (!['buffered_full', 'observe_only'].includes(mode)) {
    throw new Error('NIU_OUTPUT_MODE must be buffered_full or observe_only');
  }
  const client = new NiuAdminClient({
    adminToken: required('NIU_ADMIN_TOKEN'),
    baseURL: required('NIU_ADMIN_BASE_URL'),
  });
  const scope = {
    organizationId: required('NIU_ORGANIZATION_ID'),
    projectId: required('NIU_WORKSPACE_ID'),
  };
  // Synthetic complete response only; does not activate rules or call a model.
  const result = await client.previewGuardrailOutput(scope, {
    mode,
    protocol: 'chat',
    rules: [{ pattern: 'synthetic-secret', action: 'redact' }],
    response: { choices: [{ message: { role: 'assistant', content: 'Test synthetic-secret' } }] },
  });
  const observed = mode === 'observe_only';
  if (result.outcome !== (observed ? 'matched' : 'allowed') ||
      result.reason !== (observed ? 'pattern_match' : 'inspected_text') ||
      result.redacted !== !observed || result.enforcement !== false ||
      result.synthetic !== true || result.mode !== mode || result.coverage !== 'local_text') {
    throw new Error('Unexpected synthetic output inspection outcome');
  }
  // Never print unrecognized server fields, content, credentials or identifiers.
  console.log(JSON.stringify({ mode, outcome: result.outcome, reason: result.reason,
    redacted: result.redacted, synthetic: true, enforcement: false, coverage: 'local_text' }, null, 2));
}
main().catch(error => {
  if (error instanceof NiuAPIError) console.error(`Output preview failed (HTTP ${error.status}).`);
  else if (error instanceof Error && (/^NIU_[A-Z_]+ is required$/.test(error.message) || error.message === 'NIU_OUTPUT_MODE must be buffered_full or observe_only')) console.error(error.message);
  else console.error('Output preview failed.');
  process.exitCode = 1;
});
