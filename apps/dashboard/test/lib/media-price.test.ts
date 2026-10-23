import { describe, it, expect } from 'vitest';
import { mediaPriceExample } from '../../src/lib/media-price';
describe('media price examples',()=>{
  it('preserves sub-cent prices without floating point',()=>expect(mediaPriceExample('0.00000007',9,'1000000','0','1000000','HalfEven')).toBe('0.000000070'));
  it('applies a minimum floor rather than adding it',()=>expect(mediaPriceExample('2',2,'10','20','10','HalfEven')).toBe('4.00'));
  it.each([['Down','0'],['Up','1'],['HalfEven','0']] as const)('rounds half a unit using %s', (rounding,expected)=>expect(mediaPriceExample('1',0,'2','0','1',rounding)).toBe(expected));
  it('rounds an odd half to an even unit',()=>expect(mediaPriceExample('3',0,'2','0','1','HalfEven')).toBe('2'));
});
