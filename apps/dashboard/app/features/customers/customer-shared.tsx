import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { IconCheck, IconChevronDown, IconCopy, IconEye, IconEyeOff, IconSparkles } from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderRequestError, request, writeMayHaveCommitted } from '@/features/providers/api';
import { amountFromNanos, amountToNanos, formatUnitAmountText, money } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceSlugFromName } from '@/shell/workspace-route';
import type {
  CompanyMetadata,
  CustomerBalance,
  IssuedCustomerBalanceGrant,
  NiuAdminClient,
  PlatformCustomerCreditSummary,
  PreparedCustomerBalanceGrant,
} from '@niu-io/sdk/admin';
import { clearPending, readPending, savePending, type PendingCreation } from './pending';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

export function generateStrongPassword(length = 18): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return result;
}

export type CompanyOwnerSummary = { name: string; email: string | null };
export type CompanyWorkspaceSummary = { id: string; name: string; slug: string | null; created_at: string };
export type CompanyMemberSummary = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  project_id: string | null;
  created_at: string;
};
export type CompanyTransactionSummary = {
  id: string;
  kind: string;
  currency: string;
  amount_nanos: string;
  created_at: string;
  reverses_entry_id: string | null;
};

export type Company = {
  organization_id: string;
  organization_name: string;
  account_kind?: 'personal' | 'organization';
  slug?: string;
  created_at?: string;
  owner?: CompanyOwnerSummary | null;
  workspace_count?: number;
  member_count?: number;
  custom_price_count?: number;
  workspaces?: CompanyWorkspaceSummary[];
  members?: CompanyMemberSummary[];
  recent_transactions?: CompanyTransactionSummary[];
  accounts: CustomerBalance[];
  credits?: PlatformCustomerCreditSummary | null;
};

export function isPersonalCustomer(company: Pick<Company, 'account_kind' | 'organization_name'>): boolean {
  return company.account_kind === 'personal' || company.organization_name?.trim() === 'Personal workspace';
}

export function customerDisplayName(
  company: Pick<Company, 'account_kind' | 'organization_name' | 'owner'>,
  uiT: (en: string, zh?: string) => string,
): string {
  const raw = company.organization_name?.trim() ?? '';
  if (isPersonalCustomer(company)) {
    const ownerName = company.owner?.name?.trim();
    if (ownerName) return ownerName;
    if (raw && raw !== 'Personal workspace') return raw;
    const ownerEmail = company.owner?.email?.trim();
    if (ownerEmail) return ownerEmail;
    return uiT('Default account', '默认账户');
  }
  return raw || uiT('Unnamed company');
}

export type AccountPage = { data: Company[]; next_after: string | null };
export type Editor = {
  kind: 'topup' | 'credit' | 'grant' | 'history' | 'correction' | 'units';
  company: Company;
  account: CustomerBalance | null;
  prepared?: PreparedCustomerBalanceGrant;
  gift?: IssuedCustomerBalanceGrant;
};

export async function loadCustomerCompany(token: string, customerId: string, signal?: AbortSignal): Promise<Company | null> {
  try {
    const response = await request<{ data: Company }>(
      token,
      `/api/v1/admin/customers/${encodeURIComponent(customerId)}`,
      'GET',
      undefined,
      signal,
    );
    return response.data ?? null;
  } catch (failure) {
    if (failure instanceof ProviderRequestError && failure.status === 404) {
      return null;
    }
    throw failure;
  }
}

export function formatCustomerShortDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

