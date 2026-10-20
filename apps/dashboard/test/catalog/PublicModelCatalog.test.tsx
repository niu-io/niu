import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import PublicModelCatalog from '../../../catalog/src/components/PublicModelCatalog';

const models = [
  { id: 'vision-reader', catalog: { name: 'Vision reader', input_modalities: ['image'], output_modalities: ['text'] } },
  { id: 'image-maker', catalog: { name: 'Image maker', input_modalities: ['text'], output_modalities: ['image'] } },
];
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: models }) })));

it('reports a denied clipboard write without claiming the model ID was copied', async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
  render(<PublicModelCatalog />);
  await user.click(await screen.findByRole('button', { name: 'Copy model ID vision-reader' }));
  expect((await screen.findByRole('alert')).textContent).toContain('copy it manually');
  expect(screen.queryByText('Copied')).toBeNull();
  expect(screen.getByText('vision-reader', { selector: 'code' })).toBeTruthy();
});

it('waits for clipboard success and ignores an earlier copy response after another action', async () => {
  const user = userEvent.setup();
  let first!: () => void;
  let second!: () => void;
  vi.spyOn(navigator.clipboard, 'writeText')
    .mockImplementationOnce(() => new Promise<void>(resolve => { first = resolve; }))
    .mockImplementationOnce(() => new Promise<void>(resolve => { second = resolve; }));
  render(<PublicModelCatalog />);
  await user.click(await screen.findByRole('button', { name: 'Copy model ID vision-reader' }));
  expect(screen.queryByText('Copied')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Copy model ID image-maker' }));
  await act(async () => second());
  expect(within(screen.getByRole('button', { name: 'Copy model ID image-maker' })).getByText('Copied')).toBeTruthy();
  await act(async () => first());
  expect(within(screen.getByRole('button', { name: 'Copy model ID vision-reader' })).queryByText('Copied')).toBeNull();
});

it('ignores copy feedback after the model is filtered out', async () => {
  const user = userEvent.setup();
  let reject!: (reason: Error) => void;
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; }));
  render(<PublicModelCatalog />);
  await user.click(await screen.findByRole('button', { name: 'Copy model ID vision-reader' }));
  await user.type(screen.getByRole('searchbox', { name: 'Filter models' }), 'maker');
  await act(async () => reject(new Error('Denied')));
  expect(screen.queryByRole('alert')).toBeNull();
});
