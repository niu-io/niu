import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/shell/ui-locale';
import { categories, type RateKey, type Rates } from './text-terms';

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
