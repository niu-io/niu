import { useState, type FormEvent } from 'react';
import { ChevronDown, UserRound, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
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
        <DropdownMenu><DropdownMenuTrigger asChild><Button id="new-operator-role" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>{{ viewer: 'Viewer · read workspace data', admin: 'Admin · change workspace data', owner: 'Owner · manage operators and access' }[role]}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={role} onValueChange={value => setRole(value as OperatorRole)}>
            <DropdownMenuRadioItem value="viewer">Viewer · read workspace data</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="admin">Admin · change workspace data</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="owner">Owner · manage operators and access</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </Label>
      <Label htmlFor="new-operator-expiry">First session expires in
        <DropdownMenu><DropdownMenuTrigger asChild><Button id="new-operator-expiry" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>{expiryChoices.find(item => item.days === expiryDays)?.label}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={String(expiryDays)} onValueChange={value => setExpiryDays(Number(value))}>
            {expiryChoices.map(item => <DropdownMenuRadioItem key={item.days} value={String(item.days)}>{item.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </Label>
      <div className="operator-create-footer"><p>Sessions can be revoked at any time. Expiry can be set from 7 days up to 1 year.</p><Button type="submit" disabled={disabled || !name.trim()}><UsersRound size={15} />{disabled ? 'Creating…' : 'Create operator'}</Button></div>
    </form>
  </section>;
}
