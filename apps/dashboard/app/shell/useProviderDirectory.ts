import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { request } from '@/lib/api-client';
import { useCachedQuery } from '@/lib/query-cache';
import { canManagePlatform, type AdminSession } from './dashboard-context';
import { resolveProvider, type ProviderIdentity } from './provider-route';

export function useProviderDirectory(
  token: string,
  session: AdminSession | null,
  supplierArea: boolean,
  adminSupplierId: string,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const platformManager = canManagePlatform(session);
  const enabled = Boolean(supplierArea && session && platformManager && token);

  const {
    data: fetchedProviders,
    loading: providerQueryLoading,
    reload: reloadProviders,
  } = useCachedQuery<{ data: ProviderIdentity[] }>(
    token,
    enabled ? '/api/v1/providers' : null,
    signal => request<{ data: ProviderIdentity[] }>(token, '/api/v1/providers', 'GET', undefined, signal),
    {
      enabled,
      persist: true,
      keepPreviousData: true,
    },
  );

  useEffect(() => {
    const refresh = () => reloadProviders();
    window.addEventListener('niu:supplier-profile-updated', refresh);
    window.addEventListener('niu:provider-profile-updated', refresh);
    return () => {
      window.removeEventListener('niu:supplier-profile-updated', refresh);
      window.removeEventListener('niu:provider-profile-updated', refresh);
    };
  }, [reloadProviders]);

  const authorizedProviders = useMemo<ProviderIdentity[]>(() => {
    if (!session || !platformManager) return [];
    return fetchedProviders?.data ?? [];
  }, [session, platformManager, fetchedProviders]);

  const providerDirectoryLoading = Boolean(enabled && providerQueryLoading);
  const adminSupplierName = resolveProvider(adminSupplierId, authorizedProviders)?.name ?? '';

  useEffect(() => {
    const parts = location.pathname.split('/');
    const index = parts[1] === 'admin' ? 3 : 2;
    if (parts[index - 1] !== 'providers' && parts[index - 1] !== 'suppliers') return;
    const provider = resolveProvider(decodeURIComponent(parts[index] ?? ''), authorizedProviders);
    if (!provider?.slug || parts[index] === provider.slug) return;
    parts[index] = encodeURIComponent(provider.slug);
    navigate({ pathname: parts.join('/'), search: location.search, hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, authorizedProviders, navigate]);

  return {
    authorizedProviders,
    providerDirectoryLoading,
    adminSupplierName,
  };
}
