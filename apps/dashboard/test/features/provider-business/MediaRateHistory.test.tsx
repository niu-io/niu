import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MediaRateHistory from '../../../src/features/provider-business/MediaRateHistory';

const endpoint = '/admin/v1/providers/supplier-a/media-rates';
const revision = 'b335657a-dd32-400e-bf48-23c2a2c627c9';
function record(overrides = {}) {
  return {
    card: {
      revision, offer_revision: 'e0f51293-0df9-4d97-819d-680055e6acc7', vendor_revision: '1', model_revision: '1', schema_revision: '1',
      tariff: {
        revision: 'private-price-revision', dimensions: { model: 'seedance-test', channel: 'private-channel', resolution: '720p', reference_video: false },
        meter: 'video_tokens', currency: 'CNY', amount_units: '9007199254740993', decimal_places: 9,
        per_quantity: { numerator: '1000000', denominator: '1' }, minimum_quantity: { numerator: '0', denominator: '1' },
        rounding: 'HalfEven', effective_from: '0', effective_until: null,
      }, discounts: [],
    }, retirement_effective_until: null, created_at: null, ...overrides,
  };
}

describe('Supplier media purchase history', () => {
  it('explains network failures and lets retry recover to an empty history', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(Response.json({ data: [], has_more: false, next_after: null }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Media rates could not be loaded. Check your connection and retry.');
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No media purchase rates')).not.toBeNull();
  });

  it('preserves exact money, loads later pages and never displays internal references', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return Response.json(calls.length === 1 ? { data: [record()], has_more: true, next_after: 'next/revision' } : { data: [record({ card: { ...record().card, revision: 'later' }, retirement_effective_until: '1' })], has_more: false, next_after: null });
    }));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    expect(await screen.findByText('CNY 9007199.254740993')).not.toBeNull();
    expect(screen.queryByText(revision)).toBeNull();
    expect(screen.queryByText('private-price-revision')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Load more rates' }));
    expect(await screen.findByText('Ended')).not.toBeNull();
    expect(calls[1]).toBe(`${endpoint}?limit=50&after=next%2Frevision`);
    expect(screen.queryByRole('button', { name: 'Load more rates' })).toBeNull();
    await user.click(screen.getAllByRole('button', { name: /View rate.*seedance-test/ })[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Half to even')).not.toBeNull();
    expect(dialog.textContent).not.toContain(revision);
    expect(dialog.textContent).not.toContain('private-channel');
  });

  it('records one explicit cutoff against the original rate and reloads saved history', async () => {
    const mutations: { path: string; body: { effective_until: number } }[] = [];
    let retired: number | null = null;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        mutations.push({ path: String(input), body });
        retired = body.effective_until;
        return Response.json({ data: { revision, effective_until: String(retired) } });
      }
      return Response.json({ data: [record({ retirement_effective_until: retired === null ? null : String(retired) })], has_more: false, next_after: null });
    }));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    await user.click(await screen.findByRole('button', { name: /View rate.*seedance-test/ }));
    await user.click(screen.getByRole('button', { name: 'End rate' }));
    await user.clear(screen.getByLabelText('End date'));
    await user.type(screen.getByLabelText('End date'), '2026-10-07T12:00');
    await user.click(screen.getByRole('button', { name: 'Save end date' }));
    await waitFor(() => expect(mutations).toHaveLength(1));
    expect(mutations[0]).toEqual({ path: `${endpoint}/${revision}/retire`, body: { effective_until: Math.floor(Date.parse('2026-10-07T12:00') / 1000) } });
    expect(await screen.findByText('Rate end date saved. Existing jobs keep their original price.')).not.toBeNull();
    await user.click(await screen.findByRole('button', { name: /View rate.*seedance-test/ }));
    expect(screen.queryByRole('button', { name: 'End rate' })).toBeNull();
  });

  it('shows read failure as an error, retries and distinguishes an empty history', async () => {
    let failed = true;
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failed) { failed = false; return Response.json({ error: { message: 'Rate history unavailable' } }, { status: 503 }); }
      return Response.json({ data: [], has_more: false, next_after: null });
    }));
    const user = userEvent.setup();
    render(<MediaRateHistory token="installation-test" supplier="supplier-a" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Rate history unavailable');
    expect(screen.queryByText('No media purchase rates')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No media purchase rates')).not.toBeNull();
  });
});
