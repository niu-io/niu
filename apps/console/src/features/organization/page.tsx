import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, Plus, UsersRound } from 'lucide-react';
import ConnectGate from '@/app/ConnectGate';
import type { ConsoleContext } from '@/app/console-context';
import { workspacePathSegment } from '@/app/workspace-route';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function OrganizationSettings({ context }: { context: ConsoleContext }) {
  const { organization, workspaces, session, createWorkspace } = context;
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const entries = workspaces.filter(item => item.organization_id === organization?.id);
  const canCreate = session?.permissions.write && (session.kind === 'installation' || session.operator?.project_id === null);
  const workspacePath = entries.length ? `/workspaces/${workspacePathSegment(entries[0], workspaces)}` : '/workspaces/default';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization || !name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await createWorkspace(name.trim(), organization.id);
      setCreateOpen(false);
      setName('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create workspace.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="organization-settings">
    <PageHeader title="Organization settings" />
    {!organization ? <section className="panel"><p>No organization is available. Create a workspace to get started.</p></section> : <>
      <section className="organization-settings-card" aria-labelledby="organization-details-title">
        <h2 id="organization-details-title">General</h2>
        <dl className="organization-details"><div><dt>Organization name</dt><dd>{organization.name}</dd></div><div><dt>Organization ID</dt><dd><code>{organization.id}</code></dd></div></dl>
      </section>
      <section className="organization-settings-card" aria-labelledby="organization-workspaces-title">
        <div className="organization-section-heading"><div><h2 id="organization-workspaces-title">Workspaces</h2></div>{canCreate && <Button variant="outline" onClick={() => { setError(''); setName(''); setCreateOpen(true); }}><Plus size={16} />Create workspace</Button>}</div>
        {entries.length ? <ul className="organization-workspaces">{entries.map(item => <li key={item.id}><Link to={`/workspaces/${workspacePathSegment(item, workspaces)}`}><span>{item.name}</span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>)}</ul> : <p>No workspaces yet.</p>}
      </section>
      <section className="organization-settings-card" aria-labelledby="organization-access-title">
        <div className="organization-section-heading"><div><h2 id="organization-access-title">People & access</h2></div>{session?.permissions.manage_operators && <Button asChild variant="outline"><Link to={`${workspacePath}/operators`}><UsersRound size={16} />Manage access</Link></Button>}</div>
        {!session?.permissions.manage_operators && <p>Contact an organization administrator to change access.</p>}
      </section>
      <Dialog open={createOpen} onOpenChange={open => { if (!saving) setCreateOpen(open); }}>
      <DialogContent className="niu-modal" showCloseButton={false}>
        <DialogHeader className="niu-modal-heading flex-row text-left">
          <div><DialogTitle>Create a workspace</DialogTitle><DialogDescription>{`In ${organization.name}`}</DialogDescription></div>
          <DialogClose className="niu-modal-close" aria-label="Close dialog"><X size={18} /></DialogClose>
        </DialogHeader>
        <form onSubmit={submit} className="organization-create-form"><Label htmlFor="organization-workspace-name">Workspace name</Label><Input id="organization-workspace-name" required maxLength={200} value={name} onChange={event => setName(event.target.value)} autoFocus placeholder="e.g. Product experiments" />{error && <p role="alert" className="error-text">{error}</p>}<Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create workspace'}</Button></form>
      </DialogContent>
    </Dialog>
    </>}
  </div>;
}

export default function OrganizationRoute() {
  return <ConnectGate>{context => <OrganizationSettings key={context.organization?.id} context={context} />}</ConnectGate>;
}
