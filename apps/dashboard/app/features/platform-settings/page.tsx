import { useState } from 'react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token, session } = useDashboardContext();
  const [activeTab, setActiveTab] = useState<'general' | 'units'>('general');
  const isInternal = session?.operating_mode === 'internal';
  return (
    <section className="space-y-6" aria-label={uiT("Platform settings")}>
      <p className="text-sm text-muted-foreground">{uiT("Manage settings that apply to every workspace in this installation.")}</p>
      {isInternal ? (
        <div className="space-y-2">
          <p className="text-sm"><span className="text-muted-foreground">{uiT("Operating mode")}: </span><strong>{uiT("Internal use")}</strong></p>
          <p className="text-sm text-muted-foreground">{uiT("Operating mode is configured at deployment. It cannot be changed here.")}</p>
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={value => setActiveTab(value as 'general' | 'units')}>
          <TabsList variant="line" aria-label={uiT("Platform settings")}>
            <TabsTrigger value="general">{uiT("General")}</TabsTrigger>
            <TabsTrigger value="units">{uiT("Branded Credits & billing mode")}</TabsTrigger>
          </TabsList>
          <TabsContent value="general" className="space-y-6 pt-2">
            <div className="space-y-1">
              <p className="text-sm"><span className="text-muted-foreground">{uiT("Operating mode")}: </span><strong>{uiT("Resale")}</strong></p>
              <p className="text-sm text-muted-foreground">{uiT("Operating mode is configured at deployment. It cannot be changed here.")}</p>
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
