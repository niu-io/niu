import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/shell/ui-locale';
import type { Dispatch, SetStateAction } from 'react';
import type { ContextPriceTier } from '@niu-io/sdk/admin';
import { Button } from '@/components/ui/button';
import { categories, ratesFrom, tokenBand, validTierThreshold, type Tier, type RateKey, type Rates } from './text-terms';

export function TextRateBand({ id, rates, previous, disabled, onChange }: {
  id: string;
  rates: Rates;
  previous?: Rates;
  disabled: boolean;
  onChange: (field: RateKey, value: string) => void;
}) {
  const { t } = useLocale();
  function field([key, label]: typeof categories[number]) {
    const saved = previous?.[key];
    const fallback = key === 'reasoning_completion_rate' ? rates.completion_rate : rates.prompt_rate;
    const optional = key !== 'prompt_rate' && key !== 'completion_rate';
    return <div key={key} className="grid gap-2">
      <Label htmlFor={id + '-' + key}>{t(label)}</Label>
      <Input id={id + '-' + key} inputMode="decimal" value={rates[key]} disabled={disabled}
        placeholder={optional ? fallback : undefined} onChange={event => onChange(key, event.target.value)} />
      {saved !== undefined && saved !== rates[key] && <small>{t('Previous price', '原价')} · {saved || t('Ordinary pricing', '常规费率')}</small>}
    </div>;
  }
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">{categories.slice(0, 2).map(field)}</div>
    <details open={categories.slice(2).some(([key]) => rates[key] !== '') || undefined}>
      <summary className="cursor-pointer text-sm">{t('Cache and reasoning rates', '缓存与推理单价')}</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">{categories.slice(2).map(field)}</div>
    </details>
  </div>;
}

export function ContextTierFields({ tiers, setTiers, previous, locked, onDirty }: {
  tiers: Tier[];
  setTiers: Dispatch<SetStateAction<Tier[]>>;
  previous?: ContextPriceTier[];
  locked: boolean;
  onDirty?: () => void;
}) {
  const { t: uiT } = useLocale();
  return <div className="space-y-4">
      {tiers.map((tier, index) => {
        const savedTier = previous?.find(saved => saved.minimum_input_tokens === tier.minimum_input_tokens);
        return <section key={index} className="space-y-3 border-t pt-4">
          <h3 className="font-medium">{uiT("Input tokens", "输入 Token")} · {tokenBand(tier.minimum_input_tokens, tiers[index + 1]?.minimum_input_tokens)}</h3>
          <div className="flex items-end gap-2">
            <div className="grid gap-2">
              <Label htmlFor={'tier-threshold-' + index}>{uiT("Minimum input tokens")}</Label>
              <Input id={'tier-threshold-' + index} inputMode="numeric" required
                ref={input => { input?.setCustomValidity(validTierThreshold(tier.minimum_input_tokens, tiers[index - 1]?.minimum_input_tokens ?? '0') ? '' : uiT('Use increasing whole-token thresholds starting at 1 or higher.')); }} disabled={locked} value={tier.minimum_input_tokens}
                onChange={event => setTiers(current => current.map((item, i) => i === index ? { ...item, minimum_input_tokens: event.target.value } : item))} />
            </div>
            <Button type="button" variant="outline" disabled={locked} onClick={() => {
              onDirty?.();
              setTiers(current => current.filter((_, i) => i !== index));
            }}>{uiT("Remove tier")} {index + 1}</Button>
          </div>
          <TextRateBand id={'tier-' + index} rates={tier.rates} previous={savedTier ? ratesFrom(savedTier) : undefined} disabled={locked}
            onChange={(field, value) => setTiers(current => current.map((item, i) => i === index ? { ...item, rates: { ...item.rates, [field]: value } } : item))} />
        </section>;
      })}
      <Button type="button" variant="outline" disabled={locked || tiers.length >= 32} onClick={() => {
        onDirty?.();
        setTiers(current => [...current, { minimum_input_tokens: '', rates: ratesFrom() }]);
      }}>{uiT("Add tier")}</Button>
    </div>;
}
