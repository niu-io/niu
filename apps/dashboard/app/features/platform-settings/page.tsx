import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useDashboardContext } from '@/shell/dashboard-context';
import { PlatformCurrencySetting } from './platform-currency';
import { PlatformUnitsSetting } from './platform-units';

export default function PlatformSettingsRoute() {
  const { t: uiT } = useUILocale();
  const { token } = useDashboardContext();
  return <section className="space-y-6" aria-label={uiT("Platform settings")}>
    <p className="text-sm text-muted-foreground">{uiT("Manage settings that apply to every workspace in this installation.")}</p>
    <PlatformCurrencySetting token={token} />
    <PlatformUnitsSetting token={token} />
  </section>;
}
