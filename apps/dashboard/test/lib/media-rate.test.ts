import { describe, expect, it } from 'vitest';
import {
  discountMultiplier, discountPercent, formatMediaAmount, formatMediaQuantity, mediaMeterName,
  mediaRateBasis, parseMediaPrice, parseMediaQuantity, quantityText,
} from '../../app/lib/media-rate';

describe('standard decimal media prices', () => {
  it('keeps sub-cent prices exact with a derived scale', () => {
    expect(parseMediaPrice('0.00000007')).toEqual({ amountUnits: '7', decimalPlaces: 8 });
    expect(formatMediaAmount('7', 8)).toBe('0.00000007');
  });
  it('drops trailing zeros instead of treating them as precision', () => {
    expect(parseMediaPrice('80.00')).toEqual({ amountUnits: '80', decimalPlaces: 0 });
    expect(parseMediaPrice('0.0500')).toEqual({ amountUnits: '5', decimalPlaces: 2 });
    expect(formatMediaAmount('80', 0)).toBe('80');
  });
  it('rejects prices beyond the supported exact range', () => {
    expect(() => parseMediaPrice('0.0000000001')).toThrow(/at most 9 decimal places/);
    expect(() => parseMediaPrice('9007199254740992')).toThrow(/supported range/);
    expect(() => parseMediaPrice('-1')).toThrow();
  });
});

describe('exact media quantities', () => {
  it('parses only standard decimals and reduces exactly', () => {
    expect(parseMediaQuantity('200000', false)).toEqual({ numerator: '200000', denominator: '1' });
    expect(parseMediaQuantity('1.5', false)).toEqual({ numerator: '3', denominator: '2' });
    expect(parseMediaQuantity('0.00000007', true)).toEqual({ numerator: '7', denominator: '100000000' });
    expect(() => parseMediaQuantity('1/2', false)).toThrow(/decimal quantity/);
    expect(() => parseMediaQuantity('0', false)).toThrow(/outside the supported range/);
  });
  it('formats finite decimals and refuses to approximate repeating fractions', () => {
    expect(formatMediaQuantity({ numerator: '7', denominator: '100000000' })).toBe('0.00000007');
    expect(formatMediaQuantity({ numerator: '3', denominator: '2' })).toBe('1.5');
    expect(formatMediaQuantity({ numerator: '1', denominator: '3' })).toBeNull();
    expect(quantityText({ numerator: '1', denominator: '3' })).toBe('1/3');
  });
});

describe('discount percentages', () => {
  it('maps exact multipliers and percentages without floating point', () => {
    expect(discountPercent({ numerator: '4', denominator: '5' })).toBe('20');
    expect(discountMultiplier('20')).toEqual({ numerator: '4', denominator: '5' });
    expect(discountPercent({ numerator: '7', denominator: '8' })).toBe('12.5');
    expect(discountMultiplier('12.5')).toEqual({ numerator: '7', denominator: '8' });
    expect(discountMultiplier('100')).toEqual({ numerator: '0', denominator: '1' });
  });
  it('rejects invalid percentages and keeps non-terminating discounts internal', () => {
    expect(() => discountMultiplier('100.1')).toThrow(/0 to 100/);
    expect(discountPercent({ numerator: '1', denominator: '3' })).toBeNull();
  });
});

describe('model-derived billing units', () => {
  it('uses the configured estimator unit and standard quantity basis', () => {
    expect(mediaRateBasis('seconds')).toEqual({ numerator: '1', denominator: '1' });
    expect(mediaRateBasis('video_tokens')).toEqual({ numerator: '1000000', denominator: '1' });
    expect(mediaRateBasis(null)).toBeNull();
    expect(mediaMeterName('video_tokens', { numerator: '1000000', denominator: '1' })).toBe('video tokens');
    expect(mediaMeterName('seconds', { numerator: '1', denominator: '1' })).toBe('second');
  });
});
