export type ProviderSetup = {
  api_keys?: number;
  configured_api_keys?: number;
  internal_api_keys?: number;
  internal_model_routes?: number;
  models?: number;
  offers?: number;
  ready_offers?: number;
  enabled_api_keys?: number;
  enabled_model_routes?: number;
};
export type SupplierSetup = ProviderSetup;

/**
 * Supply readiness in clear stages: configured API key -> imported models -> active pricing/discount.
 * Never report unconfigured resources (no stored API key credential, no imported models, or no configured offers)
 * as "disabled" / "inactive"; reserve "disabled" strictly for saved resources that were explicitly turned off.
 */
export function providerAvailability(provider: ProviderSetup, _operatingMode?: string) {
  const configuredKeys = provider.configured_api_keys ?? provider.api_keys ?? 0;
  if (configuredKeys > 0 && provider.internal_api_keys && provider.internal_api_keys === provider.api_keys) return {
    label: provider.internal_model_routes ? 'Models configured' : 'API key saved',
    detail: 'Internal use. Upstream fees are paid directly.',
    usable: false, action: 'Configure', section: 'config',
  };
  if (!configuredKeys) return { label: 'Pending setup', detail: 'API key not configured.', usable: false, action: 'Configure API key', section: 'config' };
  if (provider.ready_offers == null) return { label: 'Status unavailable', detail: 'Readiness data is missing. Refresh the list to try again.', usable: false, action: 'Refresh status', section: 'refresh' };
  if (provider.ready_offers > 0) return {
    label: 'Ready', detail: `${provider.ready_offers} models active`,
    usable: true, action: 'Configure', section: 'config',
  };
  if (!provider.enabled_api_keys) return { label: 'API keys disabled', detail: 'All configured API keys are disabled.', usable: false, action: 'Enable API key', section: 'config' };
  if (!provider.models) return { label: 'Pending setup', detail: 'No models imported yet.', usable: false, action: 'Configure', section: 'config' };
  if (provider.offers !== undefined && provider.offers === 0) return { label: 'Pending setup', detail: 'Model pricing not configured.', usable: false, action: 'Configure', section: 'config' };
  return { label: 'No models active', detail: 'Enable priced models or configure model access.', usable: false, action: 'Configure', section: 'config' };
}
export const supplierAvailability = providerAvailability;
