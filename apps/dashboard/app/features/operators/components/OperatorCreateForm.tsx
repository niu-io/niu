import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { useState, type FormEvent, type Ref } from 'react';
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { IconUser as UserRound } from "@tabler/icons-react";
import { IconUsers as UsersRound } from "@tabler/icons-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { NamedResource, OperatorRole } from '../api';

const expiryChoices = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

export type NewOperator = { name: string; role: OperatorRole; expiresInSeconds: number; projectId?: string | null };

export default function OperatorCreateForm({ disabled, onCreate, nameInputRef, projects = [], defaultProjectId = null, canChooseOrganizationScope = false }: {
  disabled: boolean;
  onCreate: (operator: NewOperator) => void;
  nameInputRef?: Ref<HTMLInputElement>;
  projects?: NamedResource[];
  defaultProjectId?: string | null;
  canChooseOrganizationScope?: boolean;
}) {
  const { t: uiT } = useUILocale();
  const [name, setName] = useState('');
  const [role, setRole] = useState<OperatorRole>('viewer');
  const [expiryDays, setExpiryDays] = useState(30);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), role, expiresInSeconds: expiryDays * 86400, projectId });
  }

  const selectedProjectName = projectId
    ? workspaceDisplayName(projects.find(item => item.id === projectId)?.name ?? uiT('Selected workspace', '当前工作空间'))
    : uiT('All workspaces · organization-wide', '全部工作空间 · 组织级');

  return <section className="panel operator-create-panel" aria-labelledby="operator-create-title">
    <div className="operator-section-title"><div><h2 id="operator-create-title">{uiT("Add a user")}</h2><p>{uiT("Choose what this person can do. Adding a user creates a temporary access token; it does not send an email invitation.")}</p></div><span className="operator-create-mark"><UserRound size={17} /></span></div>
    <form className="operator-create-form" onSubmit={submit}>
      <Label htmlFor="new-operator-name">{uiT("Name")}<Input ref={nameInputRef} id="new-operator-name" disabled={disabled} required maxLength={200} autoComplete="off" placeholder={uiT("e.g. Alex Chen")} value={name} onChange={event => setName(event.target.value)} /></Label>
      {canChooseOrganizationScope && <Label htmlFor="new-operator-scope">{uiT("Scope", "访问范围")}<DropdownMenu><DropdownMenuTrigger asChild><Button id="new-operator-scope" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>{selectedProjectName}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={projectId ?? '__org__'} onValueChange={value => setProjectId(value === '__org__' ? null : value)}>
            <DropdownMenuRadioItem value="__org__">{uiT("All workspaces · organization-wide", "全部工作空间 · 组织级")}</DropdownMenuRadioItem>
            {projects.map(item => <DropdownMenuRadioItem key={item.id} value={item.id}>{workspaceDisplayName(item.name)}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </Label>}
      <Label htmlFor="new-operator-role">{uiT("Role")}<DropdownMenu><DropdownMenuTrigger asChild><Button id="new-operator-role" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>{{ viewer: 'Viewer · read workspace data', admin: 'Admin · change workspace data', owner: 'Owner · manage users and access' }[role]}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={role} onValueChange={value => setRole(value as OperatorRole)}>
            <DropdownMenuRadioItem value="viewer">{uiT("Viewer · read workspace data")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="admin">{uiT("Admin · change workspace data")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="owner">{uiT("Owner · manage users and access")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </Label>
      <Label htmlFor="new-operator-expiry">{uiT("Access token expires in")}<DropdownMenu><DropdownMenuTrigger asChild><Button id="new-operator-expiry" type="button" variant="outline" className="w-full justify-between font-normal" disabled={disabled}>{expiryChoices.find(item => item.days === expiryDays)?.label}<ChevronDown size={16} aria-hidden="true" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={String(expiryDays)} onValueChange={value => setExpiryDays(Number(value))}>
            {expiryChoices.map(item => <DropdownMenuRadioItem key={item.days} value={String(item.days)}>{item.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup></DropdownMenuContent>
        </DropdownMenu>
      </Label>
      <div className="operator-create-footer"><p>{uiT("The token grants this role until it expires or you revoke it. You can create another token later.")}</p><Button type="submit" disabled={disabled || !name.trim()}><UsersRound size={15} />{disabled ? uiT("Creating…") : uiT("Create user")}</Button></div>
    </form>
  </section>;
}
