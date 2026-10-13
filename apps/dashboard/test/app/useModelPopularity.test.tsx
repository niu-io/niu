import {renderHook} from '@testing-library/react';
import {it,expect} from 'vitest';
import {useModelPopularity} from '@/app/useModelPopularity';
import type {Model} from '@/app/dashboard-context';
it('updates metadata and customer pricing when a workspace returns the same model IDs',()=>{
 const first:Model={id:'openai/example',public_catalog:true,catalog:{name:'Original'},customer_pricing:{currency:'USD',unit:'nanounits_per_million_tokens',prompt_rate:'100',completion_rate:'200'}};
 const next:Model={...first,catalog:{name:'Updated'},customer_pricing:{...first.customer_pricing!,prompt_rate:'300'}};
 const {result,rerender}=renderHook(({models})=>useModelPopularity(models,''),{initialProps:{models:[first]}});
 rerender({models:[next]});
 expect(result.current.models[0].catalog?.name).toBe('Updated');
 expect(result.current.models[0].customer_pricing?.prompt_rate).toBe('300');
});
