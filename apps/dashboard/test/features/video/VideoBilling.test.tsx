import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect} from 'vitest';
import VideoBilling from '@/features/video/VideoBilling';
import type {VideoJobBilling} from '@niu-io/sdk';
const q=(numerator:string,denominator='1')=>({numerator,denominator});
const billing:VideoJobBilling={mode:'customer',state:'reconciliation_required',currency:'CNY',reserved_nanos:'0',charge_nanos:'9007199254740993',usage:null,settled_usage:{meter:'video_tokens',quantity:q('9007199254740995'),billable_quantity:q('9007199254740996'),provenance:'Reported'},bound_exceeded:false,effective_output:null,estimate:null,price:{meter:'video_tokens',amount_units:'123456789',decimal_places:9,per_quantity:q('1000000'),minimum_quantity:q('1'),rounding:'HalfEven',resolution:'720p',reference_video:false,effective_from:'10',effective_until:null,discounts:[{multiplier:{numerator:'4',denominator:'5'},stacking:'Multiply',effective_from:'10',effective_until:null}]}};
it('keeps settled quantities and customer rates exact while omitting fraction and rounding jargon',async()=>{
 render(<VideoBilling billing={billing}/>);
 expect(screen.getByText('¥9007199.254740993')).toBeDefined();
 expect(screen.getByText('9,007,199,254,740,995 video tokens')).toBeDefined();
 expect(screen.getByText(/Billing needs reconciliation/)).toBeDefined();
 expect(screen.queryByText(/Original customer rate/)).toBeNull();
 await userEvent.setup().click(screen.getByRole('button',{name:'Charge calculation'}));
 expect(screen.getByText('¥0.123456789 / 1,000,000 video tokens')).toBeDefined();
 expect(screen.getByText('9,007,199,254,740,996 video tokens')).toBeDefined();
 expect(screen.getByText('20% discount')).toBeDefined();
 expect(screen.queryByText('4/5')).toBeNull();
 expect(screen.queryByText(/Rounding/)).toBeNull();
 expect(screen.queryByText('Nearest, ties to even')).toBeNull();
});
it('shows a human-readable credit charge once instead of an atom-precision duplicate',()=>{
 const credits={...billing,state:'settled',currency:null,charge_nanos:null,reserved_nanos:null,settled_usage:null,usage:null,price:null,effective_output:null,estimate:null,unit_code:'Credits',charge_atoms:'10123456789',reserved_atoms:'1000000000'} as unknown as VideoJobBilling;
 render(<VideoBilling billing={credits}/>);
 expect(screen.getByText('10.12 Credits')).toBeDefined();
 expect(screen.getByText('1.00 Credits')).toBeDefined();
 expect(screen.queryByText(/10\.123456789/)).toBeNull();
 expect(screen.queryByText(/\(10\./)).toBeNull();
});
it('keeps a positive sub-quantum credit charge visible instead of rounding it to zero',()=>{
 const credits={...billing,state:'settled',currency:null,charge_nanos:null,reserved_nanos:null,settled_usage:null,usage:null,price:null,effective_output:null,estimate:null,unit_code:'Credits',charge_atoms:'1'} as unknown as VideoJobBilling;
 render(<VideoBilling billing={credits}/>);
 expect(screen.getByText('< 0.01 Credits')).toBeDefined();
});
it('renders rational usage and discounts as readable values without numerator/denominator pairs',async()=>{
 const rational={...billing,settled_usage:{meter:'video_tokens',quantity:q('2','3'),billable_quantity:q('2','3'),provenance:'Reported' as const},price:{...billing.price!,per_quantity:q('1','4'),discounts:[{multiplier:{numerator:'1',denominator:'3'},stacking:'Multiply' as const,effective_from:'10',effective_until:null}]}};
 render(<VideoBilling billing={rational}/>);
 expect(screen.getByText('≈ 0.667 video tokens')).toBeDefined();
 await userEvent.setup().click(screen.getByRole('button',{name:'Charge calculation'}));
 expect(screen.getByText('¥0.123456789 / 0.25 video tokens')).toBeDefined();
 expect(screen.getByText('66.67% discount')).toBeDefined();
 expect(screen.queryByText(/2\/3|1\/4|1\/3/)).toBeNull();
});
it('formats output duration as readable time',()=>{
 const output={...billing,state:'settled' as const,effective_output:{specification:{resolution:'720p',ratio:'16:9',width:1280,height:720},duration_seconds:90,frames_per_second:24,schema_revision:'1',estimator:'OutputSecondsV1' as const,estimator_revision:'1'}};
 render(<VideoBilling billing={output}/>);
 expect(screen.getByText('720p · 1 min 30 s · 24 FPS')).toBeDefined();
});
it('keeps unknown and owner-funded amounts distinct from zero',()=>{
 render(<VideoBilling billing={{...billing,mode:'owner_funded',state:'owner_funded',currency:null,charge_nanos:null,settled_usage:null,price:null}}/>);
 expect(screen.getByText('Own Provider account')).toBeDefined();
 expect(screen.queryByRole('button',{name:'Charge calculation'})).toBeNull();
});
it('does not hide qualified zero charges or turn pending liability into a charge',()=>{
 render(<VideoBilling billing={{...billing,state:'awaiting_usage',charge_nanos:null,reserved_nanos:'1000000000',settled_usage:null,price:null}}/>);
 expect(screen.getByText('Not settled')).toBeDefined();
 expect(screen.getByText('¥1.00')).toBeDefined();
 expect(screen.getByText(/final charge is unknown/)).toBeDefined();
});
it('shows a posted zero charge as zero rather than unknown',()=>{
 render(<VideoBilling billing={{...billing,state:'settled',charge_nanos:'0',settled_usage:{meter:'video_tokens',quantity:q('0'),billable_quantity:q('0'),provenance:'Reported'},price:null}}/>);
 expect(screen.getByText('¥0.00')).toBeDefined();
 expect(screen.getByText('0 video tokens')).toBeDefined();
 expect(screen.queryByText('Not settled')).toBeNull();
});
