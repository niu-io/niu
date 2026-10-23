import { describe, expect, it } from 'vitest';
import { amountFromNanos, amountToNanos, formatFinancialMoney, formatRateMoney, money } from '../../src/lib/money.ts';

describe('money formatting', () => {
  it('retains nanounits beyond Number precision', () => {
    expect(money('9007199254740993', 'USD')).toBe('$9007199.254740993');
    expect(money('9223372036854775807', 'USD')).toBe('$9223372036.854775807');
    expect(money('1', 'EUR')).toBe('€0.000000001');
    expect(money('0', 'USD')).toBe('$0.00');
    expect(money('-1', 'USD')).toBe('-$0.000000001');
  });

  it('formats financial and rate amounts with exact sub-4-decimal nanounits and comma grouping', () => {
    expect(formatFinancialMoney('800000000', 'USD')).toBe('$0.8000');
    expect(formatFinancialMoney('100000000000', 'USD')).toBe('$100.0000');
    expect(formatFinancialMoney('12345', 'USD')).toBe('$0.000012345');
    expect(formatFinancialMoney('-1', 'USD')).toBe('-$0.000000001');
    expect(formatFinancialMoney('9223372036854775807', 'USD')).toBe('$9,223,372,036.854775807');
    expect(formatRateMoney('3000000', 'USD')).toBe('$0.003');
    expect(formatRateMoney('2400000000', 'USD')).toBe('$2.40');
    expect(amountFromNanos('12345')).toBe('0.000012345');
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
