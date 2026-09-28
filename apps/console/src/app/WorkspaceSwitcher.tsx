import { useState, type FormEvent } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ConsoleContext } from './console-context';

function organizationLabel(id: string, name: string, organizations: ConsoleContext['organizations']) {
  const matching = organizations.filter(item => item.name === name);
  if (matching.length <= 1) return name;
  const position = matching.findIndex(item => item.id === id);
  return position > 0 ? `${name} (${position + 1})` : name;
}

export default function WorkspaceSwitcher({ context }: { context: ConsoleContext }) {
  const {
    token, session, organizations, workspaces, workspace, workspaceLoading,
    workspaceError, selectWorkspace, createWorkspace,
  } = context;
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const canCreate = Boolean(session?.permissions.write && (
    session.kind === 'installation' || session.operator?.project_id === null
  ));
  const canChooseOrganization = session?.kind === 'installation' && organizations.length > 1;

  function openCreate() {
    setName('');
    setCreateError('');
    setOrganizationId(workspace?.organization_id ?? organizations[0]?.id ?? '');
    setCreateOpen(true);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setCreateError('');
    try {
      await createWorkspace(name.trim(), organizationId || undefined);
      setCreateOpen(false);
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'Could not create workspace.');
    } finally {
      setSaving(false);
    }
  }

  const triggerTitle = workspace ? workspace.name : workspaceLoading ? 'Loading workspaces…' : 'Choose a workspace';
  return <div className="workspace-switcher">
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="workspace-switcher-trigger" disabled={!token} aria-label="Switch workspace" title="Switch workspace">
        <span className="workspace-switcher-copy"><strong>{triggerTitle}</strong></span>
        <ChevronDown size={16} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="workspace-switcher-menu" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
          <DropdownMenu.Label className="workspace-switcher-menu-title">Workspaces</DropdownMenu.Label>
          {workspaceLoading && <div className="workspace-switcher-empty">Loading workspaces…</div>}
          {!workspaceLoading && workspaces.length === 0 && <div className="workspace-switcher-empty">No workspaces yet.</div>}
          {!workspaceLoading && organizations.map(organization => {
            const entries = workspaces.filter(item => item.organization_id === organization.id);
            if (!entries.length) return null;
            return <DropdownMenu.Group key={organization.id}>
              <DropdownMenu.Label className="workspace-switcher-org">{organizationLabel(organization.id, organization.name, organizations)}</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={workspace?.id ?? ''} onValueChange={id => {
                const next = workspaces.find(item => item.id === id);
                if (next) selectWorkspace(next);
              }}>
                {entries.map(item => <DropdownMenu.RadioItem className="workspace-switcher-item" key={item.id} value={item.id}>
                  <span>{item.name}</span>{workspace?.id === item.id && <Check size={16} aria-hidden="true" />}
                </DropdownMenu.RadioItem>)}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Group>;
          })}
          {workspaceError && <div className="workspace-switcher-error" role="alert">{workspaceError}</div>}
          {canCreate && !workspaceLoading && !workspaceError && <>
            <DropdownMenu.Separator className="workspace-switcher-separator" />
            <DropdownMenu.Item className="workspace-switcher-create" onSelect={openCreate}>
              <Plus size={16} aria-hidden="true" />Create workspace
            </DropdownMenu.Item>
          </>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>

    <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="account-overlay" />
        <Dialog.Content className="account-dialog workspace-create-dialog">
          <Dialog.Title>Create a workspace</Dialog.Title>
          <Dialog.Description>Keep a project’s API keys, requests, and costs together.</Dialog.Description>
          <form onSubmit={submitCreate}>
            <Label htmlFor="workspace-name">Workspace name<Input id="workspace-name" required maxLength={200} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Product experiments" /></Label>
            {canChooseOrganization && <Label htmlFor="workspace-organization">Organization<NativeSelect id="workspace-organization" required value={organizationId} onChange={event => setOrganizationId(event.target.value)}><NativeSelectOption value="" disabled>Select an organization</NativeSelectOption>{organizations.map(item => <NativeSelectOption key={item.id} value={item.id}>{organizationLabel(item.id, item.name, organizations)}</NativeSelectOption>)}</NativeSelect></Label>}
            {!canChooseOrganization && workspace && <p className="workspace-create-parent">In {organizationLabel(workspace.organization_id, workspace.organization_name, organizations)}</p>}
            {!organizations.length && session?.kind === 'installation' && <p className="workspace-create-parent">Niu will create a personal organization for this workspace.</p>}
            {createError && <p className="error-text" role="alert">{createError}</p>}
            <div className="workspace-create-actions"><Button type="button" variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create workspace'}</Button></div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