export function formatCustomerDateTime(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function transactionKindLabel(kind: string, uiT: (en: string, zh?: string) => string): string {
  switch (kind) {
    case 'funding':
      return uiT('Top-up', '充值');
    case 'charge':
      return uiT('Usage charge', '调用扣费');
    case 'refund':
      return uiT('Refund', '退款');
    case 'funding_reversal':
      return uiT('Reversal', '冲正');
    case 'adjustment':
      return uiT('Adjustment', '调账');
    default:
      return kind;
  }
}

export function memberRoleLabel(role: string, uiT: (en: string, zh?: string) => string): string {
  if (role === 'owner') return uiT('Owner', '所有者');
  if (role === 'admin') return uiT('Administrator', '管理员');
  return uiT('Viewer', '只读成员');
}

/** Company-level Credits summary. */
export function CreditsSummaryCell({ credits }: { credits: PlatformCustomerCreditSummary | null }) {
  const { t: uiT, format: uiF } = useUILocale();
  if (!credits) return <span className="text-muted-foreground" aria-label={uiT("No Credits balance")}>—</span>;
  return (
    <div className="space-y-0.5">
      <p className="whitespace-nowrap tabular-nums">{formatUnitAmountText(credits.available, credits.name)}</p>
      {credits.additional_units > 0 && (
        <p className="text-xs text-muted-foreground">
          {credits.additional_units === 1
            ? uiF("+{0} other unit", [credits.additional_units])
            : uiF("+{0} other units", [credits.additional_units])}
        </p>
      )}
    </div>
  );
}

const TRIAL_CREDIT_PRESETS = ['5', '10', '20'] as const;

type CustomerAccountMode = 'personal' | 'existing' | 'organization';
type MemberRoleOption = 'owner' | 'admin' | 'viewer';

function fallbackNameFromEmail(email: string): string {
  const local = email.trim().split('@')[0]?.trim() ?? '';
  return local || email.trim();
}

type CreatedCustomerHandoff = {
  company: CompanyMetadata;
  mode: CustomerAccountMode;
  workspaceName: string;
  email: string;
  password: string;
  trialCreditFormatted: string;
};

export function CreateCompany({
  open,
  onOpenChange,
  client,
  token,
  existingCompanies = [],
  onCreated,
  onRestoreFocus,
}: {
  onRestoreFocus: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: NiuAdminClient;
  token?: string;
  existingCompanies?: Company[];
  onCreated: (
    company: CompanyMetadata,
    options?: {
      completedSetup?: boolean;
      workspaceCreated?: boolean;
      ownerEmail?: string;
      accountKind?: 'personal' | 'organization';
      joinedExisting?: boolean;
    },
  ) => void;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const [, setPendingVersion] = useState(0);
  const { currency, ready, error: currencyError } = usePlatformCurrency();
  const pending = useRef<PendingCreation | null>(readPending('company'));
  const progressRef = useRef<{
    company?: CompanyMetadata;
    workspaceKey?: string;
    workspaceName?: string;
    ownerKey?: string;
    ownerId?: string;
    passwordSaved?: boolean;
    grantKey?: string;
    grantIssued?: boolean;
  }>({});
  const [mode, setMode] = useState<CustomerAccountMode>(() => (pending.current ? 'organization' : 'personal'));
  const [name, setName] = useState(pending.current?.name ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [trialAmount, setTrialAmount] = useState('');
  const [targetCompanyId, setTargetCompanyId] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [memberRole, setMemberRole] = useState<MemberRoleOption>('admin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [handoff, setHandoff] = useState<CreatedCustomerHandoff | null>(null);
  const [copiedHandoff, setCopiedHandoff] = useState(false);

  const selectedExistingCompany = useMemo(
    () => existingCompanies.find(item => item.organization_id === targetCompanyId) ?? null,
    [existingCompanies, targetCompanyId],
  );
  const filteredExistingCompanies = useMemo(() => {
    const term = companyFilter.trim().toLocaleLowerCase();
    if (!term) return existingCompanies;
    return existingCompanies.filter(item =>
      [item.organization_name, item.owner?.name ?? '', item.owner?.email ?? '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [companyFilter, existingCompanies]);

  const effectiveAccountName =
    mode === 'organization'
      ? name.trim()
      : name.trim() || fallbackNameFromEmail(email);

  const wantsLogin = mode !== 'organization' || Boolean(email.trim() || password);
  const wantsTrialCredit = mode !== 'existing' && Boolean(trialAmount.trim());
  const oneStepOnboard = mode !== 'organization' || wantsLogin || wantsTrialCredit;

  function resetDialogState() {
    progressRef.current = {};
    setMode('personal');
    setName('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setTrialAmount('');
    setTargetCompanyId('');
    setCompanyFilter('');
    setMemberRole('admin');
    setError('');
    setHandoff(null);
    setCopiedHandoff(false);
  }

  function closeDialog() {
    if (busy) return;
    if (handoff) resetDialogState();
    onOpenChange(false);
  }

  function switchMode(nextMode: CustomerAccountMode) {
    if (busy || progressRef.current.company || progressRef.current.ownerId) return;
    setMode(nextMode);
    setError('');
    if (nextMode === 'existing' && !targetCompanyId && existingCompanies.length > 0) {
      const preferred =
        existingCompanies.find(item => !isPersonalCustomer(item)) ?? existingCompanies[0];
      setTargetCompanyId(preferred.organization_id);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const normalizedEmail = email.trim().toLowerCase();

    if (mode === 'existing') {
      if (!selectedExistingCompany) {
        setError(uiT('Select an existing organization first.', '请先选择要加入的已有组织。'));
        return;
      }
      if (!normalizedEmail) {
        setError(uiT('Enter a login email to create a sign-in account.', '请填写登录邮箱以创建登录账号。'));
        return;
      }
      if (Array.from(password).length < 15) {
        setError(uiT('Password must be at least 15 characters (or click Generate).', '初始密码至少 15 位（可点击右侧随机生成）。'));
        return;
      }
      const memberDisplayName = name.trim() || fallbackNameFromEmail(normalizedEmail);
      setBusy(true);
      setError('');
      try {
        if (!progressRef.current.ownerId) {
          progressRef.current.ownerKey ??= crypto.randomUUID();
          const createdMember = await client.createOperatorIdentity(
            {
              organization_id: selectedExistingCompany.organization_id,
              project_id: null,
              name: memberDisplayName,
              role: memberRole,
            },
            { idempotencyKey: progressRef.current.ownerKey },
          );
          if (!createdMember.operator?.id) throw new Error('Could not create customer account.');
          progressRef.current.ownerId = createdMember.operator.id;
        }
        if (!progressRef.current.passwordSaved) {
          await client.setMemberPassword(progressRef.current.ownerId, {
            email: normalizedEmail,
            password,
            expected_revision: 0,
          });
          progressRef.current.passwordSaved = true;
        }
        const companyMeta: CompanyMetadata = {
          id: selectedExistingCompany.organization_id,
          name: customerDisplayName(selectedExistingCompany, uiT),
        };
        onCreated(companyMeta, {
          completedSetup: true,
          workspaceCreated: false,
          ownerEmail: normalizedEmail,
          joinedExisting: true,
        });
        setHandoff({
          company: companyMeta,
          mode: 'existing',
          workspaceName: '',
          email: normalizedEmail,
          password,
          trialCreditFormatted: '',
        });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : uiT('Could not create sign-in account.', '无法创建登录账号。'));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!currency || !effectiveAccountName || (pending.current && effectiveAccountName !== pending.current.name)) return;
    if (wantsLogin) {
      if (!normalizedEmail) {
        setError(uiT('Enter a login email to create a sign-in account.', '请填写登录邮箱以创建登录账号。'));
        return;
      }
      if (Array.from(password).length < 15) {
        setError(uiT('Password must be at least 15 characters (or click Generate).', '初始密码至少 15 位（可点击右侧随机生成）。'));
        return;
      }
    }
    let grantNanos = '';
    if (wantsTrialCredit) {
      try {
        grantNanos = amountToNanos(trialAmount.trim());
        if (BigInt(grantNanos) <= 0n) throw new Error();
      } catch {
        setError(uiT('Enter a valid positive trial credit amount.', '请输入大于 0 的有效试用赠金金额。'));
        return;
      }
    }

    const accountKind: 'personal' | 'organization' = mode === 'personal' ? 'personal' : 'organization';
    pending.current ??= { name: effectiveAccountName, key: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      // Step 1: Create standalone customer billing account (idempotent, never attaches admin caller)
      let saved = progressRef.current.company;
      if (!saved) {
        savePending('company', pending.current);
        saved = await client.createCompany(
          { name: pending.current.name, account_kind: accountKind, attach_creator: false },
          { idempotencyKey: pending.current.key },
        );
        if (!saved?.id || !saved.name) throw new Error('Creation could not be confirmed.');
        clearPending('company');
        pending.current = null;
        progressRef.current.company = saved;
      }

      if (!oneStepOnboard) {
        resetDialogState();
        onCreated(saved, { completedSetup: false, accountKind });
        return;
      }

      // Step 2: Auto-create Default workspace so the customer can immediately issue API keys
      if (!progressRef.current.workspaceName) {
        const baseSlug = workspaceSlugFromName(saved.name) || 'workspace';
        progressRef.current.workspaceKey ??= crypto.randomUUID();
        try {
          const ws = await client.createWorkspace(
            { organization_id: saved.id, name: 'Default', slug: baseSlug },
            { idempotencyKey: progressRef.current.workspaceKey },
          );
          progressRef.current.workspaceName = ws.name;
        } catch (wsErr) {
          const status = (wsErr as { status?: number; responseBody?: { error?: { type?: string } } })?.status;
          const errType = (wsErr as { responseBody?: { error?: { type?: string } } })?.responseBody?.error?.type;
          if (status === 409 && errType === 'workspace_slug_taken') {
            const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
            const fallbackSlug = `${baseSlug.slice(0, 41)}-${suffix}`;
            const ws = await client.createWorkspace(
              { organization_id: saved.id, name: 'Default', slug: fallbackSlug },
              { idempotencyKey: crypto.randomUUID() },
            );
            progressRef.current.workspaceName = ws.name;
          } else {
            throw wsErr;
          }
        }
      }

      // Step 3: Create login account & set sign-in password
      if (wantsLogin) {
        const ownerName = mode === 'personal' ? saved.name : (name.trim() || fallbackNameFromEmail(normalizedEmail));
        if (!progressRef.current.ownerId) {
          progressRef.current.ownerKey ??= crypto.randomUUID();
          const ownerRes = await client.createOperatorIdentity(
            { organization_id: saved.id, project_id: null, name: ownerName, role: 'owner' },
            { idempotencyKey: progressRef.current.ownerKey },
          );
          if (!ownerRes.operator?.id) throw new Error('Could not create customer owner account.');
          progressRef.current.ownerId = ownerRes.operator.id;
        }
        if (!progressRef.current.passwordSaved) {
          await client.setMemberPassword(progressRef.current.ownerId, {
            email: normalizedEmail,
            password,
            expected_revision: 0,
          });
          progressRef.current.passwordSaved = true;
        }
      }

      // Step 4: Optional trial credit grant
      let trialCreditFormatted = '';
      if (wantsTrialCredit && grantNanos && token) {
        if (!progressRef.current.grantIssued) {
          progressRef.current.grantKey ??= crypto.randomUUID();
          const grantInput = {
            amount_nanos: grantNanos,
            reason: 'Trial credit',
            application_policy: 'future_only' as const,
            idempotency_key: progressRef.current.grantKey,
          };
          const endpoint = `/api/v1/organizations/${encodeURIComponent(saved.id)}/billing/accounts/${currency}/grants`;
          await request(token, `${endpoint}/prepare`, 'POST', grantInput);
          await request(token, endpoint, 'POST', grantInput);
          progressRef.current.grantIssued = true;
        }
        trialCreditFormatted = money(grantNanos, currency);
      }

      onCreated(saved, {
        completedSetup: true,
        workspaceCreated: true,
        ownerEmail: wantsLogin ? normalizedEmail : undefined,
        accountKind,
      });

      setHandoff({
        company: saved,
        mode,
        workspaceName: progressRef.current.workspaceName ?? 'Default',
        email: normalizedEmail,
        password,
        trialCreditFormatted,
      });
    } catch (reason) {
      const status = (reason as { status?: number })?.status;
      if (!progressRef.current.company) {
        if (status === 400 || status === 422) {
          clearPending('company');
          pending.current = null;
          setError(reason instanceof Error ? reason.message : 'Check the customer details.');
        } else {
          setError('Creation could not be confirmed. Retry uses the same request and cannot create a second customer. You can also close this dialog and refresh the customer list.');
        }
      } else {
        const detail = reason instanceof Error ? reason.message : uiT('Could not finish account setup.', '账号配置未完成。');
        setError(
          uiF(
            'Customer "{0}" was created, but setup paused: {1} Click retry to continue without duplicating the customer.',
            [progressRef.current.company.name, detail],
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  const loginUrl = typeof window !== 'undefined' ? new URL('/login', window.location.origin).href : '/login';
  const handoffCopyText = handoff
    ? [
        `${uiT('Sign-in URL', '登录地址')}: ${loginUrl}`,
        handoff.email ? `${uiT('Email', '邮箱')}: ${handoff.email}` : '',
        handoff.password ? `${uiT('Password', '密码')}: ${handoff.password}` : '',
        handoff.trialCreditFormatted ? `${uiT('Trial credit', '试用赠金')}: ${handoff.trialCreditFormatted}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const modeLabel =
    mode === 'personal'
      ? uiT('Personal account (default)', '个人账户（默认）')
      : mode === 'existing'
        ? uiT('Join existing organization', '加入已有组织')
        : uiT('New organization', '新建组织');

  const canSubmit =
    mode === 'existing'
      ? Boolean(!busy && selectedExistingCompany && email.trim() && password)
      : Boolean(
          !busy &&
            ready &&
            currency &&
            effectiveAccountName &&
            (mode === 'organization' || (email.trim() && password)) &&
            !(pending.current && effectiveAccountName !== pending.current.name),
        );

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) closeDialog(); else onOpenChange(true); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
        {handoff ? (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>{uiT('Customer ready', '客户账号已就绪')}</DialogTitle>
              <DialogDescription>
                {handoff.email
                  ? uiT('Send these sign-in credentials directly to the customer.', '直接将以下登录信息发给客户即可开始使用。')
                  : uiT('Customer account and Default workspace are ready.', '客户与默认工作空间已创建完成。')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">
                  {handoff.mode === 'existing' ? uiT('Organization', '所属组织') : uiT('Customer', '客户')}
                </span>
                <span className="font-medium">{handoff.company.name}</span>
              </div>
              {handoff.trialCreditFormatted && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{uiT('Trial credit', '试用赠金')}</span>
                  <span className="font-medium tabular-nums">{handoff.trialCreditFormatted}</span>
                </div>
              )}
              {handoff.email && (
                <>
                  <div className="border-t border-border/60 pt-2.5 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{uiT('Sign-in URL', '登录地址')}</span>
                    <code className="truncate font-mono text-xs select-all">{loginUrl}</code>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{uiT('Email', '邮箱')}</span>
                    <code className="truncate font-mono text-xs select-all">{handoff.email}</code>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{uiT('Password', '密码')}</span>
                    <code className="break-all font-mono text-xs select-all">{handoff.password}</code>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              {handoff.email && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(handoffCopyText).then(() => {
                      setCopiedHandoff(true);
                      window.setTimeout(() => setCopiedHandoff(false), 1800);
                    }).catch(() => {
                      /* Clipboard may be unavailable; text remains selectable above. */
                    });
                  }}
                >
                  {copiedHandoff ? <IconCheck size={15} aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}
                  <span>{copiedHandoff ? uiT('Copied', '已复制') : uiT('Copy sign-in details', '复制登录信息')}</span>
                </Button>
              )}
              <Button type="button" onClick={closeDialog}>
                {uiT('Done', '完成')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="text-left">
              <DialogTitle>{uiT("New customer")}</DialogTitle>
              <DialogDescription>
                {mode === 'personal'
                  ? uiT("Creates a personal account with a Default workspace so the customer can sign in and create API keys right away.", "默认创建独立个人账户与默认工作空间，客户登录后即可创建多个工作空间与 API 密钥。")
                  : mode === 'existing'
                    ? uiT("Adds a login account directly to an existing organization without creating a new one.", "直接在已有组织下新增登录账号，无需新建组织。")
                    : uiT("Creates a new organization and Default workspace. Add an email and password to issue an owner login in one step.", "创建新的组织与默认工作空间；填写邮箱与密码可一步开通负责人登录账号。")}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'organization' && (
                <div className="grid gap-2">
                  <Label htmlFor="customer-name">{uiT("Organization name", "组织名称")}</Label>
                  <Input
                    id="customer-name"
                    required
                    maxLength={200}
                    placeholder={uiT("e.g. Acme Corp", "例如：Acme Corp")}
                    value={name}
                    disabled={busy || Boolean(progressRef.current.company)}
                    onChange={event => setName(event.target.value)}
                  />
                </div>
              )}

              {mode === 'existing' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>{uiT("Target organization", "所属组织")}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || Boolean(progressRef.current.ownerId)}
                          aria-label={uiT("Target organization", "所属组织")}
                          className="justify-between font-normal"
                        >
                          <span className="truncate">
                            {selectedExistingCompany
                              ? customerDisplayName(selectedExistingCompany, uiT)
                              : uiT("Select organization", "选择组织")}
                          </span>
                          <IconChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto p-1.5">
                        <Input
                          value={companyFilter}
                          placeholder={uiT("Filter organizations…", "搜索组织或邮箱…")}
                          aria-label={uiT("Filter organizations", "筛选组织")}
                          className="mb-1.5 h-8 text-xs"
                          onChange={event => setCompanyFilter(event.target.value)}
                          onKeyDown={event => {
                            if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
                              event.stopPropagation();
                            }
                          }}
                        />
                        <DropdownMenuRadioGroup value={targetCompanyId} onValueChange={setTargetCompanyId}>
                          {filteredExistingCompanies.map(item => (
                            <DropdownMenuRadioItem key={item.organization_id} value={item.organization_id}>
                              <span className="min-w-0">
                                <span className="block truncate">{customerDisplayName(item, uiT)}</span>
                                {item.owner?.email && (
                                  <span className="block truncate text-xs text-muted-foreground">{item.owner.email}</span>
                                )}
                              </span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="grid gap-2">
                    <Label>{uiT("Role")}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || Boolean(progressRef.current.ownerId)}
                          aria-label={uiT("Member role", "成员角色")}
                          className="justify-between font-normal"
                        >
                          <span>{memberRoleLabel(memberRole, uiT)}</span>
                          <IconChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuRadioGroup
                          value={memberRole}
                          onValueChange={value => setMemberRole(value as MemberRoleOption)}
                        >
                          <DropdownMenuRadioItem value="owner">{memberRoleLabel('owner', uiT)}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="admin">{memberRoleLabel('admin', uiT)}</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="viewer">{memberRoleLabel('viewer', uiT)}</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="customer-login-email">
                  {mode === 'organization' ? uiT("Owner email (optional)", "负责人邮箱（选填）") : uiT("Login email", "登录邮箱")}
                </Label>
                <Input
                  id="customer-login-email"
                  type="email"
                  required={mode !== 'organization'}
                  maxLength={254}
                  autoComplete="off"
                  placeholder="name@example.com"
                  value={email}
                  disabled={busy || Boolean(progressRef.current.passwordSaved)}
                  onChange={event => setEmail(event.target.value)}
                />
              </div>

              {mode !== 'organization' && (
                <div className="grid gap-2">
                  <Label htmlFor="customer-name">{uiT("Name (optional)", "姓名 / 称呼（选填）")}</Label>
                  <Input
                    id="customer-name"
                    maxLength={200}
                    placeholder={uiT("Defaults to email prefix", "留空自动取邮箱前缀")}
                    value={name}
                    disabled={busy || Boolean(progressRef.current.company) || Boolean(progressRef.current.ownerId)}
                    onChange={event => setName(event.target.value)}
                  />
                </div>
              )}

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="customer-login-password">
                    {mode === 'organization' ? uiT("Initial password (optional)", "初始密码（选填）") : uiT("Initial password", "初始密码")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={busy || Boolean(progressRef.current.passwordSaved)}
                    onClick={() => {
                      setPassword(generateStrongPassword());
                      setShowPassword(true);
                    }}
                  >
                    <IconSparkles size={13} aria-hidden="true" />
                    <span>{uiT("Generate", "随机生成")}</span>
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="customer-login-password"
                    type={showPassword ? 'text' : 'password'}
                    required={mode !== 'organization'}
                    maxLength={256}
                    autoComplete="new-password"
                    placeholder={uiT("At least 15 characters", "至少 15 位，可点右上角随机生成")}
                    className="pr-9 font-mono text-sm"
                    value={password}
                    disabled={busy || Boolean(progressRef.current.passwordSaved)}
                    onChange={event => setPassword(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPassword ? uiT("Hide password", "隐藏密码") : uiT("Show password", "显示密码")}
                    onClick={() => setShowPassword(value => !value)}
                  >
                    {showPassword ? <IconEyeOff size={15} aria-hidden="true" /> : <IconEye size={15} aria-hidden="true" />}
                  </Button>
                </div>
              </div>

              {mode !== 'existing' && token && currency && (
                <div className="grid gap-2">
                  <Label htmlFor="customer-trial-credit">{uiF("Trial credit ({0}, optional)", [currency])}</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={!trialAmount.trim() ? 'secondary' : 'outline'}
                      disabled={busy || Boolean(progressRef.current.grantIssued)}
                      onClick={() => setTrialAmount('')}
                    >
                      {uiT("None", "不发")}
                    </Button>
                    {TRIAL_CREDIT_PRESETS.map(preset => (
                      <Button
                        key={preset}
                        type="button"
                        size="sm"
                        variant={trialAmount.trim() === preset ? 'secondary' : 'outline'}
                        disabled={busy || Boolean(progressRef.current.grantIssued)}
                        onClick={() => setTrialAmount(preset)}
                      >
                        {currency === 'USD' ? `$${preset}` : `${preset} ${currency}`}
                      </Button>
                    ))}
                    <Input
                      id="customer-trial-credit"
                      inputMode="decimal"
                      placeholder={uiT("Custom", "自定义")}
                      className="h-8 w-24 text-sm tabular-nums"
                      value={trialAmount}
                      disabled={busy || Boolean(progressRef.current.grantIssued)}
                      onChange={event => setTrialAmount(event.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-2 border-t border-border/60 pt-3">
                <Label>{uiT("Organization (optional)", "归属组织（可选）")}</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || Boolean(progressRef.current.company) || Boolean(progressRef.current.ownerId)}
                      aria-label={uiT("Account organization", "归属组织")}
                      className="justify-between font-normal"
                    >
                      <span>{modeLabel}</span>
                      <IconChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={mode}
                      onValueChange={value => switchMode(value as CustomerAccountMode)}
                    >
                      <DropdownMenuRadioItem value="personal">
                        {uiT("Personal account (default)", "个人账户（默认）")}
                      </DropdownMenuRadioItem>
                      {existingCompanies.length > 0 && (
                        <DropdownMenuRadioItem value="existing">
                          {uiT("Join existing organization", "加入已有组织")}
                        </DropdownMenuRadioItem>
                      )}
                      <DropdownMenuRadioItem value="organization">
                        {uiT("New organization", "新建组织")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {mode !== 'existing' && currencyError && (
                <Alert>
                  <AlertDescription>
                    {uiT(currencyError)} <Link to="/admin/settings" className="underline">{uiT("Open Settings")}</Link>
                  </AlertDescription>
                </Alert>
              )}
              {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
              {mode !== 'existing' && pending.current && effectiveAccountName !== pending.current.name && (
                <Alert>
                  <AlertDescription>
                    {uiT("The previous request may have succeeded. Check the saved list before starting a new request; otherwise you may create a duplicate.")}{" "}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        clearPending('company');
                        pending.current = null;
                        setError('');
                        setPendingVersion(value => value + 1);
                      }}
                    >
                      {uiT("Start a new request")}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={closeDialog}>{uiT("Close")}</Button>
                <Button disabled={!canSubmit}>
                  {busy
                    ? uiT("Creating…")
                    : progressRef.current.company || pending.current
                      ? uiT("Retry creation")
                      : mode === 'existing'
                        ? uiT("Add account", "添加账号")
                        : uiT("Create customer", "创建客户")}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Compare-and-set approval never posts funds; unknown outcomes require reread. */
export function CreditEditor({
  token,
  editor,
  onClose,
  onSaved,
}: {
  token: string;
  editor: Editor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t: uiT } = useUILocale();
  const { company, account } = editor;
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const { currency: platformCurrency } = usePlatformCurrency();
  const currency = account?.currency ?? platformCurrency;
  const [amount, setAmount] = useState(amountFromNanos(account?.credit_limit_nanos ?? '0'));
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || uncertain) return;
    let nanos: string;
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError('Configure the platform currency in Admin → Settings before approving credit.');
      return;
    }
    try {
      nanos = amountToNanos(amount, true);
    } catch {
      setError('Enter a nonnegative credit amount with at most nine decimal places, within the supported range.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const result = await request<{ data: { revision: string } }>(
        token,
        `/api/v1/organizations/${encodeURIComponent(company.organization_id)}/billing/accounts/${currency}/policy`,
        'PUT',
        {
          credit_limit_nanos: nanos,
          warning_threshold_nanos: account?.warning_threshold_nanos ?? null,
          expected_revision: account?.policy_revision ?? '0',
        },
      );
      if (!result?.data?.revision || BigInt(result.data.revision) !== BigInt(account?.policy_revision ?? '0') + 1n) {
        throw new Error('Credit approval could not be confirmed.');
      }
      onSaved();
    } catch (reason) {
      if (writeMayHaveCommitted(reason)) {
        setUncertain(true);
        setError('Approval outcome is unconfirmed. Close this dialog and refresh accounts before another change.');
      } else {
        setError(`${reason instanceof Error ? reason.message : 'Credit approval failed.'} Refresh accounts if another administrator changed this policy.`);
      }
    } finally {
      setPending(false);
    }
  }

  let preview: string | null = null;
  try {
    preview = money(amountToNanos(amount, true), currency);
  } catch {
    /* Invalid input is explained on submit. */
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={event => {
          if (openerRef.current?.isConnected) {
            event.preventDefault();
            openerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{uiT("Set approved credit")}</DialogTitle>
          <DialogDescription>
            {company.organization_name || uiT("Unnamed company")}{" "}
            {uiT("· Allows the balance to become negative up to this limit. It does not change the posted balance.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 border-b pb-4">
          <div>
            <p className="text-sm text-muted-foreground">{uiT("Current credit")}</p>
            <p className="font-medium">{account ? money(account.credit_limit_nanos, currency) : uiT("No currency account")}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{uiT("New credit")}</p>
            <p className="font-medium">{preview ?? uiT("Enter a valid amount")}</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <p className="text-sm text-muted-foreground">{uiT("Currency:")}{" "}{currency || uiT("configure in Admin")}</p>
          <div className="space-y-2">
            <Label htmlFor="approved-credit">{uiT("Approved credit limit")}</Label>
            <Input
              id="approved-credit"
              inputMode="decimal"
              value={amount}
              disabled={pending || uncertain}
              onChange={event => {
                setAmount(event.target.value);
                setError('');
              }}
            />
            <p className="text-sm text-muted-foreground">{uiT("Zero requires prepayment. Existing request liabilities must still settle.")}</p>
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>{uiT("Cancel")}</Button>
            <Button type="submit" disabled={pending || uncertain}>{pending ? uiT("Saving…") : uiT("Save credit policy")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
