import type { FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ConnectPrompt({ draft, error, onChange, onSubmit }: {
  draft: string;
  error: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="connect-panel">
    <div className="empty-icon"><KeyRound size={18} /></div>
    <div>
      <strong>Administrator access required</strong>
      <p>Sign in with the bootstrap token for this self-hosted Niu installation. Your application should use a scoped API key.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <form onSubmit={onSubmit}>
        <Input aria-label="Installation admin token" autoComplete="off" onChange={event => onChange(event.target.value)} placeholder="Installation admin token" type="password" value={draft} />
        <Button type="submit">Sign in</Button>
      </form>
    </div>
  </div>;
}
