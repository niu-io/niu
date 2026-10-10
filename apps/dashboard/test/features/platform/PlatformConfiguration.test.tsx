import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformConfiguration from '../../../src/features/platform/page';
const api = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../../src/features/vendors/api', () => ({request: api.request}));
vi.mock('../../../src/app/dashboard-context', () => ({useDashboardContext: () => ({token: 'session'})}));

describe('Payment configuration loading', () => {
  it('ends loading after an error and retries both configuration reads', async () => {
    api.request.mockRejectedValueOnce(new Error('Configuration unavailable')).mockRejectedValueOnce(new Error('Configuration unavailable'));
    render(<PlatformConfiguration />);
    expect((await screen.findByRole('alert')).textContent).toContain('Configuration unavailable');
    await waitFor(() => expect(screen.queryByText('Loading payment gateways…')).toBeNull());
    api.request.mockResolvedValueOnce({data:{payment_gateways:[{name:'EPay',configured:false}]}})
      .mockResolvedValueOnce({data:{revision:'0',enabled:false,merchant_id:'',has_key:false,endpoint:'',notify_url:'',return_url:'',methods:[]}});
    await userEvent.click(screen.getByRole('button',{name:'Retry'}));
    expect(await screen.findByText('Disabled')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.request).toHaveBeenCalledTimes(4);
    expect(api.request.mock.calls.every(call => call[2] === 'GET')).toBe(true);
  });
});
