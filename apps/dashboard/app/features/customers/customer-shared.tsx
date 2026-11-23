import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderRequestError, request, writeMayHaveCommitted } from '@/features/providers/api';
import { amountFromNanos, amountToNanos, formatUnitAmountText, money } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import type {
  CompanyMetadata,
  CustomerBalance,
  IssuedCustomerBalanceGrant,
  NiuAdminClient,
  PlatformCustomerCreditSummary,
  PreparedCustomerBalanceGrant,
} from '@niu-io/sdk/admin';
import { clearPending, readPending, savePending, type PendingCreation } from './pending';

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

export function CreateCompany({
  open,
  onOpenChange,
  client,
  onCreated,
  onRestoreFocus,
}: {
  onRestoreFocus: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: NiuAdminClient;
  onCreated: (company: CompanyMetadata) => void;
}) {
  const { t: uiT } = useUILocale();
  const [, setPendingVersion] = useState(0);
  const { currency, ready, error: currencyError } = usePlatformCurrency();
  const pending = useRef<PendingCreation | null>(readPending('company'));
  const [name, setName] = useState(pending.current?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !currency || !name.trim() || (pending.current && name.trim() !== pending.current.name)) return;
    pending.current ??= { name: name.trim(), key: crypto.randomUUID() };
    setBusy(true);
    setError('');
    try {
      savePending('company', pending.current);
      const saved = await client.createCompany({ name: pending.current.name }, { idempotencyKey: pending.current.key });
      if (!saved?.id || !saved.name) throw new Error('Creation could not be confirmed.');
      clearPending('company');
      pending.current = null;
      setName('');
      onCreated(saved);
    } catch (reason) {
      const status = (reason as { status?: number })?.status;
      if (status === 400 || status === 422) {
        clearPending('company');
        pending.current = null;
        setError(reason instanceof Error ? reason.message : 'Check the company name.');
      } else {
        setError('Creation could not be confirmed. Retry uses the same request and cannot create a second company. You can also close this dialog and refresh the customer list.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}>
      <DialogContent onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus(); }}>
        <DialogHeader>
          <DialogTitle>{uiT("New customer")}</DialogTitle>
          <DialogDescription>{uiT("Create a separately funded company. You will set up its workspace and owner next.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customer-name">{uiT("Company name")}</Label>
            <Input id="customer-name" required maxLength={200} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {uiT("Uses the platform currency")}{currency ? ` (${currency})` : ''}{uiT(". New companies start with no funds or approved credit.")}
          </p>
          {currencyError && (
            <Alert>
              <AlertDescription>
                {uiT(currencyError)} <Link to="/admin/settings" className="underline">{uiT("Open Settings")}</Link>
              </AlertDescription>
            </Alert>
          )}
          {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
          {pending.current && name.trim() !== pending.current.name && (
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{uiT("Close")}</Button>
            <Button disabled={busy || !ready || !currency || !name.trim() || !!(pending.current && name.trim() !== pending.current.name)}>
              {busy ? uiT("Creating…") : pending.current ? uiT("Retry creation") : uiT("Create company")}
            </Button>
          </div>
        </form>
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
