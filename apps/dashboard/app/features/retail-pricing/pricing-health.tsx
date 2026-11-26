import { readLocale as readUILocale } from '@/shell/ui-locale';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import { Link } from 'react-router';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import type { PlatformPricingHealth } from '@niu-io/sdk/admin';
export type PricingHealth = PlatformPricingHealth;
export type PricingSupplyState = 'active' | 'inactive' | 'unconfigured' | 'unknown';

export function supplyStateOf(health?: PricingHealth): PricingSupplyState {
  if (health?.supply_status === 'active' || health?.supply_status === 'inactive' || health?.supply_status === 'unconfigured') {
    return health.supply_status;
  }
  return 'unknown';
}

/** Confidential platform price diagnostics; never use in customer surfaces. */
export function PricingHealthNotice({ health }: { health?: PricingHealth }) {
  const { t: uiT, format: uiF } = useUILocale();
  const checks = health?.checks;
  const supply = supplyStateOf(health);
  const unsupplied = supply === 'inactive' || supply === 'unconfigured';
  const below = !unsupplied && checks?.some(check => check.status === 'below_cost');
  const missing = !unsupplied && checks?.some(check => check.status === 'missing_provider_price');
  const unknown = !checks?.length || checks.some(check => check.status === 'comparison_unavailable');
  const label = below
    ? uiT("Below Provider cost")
    : missing
      ? uiT("Provider price missing")
      : supply === 'unconfigured'
        ? uiT("No active supply", "无可用供应")
        : supply === 'inactive'
          ? uiT("Supply inactive", "供应已停用")
          : unknown
            ? uiT("Comparison unavailable")
            : uiT("No lower unit rates", "正常（不低于成本）");
  return <div className="flex min-w-0 sm:min-w-36 max-w-sm flex-wrap items-center gap-1 whitespace-normal">
    <Badge variant={below || missing ? 'destructive' : 'outline'} className="h-auto max-w-full whitespace-normal break-words text-left">{(below || missing) && <IconAlertTriangle size={14} />}{label}</Badge>
    <Dialog><DialogTrigger asChild><Button type="button" variant="ghost" size="icon-sm" aria-label={uiT("Price check details")} title={uiT("Price check details")}><IconInfoCircle /></Button></DialogTrigger><DialogContent className="w-[calc(100vw-2rem)] sm:max-w-xl"><DialogHeader><DialogTitle>{label}</DialogTitle><DialogDescription>{uiT("Current configuration advice. Refresh after changing prices. Below-cost rates do not block publication.")}</DialogDescription></DialogHeader><div className="space-y-3 text-sm">
      {supply === 'unconfigured' && (
        <p className="text-muted-foreground">
          {uiT(
            "No commercial Provider route currently supplies this model. This saved standard price stays on record, but customers cannot invoke the model until supply is enabled in Providers.",
            "当前没有任何商业供应商路由提供该模型。这条标准售价仅保留在价目表中，客户无法调用，直到在「模型供应商」中启用供应。",
          )}
        </p>
      )}
      {supply === 'inactive' && (
        <p className="text-muted-foreground">
          {uiT(
            "A Provider route exists for this model, but its connection, API key, model route, or offer is currently disabled or unapproved. Customers cannot invoke it until supply is active.",
            "该模型存在已配置的供应商路由，但对应的连接、API 密钥、模型路由或报价当前未启用或未生效，客户暂无法调用。",
          )}
        </p>
      )}
      {!checks?.length && <p>{uiT("Refresh prices to load current Provider comparisons.")}</p>}
      {checks?.map((check, index) => <div key={index} className="space-y-1">
        {(check.provider || check.route) && <p className="font-medium break-words">{[check.provider, check.route].filter(Boolean).join(' · ')}</p>}
        {check.status === 'below_cost' && <p className="font-medium">{uiT("Selling unit rates are below Provider cost. Review the selling price or Provider quote.")}</p>}
        {check.dimensions.map((item, i) => <p key={i}>{uiT(item.dimension)} · {item.minimum_input_tokens === '0' ? uiT("Base rate") : uiF("From {0} input tokens", [BigInt(item.minimum_input_tokens).toLocaleString(readUILocale())])}</p>)}
        {check.message && <p className="text-muted-foreground">{uiT(check.message)}</p>}
      </div>)}
      <Button asChild variant="link" className="h-auto p-0"><Link to="/admin/providers">{uiT("Review Provider prices")}</Link></Button>
    </div></DialogContent></Dialog>
  </div>;
}
