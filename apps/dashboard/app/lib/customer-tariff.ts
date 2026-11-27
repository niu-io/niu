import type { CustomerPricing, CustomerUnitPricing } from '@/shell/dashboard-context';
import { formatExactUnitAtoms, money } from './money';

export function requestCharges(price?: CustomerPricing | CustomerUnitPricing | null) {
  if (!price) return [];
  const credits = 'unit_name' in price;
  const entries = [
    ['Request fee', credits ? price.request_fee_atoms : price.request_fee_nanos],
    ['Minimum charge', credits ? price.minimum_charge_atoms : price.minimum_charge_nanos],
  ] as const;
  return entries.flatMap(([label, value]) => value && value !== '0' ? [{
    label, amount: credits ? formatExactUnitAtoms(value, price.unit_name, price.display_precision) : money(value, price.currency),
  }] : []);
}
