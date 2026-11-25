import { readLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { catalogTitle } from '@/lib/providers';
import { IconChartBar } from '@tabler/icons-react';

export type RequestBucket = { start_ms: number; end_ms: number; request_count: number };
type ModelUsage = {model_alias: string; request_count: number; prompt_tokens: string; completion_tokens: string; usage_count: number};
const baseConfig = {
  request_count: {label: 'Requests', color: 'var(--brand-orange)'},
  input: {label: 'Input tokens', color: 'var(--chart-1)'},
  output: {label: 'Output tokens', color: 'var(--chart-2)'},
};
const count = (value: number) => new Intl.NumberFormat(readLocale(), {notation: 'compact'}).format(value);
export const integerAxis = (maxValue: number): {domain: [number, number]; ticks: number[]} => {
  const max = Math.max(1, Math.ceil(maxValue));
  if (max <= 4) {
    return {domain: [0, max], ticks: Array.from({length: max + 1}, (_, i) => i)};
  }
  const rawStep = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const stepMultiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(stepMultiplier * magnitude));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return {domain: [0, top], ticks};
};

export function buildTokenSeries(models: ModelUsage[]) {
  const rankedTokens = [...models]
    .filter(model => model.usage_count > 0)
    .sort((a, b) => {
      const left = BigInt(a.prompt_tokens) + BigInt(a.completion_tokens);
      const right = BigInt(b.prompt_tokens) + BigInt(b.completion_tokens);
      return left === right ? 0 : left > right ? -1 : 1;
    })
    .slice(0, 8)
    .map(model => {
      const rawInput = Number(model.prompt_tokens);
      const rawOutput = Number(model.completion_tokens);
      return {...model, rawInput, rawOutput, totalTokens: rawInput + rawOutput};
    });
  const positiveTokenTotals = rankedTokens.map(model => model.totalTokens).filter(total => total > 0);
  const useSqrtTokens =
    positiveTokenTotals.length >= 2 &&
    Math.max(...positiveTokenTotals) / Math.min(...positiveTokenTotals) >= 25;
  const tokenModels = rankedTokens.map(model => {
    if (!useSqrtTokens || model.totalTokens <= 0) {
      return {...model, input: model.rawInput, output: model.rawOutput};
    }
    const scaledTotal = Math.sqrt(model.totalTokens);
    return {
      ...model,
      input: scaledTotal * (model.rawInput / model.totalTokens),
      output: scaledTotal * (model.rawOutput / model.totalTokens),
    };
  });
  const maxTokenTotal = Math.max(0, ...rankedTokens.map(model => model.totalTokens));
  const tokenAxis = useSqrtTokens
    ? (() => {
        const top = Math.sqrt(Math.max(1, maxTokenTotal));
        return {
          domain: [0, top] as [number, number],
          ticks: [0, 0.25 * top, 0.5 * top, 0.75 * top, top],
        };
      })()
    : integerAxis(maxTokenTotal);
  return {tokenModels, tokenAxis, useSqrtTokens};
}
const date = (value: number) => new Intl.DateTimeFormat(readLocale(), {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}).format(value);
const shortModelLabel = (value: unknown, maxLength: number) => {
  const name = catalogTitle({id: String(value)});
  if (name.length <= maxLength) return name;
  return `${name.slice(0, Math.max(6, maxLength - 5))}…${name.slice(-4)}`;
};

