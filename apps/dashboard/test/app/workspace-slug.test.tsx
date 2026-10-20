import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceCreateDialog } from '../../src/app/WorkspaceSwitcher';
import type { DashboardContext } from '../../src/app/dashboard-context';
import { workspaceSlugFromName, workspacePathSegment, resolveWorkspacePathSegment } from '../../src/app/workspace-route';

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
});
