import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreditsSummaryCell } from '../../../app/features/customers/page';
import { formatUnitAmountText } from '../../../app/lib/money';

it('formats standard-unit summaries without converting through Number', () => {
  expect(formatUnitAmountText('69.00', 'Niu Credits')).toBe('69.00 Niu Credits');
  expect(formatUnitAmountText('1234567.89', 'Niu Credits')).toBe('1,234,567.89 Niu Credits');
  expect(formatUnitAmountText('0.0015', 'Niu Credits')).toBe('0.0015 Niu Credits');
  expect(formatUnitAmountText('9007199254740993000.00', 'Niu Credits')).toBe(
    '9,007,199,254,740,993,000.00 Niu Credits',
  );
});

it('renders the company Credits summary and additional unit count', () => {
  render(
    <CreditsSummaryCell
      credits={{ name: 'Niu Credits', display_precision: 2, available: '69.00', additional_units: 1 }}
    />,
  );
  expect(screen.getByText('69.00 Niu Credits')).toBeTruthy();
  expect(screen.getByText('+1 other unit')).toBeTruthy();
});

it('renders an explicit empty state when the company has no Credits lots', () => {
  render(<CreditsSummaryCell credits={null} />);
  expect(screen.getByLabelText('No Credits balance')).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
});
