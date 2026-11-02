import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import ProviderConnectDialog from '../../../app/features/providers/components/ProviderConnectDialog';
import { providerPreset } from '../../../app/features/providers/provider-presets';
import { request, ProviderRequestError } from '../../../app/features/providers/api';
const mode = vi.hoisted(() => ({value:'internal'}));
const refreshWorkspace = vi.fn(async () => {});
vi.mock('../../../app/shell/dashboard-context', () => ({ useDashboardContext: () => ({ token:'fixture', session:{operating_mode:mode.value}, organization:{id:'account',name:'Personal account'},refreshWorkspace }) }));
vi.mock('../../../app/features/providers/api', async original => ({ ...await original<typeof import('../../../app/features/providers/api')>(),request:vi.fn() }));
beforeEach(() => { mode.value='internal'; vi.mocked(request).mockReset(); refreshWorkspace.mockClear(); });
function show(onSaved = vi.fn(), onClose = vi.fn()) {
  render(<MemoryRouter><ProviderConnectDialog preset={providerPreset({id:'deepseek',name:'DeepSeek',protocol:'openai',api_base:'https://api.deepseek.com',website:'https://platform.deepseek.com/api_keys',price_source:'https://api-docs.deepseek.com/quick_start/pricing/',price_support:'official_catalog_unqualified'})} onSaved={onSaved} onClose={onClose}/></MemoryRouter>);
  return {user:userEvent.setup(),onSaved,onClose};
}
it('prefills official settings and cancelling never creates a connection', async () => {
  const {user,onClose}=show();
  await user.click(screen.getByText('Connection settings'));
  expect((screen.getByLabelText('API base URL') as HTMLInputElement).value).toBe('https://api.deepseek.com');
  await user.type(screen.getByLabelText('Provider API key'),'draft-secret');
  await user.click(screen.getByRole('button',{name:'Cancel'}));
  expect(onClose).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
});
it('recovers catalog failures using the saved private connection, without saving the secret twice', async () => {
  let imports=0;
  vi.mocked(request).mockImplementation(async (_token,path,method) => {
    if(path==='/api/v1/vendors' && method==='POST')return {data:{id:'saved-key',revision:1}};
    if(path.endsWith('/supplier'))return {data:{id:'provider-owner'}};
    if(path.endsWith('/integration'))return {data:{effective_type:'deepseek',revision:0}};
    if(path.endsWith('/import')) {if(++imports===1)throw new ProviderRequestError('Provider rejected the key.',502);return {data:{imported:2,discovered:2}};}
    throw new Error('Unexpected request');
  });
  const {user}=show();await user.type(screen.getByLabelText('Provider API key'),'private-key');
  await user.click(screen.getByRole('button',{name:'Connect and import models'}));
  await screen.findByRole('alert');expect(screen.queryByLabelText('Provider API key')).toBeNull();
  await user.click(screen.getByRole('button',{name:'Retry model import'}));
  await screen.findByRole('link',{name:'View models'});
  const writes=vi.mocked(request).mock.calls.filter(([,path,method])=>path==='/api/v1/vendors'&&method==='POST');
  expect(writes).toHaveLength(1);expect(writes[0][3]).toMatchObject({personal_organization_id:'account',api_key:'private-key',adapter:'openai',api_base:'https://api.deepseek.com'});
  expect(refreshWorkspace).toHaveBeenCalledOnce();
});
it('blocks blind replay after uncertain key creation and clears the secret', async () => {
  vi.mocked(request).mockRejectedValue(new TypeError('Network failure'));
  const {user}=show();await user.type(screen.getByLabelText('Provider API key'),'private-key');
  await user.click(screen.getByRole('button',{name:'Connect and import models'}));
  await screen.findByRole('alert');expect(screen.queryByLabelText('Provider API key')).toBeNull();
  expect((within(screen.getByRole('dialog')).getByRole('button',{name:'Connect and import models'}) as HTMLButtonElement).disabled).toBe(true);
  expect(request).toHaveBeenCalledOnce();
});

it('uses deployment Resale policy without importing personal free routes', async () => {
  mode.value='resale';
  vi.mocked(request).mockImplementation(async (_token,path) => path.endsWith('/supplier') ? {data:{id:'resale-provider'}} : path.endsWith('/integration') ? {data:{effective_type:'deepseek',revision:0}} : {data:{id:'resale-key',revision:1}});
  const {user}=show();await user.type(screen.getByLabelText('Provider API key'),'resale-private-key');
  await user.click(screen.getByRole('button',{name:'Save connection'}));
  await screen.findByRole('link',{name:'Configured Providers'});
  expect(vi.mocked(request).mock.calls.filter(([,path])=>path.endsWith('/import'))).toHaveLength(0);
  expect(vi.mocked(request).mock.calls[0][3]).not.toHaveProperty('personal_organization_id');
});
