import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import LegacyMediaContracts from '@/features/retail-pricing/legacy-media';

it('continues the company directory without duplicate entries and isolates the selected contract history', async () => {
  let failNext = true;
  const company = (id: string, _workspace: string) => ({organization_id:id,organization_name:`Company ${id}`,created_at:'2026-10-22T00:00:00Z'});
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/pricing/customers')) {
      if (!url.includes('after=')) return Response.json({data:[company('a','one'),company('a','two')],next_after:'next'});
      if (failNext) { failNext=false; return Response.json({error:{message:'Try again'}},{status:503}); }
      return Response.json({data:[company('a','three'),company('b','four')],next_after:null});
    }
    return Response.json({data:[],has_more:false,next_after:null});
  });
  vi.stubGlobal('fetch',fetcher);
  const user=userEvent.setup();
  render(<LegacyMediaContracts token="fixture" onClose={()=>{}}/>);
  await user.click(await screen.findByRole('button',{name:'More companies'}));
  await user.click(await screen.findByRole('button',{name:'Retry companies'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'More companies'})).toBeNull());
  await user.click(screen.getByRole('button',{name:'Choose company'}));
  expect(screen.getAllByRole('menuitemradio',{name:/Company a/})).toHaveLength(1);
  await user.click(screen.getByRole('menuitemradio',{name:/Company b/}));
  await screen.findByText('No media selling rates');
  expect(fetcher.mock.calls.some(([url])=>String(url).includes('/organizations/b/billing/media-rates'))).toBe(true);
  expect(fetcher.mock.calls.some(([url])=>String(url).includes('/organizations/a/billing/media-rates'))).toBe(false);
  expect(screen.queryByRole('button',{name:'Publish selling rate'})).toBeNull();
});
