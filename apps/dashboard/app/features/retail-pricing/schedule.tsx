import { useLocale as useUILocale } from '@/shell/ui-locale';
import { money } from '@/lib/money';
import { mediaAmount } from '@/lib/media-price';
import type { RetailSchedule } from '@niu-io/sdk/admin';

export function SellingSchedule({ schedule, currency, compact = false }: { schedule: RetailSchedule; currency: string; compact?: boolean }) {
  const { t: uiT } = useUILocale();
  if (schedule.kind === 'media') {
    const formatted = mediaAmount(schedule.amount_units, schedule.decimal_places);
    return <div className="space-y-1 text-sm"><p>{currency} {formatted} / {schedule.per_quantity.numerator}{schedule.per_quantity.denominator === '1' ? '' : '/' + schedule.per_quantity.denominator} {schedule.meter}</p>{!compact && <><p>{schedule.dimensions.channel} · {schedule.dimensions.resolution} · {schedule.dimensions.reference_video ? uiT("Reference video") : uiT("No reference video")}</p><p>{uiT("Minimum quantity:")}{" "}{schedule.minimum_quantity.numerator}/{schedule.minimum_quantity.denominator}{" "}{uiT("· Rounding:")}{" "}{uiT(schedule.rounding)}</p></>}</div>;
  }
  const rates = [['Input / 1M tokens', schedule.prompt_rate], ['Output / 1M tokens', schedule.completion_rate], ...(!compact ? [['Cache read / 1M tokens', schedule.cached_prompt_rate], ['Cache write / 1M tokens', schedule.cache_write_prompt_rate], ['Reasoning / 1M tokens', schedule.reasoning_completion_rate], ['Request fee', schedule.request_fee_nanos], ['Minimum charge', schedule.minimum_charge_nanos]] : [])];
  return <div className="space-y-1 text-sm">{rates.map(([label, value]) => <p key={label}>{label}: {value == null ? uiT("Not separately priced") : money(value, currency)}</p>)}{!compact && schedule.context_tiers.map((tier, index) => <div key={index} className="pt-2"><p>{uiT("Context tier:")}{" "}{tier.minimum_input_tokens}{" "}{uiT("tokens")}</p><p>{uiT("Input:")}{" "}{money(tier.prompt_rate, currency)}{" "}{uiT("/ 1M · Output:")}{" "}{money(tier.completion_rate, currency)} / 1M</p>{([['Cache read', tier.cached_prompt_rate], ['Cache write', tier.cache_write_prompt_rate], ['Reasoning', tier.reasoning_completion_rate]] as const).map(([label, rate]) => <p key={label}>{uiT(label)}: {rate == null ? uiT("Not separately priced") : money(rate, currency) + ' / 1M'}</p>)}</div>)}</div>;
}
