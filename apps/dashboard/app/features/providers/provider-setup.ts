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

/** Supply readiness requires approved, active offers in resale mode, or configured routes in internal mode. */
export function providerAvailability(provider: ProviderSetup, operatingMode?: string) {
  if (operatingMode === 'internal') {
    if (!provider.api_keys) return { label: 'Not ready', detail: 'No API key connected.', usable: false, action: 'Connect API key', section: 'keys' };
    if (provider.enabled_api_keys !== undefined && !provider.enabled_api_keys) return { label: 'API keys disabled', detail: 'All API keys are disabled.', usable: false, action: 'Enable API key', section: 'keys' };
    const routes = provider.internal_model_routes ?? provider.models ?? 0;
    if (!routes) return { label: 'API key saved', detail: 'Internal use. Upstream fees are paid directly; no commercial approval is required.', usable: false, action: 'Import models', section: 'models' };
    if (provider.enabled_model_routes !== undefined && !provider.enabled_model_routes) return { label: 'Routes disabled', detail: 'All model routes are disabled.', usable: false, action: 'Enable models', section: 'models' };
    return { label: 'Models configured', detail: 'Internal use. Upstream fees are paid directly; no commercial approval is required.', usable: true, action: 'Manage models', section: 'models' };
  }
  if (provider.internal_api_keys && provider.internal_api_keys === provider.api_keys) return {
    label: provider.internal_model_routes ? 'Models configured' : 'API key saved',
    detail: 'Internal use. Upstream fees are paid directly; no commercial approval is required.',
    usable: false, action: provider.internal_model_routes ? 'Manage models' : 'Import models', section: 'models',
  };
  if (provider.ready_offers == null) return { label: 'Status unavailable', detail: 'Readiness data is missing. Refresh the list to try again.', usable: false, action: 'Refresh status', section: 'refresh' };
  if (provider.ready_offers > 0) return {
    label: 'Ready to supply', detail: `${provider.ready_offers} of ${provider.offers ?? '—'} offers ready`,
    usable: true, action: 'Review offers', section: 'models',
  };
  if (!provider.api_keys) return { label: 'Not ready', detail: 'No API key connected.', usable: false, action: 'Connect API key', section: 'keys' };
  if (!provider.enabled_api_keys) return { label: 'API keys disabled', detail: 'All API keys are disabled.', usable: false, action: 'Enable API key', section: 'keys' };
  if (!provider.models) return { label: 'Not ready', detail: 'No model routes added.', usable: false, action: 'Add models', section: 'models' };
  if (!provider.enabled_model_routes) return { label: 'Routes disabled', detail: 'All model routes are disabled.', usable: false, action: 'Enable models', section: 'models' };
  if (!provider.offers) return { label: 'Not ready', detail: 'No agreed model offers.', usable: false, action: 'Add offers', section: 'models' };
  return { label: 'Not ready', detail: 'No active offers with an eligible route and credential.', usable: false, action: 'Review offers', section: 'models' };
}
export const supplierAvailability = providerAvailability;
