import { categories, tokenBand } from './text-terms';
import { Fragment } from 'react';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money } from '@/lib/money';
import { compactMediaAmount, mediaQuantityInput, mediaRoundingLabels } from '@/lib/media-price';
import type { RetailSchedule } from '@niu-io/sdk/admin';

type MediaSchedule = Extract<RetailSchedule, {kind: 'media'}>;

function mediaTerms(schedule: MediaSchedule, currency: string, t: (text: string) => string) {
  const meter = t(schedule.meter === 'video_tokens' ? 'video tokens' : schedule.meter);
  return [
    [t('Price'), `${currency} ${compactMediaAmount(schedule.amount_units, schedule.decimal_places)} / ${mediaQuantityInput(schedule.per_quantity)} ${meter}`],
    [t('Media specification'), [schedule.dimensions.resolution, schedule.dimensions.channel, t(schedule.dimensions.reference_video ? 'With reference video' : 'No reference video')].join(' · ')],
    [t('Minimum quantity'), `${mediaQuantityInput(schedule.minimum_quantity)} ${meter}`],
    [t('Rounding'), t(mediaRoundingLabels[schedule.rounding])],
  ] as const;
}

export function SellingSchedule({ schedule, currency, compact = false }: { schedule: RetailSchedule; currency: string; compact?: boolean }) {
  const { t: uiT, format: uiF } = useUILocale();
  if (schedule.kind === 'media') {
    const rows = mediaTerms(schedule, currency, uiT);
    if (compact) return <div className="space-y-1 break-words text-sm"><p className="font-medium tabular-nums">{rows[0][1]}</p><p className="text-xs text-muted-foreground">{rows[1][1]}</p></div>;
    return <Table  aria-label={uiT('Selling price details')}><TableHeader><TableRow><TableHead>{uiT('Item')}</TableHead><TableHead>{uiT('Value')}</TableHead></TableRow></TableHeader><TableBody>{rows.map(([label, value]) => <TableRow key={label}><TableCell className="!py-2 whitespace-normal text-muted-foreground">{label}</TableCell><TableCell className="!py-2 whitespace-normal break-words">{value}</TableCell></TableRow>)}</TableBody></Table>;
  }
  const baseRates = [['Input / 1M tokens', schedule.prompt_rate], ['Output / 1M tokens', schedule.completion_rate]] as const;
  if (compact) return <div className="space-y-1 text-sm">{schedule.context_tiers.length > 0 && <p>{uiT("Base rates", "基础单价")} · {tokenBand("0", schedule.context_tiers[0].minimum_input_tokens)} {uiT("Tokens")}</p>}{baseRates.map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"><span className="text-muted-foreground">{uiT(label)}</span><span className="font-medium tabular-nums">{money(value, currency)}</span></div>)}</div>;
  const rates = [...baseRates, ['Cache read / 1M tokens', schedule.cached_prompt_rate], ['Cache write / 1M tokens', schedule.cache_write_prompt_rate], ['Reasoning / 1M tokens', schedule.reasoning_completion_rate], ['Request fee', schedule.request_fee_nanos], ['Minimum charge', schedule.minimum_charge_nanos]] as const;
  return <Table  aria-label={uiT('Selling price details')}><TableHeader><TableRow><TableHead>{uiT('Item')}</TableHead><TableHead className="text-right">{uiT('Price')}</TableHead></TableRow></TableHeader><TableBody>
    {rates.map(([label, value]) => <TableRow key={label}><TableCell className="!py-2 whitespace-normal">{uiT(label)}</TableCell><TableCell className="!py-2 text-right tabular-nums whitespace-normal">{value == null ? uiT('Not separately priced') : money(value, currency)}</TableCell></TableRow>)}
    {schedule.context_tiers.map((tier, index) => <Fragment key={index}>
      <TableRow><TableCell colSpan={2} className="!py-2 whitespace-normal font-medium">{uiF('Context tier: {0} tokens', [tokenBand(tier.minimum_input_tokens, schedule.context_tiers[index + 1]?.minimum_input_tokens)])}</TableCell></TableRow>
      {([['Input / 1M tokens', tier.prompt_rate], ['Output / 1M tokens', tier.completion_rate], ['Cache read / 1M tokens', tier.cached_prompt_rate], ['Cache write / 1M tokens', tier.cache_write_prompt_rate], ['Reasoning / 1M tokens', tier.reasoning_completion_rate]] as const).map(([label, value]) => <TableRow key={label}><TableCell className="!py-2 whitespace-normal">{uiT(label)}</TableCell><TableCell className="!py-2 text-right tabular-nums whitespace-normal">{value == null ? uiT('Not separately priced') : money(value, currency)}</TableCell></TableRow>)}
    </Fragment>)}
  </TableBody></Table>;
}

export function MediaPromotionChanges({ original, result, currency }: { original: MediaSchedule; result: MediaSchedule; currency: string }) {
  const { t } = useUILocale();
  const before = mediaTerms(original, currency, t);
  const changes = mediaTerms(result, currency, t).flatMap(([label, value], index) =>
    before[index][1] === value ? [] : [<li key={label}>{label} · {before[index][1]} → {value}</li>],
  );
  return <div className="space-y-2">
    {changes.length ? <ul>{changes}</ul> : <p>{t('Rates unchanged', '单价未变')}</p>}
    <details><summary className="cursor-pointer text-sm">{t('Full price schedule', '完整价表')}</summary>
      <SellingSchedule schedule={result} currency={currency} /></details>
  </div>;
}

export function ScheduleRevision({ schedule, prior, currency }: { schedule: RetailSchedule; prior?: RetailSchedule | null; currency: string }) {
  const { t } = useUILocale();
  if (schedule.kind !== 'text' || prior?.kind !== 'text') return <SellingSchedule schedule={schedule} currency={currency} />;
  const changes: Array<{ label: string; before: string; after: string }> = [];
  const bands = [...new Set([...prior.context_tiers, ...schedule.context_tiers].map(tier => tier.minimum_input_tokens))]
    .sort((a, b) => BigInt(a) < BigInt(b) ? -1 : 1);
  function add(label: string, a: string | null, b: string | null) {
    if (a !== b) changes.push({label, before: a === null ? t('Ordinary pricing', '常规费率') : money(a, currency), after: b === null ? t('Ordinary pricing', '常规费率') : money(b, currency)});
  }
  const previousTiers = new Map(prior.context_tiers.map(tier => [tier.minimum_input_tokens, tier]));
  const currentTiers = new Map(schedule.context_tiers.map(tier => [tier.minimum_input_tokens, tier]));
  let previousRates: Omit<typeof prior.context_tiers[number], 'minimum_input_tokens'> = prior;
  let currentRates: typeof previousRates = schedule;
  const thresholds = ['0', ...bands.filter(value => value !== '0')];
  for (const [index, threshold] of thresholds.entries()) {
    previousRates = previousTiers.get(threshold) ?? previousRates;
    currentRates = currentTiers.get(threshold) ?? currentRates;
    const range = tokenBand(threshold, thresholds[index + 1]);
    for (const [field, label] of categories) {
      const heading = bands.length ? `${range} ${t('Tokens')} · ${t(label)}` : t(label);
      add(heading, previousRates[field] ?? null, currentRates[field] ?? null);
    }
  }
  add(t('Request fee'), prior.request_fee_nanos, schedule.request_fee_nanos);
  add(t('Minimum charge'), prior.minimum_charge_nanos, schedule.minimum_charge_nanos);
  return <div className="space-y-2">
    {changes.length > 0 ? <ul>{changes.map(change => <li key={change.label}>{change.label} · {change.before} → {change.after}</li>)}</ul> : <p>{t('Rates unchanged', '单价未变')}</p>}
    <details><summary className="cursor-pointer text-sm">{t('Full price schedule', '完整价表')}</summary>
      <SellingSchedule schedule={schedule} currency={currency} /></details>
  </div>;
}
