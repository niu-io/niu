import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import ModelsRoute from '@/features/models/page';
const state=vi.hoisted(()=>({context:{token:'test',models:[],modelsLoading:true,modelsError:'',refreshModels:vi.fn(),workspace:{id:'one',name:'Current workspace'},workspaces:[{id:'one',name:'Current workspace'},{id:'two',name:'Production'}],selectWorkspace:vi.fn()}}));
vi.mock('@/shell/dashboard-context',()=>({useDashboardContext:()=>state.context}));
it('keeps unread and failed catalogs distinct from an empty catalog and provides retry', async()=>{
 const view=render(<ModelsRoute/>);
 expect(screen.getByText('Loading model catalog…')).toBeTruthy();
 expect(screen.queryByText('No model routes yet')).toBeNull();
 expect(screen.getByRole('button',{name:'Refreshing…'}).hasAttribute('disabled')).toBe(true);
 state.context.modelsLoading=false;state.context.modelsError='Could not load the model catalog.';
 view.rerender(<ModelsRoute/>);
 expect(screen.queryByText('No model routes yet')).toBeNull();
 expect(screen.getByRole('alert').textContent).toContain('Could not load the model catalog.');
 await userEvent.setup().click(screen.getByRole('button',{name:'Retry model catalog'}));
 expect(state.context.refreshModels).toHaveBeenCalledTimes(1);
});

it('relies on the workspace shell switcher without rendering a duplicate in-page workspace dropdown',()=>{
 state.context.modelsLoading=false;state.context.modelsError='Could not load the model catalog.';
 render(<ModelsRoute/>);
 expect(screen.queryByRole('button',{name:'Filter by workspace'})).toBeNull();
 expect(screen.getByRole('button',{name:'Refresh'})).toBeTruthy();
});
