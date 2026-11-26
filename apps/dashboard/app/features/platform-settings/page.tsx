import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { usePlatformCurrency } from '@/shell/platform-currency';
import PageHeader, { PageHeaderTabsTargetContext } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';
import { RegistrationPolicySection } from './registration-review';

import BrandingTab from '@/features/branding/page';
import PaymentsTab from '@/features/platform/page';

type SettingsTab = 'general' | 'registration' | 'branding' | 'payments' | 'units';

function parseTab(value: string | null): SettingsTab {
  if (value === 'registration' || value === 'branding' || value === 'payments' || value === 'units') return value;
  return 'general';
}

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token } = useDashboardContext();
  const { billingMode, unit } = usePlatformCurrency();
  const [search, setSearch] = useSearchParams();
  const requestedTab = search.get('tab');
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => parseTab(requestedTab));
  const currentTab: SettingsTab = requestedTab ? parseTab(requestedTab) : activeTab;

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
              <TabsTrigger value="payments">{uiT('Payments', '收款配置')}</TabsTrigger>
              <TabsTrigger value="units">{uiT('Billing mode', '计费模式')}</TabsTrigger>
            </TabsList>
          }
        />

        <PageHeaderTabsTargetContext.Provider value="">
        <TabsContent value="general" className="space-y-6">
          <PlatformCurrencySetting token={token} />
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-panel)] bg-card p-5">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold">{uiT('Billing mode', '计费模式')}</h2>
                <Badge variant="secondary">
                  {billingMode === 'credits'
                    ? (unit?.name ?? uiT('Branded Credits', '自定义积分'))
                    : uiT('Currency', '货币计费')}
                </Badge>
              </div>
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
        </TabsContent>

        <TabsContent value="registration">
          <RegistrationPolicySection token={token} />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingTab />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsTab />
        </TabsContent>

        <TabsContent value="units">
          <PlatformUnitsSetting token={token} />
        </TabsContent>
        </PageHeaderTabsTargetContext.Provider>
      </Tabs>
    </section>
  );
}
