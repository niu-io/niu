import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import ModelsRoute from '@/features/models/page';
const state=vi.hoisted(()=>({context:{token:'test',models:[],modelsLoading:true,modelsError:'',refreshModels:vi.fn()}}));
vi.mock('@/app/dashboard-context',()=>({useDashboardContext:()=>state.context}));
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
