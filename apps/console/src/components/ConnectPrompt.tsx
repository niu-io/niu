import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router';

export default function ConnectPrompt() {
  return <div className="connect-panel">
    <div className="empty-icon"><KeyRound size={18} /></div>
    <div>
      <strong>Sign in to continue</strong>
      <p>Use your installation administrator token.</p>
      <Button asChild><Link to="/login">Sign in</Link></Button>
    </div>
  </div>;
}
