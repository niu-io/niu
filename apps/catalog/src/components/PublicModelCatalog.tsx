import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconCopy, IconRefresh, IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { Input } from '../../../dashboard/src/components/ui/input';
import { Badge } from '../../../dashboard/src/components/ui/badge';

type PublicModel = {
  id: string;
  catalog?: {
    name?: string;
    description?: string;
    context_length?: number;
    max_completion_tokens?: number;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  capabilities?: Record<string, boolean>;
};

const protocols = [
  ['chat_completions', 'Chat completions', 'createchatcompletion'],
  ['streaming', 'Streaming', 'createchatcompletion'],
  ['embeddings', 'Embeddings', 'createembedding'],
  ['responses', 'Responses', 'createresponse'],
  ['messages', 'Messages', 'createmessage'],
  ['messages_streaming', 'Messages streaming', 'createmessage'],
  ['generate_content', 'Gemini content', 'generatecontent'],
] as const;
const number = new Intl.NumberFormat('en-US');
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
const tokenCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
  ? number.format(value) : null;

export default function PublicModelCatalog() {
  const [models, setModels] = useState<PublicModel[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const copyRevision = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    copyRevision.current += 1;
    setCopiedId(null);
    setCopyError('');
    return () => {
      copyRevision.current += 1;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [query, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    void fetch('/catalog/v1/models', { headers: { accept: 'application/json' }, cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Catalog unavailable');
        const body = await response.json();
        if (!Array.isArray(body.data) || body.data.some((model: PublicModel) => !model || typeof model.id !== 'string' || !model.id)) {
          throw new Error('Invalid catalog');
        }
        if (!controller.signal.aborted) { setModels(body.data); setState('ready'); }
      })
      .catch(() => { if (!controller.signal.aborted) { setModels([]); setState('error'); } });
    return () => controller.abort();
  }, [revision]);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = models.filter(model => {
    const catalog = model.catalog;
    const text = [model.id, catalog?.name, ...strings(catalog?.input_modalities), ...strings(catalog?.output_modalities),
      ...protocols.filter(([key]) => model.capabilities?.[key] === true).flatMap(([key, label]) => [key, label])].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const toggleTerm = (term: string) => {
    const normalized = term.toLocaleLowerCase();
    setQuery(previous => {
      const currentTerms = previous.trim().split(/\s+/).filter(Boolean);
      const exists = currentTerms.some(item => item.toLocaleLowerCase() === normalized);
      return exists ? currentTerms.filter(item => item.toLocaleLowerCase() !== normalized).join(' ') : [...currentTerms, normalized].join(' ');
    });
  };
  const copyModelId = async (id: string) => {
    const attempt = ++copyRevision.current;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopiedId(null);
    setCopyError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(id);
      if (copyRevision.current !== attempt) return;
      setCopiedId(id);
      copyTimer.current = window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      if (copyRevision.current === attempt) setCopyError('Could not copy the model ID. Select the ID beside the Copy button and copy it manually.');
    }
  };
  return <section className="catalog-browser" aria-label="Published models">
    <div className="catalog-toolbar">
      <div className="catalog-filter"><IconSearch size={18} aria-hidden="true" />
        <Input type="search" aria-label="Filter models" placeholder="Filter by name, modality or API…" value={query}
          onChange={event => setQuery(event.target.value)} disabled={state === 'loading'} />
      </div>
      <Button variant="outline" className="catalog-refresh-button" aria-label="Refresh" disabled={state === 'loading'} onClick={() => setRevision(value => value + 1)}><IconRefresh size={16} aria-hidden="true" /><span>Refresh</span></Button>
    </div>
    <p className="catalog-result-count" role="status">{state === 'loading' ? 'Loading models…' : state === 'error' ? 'Model catalog unavailable' : `${matches.length}${terms.length ? ` of ${models.length}` : ''} ${models.length === 1 ? 'model' : 'models'}`}</p>
    {copyError && <p role="alert">{copyError}</p>}
    <span className="sr-only" role="status">{copiedId ? 'Model ID copied.' : ''}</span>
    {state === 'error' && <div role="alert"><p>Could not load the public model catalog. Try refreshing.</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Try again</Button></div>}
    {state === 'ready' && models.length === 0 && <p>No models are published for public discovery on this gateway.</p>}
    {state === 'ready' && models.length > 0 && matches.length === 0 && <div><p>No models match this filter.</p><Button variant="ghost" onClick={() => setQuery('')}>Clear filter</Button></div>}
    {state === 'ready' && <div className="catalog-model-list">{matches.map(model => {
      const catalog = model.catalog;
      const name = catalog?.name || model.id;
      const description = typeof catalog?.description === 'string' ? catalog.description : '';
      const context = tokenCount(catalog?.context_length);
      const output = tokenCount(catalog?.max_completion_tokens);
      const supported = protocols.filter(([key]) => model.capabilities?.[key] === true);
      const guides = supported.filter(([key]) => key !== 'streaming' && key !== 'messages_streaming').map(([, label, slug]) => ({ label, slug }));
      const copied = copiedId === model.id;
      return <article key={model.id} className="catalog-model">
        <h2>{name}</h2>
        <div className="catalog-model-alias-row">
          <code className="catalog-model-alias">{model.id}</code>
          <Button type="button" variant="ghost" size="sm" className="catalog-model-copy" aria-label={`Copy model ID ${model.id}`} onClick={() => void copyModelId(model.id)}>
            {copied ? <IconCheck size={14} aria-hidden="true" /> : <IconCopy size={14} aria-hidden="true" />}
            <span>{copied ? 'Copied' : 'Copy ID'}</span>
          </Button>
        </div>
        {description && <><p className={expanded.has(model.id) ? 'catalog-description' : 'catalog-description catalog-description-preview'}>{description}</p>
          {description.length > 240 && <Button variant="link" className="catalog-description-toggle" aria-expanded={expanded.has(model.id)} onClick={() => setExpanded(previous => {
            const next = new Set(previous); if (next.has(model.id)) next.delete(model.id); else next.add(model.id); return next;
          })}>{expanded.has(model.id) ? 'Show less' : 'Read full description'}</Button>}</>}
        <div className="catalog-model-modalities">
          {strings(catalog?.input_modalities).map(value => {
            const active = terms.includes(value.toLocaleLowerCase());
            return <Badge key={'in-' + value} asChild variant={active ? 'default' : 'secondary'}><button type="button" className="catalog-modality-chip" aria-pressed={active} onClick={() => toggleTerm(value)}>{value} input</button></Badge>;
          })}
          {strings(catalog?.output_modalities).map(value => {
            const active = terms.includes(value.toLocaleLowerCase());
            return <Badge key={'out-' + value} asChild variant={active ? 'default' : 'secondary'}><button type="button" className="catalog-modality-chip" aria-pressed={active} onClick={() => toggleTerm(value)}>{value} output</button></Badge>;
          })}
          {supported.some(([key]) => key === 'streaming' || key === 'messages_streaming') && (() => {
            const active = terms.includes('streaming');
            return <Badge asChild variant={active ? 'default' : 'secondary'}><button type="button" className="catalog-modality-chip" aria-pressed={active} onClick={() => toggleTerm('streaming')}>Streaming</button></Badge>;
          })()}
        </div>
        <div className="catalog-model-footer">{(context || output) && <p className="catalog-model-limits">{[context && `${context} token context`, output && `${output} max output tokens`].filter(Boolean).join(' · ')}</p>}
        {guides.length > 0 && <nav className="catalog-model-guides" aria-label={`${name} API documentation`}>{guides.map(({ label, slug }) => <a key={slug} href={`/docs/api/rest/${slug}/`}>{label} API</a>)}</nav>}
        </div>
      </article>;
    })}</div>}
    <p className="catalog-footnote">Public discovery does not grant access. Your workspace key determines which models you can call and your customer prices.</p>
  </section>;
}
