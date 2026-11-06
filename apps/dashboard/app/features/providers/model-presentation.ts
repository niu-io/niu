import { formatLocalizedMessage, readLocale, translateUI } from '@/shell/ui-locale';
import type { ModelCapabilities, ProviderModelCheck } from './api';

/** Declared capabilities are configuration facts, not verified upstream behavior. */
export function modelCapabilityLabels(capabilities: ModelCapabilities): string[] {
  const names: string[] = [];
  if (capabilities.video_schema) names.push(translateUI('Video · configured'));
  if (capabilities.supports_tool_calls) names.push(translateUI(capabilities.supports_streaming_tool_calls ? 'Tools · streaming' : 'Tools'));
  if (capabilities.supports_structured_output) names.push(translateUI('Structured output'));
  if (capabilities.supports_embeddings) {
    const options = [
      capabilities.supports_embedding_dimensions && translateUI('dimensions'),
      capabilities.supports_embedding_base64 && translateUI('base64'),
    ].filter(Boolean);
    names.push(options.length ? translateUI('Embeddings') + ' · ' + options.join(', ') : translateUI('Embeddings'));
  }
  if (capabilities.supports_responses) names.push(translateUI('Responses'));
  return names;
}

/** A reachability check verifies the endpoint response, not inference or quality. */
export function modelCheckLabel(result: ProviderModelCheck, capabilities: ModelCapabilities): string {
  if (result.status === 'connected' && result.model === 'listed') {
    return capabilities.video_schema
      ? translateUI('Reachable · model listed. Video generation is not verified by this check.')
      : translateUI('Reachable · model listed. Try Chat to verify access.');
  }
  if (result.status === 'connected' && result.model === 'not_listed') return translateUI('Reachable · model not listed. Check the upstream ID.');
  if (result.status === 'credentials_rejected') return translateUI('Key rejected. Check the saved provider key.');
  if (result.status === 'account_chat_banned') return translateUI('The Qiniu account is not permitted to use chat services (account_chat_banned). Contact Qiniu to restore account access.');
  if (result.status === 'private_endpoint_blocked') return translateUI('Private endpoint blocked.');
  if (result.status === 'endpoint_unavailable') return translateUI('Could not reach provider endpoint.');
  if (result.status === 'invalid_endpoint') return translateUI('Provider endpoint URL is invalid.');
  if (result.status === 'redirect_blocked') return translateUI('Provider redirected; Niu did not follow it.');
  if (result.status === 'provider_rate_limited') return translateUI('Provider rate limited the check.');
  if (result.status === 'model_catalog_unavailable') return translateUI('Provider has no compatible model list.');
  if (result.status === 'model_catalog_too_large') return translateUI('Provider model list exceeded the 2 MiB check limit.');
  if (result.status === 'invalid_model_catalog') return translateUI('Provider returned an unreadable model list.');
  return formatLocalizedMessage('Provider returned an error{0}.', [result.http_status ? ` (${result.http_status})` : ''], readLocale());
}
