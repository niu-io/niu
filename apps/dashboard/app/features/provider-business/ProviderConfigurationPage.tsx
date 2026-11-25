import { IconShieldCheck as ShieldCheck } from '@tabler/icons-react';
import { useParams } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import ConnectGate from '@/shell/ConnectGate';
import { useDashboardContext } from '@/shell/dashboard-context';
import { resolveProvider, useProviderParams } from '@/shell/provider-route';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceModelsHref } from '@/shell/workspace-route';
import ProvidersView from '@/features/providers/components/ProvidersView';
import ProviderSettings from './ProviderSettings';
import ProviderModelPolicySection from './ProviderModelPolicySection';

export default function ProviderConfigurationPage({
  resolvedProviderId,
}: {
  resolvedProviderId?: string;
}) {
  const { t: uiT } = useUILocale();
  const context = useDashboardContext();
  const rawParams = useParams<'providerId' | 'supplierId'>();
  const { providerId, supplierId } = useProviderParams();
  const activeSlugOrId = providerId ?? supplierId ?? '';
  const canonicalId = resolvedProviderId || activeSlugOrId;
  const resolvedProvider = context.providerDirectory
    ? resolveProvider(canonicalId, context.providerDirectory)
    : undefined;
  const rawSegment = rawParams.providerId ?? rawParams.supplierId ?? '';
  const activeSlug =
    resolvedProvider?.slug ||
    (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawSegment) ? rawSegment : '');

  if (!(context.session?.kind === 'installation' || context.session?.permissions?.platform_admin)) {
    return (
      <>
        <PageHeader title={uiT('Providers')} />
        <section className="panel provider-access-message">
          <ShieldCheck />
          <h2>{uiT('Provider access required')}</h2>
          <p>{uiT('Providers and agreed rates are controlled by platform administration.')}</p>
        </section>
      </>
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <ProviderSettings key={`profile:${canonicalId}`} />

      <ConnectGate>
        {({ token, session, refreshWorkspace }) =>
          session ? (
            <ProvidersView
              embedded
              key={`keys:${token}:${canonicalId}`}
              token={token}
              session={session}
              refreshWorkspace={refreshWorkspace}
              catalogPath={workspaceModelsHref(context.workspace, context.workspaces)}
              providerId={canonicalId}
              providerSlug={activeSlug || canonicalId}
              organizationId={context.organization?.id}
            />
          ) : (
            <section className="rounded-[var(--radius-panel)] bg-card p-5">
              <FormSectionSkeleton fields={2} label={uiT('Checking session permissions…')} />
            </section>
          )
        }
      </ConnectGate>

      <ProviderModelPolicySection
        key={`policy:${canonicalId}`}
        providerId={canonicalId}
        providerSlug={activeSlug || canonicalId}
      />
    </div>
  );
}
