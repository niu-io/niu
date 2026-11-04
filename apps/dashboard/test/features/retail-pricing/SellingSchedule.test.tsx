import {expect,it} from 'vitest';
import {render,screen,within} from '@testing-library/react';
import {SellingSchedule} from '../../../app/features/retail-pricing/schedule';
import type {RetailSchedule} from '@niu-io/sdk/admin';
const text: RetailSchedule={kind:'text',prompt_rate:'1000000000',completion_rate:'2000000000',cached_prompt_rate:null,cache_write_prompt_rate:null,reasoning_completion_rate:null,request_fee_nanos:'0',minimum_charge_nanos:'0',context_tiers:[{minimum_input_tokens:'32000',prompt_rate:'3000000000',completion_rate:'4000000000',cached_prompt_rate:null,cache_write_prompt_rate:null,reasoning_completion_rate:null}]};
it('presents text rates and context tiers with their units and missing-rate semantics',()=>{
 render(<SellingSchedule schedule={text} currency="USD"/>);const table=screen.getByRole('table',{name:'Selling price details'});
 expect(within(table).getByText('Context tier: 32000 tokens')).toBeTruthy();expect(within(table).getByText('$3.00')).toBeTruthy();expect(within(table).getAllByText('Not separately priced')).toHaveLength(6);
});
it('retains exact media price, minimum and rounding in the detailed table',()=>{
 const schedule:RetailSchedule={kind:'media',dimensions:{model:'fixture',channel:'channel',resolution:'720p',reference_video:true},meter:'seconds',decimal_places:2,amount_units:'123',per_quantity:{numerator:'3',denominator:'2'},minimum_quantity:{numerator:'1',denominator:'2'},rounding:'HalfEven'};
 render(<SellingSchedule schedule={schedule} currency="USD"/>);const table=screen.getByRole('table',{name:'Selling price details'});
 expect(within(table).getByText('USD 1.23 / 3/2 seconds')).toBeTruthy();expect(within(table).getByText('1/2')).toBeTruthy();expect(within(table).getByText('HalfEven')).toBeTruthy();expect(within(table).getByText(/720p/)).toBeTruthy();
});
it('keeps compact schedules suitable for a parent table cell',()=>{render(<SellingSchedule schedule={text} currency="USD" compact/>);expect(screen.queryByRole('table')).toBeNull();expect(screen.getByText(/Input \/ 1M tokens: \$1.00/)).toBeTruthy();});
