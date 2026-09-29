import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy, KeyRound } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { projectKeyPath, keyRequest, workspacePath, type IssuedProjectKey } from '../api';
import { useConsoleContext } from '@/app/console-context';

type Scope = { organizationId: string; projectId: string };
const expirationOptions = [7, 30, 90, 365];

export default function NewKeyView({ token, models, canWrite, initialScope }: {
  token: string;
  models: string[];
  canWrite: boolean;
  initialScope: Scope | null;
}) {
  const { rememberChatKey } = useConsoleContext();
  const location = useLocation();
  const root = workspacePath(location.pathname);
  const chatWorkspace = root.split('/').filter(Boolean)[1] ?? initialScope?.projectId ?? '';
  const [name, setName] = useState('My application');
  const [allowedModels, setAllowedModels] = useState<string[]>(() => models[0] ? [models[0]] : []);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [issued, setIssued] = useState<IssuedProjectKey | null>(null);
  const [clientModel, setClientModel] = useState(models[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const modelSignature = models.join('\u0000');
  const availableModels = useMemo(() => [...new Set(models)], [modelSignature]);
  const baseURL = typeof window === 'undefined'
    ? `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/v1`
    : `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}/v1`;

  useEffect(() => {
    setAllowedModels(current => {
      const available = current.filter(model => availableModels.includes(model));
      return available.length ? available : availableModels.slice(0, 1);
    });
    setClientModel(current => availableModels.includes(current) ? current : availableModels[0] ?? '');
  }, [availableModels]);

  function toggleModel(model: string, checked: boolean) {
    setAllowedModels(current => checked
      ? current.includes(model) ? current : [...current, model]
      : current.filter(item => item !== model));
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied`);
    } catch {
      setNotice('Clipboard unavailable. Select the value to copy it.');
    }
  }

  const clientExample = `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  apiKey: process.env.NIU_API_KEY,\n  baseURL: '${baseURL}',\n});\n\nconst response = await client.chat.completions.create({\n  model: '${clientModel}',\n  messages: [{ role: 'user', content: 'Hello' }],\n});`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!initialScope || !canWrite || !name.trim() || !allowedModels.length || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await keyRequest<IssuedProjectKey>(
        token,
        projectKeyPath(initialScope.organizationId, initialScope.projectId),
        'POST',
        { name: name.trim(), allowed_models: allowedModels, ttl_seconds: expiresInDays * 86400 },
      );
      setIssued(result);
      if (initialScope) {
        rememberChatKey({
          ...result,
          name: name.trim(),
          allowedModels,
          organizationId: initialScope.organizationId,
          projectId: initialScope.projectId,
        });
      }
      setClientModel(allowedModels[0]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this API key.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="page-heading key-page-heading">
      <p className="page-subtitle">{issued ? 'Copy the key now. Niu won’t show this secret again.' : 'Choose the model aliases this key can access.'}</p>
      <Button asChild variant="outline"><Link to={`${root}/keys`}><ArrowLeft size={15} />All API keys</Link></Button>
    </div>

    {error && <p role="alert" className="key-page-error">{error}</p>}
    {!initialScope && <section className="panel key-form-card"><p>Choose a workspace before creating a key.</p></section>}
    {initialScope && !availableModels.length && <section className="panel key-form-card key-prerequisite" role="status">
      <div><KeyRound size={19} /><strong>Connect a model first</strong></div>
      <p>API keys grant access to model aliases configured in this workspace.</p>
      <Button asChild><Link to={`${root}/vendors`}>Connect provider</Link></Button>
    </section>}
    {initialScope && availableModels.length > 0 && !issued && <form onSubmit={submit}>
      <section className="panel key-form-card">
        <div className="key-form-grid">
          <Label htmlFor="key-name">Key name<Input id="key-name" autoComplete="off" maxLength={200} required value={name} onChange={event => setName(event.target.value)} /></Label>
          <div className="key-choice-field"><Label id="key-expiry-label">Expires after</Label><DropdownMenu><DropdownMenuTrigger asChild><Button id="key-expiry" type="button" variant="outline" className="w-full justify-between font-normal" aria-labelledby="key-expiry-label">{expiresInDays} days<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={String(expiresInDays)} onValueChange={value => setExpiresInDays(Number(value))}>{expirationOptions.map(days => <DropdownMenuRadioItem key={days} value={String(days)}>{days} days</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu></div>
        </div>
        <fieldset className="key-model-grants">
          <legend>Allowed models</legend>
          <div>{availableModels.map((model, index) => <Label className="key-model-grant" htmlFor={`allowed-model-${index}`} key={model}>
            <Checkbox id={`allowed-model-${index}`} checked={allowedModels.includes(model)} onCheckedChange={value => toggleModel(model, value === true)} />
            <span>{model}</span>
          </Label>)}</div>
        </fieldset>
        {!canWrite && <p className="key-read-only">This session can view keys but cannot create them.</p>}
        <div className="key-form-actions"><span>Access is limited to this workspace and the selected models.</span><Button type="submit" disabled={!canWrite || busy || !name.trim() || !allowedModels.length}>{busy ? 'Creating…' : 'Create API key'}</Button></div>
      </section>
    </form>}
    {issued && <section className="panel key-issued-card" role="status" aria-labelledby="issued-key-title">
      <div className="key-issued-heading"><span><Check size={17} /></span><div><h2 id="issued-key-title">API key created</h2><p>Copy this secret now. It cannot be retrieved later.</p></div></div>
      <div className="key-copy-field"><Label htmlFor="issued-api-key">API key</Label><div><Input id="issued-api-key" className="mono" readOnly autoComplete="off" value={issued.token} onFocus={event => event.target.select()} /><Button type="button" variant="outline" onClick={() => void copy('API key', issued.token)}><Copy size={15} />Copy key</Button></div></div>
      <div className="key-client-fields">
        <div className="key-copy-field"><Label htmlFor="issued-base-url">Niu base URL</Label><div><Input id="issued-base-url" className="mono" readOnly value={baseURL} onFocus={event => event.target.select()} /><Button type="button" variant="outline" onClick={() => void copy('Niu base URL', baseURL)}><Copy size={15} />Copy</Button></div></div>
        <div className="key-copy-field"><Label id="issued-model-label">Model alias</Label><div>{allowedModels.length > 1 ? <DropdownMenu><DropdownMenuTrigger asChild><Button id="issued-model" type="button" variant="outline" className="justify-between font-normal" aria-labelledby="issued-model-label">{clientModel}<ChevronDown size={16} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]"><DropdownMenuRadioGroup value={clientModel} onValueChange={setClientModel}>{allowedModels.map(model => <DropdownMenuRadioItem key={model} value={model}>{model}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu> : <span className="key-model-value">{clientModel}</span>}<Button type="button" variant="outline" onClick={() => void copy('Model alias', clientModel)}><Copy size={15} />Copy</Button></div></div>
      </div>
      <div className="key-sdk-example"><div><strong>OpenAI SDK</strong><Button type="button" variant="outline" size="sm" onClick={() => void copy('SDK example', clientExample)}><Copy size={14} />Copy example</Button></div><pre><code>{clientExample}</code></pre><p>Set <code>NIU_API_KEY</code> to the key above. Your client sends requests to Niu; provider credentials stay in the workspace.</p></div>
      {notice && <p className="key-copy-notice" role="status">{notice}</p>}
      <div className="key-issued-actions">{allowedModels.length >= 2 && <Button asChild><Link to={`/chat?workspace=${encodeURIComponent(chatWorkspace)}&key=${encodeURIComponent(issued.id)}`}>Open Chat</Link></Button>}<Button asChild variant="outline"><Link to={`${root}/keys/${encodeURIComponent(issued.id)}`}>View key activity</Link></Button><Button asChild variant={allowedModels.length >= 2 ? 'ghost' : 'default'}><Link to={`${root}/keys`}>Done</Link></Button></div>
      {allowedModels.length < 2 && <p className="key-copy-notice">To compare models in Chat, create a key that allows at least two model routes.</p>}
    </section>}
  </>;
}
