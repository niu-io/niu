import type { MutableRefObject, ReactNode, RefObject } from 'react';
import { Link } from 'react-router';
import type { GatewayAdmissionDenial } from '@niu-io/sdk/admin';
import { Sheet, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import ProviderLogo from '@/components/ProviderLogo';
import { catalogTitle, modelIdentity } from '@/lib/providers';
import { executionStatusLabel as statusLabel } from '@/lib/request-status';
import { formatUnitAtoms } from '@/lib/money';
import { readLocale as readUILocale, useLocale as useUILocale } from '@/shell/ui-locale';
import RequestTiming, { type RequestTimings } from './RequestTiming';
import RequestGuardrails from './RequestGuardrails';
import RequestContent from './RequestContent';

export type TaskEvidence = {
  execution_id: string;
  source: string;
  record_id: string;
  coverage: 'complete' | 'partial' | 'unknown';
  outcomes: Array<{
    authority: 'agent_claim' | 'deterministic_validator' | 'human_acceptance';
    result: 'accepted' | 'rejected' | 'inconclusive';
  }>;
};

export type UnitChargeDetail = {
  definition_revision: string;
  name?: string;
  unit_name?: string;
  display_precision: number;
  atoms_per_unit: string;
  charged_atoms: string;
  restored_atoms: string;
  net_atoms: string;
};

export type GatewayRequest = {
  admission_denial?: GatewayAdmissionDenial | null;
  request_kind?: 'video' | 'inference';
  attempt_id: string;
  reference?: string;
  operation_id: string;
  api_key_id: string | null;
  key_name: string | null;
  task_id: string | null;
  task_evidence: TaskEvidence | null;
  model: string;
  provider_model: string | null;
  created_at: string;
  dispatched_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  timing?: RequestTimings | null;
  execution: string;
  failure?: { kind: string; upstream_http_status: number | null } | null;
  output_guardrail_outcome?: 'allowed' | 'redacted' | 'blocked' | 'indeterminate' | null;
  customer_charge_currency: string | null;
  customer_charge_nanos: string | null;
  customer_unit_charge?: UnitChargeDetail | null;
  customer_charge_status: 'charged' | 'pending' | 'unpriced' | 'not_charged' | string;
  usage_confidence: string;
  prompt_tokens: string | null;
  completion_tokens: string | null;
  cached_input_tokens?: string | null;
  reasoning_output_tokens?: string | null;
  finish_reasons?: Array<{ index: number; reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' }> | null;
};

export type GatewayRequestPayload = {
  request: unknown;
  response: string;
  content_type: string;
  complete: boolean;
  truncated: boolean;
  expires_at: string;
};

export const failureDescriptions: Record<string, string> = {
  upstream_http_error: 'The Provider rejected the request.',
  upstream_region_unavailable: 'This model is unavailable in the upstream account’s region.',
  upstream_account_restricted: 'The upstream account is restricted for this service. Contact the Provider to restore access.',
  upstream_timeout: 'The upstream request exceeded its deadline.',
  response_stream_cancelled: 'Response delivery ended before the stream completed. This does not confirm that the Provider stopped processing.',
  upstream_connection_error: 'Could not connect to the upstream service.',
  upstream_transport_error: 'The upstream request failed during transport.',
  upstream_invalid_response: 'The upstream service returned an invalid response.',
};

export function unitLabel(item: { name?: string; unit_name?: string }): string {
  return item.name || item.unit_name || 'Credits';
}

/** Slide-over detail sheet showing timing, billing, guardrails, metadata, and captured request/response payloads. */
export default function GatewayRequestDetailSheet({
  selectedRequest,
  onClose,
  detailHeading,
  detailSheet,
  requestOpener,
  requestDurationLabel,
  requestLatency,
  requestCharge,
  workspaceSegment,
  workspaceRoot,
  keyPublicSlug,
  token,
  organization,
  project,
  admissionDenial,
  failureNextStep,
  timestamp,
  requestedKeyName,
  payloadLoading,
  payloadOwner,
  payloadIdentity,
  payloadError,
  onRetryPayload,
  payload,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: {
  selectedRequest: GatewayRequest | undefined;
  onClose: () => void;
  detailHeading: RefObject<HTMLHeadingElement | null>;
  detailSheet: RefObject<HTMLDivElement | null>;
  requestOpener: MutableRefObject<HTMLElement | null>;
  requestDurationLabel: (item: GatewayRequest) => string;
  requestLatency: (item: GatewayRequest) => string;
  requestCharge: (item: GatewayRequest) => ReactNode;
  workspaceSegment: string;
  workspaceRoot: string;
  keyPublicSlug: (id: string) => string | undefined;
  token: string;
  organization: string;
  project: string;
  admissionDenial: GatewayAdmissionDenial | null;
  failureNextStep: (failure: { kind: string; upstream_http_status?: number | null }) => string;
  timestamp: (value: string) => string;
  requestedKeyName: string | null;
  payloadLoading: boolean;
  payloadOwner: string;
  payloadIdentity: string;
  payloadError: string;
  onRetryPayload: () => void;
  payload: GatewayRequestPayload | null;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  return <Sheet open={Boolean(selectedRequest)} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent className="w-full gap-0 overflow-hidden sm:max-w-xl" onOpenAutoFocus={event => {
      event.preventDefault();
      detailHeading.current?.focus({ preventScroll: true });
    }} onCloseAutoFocus={event => {
      if (requestOpener.current?.isConnected) { event.preventDefault(); requestOpener.current.focus({ preventScroll: true }); }
      requestOpener.current = null;
    }}>
      <SheetHeader className="shrink-0 pr-12"><SheetTitle ref={detailHeading} tabIndex={-1}>{uiT("Request details")}</SheetTitle><SheetDescription className="flex min-w-0 items-center gap-2 break-all">{selectedRequest && <ProviderLogo provider={modelIdentity({ id: selectedRequest.model })} size="small" />}{selectedRequest && <>{catalogTitle(selectedRequest.model)}{catalogTitle(selectedRequest.model) !== selectedRequest.model && <span className="text-xs text-muted-foreground">({selectedRequest.model})</span>}</>}</SheetDescription></SheetHeader>
      {selectedRequest && <div ref={detailSheet} role="region" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2" aria-label={uiT("Request detail content")}>
        <div className="request-detail-metrics">
          <div><span>{requestDurationLabel(selectedRequest)}</span><strong>{requestLatency(selectedRequest)}</strong></div>
          <div><span>{uiT("Customer charge")}</span><strong>{requestCharge(selectedRequest)}</strong>{selectedRequest.customer_unit_charge != null && BigInt(selectedRequest.customer_unit_charge.restored_atoms) > 0n && <small className="text-xs text-muted-foreground">{uiF("Refunded {0}", [formatUnitAtoms(selectedRequest.customer_unit_charge.restored_atoms, unitLabel(selectedRequest.customer_unit_charge), selectedRequest.customer_unit_charge.display_precision)])}</small>}{selectedRequest.customer_charge_status === 'pending' && <small className="text-xs text-muted-foreground">{uiT("Outcome or usage is unconfirmed; not counted as zero.", "结果或用量尚未确认，暂未结算也不记为零费用。")}</small>}{selectedRequest.customer_charge_status === 'owner_funded' && <small className="text-xs text-muted-foreground">{uiT("No Niu charge", "使用自有 API 密钥，不由 Niu 扣费，费用以 Provider 为准。")}</small>}</div>
          {selectedRequest.request_kind !== 'video' && <>
          <div><span>{uiT("Input tokens")}</span><strong className="break-all">{selectedRequest.prompt_tokens == null ? '—' : BigInt(selectedRequest.prompt_tokens).toLocaleString(readUILocale())}</strong><small className="text-xs text-muted-foreground">{uiT("Cached:")}{" "}{selectedRequest.cached_input_tokens == null ? uiT("Unknown") : BigInt(selectedRequest.cached_input_tokens).toLocaleString(readUILocale())}</small></div>
          <div><span>{uiT("Output tokens")}</span><strong className="break-all">{selectedRequest.completion_tokens == null ? '—' : BigInt(selectedRequest.completion_tokens).toLocaleString(readUILocale())}</strong><small className="text-xs text-muted-foreground">{uiT("Reasoning:")}{" "}{selectedRequest.reasoning_output_tokens == null ? uiT("Unknown") : BigInt(selectedRequest.reasoning_output_tokens).toLocaleString(readUILocale())}</small></div>
          </>}
        </div>
        {/* Admission refusals are request records, not saved video jobs. */}
        {selectedRequest.request_kind === 'video' && !selectedRequest.admission_denial && <div className="grid justify-items-start gap-2"><p className="text-sm text-muted-foreground">{uiT("Video generation is asynchronous. Inspect saved status, lifecycle timing and the original charge in Video.")}</p><Button asChild variant="outline"><Link to={`/generations?${new URLSearchParams({workspace:workspaceSegment,mode:'video',job:selectedRequest.attempt_id,...(selectedRequest.api_key_id ? {key:keyPublicSlug(selectedRequest.api_key_id) ?? selectedRequest.api_key_id}:{})})}`}>{uiT("Open video result")}</Link></Button></div>}
        {selectedRequest.request_kind !== 'video' && <RequestTiming timing={selectedRequest.timing} outputTokens={selectedRequest.completion_tokens} />}
        <RequestGuardrails
          key={`${token}:${organization}:${project}:${selectedRequest.attempt_id}`}
          token={token}
          endpoint={`/api/v1/workspaces/${project}/requests/${selectedRequest.attempt_id}/guardrails`}
          historyPath={`${workspaceRoot}/guardrails?tab=history`}
        />
        <div className="gateway-request-detail"><h3 className="mb-3 text-sm font-medium">{uiT("Overview")}</h3><dl>{admissionDenial && <div><dt>{uiT("Failure reason")}</dt><dd>{admissionDenial.kind === 'key_request_rate_exceeded' ? uiT("API key request rate limit reached") : uiT("API key request rate is zero")}<span className="block">{uiT("Gateway 429")}</span></dd></div>}{selectedRequest.failure && <div><dt>{uiT("Failure reason")}</dt><dd>{uiT(failureDescriptions[selectedRequest.failure.kind] ?? "Not reported")}{Number.isInteger(selectedRequest.failure.upstream_http_status) && selectedRequest.failure.upstream_http_status! >= 100 && selectedRequest.failure.upstream_http_status! <= 599 && <span className="block">{uiT("Provider")}{" "}{selectedRequest.failure.upstream_http_status}</span>}</dd></div>}<div><dt>{uiT("Provider model")}</dt><dd>{selectedRequest.provider_model ?? <>{uiT("Not reported")}<span className="block text-xs text-muted-foreground">{uiT("The Provider did not report a model identity for this request.", "Provider 未报告此请求的模型身份。")}</span></>}</dd></div><div><dt>{uiT("Provider status")}</dt><dd>{statusLabel(selectedRequest.execution)}</dd></div>{selectedRequest.request_kind !== 'video' && <div><dt>{uiT("Finish reason")}</dt><dd>{selectedRequest.finish_reasons?.length ? selectedRequest.finish_reasons.map(choice => <span className="block" key={choice.index}>{selectedRequest.finish_reasons!.length > 1 ? uiF("Choice {0}: ", [choice.index + 1]) : ''}{uiT({stop: 'Stopped', length: 'Token limit reached', tool_calls: 'Tool calls', content_filter: 'Content filter', function_call: 'Function call'}[choice.reason] ?? "Unknown")}</span>) : uiT("Not reported")}</dd></div>}{selectedRequest.timing?.http_status != null && <div><dt>{uiT("Delivery status")}</dt><dd>{selectedRequest.timing.http_status}</dd></div>}<div><dt>{uiT("Time")}</dt><dd>{timestamp(selectedRequest.created_at)}</dd></div><div><dt>{requestedKeyName ? uiT("Requested API key") : uiT("API key")}</dt><dd>{selectedRequest.key_name ?? requestedKeyName ?? uiT("Unknown")}</dd></div></dl>{selectedRequest.failure && <div className="mt-4 space-y-2"><h4 className="text-sm font-medium">{uiT("Next steps")}</h4><p className="text-sm text-muted-foreground">{failureNextStep(selectedRequest.failure)}</p><div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to={`${workspaceRoot}/executions?modelAlias=${encodeURIComponent(selectedRequest.model)}`}>{uiT("View requests for this model")}</Link></Button></div></div>}</div>
        {payloadLoading || payloadOwner !== payloadIdentity ? <FormSectionSkeleton fields={3} label={uiT("Loading request content…")} /> : payloadError ? <div className="grid justify-items-start gap-3"><p role="alert">{uiT(payloadError)}</p><Button variant="outline" size="sm" onClick={onRetryPayload}>{uiT("Retry request content")}</Button></div> : payload ? <div className="space-y-4">
          <RequestContent key={selectedRequest.attempt_id} payload={payload} />
          <p className="text-sm text-muted-foreground">{[payload.truncated ? uiT("Response exceeds the capture limit; only the first 1 MB is shown.") : '', !payload.complete ? uiT("The response did not finish.") : '', `${uiT("Content expires")} ${timestamp(payload.expires_at)}.`].filter(Boolean).join(' ')}</p>
        </div> : <p className="text-sm text-muted-foreground">{uiT("Request and response bodies were not retained or have expired.")}</p>}
      </div>}
      {selectedRequest && <SheetFooter className="shrink-0 flex-row justify-between">
          <Button variant="outline" size="sm" disabled={!canGoPrevious} onClick={onPrevious}>{uiT("Previous request")}</Button>
          <Button variant="outline" size="sm" disabled={!canGoNext} onClick={onNext}>{uiT("Next request")}</Button>
      </SheetFooter>}
    </SheetContent>
  </Sheet>;
}
