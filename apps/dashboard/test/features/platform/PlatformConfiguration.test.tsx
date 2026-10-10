import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformConfiguration from '../../../src/features/platform/page';
const api = vi.hoisted(() => ({ request: vi.fn(), token: 'session' }));
vi.mock('../../../src/features/vendors/api', () => ({request: api.request}));
vi.mock('../../../src/app/dashboard-context', () => ({useDashboardContext: () => ({token: api.token})}));

describe('Payment configuration loading', () => {
  it('ends loading after an error and retries both configuration reads', async () => {
    api.request.mockRejectedValueOnce(new Error('Configuration unavailable')).mockRejectedValueOnce(new Error('Configuration unavailable'));
    render(<PlatformConfiguration />);
    expect((await screen.findByRole('alert')).textContent).toContain('Configuration unavailable');
    await waitFor(() => expect(screen.queryByText('Loading payment gateways…')).toBeNull());
    api.request.mockResolvedValueOnce({data:{payment_gateways:[{name:'EPay',configured:false}]}})
      .mockResolvedValueOnce({data:{revision:'0',enabled:false,merchant_id:'',has_key:false,endpoint:'',notify_url:'',return_url:'',methods:[]}});
    await userEvent.click(screen.getByRole('button',{name:'Retry'}));
    expect((await screen.findAllByText('Disabled')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.request).toHaveBeenCalledTimes(4);
    expect(api.request.mock.calls.every(call => call[2] === 'GET')).toBe(true);
  });
});

it('clears old-session drafts and ignores late payment configuration saves', async () => {
  const settings = {revision:'0',enabled:false,merchant_id:'first-account',has_key:false,endpoint:'',notify_url:'',return_url:'',methods:[]};
  let complete!: (value: unknown) => void;
  let signal: AbortSignal | undefined;
  api.token = 'first';
  api.request.mockImplementation(async (token, path, method, _body, requestSignal) => {
    if (method === 'PUT') { signal = requestSignal; return new Promise(resolve => {complete = resolve;}); }
    return {data: path.endsWith('/configuration') ? {payment_gateways:[{name:'EPay',configured:false}]} : {...settings,merchant_id:token === 'first' ? 'first-account' : 'second-account'}};
  });
  const view = render(<PlatformConfiguration/>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Configure'}));
  await user.click(screen.getByRole('button',{name:'Save',exact:true}));
  api.token = 'second'; view.rerender(<PlatformConfiguration/>);
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(await screen.findByRole('button',{name:'Configure'}));
  expect((screen.getByLabelText('Merchant ID') as HTMLInputElement).value).toBe('second-account');
  await act(async () => complete({data:{...settings,merchant_id:'late-first-account'}}));
  expect((screen.getByLabelText('Merchant ID') as HTMLInputElement).value).toBe('second-account');
  expect(screen.getByRole('dialog')).toBeTruthy();
  api.token = 'session';
});
