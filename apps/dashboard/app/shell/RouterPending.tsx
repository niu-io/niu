import { useLocale as useUILocale } from '@/shell/ui-locale';
import logo from '../../../../branding/assets/niu-mark.png';

export default function RouterPending() {
  const { t: uiT } = useUILocale();
  return <main className="route-loading" role="status" aria-label={uiT("Opening Niu Dashboard")} aria-live="polite" suppressHydrationWarning>
    <span
      className="route-loading-mark"
      aria-hidden="true"
      style={{ maskImage: `url("${logo}")`, WebkitMaskImage: `url("${logo}")` }}
    />
  </main>;
}
