import { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';
import { RegistrationPolicySection } from './registration-review';

const BrandingTab = lazy(() => import('@/features/branding/page'));
const PaymentsTab = lazy(() => import('@/features/platform/page'));

type SettingsTab = 'general' | 'registration' | 'branding' | 'payments' | 'units';

function parseTab(value: string | null, isInternal: boolean): SettingsTab {
  if (value === 'registration' || value === 'branding') return value;
  if (!isInternal && (value === 'payments' || value === 'units')) return value;
  return 'general';
}

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token, session } = useDashboardContext();
  const [search, setSearch] = useSearchParams();
  const isInternal = session?.operating_mode === 'internal';
  const requestedTab = search.get('tab');
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => parseTab(requestedTab, isInternal));
  const [advancedUnitsOpen, setAdvancedUnitsOpen] = useState(false);
  const currentTab: SettingsTab = requestedTab ? parseTab(requestedTab, isInternal) : activeTab;

  function selectTab(nextTab: SettingsTab) {
    setActiveTab(nextTab);
    const next = new URLSearchParams(search);
    if (nextTab === 'general') next.delete('tab');
    else next.set('tab', nextTab);
    setSearch(next, { replace: true });
  }

  return (
    <section className="w-full min-w-0 space-y-6" aria-label={uiT('Platform settings')}>
      <PageHeader title={uiT('Settings', '平台设置')} />
      <Tabs value={currentTab} onValueChange={value => selectTab(value as SettingsTab)}>
        <div className="max-w-full overflow-x-auto overflow-y-hidden">
          <TabsList variant="line" aria-label={uiT('Platform settings')}>
            <TabsTrigger value="general">{uiT('General & currency', '基础与币种')}</TabsTrigger>
            <TabsTrigger value="registration">{uiT('Registration policy', '注册策略')}</TabsTrigger>
            <TabsTrigger value="branding">{uiT('Branding', '品牌定制')}</TabsTrigger>
            {!isInternal && <TabsTrigger value="payments">{uiT('Payments', '收款配置')}</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="general" className="space-y-6 pt-2">
          <div className="space-y-1 rounded-[var(--radius-panel)] bg-card p-5">
            <p className="text-sm">
              <span className="text-muted-foreground">{uiT('Operating mode')}: </span>
              <strong>{isInternal ? uiT('Internal use') : uiT('Resale')}</strong>
            </p>
            <p className="text-sm text-muted-foreground">
              {uiT('Operating mode is configured at deployment. It cannot be changed here.')}
            </p>
          </div>
          {!isInternal && <PlatformCurrencySetting token={token} />}
          {!isInternal && (
            <details
              className="rounded-[var(--radius-panel)] bg-card p-5"
              onToggle={event => setAdvancedUnitsOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-medium">
                {uiT('Advanced: Branded Credits & billing mode', '高级：积分与计费模式')}
              </summary>
              {advancedUnitsOpen && (
                <div className="pt-4">
                  <PlatformUnitsSetting token={token} />
                </div>
              )}
            </details>
          )}
        </TabsContent>

        <TabsContent value="registration" className="pt-2">
          <RegistrationPolicySection token={token} />
        </TabsContent>

        <TabsContent value="branding" className="pt-2">
          <Suspense fallback={<FormSectionSkeleton fields={3} label={uiT('Loading branding…')} />}>
            <BrandingTab />
          </Suspense>
        </TabsContent>

        {!isInternal && (
          <TabsContent value="payments" className="pt-2">
            <Suspense fallback={<FormSectionSkeleton fields={3} label={uiT('Loading payments…')} />}>
              <PaymentsTab />
            </Suspense>
          </TabsContent>
        )}

        {!isInternal && (
          <TabsContent value="units" className="pt-2">
            <PlatformUnitsSetting token={token} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
