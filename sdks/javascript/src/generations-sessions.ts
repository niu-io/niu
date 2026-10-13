/** Actor-private timelines. These methods never submit or refresh inference. */
export type GenerationsInstruction = { kind: 'video'; prompt: string };
export type GenerationsTaskReference = { id: string; kind: 'video'; model: string; artifacts: Array<{task_id:string;kind:'video'|'last_frame';availability:'available'|'expired'|'deleted'|'unavailable'}>; status: 'submission_unknown' | 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'reconciliation_required' };
export type GenerationsTurn = {
  id: string; sequence: string; created_at: string;
  content_state: 'retained' | 'deleted' | 'expired';
  instruction: GenerationsInstruction | null; content_expires_at: string;
  task_id: string | null; task: GenerationsTaskReference | null;
};
export type VideoGenerationsSessionSummary = {
  id: string; workspace_id: string; owner: string; category: 'video'; title: string;
  revision: string; archived: boolean; created_at: string; updated_at: string;
};
export type VideoGenerationsSession = VideoGenerationsSessionSummary & { turns: GenerationsTurn[] };
export type VideoGenerationsSessionPage = { data: VideoGenerationsSessionSummary[]; has_more: boolean; next_before: string | null };
/** Legacy Chat turns have read-only derived references and no per-turn saved clock. */
export type ChatGenerationsInstruction = { kind:'chat';prompt:string;attachments?:Array<{name:string;type:string;content:string}> };
export type ChatGenerationsTaskReference = { id:string;kind:'chat';model:string;execution:'not_sent'|'may_have_executed'|'confirmed_completed'|'confirmed_not_executed' };
export type ChatGenerationsBranch = {
  model?:string;content?:string;elapsedMs?:number;
  /** Saved comparison phase, not authoritative execution status or cancellation. */
  phase?:'connecting'|'streaming'|'complete'|'failed'|'cancelled';
  promptTokens?:number|null;completionTokens?:number|null;totalTokens?:number|null;error?:string|null;
  customerChargeNanos?:string|null;customerChargeCurrency?:string|null;
  customerChargeStatus?:'charged'|'owner_funded'|'pending'|'unpriced'|'not_charged'|'unknown';
  task:ChatGenerationsTaskReference|null;
};
export type ChatGenerationsTurn = { id:string;kind:'chat';sequence:string;created_at:null;content_state:'retained'|'missing';instruction:ChatGenerationsInstruction|null;content_expires_at:null;branches:ChatGenerationsBranch[] };
export type ChatGenerationsSessionSummary = Omit<VideoGenerationsSessionSummary,'category'|'title'> & {category:'chat';title:string|null};
export type ChatGenerationsSession = ChatGenerationsSessionSummary & {turns:ChatGenerationsTurn[]};
export type ChatGenerationsSessionPage = {data:ChatGenerationsSessionSummary[];has_more:boolean;next_before:string|null};
export type GenerationsSessionSummary = VideoGenerationsSessionSummary | ChatGenerationsSessionSummary;
export type GenerationsSession = VideoGenerationsSession | ChatGenerationsSession;
export type GenerationsSessionPage = {data:GenerationsSessionSummary[];has_more:boolean;next_before:string|null};
export type GenerationsSessionPageOptions = { before?: string; limit?: number; archived?: boolean };
type Options = { signal?: AbortSignal };
type Request = <T>(path: string, body?: unknown, options?: Options, method?: string) => Promise<T>;
function id(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new TypeError('A canonical UUID is required');
  return value;
}
function revision(value: string): string {
  if (!/^[1-9][0-9]*$/.test(value) || BigInt(value)>9223372036854775807n) throw new TypeError('expected_revision must be a positive signed-64-bit decimal string');
  return value;
}
/** Existing Chat writes remain available through the guarded NiuAdminClient Chat methods. */
export function createGenerationsSessionsClient(request: Request, organization: string, workspace: string) {
  const root=`/organizations/${id(organization)}/projects/${id(workspace)}/generations-sessions`;
  const path=(session: string)=>`${root}/${id(session)}`;
  return {
    list(query: GenerationsSessionPageOptions = {}, options?: Options): Promise<VideoGenerationsSessionPage> {
      const qs=new URLSearchParams();
      if (query.before!==undefined) qs.set('before',id(query.before));
      if (query.limit!==undefined) {if (!Number.isInteger(query.limit) || query.limit<1 || query.limit>100) throw new TypeError('limit must be 1..100'); qs.set('limit',String(query.limit));}
      if (query.archived!==undefined) qs.set('archived',String(query.archived));
      return request(`${root}?${qs}`,undefined,options,'GET');
    },
    listChat(query: GenerationsSessionPageOptions = {}, options?: Options): Promise<ChatGenerationsSessionPage> {
      const qs=new URLSearchParams({category:'chat'});
      if (query.before!==undefined) qs.set('before',id(query.before));
      if (query.limit!==undefined) {if (!Number.isInteger(query.limit) || query.limit<1 || query.limit>100) throw new TypeError('limit must be 1..100'); qs.set('limit',String(query.limit));}
      if (query.archived!==undefined) qs.set('archived',String(query.archived));
      return request(`${root}?${qs}`,undefined,options,'GET');
    },
    retrieveChat(session: string, options?: Options): Promise<{data:ChatGenerationsSession}> {return request(`${path(session)}?category=chat`,undefined,options,'GET');},
    retrieve(session: string, options?: Options): Promise<{data: VideoGenerationsSession}> {return request(path(session),undefined,options,'GET');},
    create(session: string, input: {title: string}, options?: Options): Promise<{data: VideoGenerationsSession}> {return request(path(session),{expected_revision:'0',title:input.title},options,'PUT');},
    update(session: string, input: {expected_revision:string;title:string;archived:boolean}, options?: Options): Promise<{data: VideoGenerationsSession}> {return request(path(session),{...input,expected_revision:revision(input.expected_revision)},options,'PATCH');},
    appendTurn(session: string, turn: string, input: {expected_revision:string;instruction:GenerationsInstruction}, options?: Options): Promise<{data: VideoGenerationsSession}> {return request(`${path(session)}/turns/${id(turn)}`,{...input,expected_revision:revision(input.expected_revision)},options,'PUT');},
    attachTask(session: string, turn: string, input: {expected_revision:string;task_id:string}, options?: Options): Promise<{data: VideoGenerationsSession}> {return request(`${path(session)}/turns/${id(turn)}/task`,{expected_revision:revision(input.expected_revision),task_id:id(input.task_id)},options,'PUT');},
    deleteInstruction(session: string, turn: string, expectedRevision: string, options?: Options): Promise<{data: VideoGenerationsSession}> {return request(`${path(session)}/turns/${id(turn)}`,{expected_revision:revision(expectedRevision)},options,'DELETE');},
  };
}
