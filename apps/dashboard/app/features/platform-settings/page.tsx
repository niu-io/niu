import { useEffect, useState } from 'react';
import type { PlatformRegistrationQueuePage } from '@niu-io/sdk';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { request } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';
import { RegistrationRequestsQueue } from './registration-review';

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token, session, reloadWorkspaces } = useDashboardContext();
  const [activeTab, setActiveTab] = useState<'general' | 'registration' | 'units'>('general');
  const [pendingCount, setPendingCount] = useState(0);
  const isInternal = session?.operating_mode === 'internal';

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void request<PlatformRegistrationQueuePage>(
      token,
      '/api/v1/platform/registrations?status=pending&limit=1',
      'GET',
      undefined,
      controller.signal,
    )
      .then(page => {
        if (!controller.signal.aborted) {
          setPendingCount(page.counts.pending);
        }
      })
      .catch(() => {
        // Ignore badge prefetch failures; opening the tab surfaces errors.
      });
    return () => controller.abort();
  }, [token]);

  return (
    <section className="space-y-6" aria-label={uiT("Platform settings")}>
      <p className="text-sm text-muted-foreground">{uiT("Manage settings that apply to every workspace in this installation.")}</p>
      <Tabs
        value={isInternal && activeTab === 'units' ? 'general' : activeTab}
        onValueChange={value => setActiveTab(value as 'general' | 'registration' | 'units')}
      >
        <TabsList variant="line" aria-label={uiT("Platform settings")}>
          <TabsTrigger value="general">{uiT("General")}</TabsTrigger>
          <TabsTrigger value="registration" className="gap-2">
            <span>{uiT("Registration & preview", "注册与预览审批")}</span>
            {pendingCount > 0 && <Badge variant="default">{pendingCount}</Badge>}
          </TabsTrigger>
          {!isInternal && <TabsTrigger value="units">{uiT("Branded Credits & billing mode")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="space-y-6 pt-2">
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-muted-foreground">{uiT("Operating mode")}: </span>
              <strong>{isInternal ? uiT("Internal use") : uiT("Resale")}</strong>
            </p>
            <p className="text-sm text-muted-foreground">{uiT("Operating mode is configured at deployment. It cannot be changed here.")}</p>
          </div>
          {!isInternal && <PlatformCurrencySetting token={token} />}
        </TabsContent>

        <TabsContent value="registration" className="pt-2">
          <RegistrationRequestsQueue
            token={token}
            onCountsChange={counts => setPendingCount(counts.pending)}
            onApproved={reloadWorkspaces}
          />
        </TabsContent>

        {!isInternal && (
          <TabsContent value="units" className="pt-2">
            <PlatformUnitsSetting token={token} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