export default function ActivityCharts({ buckets, models, compact = false, loading }: {buckets?: RequestBucket[]; models: ModelUsage[]; compact?: boolean; loading: boolean}) {
  const { t: uiT } = useUILocale();
  const config = Object.fromEntries(Object.entries(baseConfig).map(([key, value]) => [key, {...value, label: uiT(value.label)}]));
  const hasBucketTraffic = Boolean(buckets?.some(bucket => bucket.request_count > 0));
  const bucketAxis = integerAxis(Math.max(0, ...(buckets ?? []).map(bucket => bucket.request_count)));
  const ranked = [...models].filter(model => model.request_count > 0).sort((a,b) => b.request_count-a.request_count).slice(0,8);
  const rankedAxis = integerAxis(Math.max(0, ...ranked.map(model => model.request_count)));
  const {tokenModels, tokenAxis, useSqrtTokens} = buildTokenSeries(models);
  const allEmpty = !compact && !loading && !hasBucketTraffic && !ranked.length && !tokenModels.length;
  if (allEmpty) {
    return (
      <section aria-label={uiT("Activity charts")} className="my-6 min-w-0" aria-busy={loading}>
        <h2 className="text-sm font-semibold">{uiT("Requests over time")}</h2>
        <Empty className="mt-3 min-h-36 py-7">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconChartBar size={18} aria-hidden="true" /></EmptyMedia>
            <EmptyTitle>{buckets === undefined ? uiT("Activity history unavailable.") : uiT("No requests in this range.")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }
  return <section aria-label={uiT("Activity charts")} className="my-6 grid min-w-0 gap-8 lg:grid-cols-2" aria-busy={loading}>
    <div className={compact ? 'min-w-0 lg:col-span-2' : 'min-w-0'}>
      <h2 className="text-sm font-semibold">{uiT("Requests over time")}</h2>
      {loading && !buckets?.length ? <p role="status" className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">{uiT("Loading activity chart…")}</p> : hasBucketTraffic ? <ChartContainer config={config} className="h-56 w-full" aria-label={uiT("Request volume over time")}>
        <AreaChart accessibilityLayer data={buckets} margin={{left:0,right:12,top:12,bottom:0}}>
          <CartesianGrid vertical={false}/><XAxis dataKey="start_ms" tickFormatter={date} minTickGap={70} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} domain={bucketAxis.domain} ticks={bucketAxis.ticks} tickFormatter={count} tickLine={false} axisLine={false} width={44}/>
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_label, payload) => payload[0]?.payload ? `${date(payload[0].payload.start_ms)} – ${date(payload[0].payload.end_ms)}` : ''}/>}/>
          <Area type="linear" baseValue={0} strokeLinecap="round" strokeLinejoin="round" dataKey="request_count" stroke="var(--color-request_count)" fill="var(--color-request_count)" fillOpacity={0.12} strokeWidth={2} dot={(buckets?.length ?? 0) === 1 ? {r: 4, fill: 'var(--color-request_count)', strokeWidth: 0} : false} isAnimationActive={false}/>
        </AreaChart>
      </ChartContainer> : <Empty className="mt-3 min-h-32 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconChartBar size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{buckets === undefined ? uiT("Activity history unavailable.") : uiT("No requests in this range.")}</EmptyDescription></EmptyHeader></Empty>}
    </div>
    {!compact && <>
      <div className="min-w-0"><h2 className="text-sm font-semibold">{uiT("Requests by model")}</h2><p className="mt-1 mb-4 text-xs text-muted-foreground">{uiT("The eight most active models in this range.")}</p>
        {ranked.length ? <ChartContainer config={config} className="h-56 w-full" aria-label={uiT("Requests by model")}><BarChart accessibilityLayer data={ranked} layout="vertical" margin={{left:8,right:16}}><CartesianGrid horizontal={false}/><XAxis type="number" allowDecimals={false} domain={rankedAxis.domain} ticks={rankedAxis.ticks} tickFormatter={count} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="model_alias" width={168} tickLine={false} axisLine={false} tickFormatter={value => shortModelLabel(value, 28)}/><ChartTooltip content={<ChartTooltipContent labelFormatter={label => catalogTitle({id: String(label)})}/>}/><Bar dataKey="request_count" fill="var(--color-request_count)" radius={[0,3,3,0]} maxBarSize={24} isAnimationActive={false}/></BarChart></ChartContainer> : loading ? <p role="status" className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">{uiT("Loading model activity…")}</p> : <Empty className="min-h-32 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconChartBar size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No model activity in this range.")}</EmptyDescription></EmptyHeader></Empty>}
      </div>
      <div className="min-w-0 lg:col-span-2"><h2 className="text-sm font-semibold">{uiT("Token volume by model")}</h2><p className="mt-1 mb-4 text-xs text-muted-foreground">{uiT("The eight models with the most reported input and output tokens. Requests with unknown usage are excluded.")}</p>
        {tokenModels.length ? <ChartContainer config={config} className="h-64 w-full" aria-label={uiT("Reported token volume by model")}><BarChart accessibilityLayer data={tokenModels} margin={{left:0,right:12}}><CartesianGrid vertical={false}/><XAxis dataKey="model_alias" tickLine={false} axisLine={false} minTickGap={24} tickFormatter={value => shortModelLabel(value, 26)}/><YAxis domain={tokenAxis.domain} ticks={tokenAxis.ticks} tickFormatter={value => count(useSqrtTokens ? Math.round(Number(value) * Number(value)) : Number(value))} tickLine={false} axisLine={false} width={48}/><ChartTooltip content={<ChartTooltipContent labelFormatter={label => catalogTitle({id: String(label)})} formatter={(_value, name, item) => {
          const seriesKey = String(item?.dataKey ?? name ?? '');
          const point = (item?.payload ?? {}) as {rawInput?: number; rawOutput?: number};
          const rawValue = seriesKey === 'input' ? point.rawInput : seriesKey === 'output' ? point.rawOutput : _value;
          const label = seriesKey === 'input' ? config.input.label : seriesKey === 'output' ? config.output.label : String(name ?? '');
          const formatted = Number.isFinite(Number(rawValue)) ? new Intl.NumberFormat(readLocale()).format(Number(rawValue)) : '—';
          return <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{backgroundColor: `var(--color-${seriesKey})`}} />
            <div className="flex flex-1 items-center justify-between gap-4 leading-tight">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-medium text-foreground tabular-nums">{formatted}</span>
            </div>
          </>;
        }}/>}/><ChartLegend content={<ChartLegendContent/>}/><Bar dataKey="input" stackId="tokens" fill="var(--color-input)" maxBarSize={48} isAnimationActive={false}/><Bar dataKey="output" stackId="tokens" fill="var(--color-output)" radius={[3,3,0,0]} maxBarSize={48} isAnimationActive={false}/></BarChart></ChartContainer> : loading ? <p role="status" className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">{uiT("Loading token activity…")}</p> : <Empty className="min-h-32 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconChartBar size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No reported token usage in this range.")}</EmptyDescription></EmptyHeader></Empty>}
      </div>
    </>}
  </section>;
}
