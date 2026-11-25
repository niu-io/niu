import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import PlatformConfiguration from '../../../app/features/platform/page';
const api = vi.hoisted(() => ({ request: vi.fn(), token: 'session' }));
vi.mock('../../../app/features/providers/api', () => ({request: api.request}));
vi.mock('../../../app/shell/dashboard-context', () => ({useDashboardContext: () => ({token: api.token})}));
beforeEach(() => {
  api.request.mockReset();
  api.token = 'session';
});
const renderConfiguration = () => render(<MemoryRouter><PlatformConfiguration /></MemoryRouter>);

describe('Payment configuration loading', () => {
  it('ends loading after an error and retries both configuration reads', async () => {
    let gatewayAttempt = 0;
    api.request.mockImplementation(async (_token, path) => {
      if (String(path).includes('bank')) return { data: { revision: '0', bank_transfer: null } };
      if (String(path).endsWith('/mock')) return { data: { available: false, enabled: false } };
      gatewayAttempt += 1;
      if (gatewayAttempt <= 2) throw new Error('Configuration unavailable');
      if (String(path).endsWith('/configuration')) return { data: { payment_gateways: [{ name: 'EPay', configured: false }] } };
      return { data: { revision: '0', enabled: false, merchant_id: '', has_key: false, endpoint: '', notify_url: '', return_url: '', methods: [] } };
    });
    renderConfiguration();
    expect((await screen.findByRole('alert')).textContent).toContain('Configuration unavailable');
    await waitFor(() => expect(screen.queryByText('Loading payment gateways…')).toBeNull());
    await userEvent.click(screen.getByRole('button',{name:'Retry'}));
    expect((await screen.findAllByText('Not configured')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.request.mock.calls.filter(call => !String(call[1]).includes('bank'))).toHaveLength(6);
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
  const view = renderConfiguration();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Configure'}));
  await user.click(screen.getByRole('button',{name:'Save',exact:true}));
  api.token = 'second'; view.rerender(<MemoryRouter><PlatformConfiguration/></MemoryRouter>);
  expect(signal?.aborted).toBe(true);
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(await screen.findByRole('button',{name:'Configure'}));
  expect((screen.getByLabelText('Merchant ID') as HTMLInputElement).value).toBe('second-account');
  await act(async () => complete({data:{...settings,merchant_id:'late-first-account'}}));
  expect((screen.getByLabelText('Merchant ID') as HTMLInputElement).value).toBe('second-account');
  expect(screen.getByRole('dialog')).toBeTruthy();
  api.token = 'session';
});


it('enables the mock gateway only through an explicit saved selection with cost disclosure', async () => {
  let enabled = false;
  api.request.mockImplementation(async (_token, path, method, body) => {
    if (path.endsWith('/mock')) {
      if (method === 'PUT') enabled = body.enabled;
      return {data:{available:true,enabled,readiness:enabled ? 'ready' : 'unconfigured'}};
    }
    return {data:path.endsWith('/configuration') ? {payment_gateways:[{name:'EPay',configured:false}]} : {revision:'0',enabled:false,methods:[]}};
  });
  renderConfiguration();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button',{name:'Configure mock payments'}));
  expect(screen.getByText('LLM calls still cost real money')).toBeTruthy();
  expect(screen.getByText(/Only payments are simulated\. LLM requests still incur upstream Provider charges\./)).toBeTruthy();
  expect(enabled).toBe(false);
  await user.click(screen.getByLabelText('Enable mock payments'));
  expect(enabled).toBe(false);
  await user.click(screen.getByRole('button',{name:'Save',exact:true}));
  await waitFor(() => expect(enabled).toBe(true));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('distinguishes disabled EPay from server credentials without claiming verified checkout', async () => {
  api.request.mockImplementation(async (_token, path) => ({data: path.endsWith('/mock')
    ? {available:false,enabled:false}
    : path.endsWith('/configuration')
      ? {payment_gateways:[{name:'Zhifux',configured:false},{name:'EPay',configured:true},{name:'Stripe',configured:true}]}
      : {revision:'1',enabled:false,has_key:true,merchant_id:'merchant',methods:['alipay']}}));
  renderConfiguration();
  expect((await screen.findByRole('article',{name:'EPay'})).textContent).toContain('Disabled');
  const zhifuxLogoImg = screen.getByRole('article',{name:'ZhifuX'}).querySelector('img');
  expect(zhifuxLogoImg?.getAttribute('src')).toContain('zhifux');
  expect(zhifuxLogoImg?.getAttribute('src')).not.toBe('/payment-gateways/zhifux.png');
  const stripe = screen.getByRole('article',{name:'Stripe'});
  expect(stripe.textContent).toContain('Configured');
  expect(stripe.textContent).not.toContain('Enabled');
  expect(screen.queryByRole('article',{name:'Mock payments'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Configure mock payments'})).toBeNull();
});

it('checks Stripe explicitly without presenting account eligibility as verified checkout', async () => {
  let result = 'account_enabled';
  api.request.mockImplementation(async (_token, path, method) => ({data: path.endsWith('/verification')
    ? {result}
    : path.endsWith('/mock') ? {available:false,enabled:false}
    : path.endsWith('/configuration') ? {payment_gateways:[{name:'Stripe',configured:true}]}
    : {revision:'1',enabled:false,methods:[]}}));
  renderConfiguration();
  const user = userEvent.setup();
  const check = await screen.findByRole('button',{name:'Check Stripe account'});
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  expect(api.request.mock.calls.some(call => call[2] === 'POST')).toBe(false);
  await user.click(check);
  expect((await screen.findByRole('status')).textContent).toContain('does not test checkout or payment notifications');
  expect(screen.getByRole('article',{name:'Stripe'}).textContent).toContain('Configured');
  result = 'account_disabled';
  await user.click(check);
  const disabledAlert = await screen.findByRole('alert');
  expect(disabledAlert.textContent).toContain('Complete the account requirements in Stripe');
  expect(screen.getByRole('link',{name:'Complete setup in Stripe'}).getAttribute('href')).toBe('https://dashboard.stripe.com/settings/account');
  expect(screen.getByRole('link',{name:'Manage Stripe API keys'}).getAttribute('href')).toBe('https://dashboard.stripe.com/apikeys');
  expect(screen.queryByRole('status')).toBeNull();
  result = 'credentials_rejected';
  await user.click(check);
  expect((await screen.findByRole('alert')).textContent).toContain('update them, then check again');
  expect(screen.getByRole('link',{name:'Open Stripe API keys'}).getAttribute('href')).toBe('https://dashboard.stripe.com/apikeys');
  result = 'check_unavailable';
  await user.click(check);
  expect((await screen.findByRole('alert')).textContent).toContain('credentials and connection');
  expect(screen.getByRole('link',{name:'Check Stripe status'}).getAttribute('href')).toBe('https://status.stripe.com/');
  expect(check.hasAttribute('disabled')).toBe(false);
});

it('aborts account checks on session change and ignores their late results', async () => {
  let complete!: (value: unknown) => void;
  let signal: AbortSignal | undefined;
  api.token = 'first';
  api.request.mockImplementation(async (_token, path, method, _body, requestSignal) => {
    if (method === 'POST') { signal = requestSignal; return new Promise(resolve => {complete = resolve;}); }
    return {data:path.endsWith('/mock') ? {available:false,enabled:false}
      : path.endsWith('/configuration') ? {payment_gateways:[{name:'Stripe',configured:true}]}
      : {revision:'1',enabled:false,methods:[]}};
  });
  const view = renderConfiguration();
  const user = userEvent.setup();
  const check = await screen.findByRole('button',{name:'Check Stripe account'});
  await waitFor(() => expect(check.hasAttribute('disabled')).toBe(false));
  await user.click(check);
  expect(screen.getByRole('button',{name:'Checking account…'}).hasAttribute('disabled')).toBe(true);
  api.token = 'second'; view.rerender(<MemoryRouter><PlatformConfiguration/></MemoryRouter>);
  expect(signal?.aborted).toBe(true);
  await act(async () => complete({data:{result:'account_enabled'}}));
  expect(screen.queryByText(/Stripe reports that this account/)).toBeNull();
  expect(await screen.findByRole('button',{name:'Check Stripe account'})).toBeTruthy();
  api.token = 'session';
});

it('shows the missing payment step, refreshes current evidence, and clears stale success after failure',async()=>{
 let callback=false;let unavailable=false;
 api.request.mockImplementation(async (_token,path)=>{
  if(path.endsWith('/mock'))return {data:{available:false,enabled:false}};
  if(path.endsWith('/configuration')){
   if(unavailable)throw new Error('Offline');
   return {data:{payment_gateways:[{name:'Stripe',configured:true}],verification:{currency_configured:true,gateways:[{gateway:'stripe',checkout_enabled:true,currency_supported:true,account_verified:true,callback_verified:callback,ready:callback}]}}};
  }
  return {data:{revision:'0',enabled:false,methods:[]}};
 });
 render(<MemoryRouter><PlatformConfiguration/></MemoryRouter>);
 const card=await screen.findByRole('article',{name:'Stripe'});
 expect(card.textContent).toContain('Needs attention');
 expect(card.textContent).toContain('Not verified');
 expect(card.textContent).toContain('Payment notifications are not verified yet.');
 expect(screen.getByRole('link',{name:'Open Stripe webhooks'}).getAttribute('href')).toBe('https://dashboard.stripe.com/webhooks');
 expect(screen.queryByRole('link',{name:'Credits'})).toBeNull();
 callback=true;
 await userEvent.click(screen.getByRole('button',{name:'Refresh verification'}));
 await waitFor(()=>expect(card.textContent).toContain('Payment delivery is verified for the current configuration.'));
 expect(card.textContent).not.toContain('Needs attention');
 unavailable=true;
 await userEvent.click(screen.getByRole('button',{name:'Refresh verification'}));
 await screen.findByText('Verification status could not be refreshed. The last known status is still shown. Try again.');
 expect(card.textContent).toContain('Payment delivery is verified for the current configuration.');
 expect(card.textContent).not.toContain('Verification status is unavailable');
 expect(api.request.mock.calls.some(call=>call[2]==='POST')).toBe(false);
});

it('keeps EPay edits intact when verification is refreshed',async()=>{
 api.request.mockImplementation(async (_token,path)=>({data:path.endsWith('/configuration')?{payment_gateways:[{name:'EPay',configured:true}]}:path.endsWith('/mock')?{available:false,enabled:false}:{revision:'1',enabled:false,merchant_id:'saved',has_key:true,methods:['alipay']}}));
 renderConfiguration();
 await userEvent.click(await screen.findByRole('button',{name:'Configure',exact:true}));
 const field=screen.getByLabelText('Merchant ID');
 await userEvent.clear(field);await userEvent.type(field,'unsaved');
 const count=api.request.mock.calls.length;
 act(()=>window.dispatchEvent(new Event('focus')));
 expect(api.request.mock.calls.length).toBe(count);
 expect((field as HTMLInputElement).value).toBe('unsaved');
});
