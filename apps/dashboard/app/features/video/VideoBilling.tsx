import { useLocale as useUILocale } from '@/shell/ui-locale';
import {useState} from 'react';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import type {VideoJobBilling} from '@niu-io/sdk';
import {formatExactUnitAtoms,formatUnitAtoms,money,currencySymbol} from '@/lib/money';
import {usePlatformCurrency} from '@/shell/platform-currency';
import {Button} from '@/components/ui/button';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
const quantity=(value:{numerator:string;denominator:string})=>value.denominator === '1' ? value.numerator:`${value.numerator}/${value.denominator}`;
const meter=(value:string)=>value === 'video_tokens' ? 'video tokens':value === 'seconds' ? 'seconds':'billing units';
function rate(units:string,places:number,currency:string) {
 const value=BigInt(units);const scale=10n**BigInt(places);
 const fraction=(value%scale).toString().padStart(places,'0').replace(/0+$/,'');
 const symbol=currencySymbol(currency);
 const prefix=/^[A-Z]{3}$/.test(symbol) ? symbol+' ' : symbol;
 return `${prefix}${value/scale}${fraction ? '.'+fraction:'.00'}`;
}
type ExtendedVideoBilling = VideoJobBilling & {
 unit_code?: string | null;
 reserved_atoms?: string | null;
 charge_atoms?: string | null;
 estimate?: (NonNullable<VideoJobBilling['estimate']> & { unit_code?: string | null; amount_atoms?: string | null }) | null;
 price?: (NonNullable<VideoJobBilling['price']> & { unit_code?: string | null; amount_atoms?: string | null }) | null;
};
export default function VideoBilling({billing: rawBilling}:{billing:VideoJobBilling}) {
  const { t: uiT, format: uiF } = useUILocale();
 const billing = rawBilling as ExtendedVideoBilling;
 const {unit: platformUnit}=usePlatformCurrency();
 const [open,setOpen]=useState(false);
 const unitPrecision=platformUnit?.display_precision ?? 2;
 const unitName=billing.unit_code ?? billing.price?.unit_code ?? billing.estimate?.unit_code ?? platformUnit?.name ?? 'Credits';
 const charge=billing.charge_atoms != null && billing.unit_code
  ? `${formatUnitAtoms(billing.charge_atoms,billing.unit_code,unitPrecision)} (${formatExactUnitAtoms(billing.charge_atoms,billing.unit_code,unitPrecision)})`
  : billing.charge_nanos != null && billing.currency
   ? money(billing.charge_nanos,billing.currency)
   : billing.mode === 'owner_funded' ? uiT("Own Provider account"):uiT("Not settled");
 const usage=billing.settled_usage ?? billing.usage;
 return <div className="video-output">
 {billing.state === 'reconciliation_required' && <p role="status" className="video-muted">{uiT("Billing needs reconciliation. Any posted charge below retains its original settlement quantity.")}</p>}
 {billing.state === 'awaiting_usage' && <p className="video-muted">{uiT("Waiting for reported usage. The final charge is unknown.")}</p>}
 {billing.state === 'awaiting_settlement' && <p className="video-muted">{uiT("Usage received; the customer charge has not been posted.")}</p>}
 <dl className="video-billing"><dt>{uiT("Customer charge")}</dt><dd>{charge}</dd>
 {billing.reserved_atoms != null && billing.unit_code && billing.reserved_atoms !== '0' ? <><dt>{uiT("Reserved")}</dt><dd>{formatUnitAtoms(billing.reserved_atoms,billing.unit_code,unitPrecision)}</dd></> : billing.reserved_nanos != null && billing.currency && billing.reserved_nanos !== '0' && <><dt>{uiT("Reserved")}</dt><dd>{money(billing.reserved_nanos,billing.currency)}</dd></>}
 {billing.estimate?.amount_atoms != null && (billing.estimate.unit_code || billing.unit_code) ? <><dt>{uiT("Original estimate")}</dt><dd>{formatUnitAtoms(billing.estimate.amount_atoms,billing.estimate.unit_code ?? unitName,unitPrecision)}</dd></> : billing.estimate?.amount_nanos != null && billing.estimate.currency && <><dt>{uiT("Original estimate")}</dt><dd>{money(billing.estimate.amount_nanos,billing.estimate.currency)}</dd></>}
 {usage && <><dt>{billing.settled_usage ? uiT("Settled usage"):uiT("Reported usage")}</dt><dd>{quantity(usage.quantity)} {uiT(meter(usage.meter))}</dd></>}
 {billing.effective_output && <><dt>{uiT("Output")}</dt><dd>{billing.effective_output.specification.resolution} · {billing.effective_output.duration_seconds}s{billing.effective_output.frames_per_second != null && uiF(" · {0} FPS", [billing.effective_output.frames_per_second])}</dd></>}
 </dl>
 {billing.price && (billing.currency || billing.price.unit_code || billing.unit_code) && <Collapsible open={open} onOpenChange={setOpen}><CollapsibleTrigger asChild><Button variant="ghost" className="video-calculation-trigger">{uiT("Charge calculation")}<ChevronDown size={14} className={open ? "rotate-180":""}/></Button></CollapsibleTrigger><CollapsibleContent><dl className="video-billing video-calculation">
 <dt>{uiT("Original customer rate")}</dt><dd>{billing.price.amount_atoms != null ? formatExactUnitAtoms(billing.price.amount_atoms,billing.price.unit_code ?? unitName,unitPrecision) : rate(billing.price.amount_units,billing.price.decimal_places,billing.currency ?? 'USD')} / {quantity(billing.price.per_quantity)} {uiT(meter(billing.price.meter))}</dd>
 {billing.settled_usage && <><dt>{uiT("Billable quantity")}</dt><dd>{quantity(billing.settled_usage.billable_quantity)} {uiT(meter(billing.settled_usage.meter))}</dd></>}
 {billing.price.minimum_quantity.numerator !== '0' && <><dt>{uiT("Minimum quantity")}</dt><dd>{quantity(billing.price.minimum_quantity)} {uiT(meter(billing.price.meter))}</dd></>}
 {billing.price.discounts.map((discount,index)=><div className="video-discount" key={index}><dt>{uiT("Applied discount")}{billing.price!.discounts.length>1 ? ` ${index+1}`:''}</dt><dd>× {quantity(discount.multiplier)}</dd></div>)}
 <dt>{uiT("Rounding")}</dt><dd>{billing.price.rounding === 'HalfEven' ? uiT("Nearest, ties to even"):billing.price.rounding === 'Up' ? uiT("Up"):uiT("Down")}</dd>
 </dl><p className="video-muted">{uiT("Uses the customer rate saved at submission. Estimates and reserved funds are separate from the posted charge.")}</p></CollapsibleContent></Collapsible>}
 </div>;
}
