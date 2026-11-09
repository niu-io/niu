import { readLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { catalogTitle } from '@/lib/providers';
import { IconChartBar } from '@tabler/icons-react';

export type RequestBucket = { start_ms: number; end_ms: number; request_count: number };
type ModelUsage = {model_alias: string; request_count: number; prompt_tokens: string; completion_tokens: string; usage_count: number};
const baseConfig = {
  request_count: {label: 'Requests', color: 'var(--chart-1)'},
  input: {label: 'Input tokens', color: 'var(--chart-1)'},
  output: {label: 'Output tokens', color: 'var(--chart-2)'},
};
const count = (value: number) => new Intl.NumberFormat('en', {notation: 'compact'}).format(value);
const date = (value: number) => new Intl.DateTimeFormat(readLocale(), {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}).format(value);

export default function ActivityCharts({ buckets, models, compact = false, loading }: {buckets?: RequestBucket[]; models: ModelUsage[]; compact?: boolean; loading: boolean}) {
  const { t: uiT } = useUILocale();
  const config = Object.fromEntries(Object.entries(baseConfig).map(([key, value]) => [key, {...value, label: uiT(value.label)}]));
  const ranked = [...models].sort((a,b) => b.request_count-a.request_count).slice(0,8);
  const tokenModels = [...models].filter(model => model.usage_count > 0).sort((a,b) => {const left=BigInt(a.prompt_tokens)+BigInt(a.completion_tokens); const right=BigInt(b.prompt_tokens)+BigInt(b.completion_tokens); return left === right ? 0 : left > right ? -1 : 1;}).slice(0,8).map(model => ({...model, input: Number(model.prompt_tokens), output: Number(model.completion_tokens)}));
  const allEmpty = !compact && !loading && !buckets?.length && !ranked.length && !tokenModels.length;
  if (allEmpty) {
    return (
      <section aria-label={uiT("Activity charts")} className="my-6 min-w-0" aria-busy={loading}>
        <h2 className="text-sm font-semibold">{uiT("Requests over time")}</h2>
        <Empty className="mt-3 min-h-36 rounded-xl border border-dashed border-border/60 bg-muted/20 py-7">
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
      {loading && !buckets?.length ? <p role="status" className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">{uiT("Loading activity chart…")}</p> : buckets?.length ? <ChartContainer config={config} className="h-56 w-full" aria-label={uiT("Request volume over time")}>
        <AreaChart accessibilityLayer data={buckets} margin={{left:0,right:12,top:12,bottom:0}}>
          <CartesianGrid vertical={false}/><XAxis dataKey="start_ms" tickFormatter={date} minTickGap={70} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} tickFormatter={count} tickLine={false} axisLine={false} width={40}/>
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_label, payload) => payload[0]?.payload ? `${date(payload[0].payload.start_ms)} – ${date(payload[0].payload.end_ms)}` : ''}/>}/>
          <Area type="monotone" strokeLinecap="round" strokeLinejoin="round" dataKey="request_count" stroke="var(--color-request_count)" fill="var(--color-request_count)" fillOpacity={0.12} strokeWidth={2} isAnimationActive={false}/>
        </AreaChart>
      </ChartContainer> : <Empty className="mt-3 min-h-32 rounded-xl border border-dashed border-border/60 bg-muted/20 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconChartBar size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{buckets === undefined ? uiT("Activity history unavailable.") : uiT("No requests in this range.")}</EmptyDescription></EmptyHeader></Empty>}
    </div>
    {!compact && <>
      <div className="min-w-0"><h2 className="text-sm font-semibold">{uiT("Requests by model")}</h2><p className="mt-1 mb-4 text-xs text-muted-foreground">{uiT("The eight most active models in this range.")}</p>
        {ranked.length ? <ChartContainer config={config} className="h-56 w-full" aria-label={uiT("Requests by model")}><BarChart accessibilityLayer data={ranked} layout="vertical" margin={{left:12,right:16}}><CartesianGrid horizontal={false}/><XAxis type="number" allowDecimals={false} tickFormatter={count} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="model_alias" width={120} tickLine={false} axisLine={false} tickFormatter={value => {const name=catalogTitle({id: String(value)}); return name.length > 15 ? `${name.slice(0,14)}…` : name;}}/><ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="request_count" fill="var(--color-request_count)" radius={[0,3,3,0]} maxBarSize={24} isAnimationActive={false}/></BarChart></ChartContainer> : loading ? <p role="status" className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">{uiT("Loading model activity…")}</p> : <Empty className="min-h-32 rounded-xl border border-dashed border-border/60 bg-muted/20 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconChartBar size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No model activity in this range.")}</EmptyDescription></EmptyHeader></Empty>}
      </div>
      <div className="min-w-0 lg:col-span-2"><h2 className="text-sm font-semibold">{uiT("Token volume by model")}</h2><p className="mt-1 mb-4 text-xs text-muted-foreground">{uiT("The eight models with the most reported input and output tokens. Requests with unknown usage are excluded.")}</p>
        {tokenModels.length ? <ChartContainer config={config} className="h-64 w-full" aria-label={uiT("Reported token volume by model")}><BarChart accessibilityLayer data={tokenModels} margin={{left:0,right:12}}><CartesianGrid vertical={false}/><XAxis dataKey="model_alias" tickLine={false} axisLine={false} minTickGap={30} tickFormatter={value => {const name=catalogTitle({id: String(value)}); return name.length > 18 ? `${name.slice(0,17)}…` : name;}}/><YAxis tickFormatter={count} tickLine={false} axisLine={false} width={45}/><ChartTooltip content={<ChartTooltipContent/>}/><ChartLegend content={<ChartLegendContent/>}/><Bar dataKey="input" stackId="tokens" fill="var(--color-input)" maxBarSize={48} isAnimationActive={false}/><Bar dataKey="output" stackId="tokens" fill="var(--color-output)" radius={[3,3,0,0]} maxBarSize={48} isAnimationActive={false}/></BarChart></ChartContainer> : loading ? <p role="status" className="flex h-44 items-center justify-center px-4 text-center text-sm text-muted-foreground">{uiT("Loading token activity…")}</p> : <Empty className="min-h-32 rounded-xl border border-dashed border-border/60 bg-muted/20 py-6"><EmptyHeader><EmptyMedia variant="icon"><IconChartBar size={18} aria-hidden="true" /></EmptyMedia><EmptyDescription>{uiT("No reported token usage in this range.")}</EmptyDescription></EmptyHeader></Empty>}
      </div>
    </>}
  </section>;
}
