import test from 'node:test';
import assert from 'node:assert/strict';
import { money } from '../src/lib/money.ts';

test('currency formatting retains nanounits beyond Number precision', () => {
  assert.equal(money('9007199254740993', 'USD'), 'USD 9007199.254740993');
  assert.equal(money('9223372036854775807', 'USD'), 'USD 9223372036.854775807');
  assert.equal(money('1', 'EUR'), 'EUR 0.000000001');
  assert.equal(money('0', 'USD'), 'USD 0.00');
  assert.equal(money('-1', 'USD'), 'USD -0.000000001');
});
