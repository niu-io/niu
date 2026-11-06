import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandedUnitTariffsSection } from '../../../app/features/retail-pricing/unit-tariffs';

const config = {
  revision: '4',
  billing_mode: 'credits',
  definition: { revision: '3', name: 'Niu Credits', display_precision: 2, atoms_per_unit: '1000000000' },
  purchase_rules: [],
  text_tariffs: [{
    revision: '5',
    definition_revision: '3',
    model_alias: 'text-model',
    price: {
      prompt_rate: '2500000000',
      completion_rate: '7500000000',
      cached_prompt_rate: '1250000000',
      cache_write_prompt_rate: null,
      reasoning_completion_rate: '9000000000',
      request_fee_atoms: '0',
      minimum_charge_atoms: '0',
      context_tiers: [],
    },
  }],
};
const mediaTariffs = [{
  revision: '6',
  definition_revision: '3',
  model_alias: 'text-model',
  channel: 'ark-direct-v1',
  resolution: '720p',
  reference_video: false,
  meter: 'video_tokens',
  price: {
    dimensions: { model: 'text-model', channel: 'ark-direct-v1', resolution: '720p', reference_video: false },
    meter: 'video_tokens',
    amount_atoms: '15000000000',
    per_quantity: { numerator: '1000000', denominator: '1' },
    minimum_quantity: { numerator: '1', denominator: '1' },
    rounding: 'Up',
  },
}];
const modelChoices = [
  { model_alias: 'text-model', media: null },
  { model_alias: 'video-model', media: { channel: 'ark-direct-v1', resolutions: ['720p', '1080p'], reference_video: true, meter: 'video_tokens' } },
  { model_alias: 'seconds-model', media: { channel: 'ark-direct-v1', resolutions: ['720p'], reference_video: false, meter: 'seconds' } },
];

type Write = { path: string; body: Record<string, unknown> };

function installFetch(options: { includeMedia?: boolean } = {}) {
  const writes: Write[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === 'POST') {
      writes.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      return Response.json({ data: { revision: '7' } });
    }
    if (path === '/api/v1/platform/units') return Response.json({ data: config });
    if (path === '/api/v1/platform/units/media/tariffs') return Response.json({ data: options.includeMedia ? mediaTariffs : [] });
    if (path.includes('/api/v1/pricing/standard-prices/models?')) return Response.json({ data: modelChoices, next_after: null });
    return Response.json({ error: { message: 'Unexpected ' + path } }, { status: 404 });
  }));
  return writes;
}

