import { describe, expect, it } from 'vitest';
import { amountToNanos, money } from '../../src/lib/money.ts';

describe('money formatting', () => {
  it('retains nanounits beyond Number precision', () => {
    expect(money('9007199254740993', 'USD')).toBe('USD 9007199.254740993');
    expect(money('9223372036854775807', 'USD')).toBe('USD 9223372036.854775807');
    expect(money('1', 'EUR')).toBe('EUR 0.000000001');
    expect(money('0', 'USD')).toBe('USD 0.00');
    expect(money('-1', 'USD')).toBe('USD -0.000000001');
  });
});

describe('cash amount input', () => {
  it('converts decimal amounts to exact nanounits', () => {
    expect(amountToNanos('9007199.254740993')).toBe('9007199254740993');
    expect(amountToNanos('0.000000001')).toBe('1');
    expect(amountToNanos('1250.12')).toBe('1250120000000');
  });

  it('rejects zero, excess precision and values outside PostgreSQL BIGINT', () => {
    for (const value of ['0', '0.000000000', '1e3', '1.0000000001', '9223372036.854775808']) {
      expect(() => amountToNanos(value)).toThrow();
    }
  });
});
