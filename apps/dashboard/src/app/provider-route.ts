import { useParams } from 'react-router';
import { useDashboardContext } from './dashboard-context';

export type ProviderIdentity = {id: string; slug?: string; name: string};
export function providerPathSegment(provider: Pick<ProviderIdentity, 'id' | 'slug'>) {
  return provider.slug || provider.id;
}
export function resolveProvider(segment: string | undefined, providers: ProviderIdentity[]) {
  return providers.find(provider => provider.slug === segment || provider.id === segment);
}
/** Product routes use slugs; existing API and storage contracts retain UUIDs. */
export function useProviderParams() {
  const params = useParams<'providerId' | 'supplierId' | 'provider' | 'supplier' | 'section'>();
  const context = useDashboardContext();
  const providers = context?.providerDirectory ?? context?.session?.provider_memberships ?? [];
  const resolve = (segment: string | undefined) => resolveProvider(segment, providers)?.id ?? segment;
  return {...params, providerId: resolve(params.providerId), supplierId: resolve(params.supplierId), provider: resolve(params.provider), supplier: resolve(params.supplier)};
}
