export type ProviderSetup = {
  api_keys?: number;
  models?: number;
  offers?: number;
  ready_offers?: number;
  enabled_api_keys?: number;
  enabled_model_routes?: number;
};
export type SupplierSetup = ProviderSetup;

/** Supply readiness requires approved, active offers, not merely configured routes. */
export function providerAvailability(provider: ProviderSetup & { qualification_status?: string }) {
  if (provider.ready_offers == null) return { label: 'Status unavailable', detail: 'Readiness data is missing. Refresh the list to try again.', usable: false, action: 'Refresh status', section: 'refresh' };
  if (provider.ready_offers > 0) return {
    label: 'Ready to supply', detail: `${provider.ready_offers} of ${provider.offers ?? '—'} offers ready`,
    usable: true, action: 'Review offers', section: 'models',
  };
  if (!provider.api_keys) return { label: 'Not ready', detail: 'No API key connected.', usable: false, action: 'Connect API key', section: 'configuration' };
  if (!provider.enabled_api_keys) return { label: 'Disabled', detail: 'All API keys are disabled.', usable: false, action: 'Enable API key', section: 'configuration' };
  if (!provider.models) return { label: 'Not ready', detail: 'No model routes added.', usable: false, action: 'Add model routes', section: 'configuration' };
  if (!provider.enabled_model_routes) return { label: 'Disabled', detail: 'All model routes are disabled.', usable: false, action: 'Enable model routes', section: 'configuration' };
  if (provider.qualification_status !== 'qualified') return { label: 'Not qualified', detail: 'Provider review is missing, expired, or revoked.', usable: false, action: 'Review Provider', section: 'models' };
  if (!provider.offers) return { label: 'Not ready', detail: 'No agreed model offers.', usable: false, action: 'Add offers', section: 'models' };
  return { label: 'Not ready', detail: 'No active, qualified offers with an enabled route and credential.', usable: false, action: 'Review offers', section: 'models' };
}
export const supplierAvailability = providerAvailability;
