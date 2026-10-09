import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useDashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName } from '@/app/workspace-route';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function WorkspaceSettings() {
  const context = useDashboardContext();
  const workspace = context.workspace;
  const nameInputRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState(workspace ? workspaceDisplayName(workspace.name) : '');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const operationScope = useRef(0);
  useLayoutEffect(() => {
    operationScope.current += 1;
    setSaving(false); setConfirming(false); setConfirmation(''); setError(''); setSaved(false);
    return () => { operationScope.current += 1; };
  }, [workspace?.id]);
  useEffect(() => { setName(workspace ? workspaceDisplayName(workspace.name) : ''); setError(''); }, [workspace?.id, workspace?.name]);
  useEffect(() => setSaved(false), [workspace?.id]);
  if (!workspace) return null;
  const canEdit = Boolean(context.session?.permissions.write);
  const canDelete = Boolean(context.session?.permissions.manage_operators && (context.session.kind === 'installation' || context.session.operator?.project_id === null));
  async function rename(event: FormEvent) {
    event.preventDefault(); if (!workspace || saving || !name.trim()) return;
    setSaving(true); setError('');
    const scope = operationScope.current;
    try {
      await context.renameWorkspace(workspace, name);
      if (scope === operationScope.current) setSaved(true);
    } catch (cause) { if (scope === operationScope.current) setError(cause instanceof Error ? cause.message : 'Could not rename workspace.'); }
    finally { if (scope === operationScope.current) setSaving(false); }
  }
  async function remove() {
    if (!workspace || workspace.is_default || saving || confirmation !== workspaceDisplayName(workspace.name)) return;
    setSaving(true); setError('');
    const scope = operationScope.current;
    try {
      await context.deleteWorkspace(workspace);
      if (scope === operationScope.current) setConfirming(false);
    } catch (cause) { if (scope === operationScope.current) setError(cause instanceof Error ? cause.message : 'Could not delete workspace.'); }
    finally { if (scope === operationScope.current) setSaving(false); }
  }
  return <div className="w-full min-w-0 space-y-10">
    <section aria-labelledby="workspace-general-title" className="space-y-5">
      <h2 id="workspace-general-title" className="text-base font-semibold">General</h2>
      <form onSubmit={rename} className="grid gap-5">
        <div className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] sm:gap-6">
          <Label htmlFor="workspace-name">Workspace name</Label>
          <Input ref={nameInputRef} id="workspace-name" required maxLength={200} value={name} disabled={!canEdit || saving} onChange={event => {setName(event.target.value);setSaved(false);}}/>
        </div>
        <div className="flex justify-end gap-2">
          {name !== workspaceDisplayName(workspace.name) && <Button type="button" variant="ghost" disabled={saving} onClick={() => { setName(workspaceDisplayName(workspace.name)); setError(''); setSaved(false); nameInputRef.current?.focus(); }}>Cancel</Button>}
          <Button disabled={!canEdit || saving || !name.trim() || name.trim() === workspaceDisplayName(workspace.name)}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
        {saved && <p role="status" className="text-sm text-muted-foreground">Workspace renamed.</p>}
      </form>
    </section>
    {canDelete && <section aria-labelledby="workspace-delete-title" className="space-y-3">
      <h2 id="workspace-delete-title" className="text-base font-semibold">Delete workspace</h2>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{workspace.is_default ? 'The default workspace cannot be deleted.' : 'Only empty workspaces can be deleted. Workspaces with saved records are protected.'}</p>
        <Button ref={deleteButtonRef} variant="destructive" disabled={workspace.is_default} onClick={() => {setConfirmation('');setError('');setConfirming(true);}}>Delete workspace</Button>
      </div>
    </section>}
    {!confirming && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Dialog open={confirming} onOpenChange={open => {if (!saving) {setConfirming(open);if (!open) setError('');}}}>
      <DialogContent onCloseAutoFocus={event => {if (deleteButtonRef.current) {event.preventDefault();deleteButtonRef.current.focus();}}}><DialogHeader><DialogTitle>Delete {workspaceDisplayName(workspace.name)}?</DialogTitle><DialogDescription>Deletion is permanent and only allowed when the workspace has no saved records.</DialogDescription></DialogHeader>
        <div className="grid gap-2"><Label htmlFor="workspace-delete-confirmation">Type the workspace name to confirm</Label><Input id="workspace-delete-confirmation" value={confirmation} disabled={saving} onChange={event => setConfirmation(event.target.value)}/></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="ghost" disabled={saving} onClick={() => {setConfirming(false);setError('');}}>Cancel</Button><Button variant="destructive" disabled={saving || confirmation !== workspaceDisplayName(workspace.name)} onClick={() => void remove()}>{saving ? 'Deleting…' : 'Delete workspace'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
