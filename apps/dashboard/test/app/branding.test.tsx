import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrandingProvider, defaultBranding, parseBranding, previewPalette } from '../../src/app/branding';
import { applyTheme, setDeploymentPalette } from '../../src/app/theme';
import BrandingPage from '../../src/features/branding/page';

// Vitest stubs CSS imports. Use the real checked-in token source for preview
// resolution; browser verification separately exercises Vite's raw import.
vi.mock('../../../../branding/tokens.css?raw',async()=>{
  const {readFile} = await import('node:fs/promises');
  const {resolve} = await import('node:path');
  return {default:await readFile(resolve(process.cwd(),'../../branding/tokens.css'),'utf8')};
});

const configuration = (revision='0') => ({data:{revision,settings:{...defaultBranding,light:{},dark:{}}}});
afterEach(()=>{setDeploymentPalette({},{});document.documentElement.style.removeProperty('--primary');});
describe('deployment branding',()=>{
  it('rejects executable assets and CSS values at the display boundary',()=>{
    const value=configuration();
    expect(parseBranding(value).settings.display_name).toBe('NIU.IO');
    expect(()=>parseBranding({data:{...value.data,settings:{...value.data.settings,logo_data_url:'https://example.org/x'}}})).toThrow();
    expect(()=>parseBranding({data:{...value.data,settings:{...value.data.settings,light:{primary:'url(x)'}}}})).toThrow();
    expect(()=>parseBranding({data:{...value.data,settings:{...value.data.settings,dark:{position:'#ffffff'}}}})).toThrow();
  });
  it('switches deployment palettes with appearance and removes obsolete overrides on reset',()=>{
    setDeploymentPalette({primary:'#112233'},{primary:'#ffffff'});
    applyTheme('light');expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#112233');
    applyTheme('dark');expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#ffffff');
    setDeploymentPalette({},{});expect(document.documentElement.style.getPropertyValue('--primary')).toBe('');
  });
  it('resolves preview defaults independently of the current page mode and ignores invalid drafts',()=>{
    document.documentElement.classList.add('dark');
    expect(previewPalette(defaultBranding,'light')['--background']).toBe('oklch(0.985 0.001 255)');
    expect(previewPalette(defaultBranding,'dark')['--background']).toBe('oklch(0.19 0.003 255)');
    expect(previewPalette({...defaultBranding,light:{primary:'url(x)'}},'light')['--primary']).toBe('oklch(0.34 0.035 255)');
  });
  it('keeps a draft on save failure, reloads current revisions and saves the full configuration',async()=>{
    let revision='0';let fail=true;const writes:unknown[]=[];
    vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{
      if(init?.method==='PUT') {const body=JSON.parse(String(init.body));writes.push(body);if(fail)return Response.json({}, {status:409});revision='2';return Response.json({data:{revision,settings:body.settings}});}
      return Response.json(configuration(revision));
    }));
    const router=createMemoryRouter([{element:<Outlet context={{token:'member'}}/>,children:[{path:'/admin/branding',element:<BrandingPage/>}]}],{initialEntries:['/admin/branding']});
    render(<RouterProvider router={router}/>);
    const user=userEvent.setup();await screen.findByDisplayValue('NIU.IO');
    await user.clear(screen.getByLabelText('Display name'));await user.type(screen.getByLabelText('Display name'),'Example');
    await user.click(screen.getByRole('button',{name:'Save changes'}));
    await screen.findByRole('alert');expect(screen.getByDisplayValue('Example')).toBeTruthy();
    revision='1';await user.click(screen.getByRole('button',{name:'Reload saved settings'}));
    await screen.findByDisplayValue('NIU.IO');fail=false;
    await user.clear(screen.getByLabelText('Display name'));await user.type(screen.getByLabelText('Display name'),'Updated');
    await user.click(screen.getByRole('tab',{name:'Theme',exact:true}));
    await user.click(screen.getByRole('button',{name:'Default appearance',exact:true}));await user.click(screen.getByRole('menuitemradio',{name:'Dark',exact:true}));
    await user.click(screen.getByRole('button',{name:'Save changes'}));await screen.findByText('Changes saved.');
    expect(writes).toEqual([{expected_revision:'0',settings:{...defaultBranding,display_name:'Example'}},{expected_revision:'1',settings:{...defaultBranding,display_name:'Updated',default_appearance:'dark'}}]);
  });
  it('does not overwrite a cached member appearance when public branding loads',async()=>{
    localStorage.setItem('niu-dashboard-theme-owner','member');localStorage.setItem('niu-dashboard-theme','light');
    const settings={...defaultBranding,default_appearance:'dark',light:{primary:'#112233'}};
    vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:{revision:'3',settings}})));
    render(<BrandingProvider><p>Dashboard</p></BrandingProvider>);
    await waitFor(()=>expect(document.documentElement.style.getPropertyValue('--primary')).toBe('#112233'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('niu-dashboard-theme')).toBe('light');
  });
});
