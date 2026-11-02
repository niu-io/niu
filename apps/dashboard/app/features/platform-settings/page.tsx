import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token, session } = useDashboardContext();
  return <section className="space-y-6" aria-label={uiT("Platform settings")}>
    <p className="text-sm text-muted-foreground">{uiT("Manage settings that apply to every workspace in this installation.")}</p>
    <p className="text-sm font-medium">{session?.operating_mode === 'internal' ? uiT("Internal use") : uiT("Resale")}</p>
    <p className="text-sm text-muted-foreground">{uiT("Operating mode is configured at deployment. It cannot be changed here.")}</p>
    {session?.operating_mode !== 'internal' && <><PlatformCurrencySetting token={token} /><PlatformUnitsSetting token={token} /></>}
  </section>;
}
