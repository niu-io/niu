import { IconKey as KeyRound } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { useDashboardContext } from '@/app/dashboard-context';
import { Link, useLocation } from 'react-router';

export default function ConnectPrompt() {
  const location = useLocation();
  const { error } = useDashboardContext();
  const from = `${location.pathname}${location.search}${location.hash}`;
  return <div className="connect-panel">
    <div className="empty-icon"><KeyRound size={18} /></div>
    <div>
      <strong>Sign in to continue</strong>
      {error && <p role="alert">{error}</p>}
      <Button asChild><Link to="/login" state={{ from }}>Sign in</Link></Button>
    </div>
  </div>;
}
