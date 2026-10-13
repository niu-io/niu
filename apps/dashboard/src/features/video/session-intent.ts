import { NiuAPIError } from '../../../../../sdks/javascript/src/index';
import type { RequestOptions } from '../../../../../sdks/javascript/src/index';
import type { NiuAdminClient, TenantScope, VideoIntentRequest, VideoSubmissionIntent } from '../../../../../sdks/javascript/src/admin';
import type { GenerationsTurn, VideoGenerationsSession } from '../../../../../sdks/javascript/src/generations-sessions';

type Client = Pick<NiuAdminClient, 'generations' | 'saveVideoIntent' | 'getVideoIntent'>;
export type VideoSessionIntentInput = {
  sessionId: string; turnId: string; intentId: string; keyId: string;
  title: string; request: VideoIntentRequest;
};
export type PreparedVideoSessionIntent = {
  session: VideoGenerationsSession; turn: GenerationsTurn; intent: VideoSubmissionIntent;
};

function canonical(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, ordered(child)]));
    }
    return item;
  }
  return JSON.stringify(ordered(value));
}
function checkInput(input: VideoSessionIntentInput) {
  for (const id of [input.sessionId, input.turnId, input.intentId, input.keyId]) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) || id === '00000000-0000-0000-0000-000000000000') throw new Error('Stable nonnil Video references are required.');
  }
  if (!input.title.trim() || new TextEncoder().encode(input.title).length > 200) throw new Error('Provide a bounded Video session title.');
}
function instruction(input: VideoSessionIntentInput) {
  return {kind: 'video' as const, prompt: input.request.content.flatMap(item => item.type === 'text' ? [item.text] : []).join('\n')};
}
function checkSession(session: VideoGenerationsSession, scope: TenantScope, input: VideoSessionIntentInput, forWrite: boolean) {
  // Actor authorization belongs to the server's private session read, never a
  // client-invented owner. Titles are mutable labels, not identity. Archived
  // sessions remain readable but cannot receive new preparation writes.
  if (session.id !== input.sessionId || session.workspace_id !== scope.projectId || session.category !== 'video' || (forWrite && session.archived)) throw new Error('The original Video session is unavailable or changed.');
}
function checkIntent(intent: VideoSubmissionIntent, input: VideoSessionIntentInput) {
  if (intent.id !== input.intentId || intent.model !== input.request.model || (intent.key_id !== input.keyId && intent.original_key_id !== input.keyId)) throw new Error('The saved Video intent does not match the original context.');
  if (intent.content_state !== 'retained' || !intent.request) throw new Error('The original Video input has expired or was deleted.');
  // Compare only explicitly supplied fields. Extra server-materialized controls
  // remain authoritative; never guess their defaults or reconstruct the request.
  if (Object.entries(input.request).some(([key, value]) => canonical(value) !== canonical(intent.request![key]))) throw new Error('The saved Video request differs from this input. Restore the original request.');
}
function checkTurn(turn: GenerationsTurn, input: VideoSessionIntentInput, intent: VideoSubmissionIntent, requireBinding: boolean) {
  if (turn.id !== input.turnId || turn.content_state !== 'retained' || !turn.instruction || canonical(turn.instruction) !== canonical(instruction(input))) throw new Error('The original Video turn is unavailable or differs from this input.');
  if (turn.intent && (turn.intent.id !== input.intentId || turn.intent.model !== intent.model || turn.intent.content_state !== 'retained')) throw new Error('The Video turn belongs to another or unavailable intent.');
  if (requireBinding && !turn.intent) throw new Error('The original Video intent has not been bound. Resume preparation with the same references.');
  if (turn.task_id && turn.task_id !== intent.job?.id) throw new Error('The Video turn task does not match the original submission.');
}
async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try { return await read(); } catch (error) {
    if (error instanceof NiuAPIError && error.status === 404) return null;
    throw error;
  }
}

/** Read-only recovery. Missing, deleted or mismatched identities never trigger
 * writes, a replacement turn/intent, inference, or a fabricated task. */
export async function restoreVideoSessionIntent(client: Client, scope: TenantScope, input: VideoSessionIntentInput, options?: RequestOptions): Promise<PreparedVideoSessionIntent> {
  checkInput(input);
  const sessions = client.generations(scope).sessions;
  const [session, intent] = await Promise.all([sessions.retrieve(input.sessionId, options).then(value => value.data), client.getVideoIntent(scope, input.intentId, options).then(value => value.data)]);
  checkSession(session, scope, input, false); checkIntent(intent, input);
  const turn = session.turns.find(value => value.id === input.turnId);
  if (!turn) throw new Error('The original Video turn has not been saved. Resume preparation with the same references.');
  checkTurn(turn, input, intent, true);
  return {session, turn, intent};
}

/** Explicit metadata preparation only. Caller allocates and locates identities
 * before calling. Errors retain those identities; there is no internal retry,
 * submit, upstream call, task attachment, or inferred cancellation. */
export async function prepareVideoSessionIntent(client: Client, scope: TenantScope, input: VideoSessionIntentInput, options?: RequestOptions): Promise<PreparedVideoSessionIntent> {
  checkInput(input);
  const sessions = client.generations(scope).sessions;
  let session = await optional(() => sessions.retrieve(input.sessionId, options).then(value => value.data));
  const existing = await optional(() => client.getVideoIntent(scope, input.intentId, options).then(value => value.data));
  if (session) checkSession(session, scope, input, true);
  if (existing) checkIntent(existing, input);
  const priorTurn = session?.turns.find(value => value.id === input.turnId);
  if (priorTurn && existing) checkTurn(priorTurn, input, existing, false);
  if (priorTurn && !existing) throw new Error('Restore the existing Video turn before preparing another intent.');
  // Read and validate existing content before any write. A mismatched replay is
  // rejected without creating an empty session or replacing retained content.
  const intent = (await client.saveVideoIntent(scope, input.intentId, input.keyId, input.request, options)).data;
  checkIntent(intent, input);
  if (!session) session = (await sessions.create(input.sessionId, {title: input.title}, options)).data;
  checkSession(session, scope, input, true);
  let turn = session.turns.find(value => value.id === input.turnId);
  if (!turn) {
    session = (await sessions.appendTurn(input.sessionId, input.turnId, {expected_revision: session.revision, instruction: instruction(input)}, options)).data;
    checkSession(session, scope, input, true);
    turn = session.turns.find(value => value.id === input.turnId);
  }
  if (!turn) throw new Error('The saved Video turn was not returned. Restore the same session.');
  checkTurn(turn, input, intent, false);
  if (!turn.intent) {
    session = (await sessions.bindIntent(input.sessionId, input.turnId, {expected_revision: session.revision, intent_id: input.intentId}, options)).data;
    checkSession(session, scope, input, true);
    turn = session.turns.find(value => value.id === input.turnId);
  }
  if (!turn) throw new Error('The bound Video turn was not returned. Restore the same session.');
  // Final fresh reads also recover an authoritative original attempt if one was
  // already submitted elsewhere. This function never submits it itself.
  const restored = await restoreVideoSessionIntent(client, scope, input, options);
  checkSession(restored.session, scope, input, true);
  return restored;
}
