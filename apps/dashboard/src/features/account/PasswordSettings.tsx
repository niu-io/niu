import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function PasswordSettings({ token, onChanged }: {token: string; onChanged: () => Promise<void>}) {
  const saveController = useRef<AbortController | null>(null);
  useEffect(() => () => saveController.current?.abort(), [token]);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [capabilityError, setCapabilityError] = useState(false);
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const currentInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) currentInput.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setCapabilityError(false);
    void fetch('/admin/v1/auth/config', {signal:controller.signal,cache:'no-store'})
      .then(async response => { if (!response.ok) throw new Error('Capability request failed'); const value = await response.json(); if (typeof value?.password_login !== 'boolean') throw new Error('Invalid capability response'); return value; })
      .then(value => {if (!controller.signal.aborted) {setEnabled(value?.password_login === true);setLoaded(true);}})
      .catch(() => { if (!controller.signal.aborted) { setCapabilityError(true); setLoaded(true); } });
    return () => controller.abort();
  }, [capabilityRevision]);
  if (capabilityError) return <div className="mt-6 grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">Could not load password settings.</p><Button variant="secondary" onClick={() => setCapabilityRevision(value => value + 1)}>Retry password settings</Button></div>;
  if (!loaded) return <p role="status" className="mt-6 text-sm text-muted-foreground">Loading password settings…</p>;
  if (!enabled) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setError('');
    if (password !== confirmation) {setError('The new passwords do not match.'); return;}
    if ([...password].length < 15 || new TextEncoder().encode(password).length > 1024) {
      setError('Use at least 15 characters and at most 1024 bytes.'); return;
    }
    setSaving(true);
    const controller = new AbortController();
    saveController.current = controller;
    try {
      const response = await fetch('/admin/v1/auth/password', {
        method:'PUT', signal:controller.signal, cache:'no-store', headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify({current_password:current,password}),
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(response.status === 401 ? 'The current password could not be verified.'
          : response.status === 409 ? 'Your password changed while this request was running. Sign in again.'
          : response.status === 429 ? 'Too many attempts. Try again in a minute.' : 'Could not change your password. Try again.');
        return;
      }
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (result.sign_in_required !== true || !Number.isSafeInteger(result.revision) || result.revision < 1) throw new Error('Unconfirmed password change');
      setCurrent(''); setPassword(''); setConfirmation('');
      await onChanged();
    } catch {if (!controller.signal.aborted) setError('Could not confirm the password change. Try signing in before retrying.');}
    finally {if (!controller.signal.aborted) setSaving(false);}
  }
  return <section className="mt-6" aria-labelledby="password-settings-title">
    <Collapsible open={editing} onOpenChange={open=>{
      if (saving) return;
      if (!open) {setCurrent('');setPassword('');setConfirmation('');setError('');}
      setEditing(open);
    }}>
      <div className="flex flex-wrap items-center justify-between gap-4 py-4">
        <h3 id="password-settings-title" className="text-sm font-medium">Password</h3>
        {!editing && <CollapsibleTrigger asChild><Button ref={editButton} type="button" variant="secondary">Change password</Button></CollapsibleTrigger>}
      </div>
      <CollapsibleContent>
    <p className="text-sm text-muted-foreground">Changing your password signs you out on all devices.</p>
    <form onSubmit={submit} className="mt-4 grid max-w-md gap-4">
      <div className="grid gap-2"><Label htmlFor="account-current-password">Current password</Label><Input ref={currentInput} id="account-current-password" autoComplete="current-password" type="password" required disabled={saving} value={current} onChange={event=>setCurrent(event.target.value)}/></div>
      <div className="grid gap-2"><Label htmlFor="account-new-password">New password</Label><Input id="account-new-password" autoComplete="new-password" type="password" required disabled={saving} value={password} onChange={event=>setPassword(event.target.value)} aria-describedby="account-password-policy"/><p id="account-password-policy" className="text-sm text-muted-foreground">At least 15 characters.</p></div>
      <div className="grid gap-2"><Label htmlFor="account-confirm-password">Confirm new password</Label><Input id="account-confirm-password" autoComplete="new-password" type="password" required disabled={saving} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving}>{saving ? 'Changing…' : 'Update password'}</Button><CollapsibleTrigger asChild><Button type="button" variant="ghost" disabled={saving}>Cancel</Button></CollapsibleTrigger></div>
    </form>
      </CollapsibleContent>
    </Collapsible>
  </section>;
}
