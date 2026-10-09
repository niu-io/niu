import {useState} from 'react';
import { IconChevronDown as ChevronDown } from '@tabler/icons-react';
import type {VideoJobBilling} from '../../../../../sdks/javascript/src/index';
import {money} from '@/lib/money';
import {Button} from '@/components/ui/button';
import {Collapsible,CollapsibleTrigger,CollapsibleContent} from '@/components/ui/collapsible';
const quantity=(value:{numerator:string;denominator:string})=>value.denominator === '1' ? value.numerator:`${value.numerator}/${value.denominator}`;
const meter=(value:string)=>value === 'video_tokens' ? 'video tokens':value === 'seconds' ? 'seconds':'billing units';
function rate(units:string,places:number,currency:string) {
 const value=BigInt(units);const scale=10n**BigInt(places);
 const fraction=(value%scale).toString().padStart(places,'0').replace(/0+$/,'');
 return `${currency} ${value/scale}${fraction ? '.'+fraction:'.00'}`;
}
export default function VideoBilling({billing}:{billing:VideoJobBilling}) {
 const [open,setOpen]=useState(false);
 const charge=billing.charge_nanos != null && billing.currency ? money(billing.charge_nanos,billing.currency):billing.mode === 'owner_funded' ? 'Own Supplier account':'Not settled';
 const usage=billing.settled_usage ?? billing.usage;
 return <div className="video-output">
 {billing.state === 'reconciliation_required' && <p role="status" className="video-muted">Billing needs reconciliation. Any posted charge below retains its original settlement quantity.</p>}
 {billing.state === 'awaiting_usage' && <p className="video-muted">Waiting for reported usage. The final charge is unknown.</p>}
 {billing.state === 'awaiting_settlement' && <p className="video-muted">Usage received; the customer charge has not been posted.</p>}
 <dl className="video-billing"><dt>Customer charge</dt><dd>{charge}</dd>
 {billing.reserved_nanos != null && billing.currency && billing.reserved_nanos !== '0' && <><dt>Reserved</dt><dd>{money(billing.reserved_nanos,billing.currency)}</dd></>}
 {billing.estimate?.amount_nanos != null && billing.estimate.currency && <><dt>Original estimate</dt><dd>{money(billing.estimate.amount_nanos,billing.estimate.currency)}</dd></>}
 {usage && <><dt>{billing.settled_usage ? 'Settled usage':'Reported usage'}</dt><dd>{quantity(usage.quantity)} {meter(usage.meter)}</dd></>}
 {billing.effective_output && <><dt>Output</dt><dd>{billing.effective_output.specification.resolution} · {billing.effective_output.duration_seconds}s · {billing.effective_output.frames_per_second} FPS</dd></>}
 </dl>
 {billing.price && billing.currency && <Collapsible open={open} onOpenChange={setOpen}><CollapsibleTrigger asChild><Button variant="ghost" className="video-calculation-trigger">Charge calculation<ChevronDown size={14} className={open ? "rotate-180":""}/></Button></CollapsibleTrigger><CollapsibleContent><dl className="video-billing video-calculation">
 <dt>Original customer rate</dt><dd>{rate(billing.price.amount_units,billing.price.decimal_places,billing.currency)} / {quantity(billing.price.per_quantity)} {meter(billing.price.meter)}</dd>
 {billing.settled_usage && <><dt>Billable quantity</dt><dd>{quantity(billing.settled_usage.billable_quantity)} {meter(billing.settled_usage.meter)}</dd></>}
 {billing.price.minimum_quantity.numerator !== '0' && <><dt>Minimum quantity</dt><dd>{quantity(billing.price.minimum_quantity)} {meter(billing.price.meter)}</dd></>}
 {billing.price.discounts.map((discount,index)=><div className="video-discount" key={index}><dt>Applied discount{billing.price!.discounts.length>1 ? ` ${index+1}`:''}</dt><dd>× {quantity(discount.multiplier)}</dd></div>)}
 <dt>Rounding</dt><dd>{billing.price.rounding === 'HalfEven' ? 'Nearest, ties to even':billing.price.rounding === 'Up' ? 'Up':'Down'}</dd>
 </dl><p className="video-muted">Uses the customer rate saved at submission. Estimates and reserved funds are separate from the posted charge.</p></CollapsibleContent></Collapsible>}
 </div>;
}
