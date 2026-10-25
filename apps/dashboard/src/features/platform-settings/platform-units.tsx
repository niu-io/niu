import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePlatformCurrency } from '@/app/platform-currency';
import { formatExactUnitAtoms, formatUnitAtoms } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { request } from '@/features/providers/api';

type UnitDefinition = {
  revision: string;
  name: string;
  display_precision: number;
  atoms_per_unit: string;
};

type PurchaseRule = {
  revision: string;
  definition_revision: string;
  payment_currency: string;
  numerator: string;
  denominator: string;
};

type UnitConfiguration = {
  revision: string;
  billing_mode: 'currency' | 'credits';
  definition: UnitDefinition | null;
  purchase_rules: PurchaseRule[];
};

type ModeBlocker = {
  category: string;
  record_count: string;
  organization_count: string;
  accounts_truncated: boolean;
  accounts: { organization_id: string; name: string; record_count: string }[];
};

type ModeSnapshot = {
  revision: string;
  billing_mode: 'currency' | 'credits';
  target_mode: 'currency' | 'credits';
  change_required: boolean;
  blockers_empty: boolean;
  observed_at: string;
  blockers: ModeBlocker[];
  preserved_configuration: {
    monetary_workspace_limits: string;
    monetary_key_limits: string;
    monetary_text_tariffs: string;
    credits_text_tariffs: string;
    monetary_retail_prices: string;
    monetary_media_rate_history: string;
  };
};

type SavedModePreview = {
  id: string;
  expected_revision: string;
  source_mode: 'currency' | 'credits';
  target_mode: 'currency' | 'credits';
  snapshot: ModeSnapshot;
  created_at: string;
  expires_at: string;
};

const BLOCKER_LABELS: Record<string, string> = {
  missing_unit_definition: 'Missing branded unit definition',
  missing_purchase_rule: 'Missing platform-currency purchase conversion rule',
  customer_monetary_balance: 'Non-zero customer monetary balances',
  approved_credit_limit: 'Active customer approved credit facilities',
  pending_topup_order: 'Pending customer checkout orders',
  unapplied_balance_grant: 'Unapplied monetary balance grants',
  unresolved_monetary_attempt: 'Unresolved monetary inference or media attempts',
  remaining_credits: 'Remaining unexpired customer Credits lots',
  credits_reservation: 'Unresolved customer Credits reservations',
  unresolved_credits_charge: 'Unresolved customer Credits charges',
  unresolved_credits_attempt: 'Unresolved Credits inference or media attempts',
  unsettled_customer_request: 'Unresolved customer requests or reservations',
};

function formatRuleRate(rule: PurchaseRule, unitName: string, precision: number): string {
  try {
    const atomsForOneCurrency = (BigInt(rule.numerator) * 1000000000n) / BigInt(rule.denominator);
    return `${formatUnitAtoms(atomsForOneCurrency.toString(), unitName, precision)} per 1 ${rule.payment_currency} (exact ratio ${rule.numerator}:${rule.denominator})`;
  } catch {
    return `${rule.numerator}:${rule.denominator} (${rule.payment_currency})`;
  }
}

