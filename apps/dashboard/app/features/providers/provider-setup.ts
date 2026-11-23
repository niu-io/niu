export type ProviderSetup = {
  api_keys?: number;
  internal_api_keys?: number;
  internal_model_routes?: number;
  models?: number;
  offers?: number;
  ready_offers?: number;
  enabled_api_keys?: number;
  enabled_model_routes?: number;
};
export type SupplierSetup = ProviderSetup;

/** Supply readiness in 3 clear steps: API key -> synced models -> active pricing/discount. */
export function providerAvailability(provider: ProviderSetup, operatingMode?: string) {
  if (operatingMode === 'internal') {
    if (!provider.api_keys) return { label: 'Not ready', detail: 'No API key connected.', usable: false, action: 'Connect API key', section: 'config' };
    if (provider.enabled_api_keys !== undefined && !provider.enabled_api_keys) return { label: 'API keys disabled', detail: 'All API keys are disabled.', usable: false, action: 'Enable API key', section: 'config' };
    const routes = provider.internal_model_routes ?? provider.models ?? 0;
    if (!routes) return { label: 'API key saved', detail: 'No models imported yet.', usable: false, action: 'Configure', section: 'config' };
    if (provider.enabled_model_routes !== undefined && !provider.enabled_model_routes) return { label: 'No models active', detail: 'No models are currently enabled.', usable: false, action: 'Configure', section: 'config' };
    return { label: 'Ready', detail: `${provider.enabled_model_routes ?? routes} models active`, usable: true, action: 'Configure', section: 'config' };
  }
  if (provider.internal_api_keys && provider.internal_api_keys === provider.api_keys) return {
    label: provider.internal_model_routes ? 'Models configured' : 'API key saved',
    detail: 'Internal use. Upstream fees are paid directly.',
    usable: false, action: 'Configure', section: 'config',
  };
  if (provider.ready_offers == null) return { label: 'Status unavailable', detail: 'Readiness data is missing. Refresh the list to try again.', usable: false, action: 'Refresh status', section: 'refresh' };
  if (provider.ready_offers > 0) return {
    label: 'Ready', detail: `${provider.ready_offers} models active`,
    usable: true, action: 'Configure', section: 'config',
  };
  if (!provider.api_keys) return { label: 'Not ready', detail: 'No API key connected.', usable: false, action: 'Connect API key', section: 'config' };
  if (!provider.enabled_api_keys) return { label: 'API keys disabled', detail: 'All API keys are disabled.', usable: false, action: 'Enable API key', section: 'config' };
  if (!provider.models) return { label: 'No models active', detail: 'Import models to enable them automatically.', usable: false, action: 'Configure', section: 'config' };
  return { label: 'No models active', detail: 'Enable priced models or configure model access.', usable: false, action: 'Configure', section: 'config' };
}
export const supplierAvailability = providerAvailability;
