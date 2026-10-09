import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import ModelMappings from '@/features/vendors/components/ModelMappings';
import type { VendorModel, ProviderModelCheck } from '@/features/vendors/api';

it('shows remaining models when a refresh removes the current page', async () => {
  const models: VendorModel[] = Array.from({ length: 25 }, (_, index) => ({
    alias: `model-${index + 1}`, upstream_model: `model-${index + 1}`, vendor_id: 'supplier',
    public_catalog: false, enabled: true, pricing: null, revision: 1,
    capabilities: { supports_tool_calls: false, supports_streaming_tool_calls: false,
      supports_structured_output: false, supports_embeddings: false,
      supports_embedding_dimensions: false, supports_embedding_base64: false, supports_responses: false },
  }));
  const props = { catalog: [], catalogLoading: false, catalogError: '', loading: false,
    disabled: false, onRefresh: vi.fn(), onLoadCatalog: vi.fn(), onSave: vi.fn(), onCheck: vi.fn() };
  const view = render(<MemoryRouter><ModelMappings {...props} models={models} /></MemoryRouter>);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('model-25', { selector: 'strong' })).toBeTruthy();
  view.rerender(<MemoryRouter><ModelMappings {...props} models={models.slice(0, 5)} /></MemoryRouter>);
  expect(screen.getByText('model-1', { selector: 'strong' })).toBeTruthy();
  expect(screen.getByText('model-5', { selector: 'strong' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
});

it('keeps each concurrent model check pending until its own response arrives', async () => {
  const model = (alias: string): VendorModel => ({alias,upstream_model:alias,vendor_id:'supplier',public_catalog:false,enabled:true,pricing:null,revision:1,
    capabilities:{supports_tool_calls:false,supports_streaming_tool_calls:false,supports_structured_output:false,supports_embeddings:false,supports_embedding_dimensions:false,supports_embedding_base64:false,supports_responses:false}});
  let finishFirst!: (result: ProviderModelCheck) => void;
  let finishSecond!: (result: ProviderModelCheck) => void;
  const onCheck = vi.fn(alias => new Promise<ProviderModelCheck>(resolve => {if(alias==='first') finishFirst=resolve;else finishSecond=resolve;}));
  render(<MemoryRouter><ModelMappings models={[model('first'),model('second')]} catalog={[]} catalogLoading={false} catalogError="" loading={false} disabled={false} onRefresh={vi.fn()} onLoadCatalog={vi.fn()} onSave={vi.fn()} onCheck={onCheck}/></MemoryRouter>);
  const first=screen.getByText('first',{selector:'strong'}).closest('tr')!;
  const second=screen.getByText('second',{selector:'strong'}).closest('tr')!;
  const user=userEvent.setup();
  await user.click(within(first).getByRole('button',{name:'Check',exact:true}));
  await user.click(within(second).getByRole('button',{name:'Check',exact:true}));
  expect((within(first).getByRole('button',{name:'Checking…'}) as HTMLButtonElement).disabled).toBe(true);
  expect((within(second).getByRole('button',{name:'Checking…'}) as HTMLButtonElement).disabled).toBe(true);
  finishSecond({status:'connected',model:'listed'});
  await waitFor(()=>expect(within(second).getByRole('button',{name:'Check',exact:true})).toBeTruthy());
  expect(within(first).getByRole('button',{name:'Checking…'})).toBeTruthy();
  finishFirst({status:'connected',model:'listed'});
  await waitFor(()=>expect(within(first).getByRole('button',{name:'Check',exact:true})).toBeTruthy());
  expect(onCheck).toHaveBeenCalledTimes(2);
});
