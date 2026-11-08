import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import { useState, type FormEvent, type Ref } from 'react';
import { IconChevronDown as ChevronDown, IconMailPlus as MailPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { NamedResource, NewMemberInvitation, OperatorRole } from '../api';

const expiryChoices = [
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
];

const roleChoices: Array<{ value: OperatorRole; label: string }> = [
  { value: 'viewer', label: 'Can view' },
  { value: 'admin', label: 'Admin · change workspace data' },
  { value: 'owner', label: 'Owner · manage users and access' },
];

export default function InviteMemberForm({
  disabled,
  onCreate,
  emailInputRef,
  projects = [],
  defaultProjectId = null,
  canChooseOrganizationScope = false,
}: {
  disabled: boolean;
  onCreate: (invitation: NewMemberInvitation) => void;
  emailInputRef?: Ref<HTMLInputElement>;
  projects?: NamedResource[];
  defaultProjectId?: string | null;
  canChooseOrganizationScope?: boolean;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<OperatorRole>('viewer');
  const [expiryDays, setExpiryDays] = useState(7);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validEmail) return;
    onCreate({
      email: email.trim(),
      name: name.trim() || null,
      role,
      projectId,
      expiresInSeconds: expiryDays * 86_400,
    });
  }

  const selectedProjectName = projectId
    ? workspaceDisplayName(
        projects.find(item => item.id === projectId)?.name ??
          uiT('Selected workspace', '当前工作空间'),
      )
    : uiT('All workspaces · organization-wide', '全部工作空间 · 组织级');
  const roleLabel = roleChoices.find(item => item.value === role)?.label ?? 'Can view';
  const expiryLabel = expiryChoices.find(item => item.days === expiryDays)?.label ?? '7 days';

  return (
    <section className="panel operator-create-panel" aria-label={uiT('Invite member', '邀请成员')}>
      <form className="operator-create-form" onSubmit={submit}>
        <Label htmlFor="new-member-email">
          {uiT('Email', '邮箱')}
          <Input
            ref={emailInputRef}
            id="new-member-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            required
            maxLength={254}
            placeholder="name@company.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </Label>
        <Label htmlFor="new-member-name">
          {uiT('Name (optional)', '姓名（可选）')}
          <Input
            id="new-member-name"
            disabled={disabled}
            maxLength={200}
            autoComplete="off"
            placeholder={uiT('e.g. Alex Chen', '例如：陈明')}
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </Label>
        {canChooseOrganizationScope && (
          <Label htmlFor="new-member-scope">
            {uiT('Scope', '访问范围')}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id="new-member-scope"
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                  disabled={disabled}
                  aria-label={uiF('Scope: {0}', [selectedProjectName])}
                >
                  {selectedProjectName}
                  <ChevronDown size={16} aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-[var(--radix-dropdown-menu-trigger-width)]"
              >
                <DropdownMenuRadioGroup
                  value={projectId ?? '__org__'}
                  onValueChange={value => setProjectId(value === '__org__' ? null : value)}
                >
                  <DropdownMenuRadioItem value="__org__">
                    {uiT('All workspaces · organization-wide', '全部工作空间 · 组织级')}
                  </DropdownMenuRadioItem>
                  {projects.map(item => (
                    <DropdownMenuRadioItem key={item.id} value={item.id}>
                      {workspaceDisplayName(item.name)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </Label>
        )}
        <Label htmlFor="new-member-role">
          {uiT('Role', '角色')}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="new-member-role"
                type="button"
                variant="outline"
                className="w-full justify-between font-normal"
                disabled={disabled}
                aria-label={uiF('Role: {0}', [uiT(roleLabel)])}
              >
                {uiT(roleLabel)}
                <ChevronDown size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)]"
            >
              <DropdownMenuRadioGroup
                value={role}
                onValueChange={value => setRole(value as OperatorRole)}
              >
                {roleChoices.map(item => (
                  <DropdownMenuRadioItem key={item.value} value={item.value}>
                    {uiT(item.label)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Label>
        {!projectId && role !== 'viewer' && (
          <p className="text-sm text-muted-foreground">
            {uiT(
              'This organization-wide role can access organization billing and shared funds.',
              '此组织级角色可以访问组织账单及共享资金。',
            )}
          </p>
        )}
        <Label htmlFor="new-member-expiry">
          {uiT('Invitation expires in', '邀请有效期')}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id="new-member-expiry"
                type="button"
                variant="outline"
                className="w-full justify-between font-normal"
                disabled={disabled}
                aria-label={uiF('Invitation expires in: {0}', [uiT(expiryLabel)])}
              >
                {uiT(expiryLabel)}
                <ChevronDown size={16} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)]"
            >
              <DropdownMenuRadioGroup
                value={String(expiryDays)}
                onValueChange={value => setExpiryDays(Number(value))}
              >
                {expiryChoices.map(item => (
                  <DropdownMenuRadioItem key={item.days} value={String(item.days)}>
                    {uiT(item.label)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </Label>
        <p className="text-sm text-muted-foreground">
          {uiT(
            'The recipient must already have a Niu account with this email. They sign in, review this access, and accept once. No password or access token is shared.',
            '收件人必须已有使用此邮箱的 Niu 账户。对方登录并确认后即可一次性接受，无需分享密码或访问令牌。',
          )}
        </p>
        <div className="operator-create-footer">
          <Button type="submit" disabled={disabled || !validEmail}>
            <MailPlus size={15} aria-hidden="true" />
            {disabled ? uiT('Creating…', '正在创建…') : uiT('Create invitation', '创建邀请')}
          </Button>
        </div>
      </form>
    </section>
  );
}
