import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect} from 'vitest';
import VideoBilling from '@/features/video/VideoBilling';
import type {VideoJobBilling} from '../../../../../sdks/javascript/src/index';
const q=(numerator:string)=>({numerator,denominator:'1'});
const billing:VideoJobBilling={mode:'customer',state:'reconciliation_required',currency:'CNY',reserved_nanos:'0',charge_nanos:'9007199254740993',usage:null,settled_usage:{meter:'video_tokens',quantity:q('9007199254740995'),billable_quantity:q('9007199254740996'),provenance:'Reported'},bound_exceeded:false,effective_output:null,estimate:null,price:{meter:'video_tokens',amount_units:'123456789',decimal_places:9,per_quantity:q('1000000'),minimum_quantity:q('1'),rounding:'HalfEven',resolution:'720p',reference_video:false,effective_from:'10',effective_until:null,discounts:[{multiplier:{numerator:'4',denominator:'5'},stacking:'Multiply',effective_from:'10',effective_until:null}]}};
it('keeps exact settled quantities and customer rates distinct from unresolved observations',async()=>{
 render(<VideoBilling billing={billing}/>);
 expect(screen.getByText('CNY 9007199.254740993')).toBeDefined();
 expect(screen.getByText('9007199254740995 video tokens')).toBeDefined();
 expect(screen.getByText(/Billing needs reconciliation/)).toBeDefined();
 expect(screen.queryByText(/Original customer rate/)).toBeNull();
 await userEvent.setup().click(screen.getByRole('button',{name:'Charge calculation'}));
 expect(screen.getByText('CNY 0.123456789 / 1000000 video tokens')).toBeDefined();
 expect(screen.getByText('9007199254740996 video tokens')).toBeDefined();
 expect(screen.getByText('× 4/5')).toBeDefined();
 expect(screen.getByText('Nearest, ties to even')).toBeDefined();
});
it('keeps unknown and owner-funded amounts distinct from zero',()=>{
 render(<VideoBilling billing={{...billing,mode:'owner_funded',state:'owner_funded',currency:null,charge_nanos:null,settled_usage:null,price:null}}/>);
 expect(screen.getByText('Own Supplier account')).toBeDefined();
 expect(screen.queryByRole('button',{name:'Charge calculation'})).toBeNull();
});
it('does not hide qualified zero charges or turn pending liability into a charge',()=>{
 render(<VideoBilling billing={{...billing,state:'awaiting_usage',charge_nanos:null,reserved_nanos:'1000000000',settled_usage:null,price:null}}/>);
 expect(screen.getByText('Not settled')).toBeDefined();
 expect(screen.getByText('CNY 1.00')).toBeDefined();
 expect(screen.getByText(/final charge is unknown/)).toBeDefined();
});
it('shows a posted zero charge as zero rather than unknown',()=>{
 render(<VideoBilling billing={{...billing,state:'settled',charge_nanos:'0',settled_usage:{meter:'video_tokens',quantity:q('0'),billable_quantity:q('0'),provenance:'Reported'},price:null}}/>);
 expect(screen.getByText('CNY 0.00')).toBeDefined();
 expect(screen.getByText('0 video tokens')).toBeDefined();
 expect(screen.queryByText('Not settled')).toBeNull();
});
