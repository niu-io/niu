import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import PageHeader, { PageHeaderTabsTargetContext } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';
import { RegistrationPolicySection } from './registration-review';

import BrandingTab from '@/features/branding/page';
import PaymentsTab from '@/features/platform/page';

type SettingsTab = 'general' | 'registration' | 'branding' | 'payments' | 'units';

function parseTab(value: string | null, isInternal: boolean): SettingsTab {
  if (value === 'registration' || value === 'branding') return value;
  if (!isInternal && (value === 'payments' || value === 'units')) return value;
  return 'general';
}

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token, session } = useDashboardContext();
  const { billingMode, unit } = usePlatformCurrency();
  const [search, setSearch] = useSearchParams();
  const isInternal = session?.operating_mode === 'internal';
  const requestedTab = search.get('tab');
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => parseTab(requestedTab, isInternal));
  const currentTab: SettingsTab = requestedTab ? parseTab(requestedTab, isInternal) : activeTab;

  function selectTab(nextTab: SettingsTab) {
    setActiveTab(nextTab);
    const next = new URLSearchParams(search);
    next.delete('section');
    if (nextTab === 'general') next.delete('tab');
    else next.set('tab', nextTab);
    setSearch(next, { replace: true });
  }

  return (
    <section className="w-full min-w-0 space-y-6" aria-label={uiT('Platform settings')}>
      <Tabs value={currentTab} onValueChange={value => selectTab(value as SettingsTab)}>
        <PageHeader
          title={uiT('Settings', '平台设置')}
          tabs={
            <TabsList variant="line" aria-label={uiT('Platform settings')}>
              <TabsTrigger value="general">{uiT('General & currency', '基础与币种')}</TabsTrigger>
              <TabsTrigger value="registration">{uiT('Registration policy', '注册策略')}</TabsTrigger>
              <TabsTrigger value="branding">{uiT('Branding', '品牌定制')}</TabsTrigger>
              {!isInternal && <TabsTrigger value="payments">{uiT('Payments', '收款配置')}</TabsTrigger>}
              {!isInternal && <TabsTrigger value="units">{uiT('Billing mode', '计费模式')}</TabsTrigger>}
            </TabsList>
          }
        />

        <PageHeaderTabsTargetContext.Provider value="">
        <TabsContent value="general" className="space-y-6">
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
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-panel)] bg-card p-5">
              <div className="min-w-0 space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">{uiT('Billing mode', '计费模式')}: </span>
                  <strong>
                    {billingMode === 'credits'
                      ? (unit?.name ?? uiT('Branded Credits', '自定义积分'))
                      : uiT('Currency', '货币计费')}
                  </strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  {uiT(
                    'Configure Branded Credits definitions, purchase rates, and platform billing mode.',
                    '配置自定义积分定义、购买兑换率与平台计费模式。',
                  )}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => selectTab('units')}>
                {uiT('Manage billing mode', '管理计费模式')}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="registration">
          <RegistrationPolicySection token={token} />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>

        {!isInternal && (
          <TabsContent value="payments">
            <PaymentsTab />
          </TabsContent>
        )}

        {!isInternal && (
          <TabsContent value="units">
            <PlatformUnitsSetting token={token} />
          </TabsContent>
        )}
        </PageHeaderTabsTargetContext.Provider>
      </Tabs>
    </section>
  );
}
