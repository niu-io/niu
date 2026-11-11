import { translateUI } from '@/shell/ui-locale';
import { formatLocalizedMessage, readLocale } from '@/shell/ui-locale';
import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { fetchQuery, invalidateQueries, peekQuery } from '@/lib/query-cache';
import { usePlatformCurrency } from '@/shell/platform-currency';
import { formatUnitAtoms } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  monetary_balance: 'Non-zero customer monetary balances',
  monetary_credit_facility: 'Active customer approved credit facilities',
  monetary_reservation: 'Unresolved customer requests or reservations',
  unposted_monetary_charge: 'Unresolved monetary inference or media attempts',
  pending_checkout: 'Pending customer checkout orders',
  unapplied_monetary_grant: 'Unapplied monetary balance grants',
  missing_payment_currency: 'Platform currency required',
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
    return formatLocalizedMessage('{0} = 1 {1}', [formatUnitAtoms(atomsForOneCurrency.toString(), unitName, precision), rule.payment_currency], readLocale());
  } catch {
    return `${rule.numerator}:${rule.denominator} ${rule.payment_currency}`;
  }
}

export function PlatformUnitsSetting({ token }: { token: string }) {
  const { t: uiT, format: uiF } = useUILocale();
  const scope = token || 'public';
  const { currency: platformCurrency, reload: reloadPlatformCurrency } = usePlatformCurrency();
  const initialConfig = peekQuery<{ data: UnitConfiguration }>(scope, '/api/v1/platform/units')?.data ?? null;
  const [config, setConfig] = useState<UnitConfiguration | null>(() => initialConfig);
  const [preview, setPreview] = useState<ModeSnapshot | null>(null);
  const [savedPreview, setSavedPreview] = useState<SavedModePreview | null>(null);
  const [confirmMode, setConfirmMode] = useState(false);
  const [targetMode, setTargetMode] = useState<'currency' | 'credits'>(() =>
    initialConfig?.billing_mode === 'credits' ? 'currency' : 'credits',
  );
  const [loading, setLoading] = useState(() => !initialConfig);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Definition form state
  const [unitName, setUnitName] = useState(() => initialConfig?.definition?.name ?? 'Niu Credits');
  const [precision, setPrecision] = useState(() =>
    initialConfig?.definition ? String(initialConfig.definition.display_precision) : '2',
  );
  const [savingDef, setSavingDef] = useState(false);

  // Rule form state
  const [ruleCurrency, setRuleCurrency] = useState('');
  const [unitsPerCurrency, setUnitsPerCurrency] = useState('100');
  const [savingRule, setSavingRule] = useState(false);

  // Mode switch state
  const [preparingMode, setPreparingMode] = useState(false);
  const [publishingMode, setPublishingMode] = useState(false);

  async function loadAll(preferredTarget?: 'currency' | 'credits', force = false) {
    setLoading(true);
    setError('');
    try {
      if (force) invalidateQueries('/api/v1/platform/units');
      const cfgResp = await fetchQuery(
        scope,
        '/api/v1/platform/units',
        signal => request<{ data: UnitConfiguration }>(token, '/api/v1/platform/units', 'GET', undefined, signal),
        { force, awaitRevalidate: true },
      );
      const cfg = cfgResp.data;
      setConfig(cfg);
      if (cfg.definition) {
        setUnitName(cfg.definition.name);
        setPrecision(String(cfg.definition.display_precision));
      }
      const nextTarget = preferredTarget ?? (cfg.billing_mode === 'credits' ? 'currency' : 'credits');
      setTargetMode(nextTarget);
      const modePath = `/api/v1/platform/units/mode?target=${encodeURIComponent(nextTarget)}`;
      const modeResp = await fetchQuery(
        scope,
        modePath,
        signal => request<{ data: ModeSnapshot }>(token, modePath, 'GET', undefined, signal),
        { force, awaitRevalidate: true },
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
      await loadAll(targetMode, true);
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
      await loadAll(targetMode, true);
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
      setConfirmMode(true);
      setNotice(
        `Compatibility snapshot ready for switching to ${targetMode === 'credits' ? 'Branded Credits' : 'Settlement Currency'} mode.`,
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
      setConfirmMode(false);
      setNotice(
        `Switched installation billing mode to ${targetMode === 'credits' ? 'Branded Credits' : 'Settlement Currency'}.`,
      );
      reloadPlatformCurrency();
      await loadAll(undefined, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Billing-mode switch rejected.');
    } finally {
      setPublishingMode(false);
    }
  }

  const defName = config?.definition?.name ?? uiT("Credits");
  const defPrecision = config?.definition?.display_precision ?? 2;

  return (
    <section className="space-y-6" aria-label={uiT("Branded Credits and billing mode")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{uiT("Branded Credits & billing mode")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {uiT("Configure branded consumption units, payment conversion rules, and guarded installation billing-mode transitions.")}</p>
        </div>
        <div className="flex items-center gap-2">
          {config && (
            <Badge variant={config.billing_mode === 'credits' ? 'default' : 'outline'}>
              {uiT("Active mode:")}{" "}{config.billing_mode === 'credits' ? uiF("Branded Credits ({0})", [defName]) : uiT("Settlement Currency")}
            </Badge>
          )}
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadAll(targetMode, true)}>
            {uiT("Refresh unit settings")}</Button>
        </div>
      </div>

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{uiT(error)}</AlertDescription>
        </Alert>
      )}
      {loading && !config && <FormSectionSkeleton fields={2} label={uiT("Loading branded unit configuration…")} />}

      {config && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg bg-muted/30 p-4">
            <div>
              <h3 className="text-sm font-semibold">{uiT("1. Branded unit definition")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {uiT("Active unit:")}{" "}{config.definition ? uiF("{0} ({1} decimal places)", [config.definition.name, config.definition.display_precision]) : uiT("Not published")}
              </p>
            </div>
            <form className="space-y-3" onSubmit={event => void handlePublishDefinition(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="unit-definition-name">{uiT("Unit display name")}</Label>
                  <Input
                    id="unit-definition-name"
                    value={unitName}
                    onChange={event => setUnitName(event.target.value)}
                    placeholder={uiT("Niu Credits or 牛元")}
                    disabled={savingDef}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit-definition-precision">{uiT("Display decimal places")}</Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        id="unit-definition-precision"
                        type="button"
                        variant="outline"
                        disabled={savingDef}
                        className="w-full justify-between"
                      >
                        <span>{precision}{" "}{uiT("decimal places")}</span>
                        <ChevronDown className="size-4 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuRadioGroup value={precision} onValueChange={setPrecision}>
                        {['0', '1', '2', '3', '4', '6', '9'].map(p => (
                          <DropdownMenuRadioItem key={p} value={p}>
                            {p}{" "}{uiT("decimal places")}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <Button type="submit" size="sm" disabled={savingDef}>
                {savingDef ? uiT("Publishing…") : uiT("Publish unit definition")}
              </Button>
            </form>
          </div>

          <div className="space-y-4 rounded-lg bg-muted/30 p-4">
            <div>
              <h3 className="text-sm font-semibold">{uiT("2. Purchase conversion rule")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {uiF("Defines how top-up payments in settlement currency convert into issued {0} at checkout.", [defName])}</p>
            </div>
            {config.purchase_rules.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {config.purchase_rules.map(rule => (
                  <li key={rule.revision}>
                    <span className="font-medium text-foreground">{rule.payment_currency}</span>{": "}
                    {formatRuleRate(rule, defName, defPrecision)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{uiT("No purchase rule published for the latest unit definition.")}</p>
            )}
            <form className="space-y-3" onSubmit={event => void handlePublishRule(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="unit-rule-currency">{uiT("Payment currency")}</Label>
                  <Input
                    id="unit-rule-currency"
                    value={ruleCurrency || platformCurrency || 'USD'}
                    onChange={event => setRuleCurrency(event.target.value.toUpperCase())}
                    maxLength={3}
                    disabled={savingRule || !config.definition}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="unit-rule-rate">{defName}{" "}{uiT("per 1")}{" "}{ruleCurrency || platformCurrency || 'USD'}</Label>
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
                {savingRule ? uiT("Publishing…") : uiT("Publish purchase rule")}
              </Button>
            </form>
          </div>
        </div>
      )}

      {config && (
        <div className="space-y-4 rounded-lg bg-muted/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">{uiT("3. Guarded billing-mode transition")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {uiT("Resolve the listed obligations before switching. Review expires after 15 minutes or when configuration changes.")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-between gap-2">
                    <span>{uiT("Target:")}{" "}{targetMode === 'credits' ? uiF("Branded Credits ({0})", [defName]) : uiT("Settlement Currency")}</span>
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
                    <DropdownMenuRadioItem value="credits">{uiT("Branded Credits (")}{defName})</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="currency">{uiT("Settlement Currency")}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                disabled={preparingMode || loading || publishingMode || targetMode === config.billing_mode}
                onClick={() => void handleSaveModePreview()}
              >
                {preparingMode ? uiT("Preparing switch…") : uiT("Switch billing mode")}
              </Button>
            </div>
          </div>

          {savedPreview && !confirmMode && (
            <div className="rounded border bg-background p-3 text-xs space-y-1">
              <p className="font-medium">
                {uiT("Compatibility check:")}{' '}
                {savedPreview.source_mode === 'credits' ? uiT("Branded Credits") : uiT("Settlement Currency")} →{' '}
                {savedPreview.target_mode === 'credits' ? uiT("Branded Credits") : uiT("Settlement Currency")}
              </p>
              <p className="text-muted-foreground">
                {uiT("Expires")}{" "}{new Date(savedPreview.expires_at).toLocaleString(readUILocale())} ·{' '}
                {savedPreview.snapshot.blockers_empty
                  ? uiT("No compatibility blockers detected at snapshot time.")
                  : uiF("{0} blocker categories prevented activation.", [savedPreview.snapshot.blockers.length])}
              </p>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={preview.blockers_empty ? 'default' : 'destructive'}>
                  {preview.blockers_empty ? uiT("Compatible (0 blockers)") : uiF("{0} blocker categories", [preview.blockers.length])}
                </Badge>
                <span className="text-muted-foreground">
                  {uiT("Preserved configuration (retained without conversion):")}{" "}{preview.preserved_configuration.credits_text_tariffs}{' '}
                  {uiT("Credits text tariffs ·")}{" "}{preview.preserved_configuration.monetary_retail_prices}{" "}{uiT("standard monetary prices ·")}{' '}
                  {preview.preserved_configuration.monetary_workspace_limits}{" "}{uiT("monetary workspace limits ·")}{' '}
                  {preview.preserved_configuration.monetary_key_limits}{" "}{uiT("monetary key limits")}</span>
              </div>

              {preview.blockers.length > 0 && (
                <Table aria-label={uiT("Billing-mode compatibility blockers")}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{uiT("Incompatibility category")}</TableHead>
                      <TableHead className="text-right">{uiT("Records")}</TableHead>
                      <TableHead className="text-right">{uiT("Companies")}</TableHead>
                      <TableHead>{uiT("Affected companies")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.blockers.map(blocker => (
                      <TableRow key={blocker.category}>
                        <TableCell className="font-medium">
                          {translateUI(BLOCKER_LABELS[blocker.category] ?? 'Compatibility check unavailable')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{blocker.record_count}</TableCell>
                        <TableCell className="text-right tabular-nums">{blocker.organization_count}</TableCell>
                        <TableCell className="whitespace-normal text-xs text-muted-foreground">
                          {blocker.accounts.length
                            ? blocker.accounts.map(a => `${a.name} (${a.record_count})`).join(', ')
                            : uiT("Platform-wide configuration requirement")}
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
      <Dialog open={confirmMode} onOpenChange={open => { if (!open && !publishingMode) setConfirmMode(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiT("Confirm billing mode switch")}</DialogTitle>
            <DialogDescription>{uiT("Review the compatibility snapshot, then confirm the installation-wide switch. The snapshot expires after 15 minutes.")}</DialogDescription>
          </DialogHeader>
          {savedPreview && <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">
              {savedPreview.source_mode === 'credits' ? uiT("Branded Credits") : uiT("Settlement Currency")} → {savedPreview.target_mode === 'credits' ? uiT("Branded Credits") : uiT("Settlement Currency")}
            </p>
            <p className="text-muted-foreground">{uiT("Expires")} {new Date(savedPreview.expires_at).toLocaleString(readUILocale())}</p>
            <p className="text-muted-foreground">{savedPreview.snapshot.blockers_empty ? uiT("No compatibility blockers detected at snapshot time.") : uiF("{0} blocker categories prevented activation.", [savedPreview.snapshot.blockers.length])}</p>
          </div>}
          {error && <Alert variant="destructive"><AlertDescription>{uiT(error)}</AlertDescription></Alert>}
          <DialogFooter>
            <Button variant="outline" disabled={publishingMode} onClick={() => setConfirmMode(false)}>{uiT("Cancel")}</Button>
            <Button disabled={publishingMode || !savedPreview || !config || savedPreview.expected_revision !== config.revision || !savedPreview.snapshot.blockers_empty || !savedPreview.snapshot.change_required} onClick={() => void handlePublishModeSwitch()}>{publishingMode ? uiT("Switching mode…") : uiT("Confirm switch")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
