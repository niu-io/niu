import { useDashboardContext } from '@/app/dashboard-context';
import { PlatformCurrencySetting } from './platform-currency';

export default function PlatformSettingsRoute() {
  const { token } = useDashboardContext();
  return <section className="space-y-6" aria-label="Platform settings">
    <p className="text-sm text-muted-foreground">Manage settings that apply to every workspace in this installation.</p>
    <PlatformCurrencySetting token={token} />
  </section>;
}
