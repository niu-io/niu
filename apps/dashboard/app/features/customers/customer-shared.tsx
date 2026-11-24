import { useRef, useState, type FormEvent } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ProviderRequestError, request, writeMayHaveCommitted } from '@/features/providers/api';
import { amountFromNanos, amountToNanos, formatUnitAmountText, money } from '@/lib/money';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { CustomerBalance, IssuedCustomerBalanceGrant, PlatformCustomerCreditSummary, PreparedCustomerBalanceGrant } from '@niu-io/sdk/admin';

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

export const CUSTOMER_ACCOUNTS_PATH = '/api/v1/admin/customers?limit=50';
