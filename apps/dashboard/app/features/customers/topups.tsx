import { useRef, useState, type FormEvent } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { request, writeMayHaveCommitted } from '@/features/providers/api';
import { amountToNanos, money } from '@/lib/money';
import type { Editor } from './page';

type TopupChannel = 'test_topup' | 'bank_transfer' | 'offline_settlement';

const CHANNELS: Array<{ value: TopupChannel; label: string }> = [
  { value: 'test_topup', label: 'Test top-up' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'offline_settlement', label: 'Offline settlement' },
];

function defaultPaymentReference() {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    '-',
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `topup-${stamp}-${suffix}`;
}

type SubmittedTopup = {
  currency: string;
  amount_nanos: string;
  channel: TopupChannel;
  payment_reference: string;
};

/**
 * Platform administration settled top-up dialog. Locks the submitted reference
 * and amount so retrying after an uncertain response reuses the exact same
 * (channel, payment_reference) and can never credit twice.
 */
export function TopupEditor({ token, editor, onClose, onSaved }: { token: string; editor: Editor; onClose: () => void; onSaved: () => void }) {
  const { t: uiT } = useUILocale();
  const { currency: platformCurrency } = usePlatformCurrency();
  const { company, account } = editor;
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const currency = account?.currency ?? platformCurrency;
  const [amount, setAmount] = useState('');
  const [channel, setChannel] = useState<TopupChannel>('test_topup');
  const [reference, setReference] = useState(defaultPaymentReference);
  const [attempt, setAttempt] = useState<SubmittedTopup | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const locked = pending || !!attempt;
  const selectedChannelLabel = CHANNELS.find(item => item.value === channel)?.label ?? 'Test top-up';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    let payload = attempt;
    if (!payload) {
      if (!/^[A-Z]{3}$/.test(currency)) {
        setError('Configure the platform currency in Admin → Settings before recording a top-up.');
        return;
      }
      let nanos: string;
      try {
        nanos = amountToNanos(amount);
        if (BigInt(nanos) <= 0n) throw new Error();
      } catch {
        setError('Enter a positive top-up amount with at most nine decimal places.');
        return;
      }
      const trimmedRef = reference.trim();
      const hasControlChar = [...trimmedRef].some(ch => {
        const code = ch.codePointAt(0) ?? 0;
        return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
      });
      if (!trimmedRef || trimmedRef.length > 200 || hasControlChar) {
        setError('Enter a single-line payment reference of up to 200 characters.');
        return;
      }
      payload = {
        currency,
        amount_nanos: nanos,
        channel,
        payment_reference: trimmedRef,
      };
      setAttempt(payload);
    }
    setPending(true);
    setError('');
    try {
      const result = await request<{ data: { recorded: boolean } }>(
        token,
        `/api/v1/organizations/${encodeURIComponent(company.organization_id)}/billing/funding/settled`,
        'POST',
        payload,
      );
      if (result?.data?.recorded !== true) {
        throw new Error('Top-up could not be confirmed.');
      }
      onSaved();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Top-up failed.';
      if (writeMayHaveCommitted(reason)) {
        setError(message + ' Retry with this same reference to confirm without crediting twice, or close and refresh customer balances.');
      } else {
        setAttempt(null);
        setError(message);
      }
    } finally {
      setPending(false);
    }
  }

  let balancePreview: string | null = null;
  let availablePreview: string | null = null;
  try {
    const delta = BigInt(amountToNanos(amount));
    if (delta > 0n) {
      balancePreview = money((BigInt(account?.balance_nanos ?? '0') + delta).toString(), currency);
      availablePreview = money((BigInt(account?.available_nanos ?? '0') + delta).toString(), currency);
    }
  } catch {
    /* Validation explains invalid amounts on submit. */
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
          <DialogTitle>{uiT("Top up customer balance")}</DialogTitle>
          <DialogDescription>
            {company.organization_name || uiT("Unnamed company")} · {currency}{uiT(". Credits the company's shared balance immediately and repays any negative balance first. Retrying the same reference cannot credit twice.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 border-b pb-4">
          <div>
            <p className="text-sm text-muted-foreground">{uiT("Posted balance")}</p>
            <p className="font-medium">{account ? money(account.balance_nanos, currency) : money('0', currency)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{uiT("Estimated after top-up")}</p>
            <p className="font-medium">{balancePreview ?? uiT("Enter an amount")}</p>
          </div>
          {account && account.available_nanos !== account.balance_nanos && (
            <>
              <div>
                <p className="text-sm text-muted-foreground">{uiT("Available capacity")}</p>
                <p className="font-medium">{money(account.available_nanos, currency)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{uiT("Estimated available")}</p>
                <p className="font-medium">{availablePreview ?? uiT("Enter an amount")}</p>
              </div>
            </>
          )}
        </div>
        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <div className="space-y-2">
            <Label htmlFor="topup-amount">{uiT("Top-up amount in")} {currency}</Label>
            <Input
              id="topup-amount"
              inputMode="decimal"
              placeholder="100.00"
              value={amount}
              disabled={locked}
              onChange={event => { setAmount(event.target.value); setError(''); }}
            />
          </div>
          <div className="space-y-2">
            <Label>{uiT("Funding channel")}</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" disabled={locked} aria-label={uiT("Funding channel")}>
                  {uiT(selectedChannelLabel)}
                  <IconChevronDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={channel} onValueChange={value => setChannel(value as TopupChannel)}>
                  {CHANNELS.map(item => (
                    <DropdownMenuRadioItem key={item.value} value={item.value}>
                      {uiT(item.label)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topup-reference">{uiT("Payment reference")}</Label>
            <Input
              id="topup-reference"
              maxLength={200}
              value={reference}
              disabled={locked}
              onChange={event => { setReference(event.target.value); setError(''); }}
            />
            <p className="text-sm text-muted-foreground">{uiT("Unique receipt or test reference used to prevent duplicate credits.")}</p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{uiT(error)}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
              {uiT("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? uiT("Recording…") : attempt ? uiT("Retry same top-up") : uiT("Record top-up")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
