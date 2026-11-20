import { IconKey as KeyRound } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';
import { Link, useLocation } from 'react-router';

export default function ConnectPrompt() {
  const { t } = useLocale();
  const location = useLocation();
  const { error } = useDashboardContext();
  const from = `${location.pathname}${location.search}${location.hash}`;
  return <div className="connect-panel">
    <div className="empty-icon"><KeyRound size={18} /></div>
    <div>
      <strong>{t('Sign in to continue', '请登录以继续')}</strong>
      {error && <p role="alert">{t(error)}</p>}
      <Button asChild><Link to="/login" state={{ from }}>{t('Sign in', '登录')}</Link></Button>
    </div>
  </div>;
}
