import { useState, type FormEvent } from 'react';
import { UserRound, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { OperatorRole } from '../api';

const expiryChoices = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

export type NewOperator = { name: string; role: OperatorRole; expiresInSeconds: number };

export default function OperatorCreateForm({ disabled, onCreate }: {
  disabled: boolean;
  onCreate: (operator: NewOperator) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<OperatorRole>('viewer');
  const [expiryDays, setExpiryDays] = useState(30);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), role, expiresInSeconds: expiryDays * 86400 });
    setName('');
  }

  return <section className="panel operator-create-panel" aria-labelledby="operator-create-title">
    <div className="operator-section-title"><div><h2 id="operator-create-title">Add an operator</h2><p>Issue an initial session for this person. Their secret appears once after creation.</p></div><span className="operator-create-mark"><UserRound size={17} /></span></div>
    <form className="operator-create-form" onSubmit={submit}>
      <Label htmlFor="new-operator-name">Name<Input id="new-operator-name" required maxLength={200} autoComplete="off" placeholder="e.g. Platform on-call" value={name} onChange={event => setName(event.target.value)} /></Label>
      <Label htmlFor="new-operator-role">Role
        <NativeSelect id="new-operator-role" disabled={disabled} value={role} onChange={event => setRole(event.target.value as OperatorRole)}>
          <NativeSelectOption value="viewer">Viewer · read workspace data</NativeSelectOption>
          <NativeSelectOption value="admin">Admin · change workspace data</NativeSelectOption>
          <NativeSelectOption value="owner">Owner · manage operators and access</NativeSelectOption>
        </NativeSelect>
      </Label>
      <Label htmlFor="new-operator-expiry">First session expires in
        <NativeSelect id="new-operator-expiry" disabled={disabled} value={expiryDays} onChange={event => setExpiryDays(Number(event.target.value))}>
          {expiryChoices.map(item => <NativeSelectOption key={item.days} value={item.days}>{item.label}</NativeSelectOption>)}
        </NativeSelect>
      </Label>
      <div className="operator-create-footer"><p>Sessions can be revoked at any time. Expiry can be set from 7 days up to 1 year.</p><Button type="submit" disabled={disabled || !name.trim()}><UsersRound size={15} />{disabled ? 'Creating…' : 'Create operator'}</Button></div>
    </form>
  </section>;
}