function renderSection() {
  render(<MemoryRouter><BrandedUnitTariffsSection token="unit-tariff-test" filter="" /></MemoryRouter>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Branded Credits tariffs', () => {
  it('shows decimal rates and model names without revision IDs, atom scale copy or a hardcoded model', async () => {
    installFetch({ includeMedia: true });
    renderSection();

    const textTable = await screen.findByRole('table', { name: 'Branded Credits text tariffs' });
    expect(within(textTable).getByText('text-model')).toBeTruthy();
    expect(within(textTable).getByText('2.50 Niu Credits')).toBeTruthy();
    expect(within(textTable).getByText('7.50 Niu Credits')).toBeTruthy();
    const mediaTable = screen.getByRole('table', { name: 'Branded Credits media tariffs' });
    expect(within(mediaTable).getByText(/15\.00 Niu Credits/)).toBeTruthy();
    expect(within(mediaTable).getByText(/per 1,000,000 video tokens/)).toBeTruthy();
    expect(screen.queryByText(/Tariff v/)).toBeNull();
    expect(screen.queryByText(/Unit v/)).toBeNull();
    expect(screen.queryByText(/1,000,000,000/)).toBeNull();
    expect(screen.queryByText(/exact atoms/i)).toBeNull();
    expect(screen.queryByText(/seedance-2\.0/)).toBeNull();
  });

  it('publishes a text tariff from a registered model using exact decimal-to-atom conversion', async () => {
    const writes = installFetch();
    renderSection();
    const user = userEvent.setup();

    const publish = await screen.findByRole('button', { name: 'Publish Credits text tariff' });
    await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false));
    await user.click(publish);
    const modelButton = screen.getByRole('button', { name: 'Credits text tariff model' });
    await waitFor(() => expect((modelButton as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByLabelText('Model alias')).toBeNull();
    expect(screen.queryByText(/1,000,000,000|exact atoms/i)).toBeNull();

    await user.click(modelButton);
    await user.click(await screen.findByRole('menuitemradio', { name: 'text-model' }));
    const prompt = screen.getByLabelText('Input rate (Niu Credits / 1M tokens)');
    const completion = screen.getByLabelText('Output rate (Niu Credits / 1M tokens)');
    await user.type(prompt, '0.000000001');
    await user.type(completion, '15');
    await user.click(screen.getByRole('button', { name: 'Publish Niu Credits tariff' }));
    await waitFor(() => expect(writes).toHaveLength(1));

    expect(writes[0].path).toBe('/api/v1/platform/units/tariffs');
    expect(writes[0].body).toMatchObject({
      model_alias: 'text-model',
      definition_revision: '3',
      expected_revision: '4',
      price: {
        prompt_rate: '1',
        completion_rate: '15000000000',
        cached_prompt_rate: null,
        cache_write_prompt_rate: null,
        reasoning_completion_rate: null,
        request_fee_atoms: '0',
        minimum_charge_atoms: '0',
        context_tiers: [],
      },
    });
  });

  it('selects a registered video-token model and derived channel, resolution and reference mode for media tariffs', async () => {
    const writes = installFetch();
    renderSection();
    const user = userEvent.setup();

    const publish = await screen.findByRole('button', { name: 'Publish Credits media tariff' });
    await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false));
    await user.click(publish);
    const modelButton = screen.getByRole('button', { name: 'Credits media tariff model' });
    await waitFor(() => expect((modelButton as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByLabelText('Model alias')).toBeNull();
    expect(screen.queryByDisplayValue('seedance-2.0')).toBeNull();
    expect(screen.queryByText('No registered models use video-token media pricing.')).toBeNull();

    await user.click(modelButton);
    expect(screen.queryByRole('menuitemradio', { name: 'seconds-model' })).toBeNull();
    await user.click(await screen.findByRole('menuitemradio', { name: 'video-model' }));
    expect(screen.getByText('ark-direct-v1')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Media resolution' }));
    await user.click(await screen.findByRole('menuitemradio', { name: '1080p' }));
    await user.click(screen.getByRole('checkbox', { name: 'With reference video' }));
    await user.type(screen.getByLabelText('Rate (Niu Credits)'), '0.5');
    await user.clear(screen.getByLabelText('Per quantity (video tokens)'));
    await user.type(screen.getByLabelText('Per quantity (video tokens)'), '1000000');
    await user.click(screen.getByRole('button', { name: 'Publish Niu Credits tariff' }));
    await waitFor(() => expect(writes).toHaveLength(1));

    expect(writes[0].path).toBe('/api/v1/platform/units/media/tariffs');
    expect(writes[0].body).toMatchObject({
      model_alias: 'video-model',
      definition_revision: '3',
      price: {
        dimensions: { model: 'video-model', channel: 'ark-direct-v1', resolution: '1080p', reference_video: true },
        meter: 'video_tokens',
        amount_atoms: '500000000',
        per_quantity: { numerator: '1000000', denominator: '1' },
        minimum_quantity: { numerator: '1', denominator: '1' },
        rounding: 'Up',
      },
    });
  });

  it('explains the missing video-token configuration instead of offering an arbitrary alias', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/v1/platform/units') return Response.json({ data: config });
      if (path === '/api/v1/platform/units/media/tariffs') return Response.json({ data: [] });
      if (path.includes('/api/v1/pricing/standard-prices/models?')) return Response.json({ data: [{ model_alias: 'seconds-model', media: modelChoices[2].media }], next_after: null });
      return Response.json({ error: { message: 'Unexpected ' + path } }, { status: 404 });
    }));
    renderSection();
    const user = userEvent.setup();

    const publish = await screen.findByRole('button', { name: 'Publish Credits media tariff' });
    await waitFor(() => expect((publish as HTMLButtonElement).disabled).toBe(false));
    await user.click(publish);
    expect(await screen.findByText('No registered models use video-token media pricing.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Configure a Provider model (opens in a new tab)' }).getAttribute('href')).toBe('/admin/providers');
    expect(screen.queryByLabelText('Model alias')).toBeNull();
  });
});
