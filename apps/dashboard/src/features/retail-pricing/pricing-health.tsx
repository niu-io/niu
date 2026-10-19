import { Link } from 'react-router';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import type { PlatformPricingHealth } from '../../../../../sdks/javascript/src/admin';
export type PricingHealth = PlatformPricingHealth;

/** Confidential platform price diagnostics; never use in customer surfaces. */
export function PricingHealthNotice({ health }: { health?: PricingHealth }) {
  const checks = health?.checks;
  const below = checks?.some(check => check.status === 'below_cost');
  const missing = checks?.some(check => check.status === 'missing_provider_price');
  const unknown = !checks?.length || checks.some(check => check.status === 'comparison_unavailable');
  const label = below ? 'Below Provider cost' : missing ? 'Provider price missing' : unknown ? 'Comparison unavailable' : 'No lower unit rates';
  return <div className="flex min-w-44 max-w-sm flex-col items-start gap-2 whitespace-normal">
    <Badge variant={below || missing ? 'destructive' : 'outline'} className="whitespace-normal">{(below || missing) && <IconAlertTriangle size={14} />}{label}</Badge>
    <Dialog><DialogTrigger asChild><Button type="button" variant="link" className="h-auto p-0">Price check details</Button></DialogTrigger><DialogContent className="w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>Current configuration advice. Refresh after changing prices. Below-cost rates do not block publication.</DialogDescription></DialogHeader><div className="space-y-3 text-sm">
      {!checks?.length && <p>Refresh prices to load current Provider comparisons.</p>}
      {checks?.map((check, index) => <div key={index} className="space-y-1">
        {(check.provider || check.route) && <p className="font-medium break-words">{[check.provider, check.route].filter(Boolean).join(' · ')}</p>}
        {check.status === 'below_cost' && <p className="font-medium">Selling unit rates are below Provider cost. Review the selling price or Provider quote.</p>}
        {check.dimensions.map((item, i) => <p key={i}>{item.dimension} · {item.minimum_input_tokens === '0' ? 'Base rate' : `From ${BigInt(item.minimum_input_tokens).toLocaleString()} input tokens`}</p>)}
        {check.message && <p className="text-muted-foreground">{check.message}</p>}
      </div>)}
      <Button asChild variant="link" className="h-auto p-0"><Link to="/admin/providers">Review Provider prices</Link></Button>
    </div></DialogContent></Dialog>
  </div>;
}
