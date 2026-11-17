import { readLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { currencySymbol } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { request } from '@/features/providers/api';

const currencyNames = new Map<string, Intl.DisplayNames>();
const currencies = Intl.supportedValuesOf('currency').filter(code => !['XXX', 'XTS'].includes(code));
const description = (code: string) => {
  const locale = readLocale();
  let names = currencyNames.get(locale);
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: 'currency' });
    currencyNames.set(locale, names);
  }
  return `${names.of(code) ?? code} (${code}) · ${currencySymbol(code)}`;
};

export function PlatformCurrencySetting({ token }: { token: string }) {
  const { t: uiT } = useUILocale();
  const { currency, reload, ready, failed } = usePlatformCurrency();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const current = currency || saved;

  async function save() {
    if (saving || !currencies.includes(draft)) return;
    setSaving(true);
    setError('');
    try {
      await request(token, '/api/v1/platform/currency', 'PUT', { currency: draft });
      setSaved(draft);
      setOpen(false);
      reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save currency. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4" aria-label={uiT('Platform currency')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{uiT('Platform currency')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {uiT('The currency for pricing, balances, spending limits, and reports across all workspaces.')}
          </p>
        </div>
        {ready !== false && !(failed && !current) && !current && (
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft('');
              setQuery('');
              setError('');
              setOpen(true);
            }}
          >
            {uiT('Set platform currency', '设置平台币种')}
          </Button>
        )}
      </div>
      {ready === false ? (
        <FormSectionSkeleton fields={1} label={uiT('Loading currency…')} />
      ) : failed && !current ? (
        <div role="alert" className="space-y-2">
          <p>{uiT('Could not load the platform currency.')}</p>
          <Button variant="outline" onClick={reload}>
            {uiT('Retry')}
          </Button>
        </div>
      ) : current ? (
        <div className="space-y-2 rounded-[var(--radius-panel)] bg-card p-5">
          <p className="font-medium">{description(current)}</p>
          <p className="text-sm text-muted-foreground">
            {uiT('Configured for this installation. Changing currency requires a data migration; existing amounts are never converted automatically.')}
          </p>
          {saved && (
            <p role="status" className="text-sm">
              {uiT('Platform currency saved.')}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-[var(--radius-panel)] bg-card p-5 text-sm text-muted-foreground">
          {uiT('Choose once during setup. All workspaces inherit this currency. Historical amounts keep their original currency.')}
        </div>
      )}
      <Dialog
        open={open && !current}
        onOpenChange={value => {
          if (!saving) {
            setOpen(value);
            if (!value) {
              setQuery('');
              setError('');
            }
          }
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto"
          onCloseAutoFocus={event => {
            if (triggerRef.current?.isConnected) {
              event.preventDefault();
              triggerRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{uiT('Set platform currency', '设置平台币种')}</DialogTitle>
            <DialogDescription>
              {uiT(
                'Choose the currency for all new pricing, balances, and spending limits. This setting cannot be changed here after saving; existing amounts keep their original currency.',
                '选择用于所有新定价、余额与消费限额的结算币种。保存后无法在此处更改，已有金额将保留原有币种。',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="platform-currency">{uiT('Currency')}</Label>
            <DropdownMenu onOpenChange={() => setQuery('')}>
              <DropdownMenuTrigger asChild>
                <Button
                  id="platform-currency"
                  type="button"
                  variant="outline"
                  disabled={saving}
                  className="w-full justify-between gap-4"
                >
                  <span className="truncate">{draft ? description(draft) : uiT('Choose currency')}</span>
                  <ChevronDown className="size-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]">
                <div className="p-2">
                  <Input
                    aria-label={uiT('Search currencies')}
                    placeholder={uiT('Search name or code…')}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    onKeyDown={event => {
                      if (event.key.length === 1 || ['Home', 'End', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
                        event.stopPropagation();
                      }
                    }}
                  />
                </div>
                <DropdownMenuRadioGroup
                  value={draft}
                  onValueChange={value => {
                    setDraft(value);
                    setError('');
                  }}
                  className="max-h-64 overflow-y-auto"
                >
                  {currencies
                    .filter(code => description(code).toLowerCase().includes(query.toLowerCase().trim()))
                    .map(code => (
                      <DropdownMenuRadioItem key={code} value={code}>
                        {description(code)}
                      </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                {!currencies.some(code => description(code).toLowerCase().includes(query.toLowerCase().trim())) && (
                  <p className="p-3 text-sm text-muted-foreground">{uiT('No currencies found.')}</p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>
              {uiT('Cancel')}
            </Button>
            <Button type="button" disabled={!draft || saving} onClick={() => void save()}>
              {saving ? uiT('Saving…') : uiT('Confirm currency')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
