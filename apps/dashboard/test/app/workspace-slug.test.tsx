import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceCreateDialog } from '../../src/app/WorkspaceSwitcher';
import type { DashboardContext } from '../../src/app/dashboard-context';
import { workspaceSlugFromName, workspacePathSegment, resolveWorkspacePathSegment } from '../../src/app/workspace-route';

const { currencyState } = vi.hoisted(() => ({currencyState:{currency:'USD',error:'',reload:()=>{}}}));
vi.mock('../../src/app/platform-currency', () => ({usePlatformCurrency:()=>currencyState}));

describe('workspace slugs', () => {
  it.each([
    ['  Product\t experiments\n ', 'product-experiments'],
    ['产品 实验', 'chan-pin-shi-yan'], ['Niu 测试', 'niu-ce-shi'],
    ['Café / Déjà Vu!', 'cafe-deja-vu'], ['ＡＢＣ　１２３', 'abc-123'],
    ['a___b///c 🚀', 'a-b-c'], ['🚀 !!!', 'workspace'], ['Default', 'default-workspace'], ['', ''],
  ])('generates %s → %s', (name, expected) => expect(workspaceSlugFromName(name)).toBe(expected));
  it('truncates without a trailing hyphen', () => expect(workspaceSlugFromName('a'.repeat(47) + ' test')).toBe('a'.repeat(47)));
  it('uses the canonical slug and resolves old bookmarks', () => {
    const workspace = {id:'internal', name:'Renamed', slug:'research', route_slug:'legacy', slug_aliases:['research-old'], organization_id:'org', organization_name:'Company'};
    expect(workspacePathSegment(workspace, [workspace])).toBe('research');
    expect(resolveWorkspacePathSegment('research-old', [workspace])).toBe(workspace);
    expect(resolveWorkspacePathSegment('internal', [workspace])).toBe(workspace);
  });
  it('disambiguates colliding legacy workspace names without exposing internal UUID suffixes', () => {
    const first = {id:'11111111-1111-4111-8111-111111111111', name:'Research', organization_id:'org', organization_name:'Company'};
    const second = {id:'22222222-2222-4222-8222-222222222222', name:'Research', organization_id:'org', organization_name:'Company'};
    const list = [first, second];
    expect(workspacePathSegment(first, list)).toBe('research');
    expect(workspacePathSegment(second, list)).toBe('research-2');
    expect(resolveWorkspacePathSegment('research-2', list)).toBe(second);
    expect(resolveWorkspacePathSegment('research-22222222', list)).toBe(second);
  });
  it('suggests pinyin, preserves manual edits, and retains collision errors', async () => {
    const user = userEvent.setup();
    const createWorkspace = vi.fn().mockRejectedValueOnce(new Error('This slug is already in use. Choose a different slug.')).mockResolvedValue({});
    const onOpenChange = vi.fn();
    render(<WorkspaceCreateDialog context={{organization:{id:'org',name:'Company'},createWorkspace} as unknown as DashboardContext} open onOpenChange={onOpenChange}/>);
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Workspace name'), '产品 实验');
    const slug = within(dialog).getByLabelText('Slug') as HTMLInputElement;
    expect(slug.value).toBe('chan-pin-shi-yan');
    await user.clear(slug); await user.type(slug, 'research');
    await user.type(within(dialog).getByLabelText('Workspace name'), ' 2');
    expect(slug.value).toBe('research');
    await user.click(within(dialog).getByRole('button', {name:'Create workspace'}));
    expect((await screen.findByRole('alert')).textContent).toContain('already in use');
    expect(createWorkspace).toHaveBeenCalledWith('产品 实验 2','org','research');
    expect(onOpenChange).not.toHaveBeenCalled();
    await user.clear(slug); await user.type(slug,'research-2');
    await user.click(within(dialog).getByRole('button', {name:'Create workspace'}));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('creates an optional exact lifetime cap, including zero', async () => {
    const user = userEvent.setup();
    const createWorkspace = vi.fn().mockResolvedValue({});
    render(<WorkspaceCreateDialog context={{session:{kind:'installation'},createWorkspace} as unknown as DashboardContext} open onOpenChange={vi.fn()}/>);
    await user.type(screen.getByLabelText('Workspace name'), 'Budget test');
    expect((screen.getByLabelText('Reset') as HTMLInputElement).value).toBe('Never (lifetime)');
    await user.type(screen.getByLabelText('Spending limit ($)'), '0');
    await user.click(screen.getByRole('button', {name:'Create workspace'}));
    expect(createWorkspace).toHaveBeenCalledWith('Budget test',undefined,'budget-test',{currency:'USD',limit_nanos:'0'});
  });
  it('rejects excess precision before creating anything', async () => {
    const user = userEvent.setup();
    const createWorkspace = vi.fn();
    render(<WorkspaceCreateDialog context={{session:{kind:'installation'},createWorkspace} as unknown as DashboardContext} open onOpenChange={vi.fn()}/>);
    await user.type(screen.getByLabelText('Workspace name'), 'Budget test');
    await user.type(screen.getByLabelText('Spending limit ($)'), '1.0000000001');
    await user.click(screen.getByRole('button', {name:'Create workspace'}));
    expect((await screen.findByRole('alert')).textContent).toContain('9 decimal places');
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it('inherits the configured platform currency without a selector', async () => {
    currencyState.currency='CNY';
    const user = userEvent.setup();
    const createWorkspace = vi.fn().mockResolvedValue({});
    render(<WorkspaceCreateDialog context={{session:{kind:'installation'},token:'test',organization:{id:'org',name:'Company'},createWorkspace} as unknown as DashboardContext} open onOpenChange={vi.fn()}/>);
    expect(screen.queryByLabelText('Currency')).toBeNull();
    await user.type(screen.getByLabelText('Workspace name'),'Currency test');
    await user.type(screen.getByLabelText('Spending limit (¥)'),'12.000000001');
    await user.click(screen.getByRole('button',{name:'Create workspace'}));
    expect(createWorkspace).toHaveBeenCalledWith('Currency test','org','currency-test',{currency:'CNY',limit_nanos:'12000000001'});
    currencyState.currency='USD';
  });
  it('keeps spending controls owner-only', () => {
    render(<WorkspaceCreateDialog context={{session:{kind:'operator',operator:{role:'admin'}},createWorkspace:vi.fn()} as unknown as DashboardContext} open onOpenChange={vi.fn()}/>);
    expect(screen.queryByRole('heading',{name:'Budget (optional)'})).toBeNull();
  });

});
