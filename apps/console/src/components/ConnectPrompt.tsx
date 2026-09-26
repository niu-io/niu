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
      <strong>Connect to the gateway admin API</strong>
      <p>Enter the admin token configured for this Niu instance. It stays in this browser tab.</p>
      {error && <p className="error-text" role="alert">{error}</p>}
      <form onSubmit={onSubmit}>
        <Input aria-label="Admin token" autoComplete="off" onChange={event => onChange(event.target.value)} placeholder="Admin token" type="password" value={draft} />
        <Button type="submit">Connect</Button>
      </form>
    </div>
  </div>;
}
