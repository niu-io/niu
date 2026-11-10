import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Link } from 'react-router';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import type { PlatformPricingHealth } from '@niu-io/sdk/admin';
export type PricingHealth = PlatformPricingHealth;

/** Confidential platform price diagnostics; never use in customer surfaces. */
export function PricingHealthNotice({ health }: { health?: PricingHealth }) {
  const { t: uiT, format: uiF } = useUILocale();
  const checks = health?.checks;
  const below = checks?.some(check => check.status === 'below_cost');
  const missing = checks?.some(check => check.status === 'missing_provider_price');
  const unknown = !checks?.length || checks.some(check => check.status === 'comparison_unavailable');
  const label = below ? uiT("Below Provider cost") : missing ? uiT("Provider price missing") : unknown ? uiT("Comparison unavailable") : uiT("No lower unit rates");
  return <div className="flex min-w-36 max-w-sm flex-wrap items-center gap-1 whitespace-normal">
    <Badge variant={below || missing ? 'destructive' : 'outline'} className="whitespace-normal">{(below || missing) && <IconAlertTriangle size={14} />}{label}</Badge>
    <Dialog><DialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={uiT("Price check details")} title={uiT("Price check details")}><IconInfoCircle /></Button></DialogTrigger><DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{uiT("Current configuration advice. Refresh after changing prices. Below-cost rates do not block publication.")}</DialogDescription></DialogHeader><div className="space-y-3 text-sm">
      {!checks?.length && <p>{uiT("Refresh prices to load current Provider comparisons.")}</p>}
      {checks?.map((check, index) => <div key={index} className="space-y-1">
        {(check.provider || check.route) && <p className="font-medium break-words">{[check.provider, check.route].filter(Boolean).join(' · ')}</p>}
        {check.status === 'below_cost' && <p className="font-medium">{uiT("Selling unit rates are below Provider cost. Review the selling price or Provider quote.")}</p>}
        {check.dimensions.map((item, i) => <p key={i}>{item.dimension} · {item.minimum_input_tokens === '0' ? uiT("Base rate") : uiF("From {0} input tokens", [BigInt(item.minimum_input_tokens).toLocaleString(readUILocale())])}</p>)}
        {check.message && <p className="text-muted-foreground">{check.message}</p>}
      </div>)}
      <Button asChild variant="link" className="h-auto p-0"><Link to="/admin/providers">{uiT("Review Provider prices")}</Link></Button>
    </div></DialogContent></Dialog>
  </div>;
}
