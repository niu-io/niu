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
    error: providerQueryError,
    reload: reloadProviders,
  } = useCachedQuery<{ data: ProviderIdentity[] }>(
    token,
    enabled ? '/api/v1/admin/providers' : null,
    signal => request<{ data: ProviderIdentity[] }>(token, '/api/v1/admin/providers', 'GET', undefined, signal),
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
  // The directory is also loaded by ProviderNav, which renders this query's
  // error and retry. Expose the failure so a provider detail route does not
  // mistake an empty directory for a missing Provider.
  const providerDirectoryError = enabled ? providerQueryError : '';
  const adminSupplierName = resolveProvider(adminSupplierId, authorizedProviders)?.name ?? '';

  useEffect(() => {
    const parts = location.pathname.split('/');
    const index = parts[1] === 'admin' ? 3 : 2;
    if (parts[index - 1] !== 'providers' && parts[index - 1] !== 'suppliers') return;
    const provider = resolveProvider(decodeURIComponent(parts[index] ?? ''), authorizedProviders);
    if (!provider) return;
    const nextParts = [...parts];
    if (provider.slug) {
      nextParts[index] = encodeURIComponent(provider.slug);
    }
    if (nextParts[1] === 'admin' && nextParts[2] === 'providers' && nextParts.length >= 5) {
      if (nextParts[4] === 'settlements') {
        nextParts[4] = 'usage';
      } else if (nextParts[4] !== 'usage') {
        nextParts.splice(4);
      }
    }
    const nextPathname = nextParts.join('/');
    if (nextPathname === location.pathname) return;
    navigate({ pathname: nextPathname, search: location.search, hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, authorizedProviders, navigate]);

  return {
    authorizedProviders,
    providerDirectoryLoading,
    providerDirectoryError,
    reloadProviderDirectory: reloadProviders,
    adminSupplierName,
  };
}
