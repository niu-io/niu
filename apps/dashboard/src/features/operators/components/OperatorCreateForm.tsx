import { useState, type FormEvent, type Ref } from 'react';
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconUser as UserRound } from "@tabler/icons-react";
import { IconUsers as UsersRound } from "@tabler/icons-react";
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

export default function OperatorCreateForm({ disabled, onCreate, nameInputRef }: {
  disabled: boolean;
  onCreate: (operator: NewOperator) => void;
  nameInputRef?: Ref<HTMLInputElement>;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<OperatorRole>('viewer');
  const [expiryDays, setExpiryDays] = useState(30);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), role, expiresInSeconds: expiryDays * 86400 });
  }

  return <section className="panel operator-create-panel" aria-labelledby="operator-create-title">
    <div className="operator-section-title"><div><h2 id="operator-create-title">Add a user</h2><p>Choose what this person can do. Adding a user creates a temporary access token; it does not send an email invitation.</p></div><span className="operator-create-mark"><UserRound size={17} /></span></div>
    <form className="operator-create-form" onSubmit={submit}>
      <Label htmlFor="new-operator-name">Name<Input ref={nameInputRef} id="new-operator-name" disabled={disabled} required maxLength={200} autoComplete="off" placeholder="e.g. Alex Chen" value={name} onChange={event => setName(event.target.value)} /></Label>
      <Label htmlFor="new-operator-role">Role
        <DropdownMenu><DropdownMenuTrigger asChild><Button id="new-operator-role" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>{{ viewer: 'Viewer · read workspace data', admin: 'Admin · change workspace data', owner: 'Owner · manage users and access' }[role]}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={role} onValueChange={value => setRole(value as OperatorRole)}>
            <DropdownMenuRadioItem value="viewer">Viewer · read workspace data</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="admin">Admin · change workspace data</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="owner">Owner · manage users and access</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </Label>
      <Label htmlFor="new-operator-expiry">Access token expires in
        <DropdownMenu><DropdownMenuTrigger asChild><Button id="new-operator-expiry" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>{expiryChoices.find(item => item.days === expiryDays)?.label}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={String(expiryDays)} onValueChange={value => setExpiryDays(Number(value))}>
            {expiryChoices.map(item => <DropdownMenuRadioItem key={item.days} value={String(item.days)}>{item.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </Label>
      <div className="operator-create-footer"><p>The token grants this role until it expires or you revoke it. You can create another token later.</p><Button type="submit" disabled={disabled || !name.trim()}><UsersRound size={15} />{disabled ? 'Creating…' : 'Create user'}</Button></div>
    </form>
  </section>;
}
