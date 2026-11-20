import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token, session } = useDashboardContext();
  const [search, setSearch] = useSearchParams();
  const isInternal = session?.operating_mode === 'internal';
  const requestedTab = search.get('tab');
  const [activeTab, setActiveTab] = useState<'general' | 'units'>(
    !isInternal && requestedTab === 'units' ? 'units' : 'general',
  );
  const currentTab = isInternal ? 'general' : requestedTab === 'units' ? 'units' : activeTab;

  return (
    <section className="w-full min-w-0 space-y-6" aria-label={uiT('Platform settings')}>
      <PageHeader
        title={uiT('General & billing', '基础与计费')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/settings/registration">{uiT('Registration policy', '注册策略')}</Link>
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        {uiT('Manage settings that apply to every workspace in this installation.')}
      </p>
      {isInternal ? (
        <div className="space-y-1 rounded-[var(--radius-panel)] bg-card p-5">
          <p className="text-sm">
            <span className="text-muted-foreground">{uiT('Operating mode')}: </span>
            <strong>{uiT('Internal use')}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            {uiT('Operating mode is configured at deployment. It cannot be changed here.')}
          </p>
        </div>
      ) : (
        <Tabs
          value={currentTab}
          onValueChange={value => {
            const nextTab = value as 'general' | 'units';
            setActiveTab(nextTab);
            const next = new URLSearchParams(search);
            if (nextTab === 'units') next.set('tab', 'units');
            else next.delete('tab');
            setSearch(next, { replace: true });
          }}
        >
          <TabsList variant="line" aria-label={uiT('Platform settings')}>
            <TabsTrigger value="general">{uiT('General & currency', '常规与币种')}</TabsTrigger>
            <TabsTrigger value="units">{uiT('Branded Credits & billing mode')}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 pt-2">
            <div className="space-y-1 rounded-[var(--radius-panel)] bg-card p-5">
              <p className="text-sm">
                <span className="text-muted-foreground">{uiT('Operating mode')}: </span>
                <strong>{uiT('Resale')}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                {uiT('Operating mode is configured at deployment. It cannot be changed here.')}
              </p>
            </div>
            <PlatformCurrencySetting token={token} />
          </TabsContent>

          <TabsContent value="units" className="pt-2">
            <PlatformUnitsSetting token={token} />
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