export function PlatformUnitsSetting({ token }: { token: string }) {
  const { currency: platformCurrency, reload: reloadPlatformCurrency } = usePlatformCurrency();
  const [config, setConfig] = useState<UnitConfiguration | null>(null);
  const [preview, setPreview] = useState<ModeSnapshot | null>(null);
  const [savedPreview, setSavedPreview] = useState<SavedModePreview | null>(null);
  const [targetMode, setTargetMode] = useState<'currency' | 'credits'>('credits');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Definition form state
  const [unitName, setUnitName] = useState('Niu Credits');
  const [precision, setPrecision] = useState('2');
  const [savingDef, setSavingDef] = useState(false);

  // Rule form state
  const [ruleCurrency, setRuleCurrency] = useState('');
  const [unitsPerCurrency, setUnitsPerCurrency] = useState('100');
  const [savingRule, setSavingRule] = useState(false);

  // Mode switch state
  const [preparingMode, setPreparingMode] = useState(false);
  const [publishingMode, setPublishingMode] = useState(false);

  async function loadAll(preferredTarget?: 'currency' | 'credits') {
    setLoading(true);
    setError('');
    try {
      const cfgResp = await request<{ data: UnitConfiguration }>(token, '/api/v1/platform/units', 'GET');
      const cfg = cfgResp.data;
      setConfig(cfg);
      if (cfg.definition) {
        setUnitName(cfg.definition.name);
        setPrecision(String(cfg.definition.display_precision));
      }
      const nextTarget = preferredTarget ?? (cfg.billing_mode === 'credits' ? 'currency' : 'credits');
      setTargetMode(nextTarget);
      const modeResp = await request<{ data: ModeSnapshot }>(
        token,
        `/api/v1/platform/units/mode?target=${encodeURIComponent(nextTarget)}`,
        'GET',
      );
      setPreview(modeResp.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Branded Credits configuration unavailable.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [token]);

  useEffect(() => {
    if (platformCurrency && !ruleCurrency) {
      setRuleCurrency(platformCurrency);
    }
  }, [platformCurrency, ruleCurrency]);

  async function handlePublishDefinition(event: FormEvent) {
    event.preventDefault();
    if (!config || savingDef) return;
    const trimmed = unitName.trim();
    if (!trimmed) {
      setError('Enter a branded unit name (for example, Niu Credits or 牛元).');
      return;
    }
    setSavingDef(true);
    setError('');
    setNotice('');
    try {
      await request(token, '/api/v1/platform/units/definitions', 'POST', {
        name: trimmed,
        display_precision: Number(precision),
        expected_revision: config.revision,
        idempotency_key: crypto.randomUUID(),
      });
      setNotice(`Published branded unit definition "${trimmed}" (${precision} decimal places).`);
      reloadPlatformCurrency();
      await loadAll(targetMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish branded unit definition.');
    } finally {
      setSavingDef(false);
    }
  }

  async function handlePublishRule(event: FormEvent) {
    event.preventDefault();
    if (!config?.definition || savingRule) return;
    const currencyCode = (ruleCurrency || platformCurrency || 'USD').trim().toUpperCase();
    const trimmedRate = unitsPerCurrency.trim();
    if (!/^\d+(\.\d{1,6})?$/.test(trimmedRate) || Number(trimmedRate) <= 0) {
      setError('Enter a positive conversion rate (up to 6 decimal places) of branded units per 1 currency unit.');
      return;
    }
    const [whole, frac = ''] = trimmedRate.split('.');
    const scaledUnits = BigInt(whole) * 1000000n + BigInt(frac.padEnd(6, '0'));
    // 1 currency unit = 10^9 nanounits; 1 branded unit = 10^9 atoms.
    // scaledUnits / 10^6 branded units per 1 currency unit => numerator = scaledUnits, denominator = 1000000.
    setSavingRule(true);
    setError('');
    setNotice('');
    try {
      await request(token, '/api/v1/platform/units/rules', 'POST', {
        definition_revision: config.definition.revision,
        payment_currency: currencyCode,
        numerator: scaledUnits.toString(),
        denominator: '1000000',
        expected_revision: config.revision,
        idempotency_key: crypto.randomUUID(),
      });
      setNotice(`Published ${currencyCode} purchase conversion rule for ${config.definition.name}.`);
      reloadPlatformCurrency();
      await loadAll(targetMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not publish purchase conversion rule.');
    } finally {
      setSavingRule(false);
    }
  }

  async function handleSaveModePreview() {
    if (!config || preparingMode) return;
    setPreparingMode(true);
    setError('');
    setNotice('');
    try {
      const resp = await request<{ data: SavedModePreview }>(token, '/api/v1/platform/units/mode/previews', 'POST', {
        target_mode: targetMode,
        expected_revision: config.revision,
        idempotency_key: crypto.randomUUID(),
      });
      setSavedPreview(resp.data);
      setPreview(resp.data.snapshot);
      setNotice(
        `Saved 15-minute compatibility snapshot for switching to ${targetMode === 'credits' ? 'Branded Credits' : 'Settlement Currency'} mode.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save billing-mode preview.');
    } finally {
      setPreparingMode(false);
    }
  }

  async function handlePublishModeSwitch() {
    if (!config || !savedPreview || publishingMode) return;
    setPublishingMode(true);
    setError('');
    setNotice('');
    try {
      await request(token, '/api/v1/platform/units/mode', 'PUT', {
        preview_id: savedPreview.id,
        expected_revision: config.revision,
        idempotency_key: crypto.randomUUID(),
      });
      setSavedPreview(null);
      setNotice(
        `Switched installation billing mode to ${targetMode === 'credits' ? 'Branded Credits' : 'Settlement Currency'}.`,
      );
      reloadPlatformCurrency();
      await loadAll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Billing-mode switch rejected.');
    } finally {
      setPublishingMode(false);
    }
  }

  const defName = config?.definition?.name ?? 'Credits';
  const defPrecision = config?.definition?.display_precision ?? 2;

  return (
    <section className="space-y-6 border-t pt-6" aria-label="Branded Credits and billing mode">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Branded Credits &amp; billing mode</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure versioned branded consumption units (1 unit = 1,000,000,000 exact atoms), payment conversion rules,
            and guarded installation billing-mode transitions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <Badge variant={config.billing_mode === 'credits' ? 'default' : 'outline'}>
              Active mode: {config.billing_mode === 'credits' ? `Branded Credits (${defName})` : 'Settlement Currency'}
            </Badge>
          )}
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadAll(targetMode)}>
            Refresh unit settings
          </Button>
        </div>
      </div>

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading && !config && <p role="status">Loading branded unit configuration…</p>}

      {config && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg bg-muted/30 p-4">
            <div>
              <h3 className="text-sm font-semibold">1. Branded unit definition</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Current revision: {config.definition ? `v${config.definition.revision} (${config.definition.name}, ${config.definition.display_precision} decimals, ${formatExactUnitAtoms(config.definition.atoms_per_unit, config.definition.name)} per unit)` : 'Not published'}
              </p>
            </div>
            <form className="space-y-3" onSubmit={event => void handlePublishDefinition(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="unit-definition-name">Unit display name</Label>
                  <Input
                    id="unit-definition-name"
                    value={unitName}
                    onChange={event => setUnitName(event.target.value)}
                    placeholder="Niu Credits or 牛元"
                    disabled={savingDef}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit-definition-precision">Display decimal places</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        id="unit-definition-precision"
                        type="button"
                        variant="outline"
                        disabled={savingDef}
                        className="w-full justify-between"
                      >
                        <span>{precision} decimal places</span>
                        <ChevronDown className="size-4 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuRadioGroup value={precision} onValueChange={setPrecision}>
                        {['0', '1', '2', '3', '4', '6', '9'].map(p => (
                          <DropdownMenuRadioItem key={p} value={p}>
                            {p} decimal places
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <Button type="submit" size="sm" disabled={savingDef}>
                {savingDef ? 'Publishing…' : 'Publish unit definition'}
              </Button>
            </form>
          </div>

          <div className="space-y-4 rounded-lg bg-muted/30 p-4">
            <div>
              <h3 className="text-sm font-semibold">2. Purchase conversion rule</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Defines how top-up payments in settlement currency convert into issued {defName} atoms at checkout.
              </p>
            </div>
            {config.purchase_rules.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {config.purchase_rules.map(rule => (
                  <li key={rule.revision}>
                    <span className="font-medium text-foreground">{rule.payment_currency}</span> (rule v{rule.revision}, unit v{rule.definition_revision}):{' '}
                    {formatRuleRate(rule, defName, defPrecision)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No purchase rule published for the latest unit definition.</p>
            )}
            <form className="space-y-3" onSubmit={event => void handlePublishRule(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="unit-rule-currency">Payment currency</Label>
                  <Input
                    id="unit-rule-currency"
                    value={ruleCurrency || platformCurrency || 'USD'}
                    onChange={event => setRuleCurrency(event.target.value.toUpperCase())}
                    maxLength={3}
                    disabled={savingRule || !config.definition}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit-rule-rate">{defName} per 1 {ruleCurrency || platformCurrency || 'USD'}</Label>
                  <Input
                    id="unit-rule-rate"
                    inputMode="decimal"
                    value={unitsPerCurrency}
                    onChange={event => setUnitsPerCurrency(event.target.value)}
                    disabled={savingRule || !config.definition}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" disabled={savingRule || !config.definition}>
                {savingRule ? 'Publishing…' : 'Publish purchase rule'}
              </Button>
            </form>
          </div>
        </div>
      )}

      {config && (
        <div className="space-y-4 rounded-lg bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">3. Guarded billing-mode transition</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Switching modes requires zero incompatible obligations across all companies and an unexpired 15-minute
                compatibility preview bound to configuration revision v{config.revision}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-between gap-2">
                    <span>Target: {targetMode === 'credits' ? `Branded Credits (${defName})` : 'Settlement Currency'}</span>
                    <ChevronDown className="size-4 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={targetMode}
                    onValueChange={val => {
                      const next = val as 'currency' | 'credits';
                      setSavedPreview(null);
                      void loadAll(next);
                    }}
                  >
                    <DropdownMenuRadioItem value="credits">Branded Credits ({defName})</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="currency">Settlement Currency</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                disabled={preparingMode || loading}
                onClick={() => void handleSaveModePreview()}
              >
                {preparingMode ? 'Saving preview…' : 'Save 15-minute preview'}
              </Button>
              <Button
                size="sm"
                disabled={
                  publishingMode ||
                  !savedPreview ||
                  savedPreview.expected_revision !== config.revision ||
                  !savedPreview.snapshot.blockers_empty ||
                  !savedPreview.snapshot.change_required
                }
                onClick={() => void handlePublishModeSwitch()}
              >
                {publishingMode
                  ? 'Switching mode…'
                  : `Switch to ${targetMode === 'credits' ? 'Branded Credits' : 'Settlement Currency'}`}
              </Button>
            </div>
          </div>

          {savedPreview && (
            <div className="rounded border bg-background p-3 text-xs space-y-1">
              <p className="font-medium">
                Saved preview bound to revision v{savedPreview.expected_revision}:{' '}
                {savedPreview.source_mode === 'credits' ? 'Branded Credits' : 'Settlement Currency'} →{' '}
                {savedPreview.target_mode === 'credits' ? 'Branded Credits' : 'Settlement Currency'}
              </p>
              <p className="text-muted-foreground">
                Expires {new Date(savedPreview.expires_at).toLocaleString()} ·{' '}
                {savedPreview.snapshot.blockers_empty
                  ? 'No compatibility blockers detected at snapshot time.'
                  : `${savedPreview.snapshot.blockers.length} blocker categories prevented activation.`}
              </p>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={preview.blockers_empty ? 'default' : 'destructive'}>
                  {preview.blockers_empty ? 'Compatible (0 blockers)' : `${preview.blockers.length} blocker categories`}
                </Badge>
                <span className="text-muted-foreground">
                  Preserved configuration (retained without conversion): {preview.preserved_configuration.credits_text_tariffs}{' '}
                  Credits text tariffs · {preview.preserved_configuration.monetary_retail_prices} standard monetary prices ·{' '}
                  {preview.preserved_configuration.monetary_workspace_limits} monetary workspace limits ·{' '}
                  {preview.preserved_configuration.monetary_key_limits} monetary key limits
                </span>
              </div>

              {preview.blockers.length > 0 && (
                <Table aria-label="Billing-mode compatibility blockers">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Incompatibility category</TableHead>
                      <TableHead className="text-right">Records</TableHead>
                      <TableHead className="text-right">Companies</TableHead>
                      <TableHead>Affected companies</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.blockers.map(blocker => (
                      <TableRow key={blocker.category}>
                        <TableCell className="font-medium">
                          {BLOCKER_LABELS[blocker.category] ?? blocker.category}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{blocker.record_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{blocker.organization_count}</TableCell>
                        <TableCell className="whitespace-normal text-xs text-muted-foreground">
                          {blocker.accounts.length
                            ? blocker.accounts.map(a => `${a.name} (${a.record_count})`).join(', ')
                            : 'Platform-wide configuration requirement'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
