import { tokenBand } from './text-terms';
import { useLocale } from '@/shell/ui-locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money, currencySymbol } from '@/lib/money';
import { mediaAmount } from '@/lib/media-price';
import type { PlatformPricingHealth } from '@niu-io/sdk/admin';
export type PricingHealth = PlatformPricingHealth;
export type PricingSupplyState = 'active' | 'inactive' | 'unconfigured' | 'unknown';

export function supplyStateOf(health?: PricingHealth): PricingSupplyState {
  if (health?.supply_status === 'active' || health?.supply_status === 'inactive' || health?.supply_status === 'unconfigured') {
    return health.supply_status;
  }
  return 'unknown';
}

type Check = PricingHealth['checks'][number];
type MediaAmount = NonNullable<Check['media_rates']>['purchase'];

function mediaPrice(value: MediaAmount, currency: string, meter: string) {
  const { numerator, denominator } = value.per_quantity;
  const quantity = denominator === '1' ? numerator : `${numerator}/${denominator}`;
  return `${currencySymbol(currency)}${mediaAmount(value.amount_units, value.decimal_places)} / ${quantity} ${meter}`;
}

function TextComparison({ rates, currency }: { rates: NonNullable<Check['rates']>; currency: string }) {
  const { t } = useLocale();
  const grouped = new Map<string, typeof rates>();
  for (const rate of rates) {
    const rows = grouped.get(rate.minimum_input_tokens);
    if (rows) rows.push(rate);
    else grouped.set(rate.minimum_input_tokens, [rate]);
  }
  const bands = [...grouped].sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : 1);
  return <Table className="unit-price-comparison text-unit-comparison">
        <caption className="caption-top pb-2 text-left text-sm">{currency} / {t('million tokens', '百万 Token')}</caption>
        <TableHeader><TableRow>{[t('Item'), t('Purchase price', '采购价'), t('Selling price', '售价'), t('Unit spread', '单位价差')].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
        {bands.map(([threshold, rows], index) => <TableBody key={threshold}>
          {bands.length > 1 && <TableRow><TableHead scope="rowgroup" colSpan={4} className="h-auto text-foreground">
            {t('Input tokens', '输入 Token')} · {tokenBand(threshold, bands[index + 1]?.[0])}
          </TableHead></TableRow>}
          {rows.map(rate => <TableRow key={rate.dimension}>
          <TableCell>{t(rate.dimension)}</TableCell>
          <TableCell data-label={t('Purchase price', '采购价')}>{money(rate.purchase, currency)}</TableCell><TableCell data-label={t('Selling price', '售价')}>{money(rate.selling, currency)}</TableCell>
          <TableCell data-label={t('Unit spread', '单位价差')}>{money((BigInt(rate.selling) - BigInt(rate.purchase)).toString(), currency)}</TableCell>
        </TableRow>)}</TableBody>)}
      </Table>;
}

/** Display only in platform administration, using the same operands as the comparison. */
export function PriceComparison({ health, currency }: { health?: PricingHealth; currency: string }) {
  const { t } = useLocale();
  const supply = supplyStateOf(health);
  if (supply === 'inactive' || supply === 'unconfigured') {
    return <p>{t('No active purchase quote', '暂无生效采购报价')}</p>;
  }
  if (!health?.checks.length) return <p>{t('Purchase price unavailable', '采购价暂不可用')}</p>;
  return <div className="space-y-5">
    {health.checks.map((check, index) => <section key={index} className="space-y-2">
      <h3 className="break-all font-medium">{[check.provider, check.route].filter(Boolean).join(' · ')}</h3>
      {check.status === 'below_cost' && <p className="text-destructive">{t('Below purchase cost', '低于采购成本')}</p>}
      {check.rates?.length ? <TextComparison rates={check.rates} currency={currency} /> : check.media_rates ? <dl className="grid grid-cols-2 gap-2">
        <dt>{t('Purchase price', '采购价')}</dt><dd>{mediaPrice(check.media_rates.purchase, currency, t(check.media_rates.meter))}</dd>
        <dt>{t('Selling price', '售价')}</dt><dd>{mediaPrice(check.media_rates.selling, currency, t(check.media_rates.meter))}</dd>
      </dl> : <p>{check.message && check.status !== 'below_cost' && check.status !== 'no_lower_unit_rates' ? t(check.message) : t('Purchase price unavailable', '采购价暂不可用')}</p>}
    </section>)}
  </div>;
}
