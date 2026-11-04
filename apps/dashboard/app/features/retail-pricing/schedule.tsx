import { Fragment } from 'react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money } from '@/lib/money';
import { mediaAmount } from '@/lib/media-price';
import type { RetailSchedule } from '@niu-io/sdk/admin';

export function SellingSchedule({ schedule, currency, compact = false }: { schedule: RetailSchedule; currency: string; compact?: boolean }) {
  const { t: uiT, format: uiF } = useUILocale();
  if (schedule.kind === 'media') {
    const formatted = mediaAmount(schedule.amount_units, schedule.decimal_places);
    const price = `${currency} ${formatted} / ${schedule.per_quantity.numerator}${schedule.per_quantity.denominator === '1' ? '' : '/' + schedule.per_quantity.denominator} ${schedule.meter}`;
    if (compact) return <p className="text-sm">{price}</p>;
    const rows = [
      [uiT('Price'), price],
      [uiT('Media specification'), `${schedule.dimensions.channel} · ${schedule.dimensions.resolution} · ${schedule.dimensions.reference_video ? uiT('Reference video') : uiT('No reference video')}`],
      [uiT('Minimum quantity'), `${schedule.minimum_quantity.numerator}/${schedule.minimum_quantity.denominator}`],
      [uiT('Rounding'), uiT(schedule.rounding)],
    ];
    return <Table  aria-label={uiT('Selling price details')}><TableHeader><TableRow><TableHead>{uiT('Item')}</TableHead><TableHead>{uiT('Value')}</TableHead></TableRow></TableHeader><TableBody>{rows.map(([label, value]) => <TableRow key={label}><TableCell className="!py-2 whitespace-normal text-muted-foreground">{label}</TableCell><TableCell className="!py-2 whitespace-normal break-words">{value}</TableCell></TableRow>)}</TableBody></Table>;
  }
  const baseRates = [['Input / 1M tokens', schedule.prompt_rate], ['Output / 1M tokens', schedule.completion_rate]] as const;
  if (compact) return <div className="space-y-1 text-sm">{baseRates.map(([label, value]) => <p key={label}>{uiT(label)}: {money(value, currency)}</p>)}</div>;
  const rates = [...baseRates, ['Cache read / 1M tokens', schedule.cached_prompt_rate], ['Cache write / 1M tokens', schedule.cache_write_prompt_rate], ['Reasoning / 1M tokens', schedule.reasoning_completion_rate], ['Request fee', schedule.request_fee_nanos], ['Minimum charge', schedule.minimum_charge_nanos]] as const;
  return <Table  aria-label={uiT('Selling price details')}><TableHeader><TableRow><TableHead>{uiT('Item')}</TableHead><TableHead className="text-right">{uiT('Price')}</TableHead></TableRow></TableHeader><TableBody>
    {rates.map(([label, value]) => <TableRow key={label}><TableCell className="!py-2 whitespace-normal">{uiT(label)}</TableCell><TableCell className="!py-2 text-right tabular-nums whitespace-normal">{value == null ? uiT('Not separately priced') : money(value, currency)}</TableCell></TableRow>)}
    {schedule.context_tiers.map((tier, index) => <Fragment key={index}>
      <TableRow><TableCell colSpan={2} className="!py-2 whitespace-normal font-medium">{uiF('Context tier: {0} tokens', [tier.minimum_input_tokens])}</TableCell></TableRow>
      {([['Input / 1M tokens', tier.prompt_rate], ['Output / 1M tokens', tier.completion_rate], ['Cache read / 1M tokens', tier.cached_prompt_rate], ['Cache write / 1M tokens', tier.cache_write_prompt_rate], ['Reasoning / 1M tokens', tier.reasoning_completion_rate]] as const).map(([label, value]) => <TableRow key={label}><TableCell className="!py-2 whitespace-normal">{uiT(label)}</TableCell><TableCell className="!py-2 text-right tabular-nums whitespace-normal">{value == null ? uiT('Not separately priced') : money(value, currency)}</TableCell></TableRow>)}
    </Fragment>)}
  </TableBody></Table>;
}
