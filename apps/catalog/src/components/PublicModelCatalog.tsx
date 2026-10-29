import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  IconAlertTriangle, IconArrowRight, IconBolt, IconCheck, IconCopy, IconFileText, IconLayoutGrid, IconMicrophone,
  IconPhoto, IconRefresh, IconSearch, IconSearchOff, IconTypography, IconVideo, type IconProps,
} from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { Input } from '../../../dashboard/src/components/ui/input';
import { Skeleton } from '../../../dashboard/src/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '../../../dashboard/src/components/ui/tabs';
import ProviderLogo from '../../../dashboard/src/components/ProviderLogo';
import { modelIdentity } from '../../../dashboard/src/lib/providers';
import { useLocale } from '../../../dashboard/src/app/locale';

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
  ['chat_completions', 'Chat completions', '对话补全 (Chat)', 'createchatcompletion'],
  ['streaming', 'Streaming', '流式输出', 'createchatcompletion'],
  ['embeddings', 'Embeddings', '向量嵌入 (Embeddings)', 'createembedding'],
  ['responses', 'Responses', 'Responses', 'createresponse'],
  ['messages', 'Messages', 'Messages', 'createmessage'],
  ['messages_streaming', 'Messages streaming', 'Messages 流式输出', 'createmessage'],
  ['generate_content', 'Gemini content', 'Gemini 生成', 'generatecontent'],
] as const;

const modalityZh: Record<string, string> = {
  text: '文本',
  image: '图像',
  audio: '音频',
  video: '视频',
  file: '文件',
};

// Modality vocabulary published by the catalog contract; unknown values keep a text label without an icon.
const modalityIcons: Record<string, ComponentType<IconProps>> = {
  text: IconTypography,
  image: IconPhoto,
  file: IconFileText,
  audio: IconMicrophone,
  video: IconVideo,
};
const modalityOrder = Object.keys(modalityIcons);
const modalityEn = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);

const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];

export default function PublicModelCatalog() {
  const { locale, isZh, t } = useLocale();
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const compactFormat = useMemo(() => new Intl.NumberFormat(locale, { notation: 'compact', maximumSignificantDigits: 3 }), [locale]);
  const tokenCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? { full: numberFormat.format(value), short: compactFormat.format(value) } : null;
  const modalityName = (value: string) => isZh ? (modalityZh[value.toLocaleLowerCase()] ?? value) : modalityEn(value);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [queryLoaded, setQueryLoaded] = useState(false);
  useEffect(() => {
    const restoreQuery = () => {
      const params = new URL(window.location.href).searchParams;
      setQuery(params.get('q') ?? '');
      setCategory(params.get('modality') ?? 'all');
    };
    restoreQuery();
    setQueryLoaded(true);
    window.addEventListener('popstate', restoreQuery);
    return () => window.removeEventListener('popstate', restoreQuery);
  }, []);
  useEffect(() => {
    if (!queryLoaded) return;
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    if (category !== 'all') url.searchParams.set('modality', category);
    else url.searchParams.delete('modality');
    window.history.replaceState(window.history.state, '', url);
  }, [query, category, queryLoaded]);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const copyRevision = useRef(0);
  const copyTimer = useRef<number | null>(null);
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
  const modelModalities = (model: PublicModel) => new Set([...strings(model.catalog?.input_modalities), ...strings(model.catalog?.output_modalities)]
    .map(value => value.toLocaleLowerCase()));
  const textMatches = models.filter(model => {
    const catalog = model.catalog;
    const developer = modelIdentity(model);
    const text = [model.id, catalog?.name, developer.id === 'other' ? '' : developer.name, ...strings(catalog?.input_modalities), ...strings(catalog?.output_modalities),
      ...protocols.filter(([key]) => model.capabilities?.[key] === true).flatMap(([key, label, labelZh]) => [key, label, labelZh])].join(' ').toLocaleLowerCase();
    return terms.every(term => {
      const directional = /^(input|output):(.+)$/.exec(term);
      if (!directional) return text.includes(term);
      const modalities = directional[1] === 'input' ? catalog?.input_modalities : catalog?.output_modalities;
      return strings(modalities).some(value => value.toLocaleLowerCase() === directional[2]);
    });
  });
  const categories = modalityOrder
    .filter(key => models.some(model => modelModalities(model).has(key)))
    .map(key => ({ key, count: textMatches.filter(model => modelModalities(model).has(key)).length }));
  const activeCategory = category === 'all' || categories.some(item => item.key === category) ? category : 'all';
  const matches = activeCategory === 'all' ? textMatches : textMatches.filter(model => modelModalities(model).has(activeCategory));
  const filtered = terms.length > 0 || activeCategory !== 'all';
  const clearFilters = () => { setQuery(''); setCategory('all'); };
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
      if (copyRevision.current === attempt) setCopyError(t('Could not copy the model ID. Select the ID beside the Copy button and copy it manually.', '无法复制模型 ID，请选中旁边的 ID 手动复制。'));
    }
  };
  const chip = (key: string, term: string, label: string, Icon?: ComponentType<IconProps>) => {
    const active = terms.includes(term.toLocaleLowerCase());
    return <Button key={key} type="button" size="sm" variant={active ? 'default' : 'secondary'} className="catalog-modality-chip h-6 rounded-full px-2 text-xs" aria-pressed={active} onClick={() => toggleTerm(term)}>
      {Icon && <Icon size={13} stroke={1.8} aria-hidden="true" />}{label}
    </Button>;
  };
  return <>
    <h1>{t('Models', '模型目录')}</h1>
    <p className="catalog-lede">
      {t(
        'Explore models published on this gateway. Filter by name, developer, input or output modality, or supported API.',
        '浏览此网关公开发布的模型。支持按名称、开发商、输入/输出模态或支持的 API 协议筛选。',
      )}
    </p>
    <section className="catalog-browser" aria-label="Published models">
      <div className="catalog-toolbar">
        <div className="catalog-filter"><IconSearch size={17} aria-hidden="true" />
          <Input type="search" aria-label="Filter models" placeholder={t('Filter by name, developer, modality or API…', '按模型名称、开发商、模态或 API 协议筛选…')} value={query}
            onChange={event => setQuery(event.target.value)} disabled={state === 'loading'} />
        </div>
        <Button variant="outline" className="catalog-refresh-button" aria-label="Refresh" disabled={state === 'loading'} onClick={() => setRevision(value => value + 1)}><IconRefresh size={16} aria-hidden="true" /><span>{t('Refresh', '刷新')}</span></Button>
        {filtered && <Button variant="ghost" onClick={clearFilters}>{t('Clear filters', '清除筛选')}</Button>}
      </div>
      {state === 'ready' && categories.length > 0 && <Tabs value={activeCategory} onValueChange={setCategory} className="catalog-categories">
        <TabsList variant="line" aria-label={t('Filter by modality', '按模态筛选')}>
          <TabsTrigger value="all"><IconLayoutGrid aria-hidden="true" />{t('All', '全部')}<span className="catalog-category-count">{textMatches.length}</span></TabsTrigger>
          {categories.map(({ key, count }) => {
            const Icon = modalityIcons[key];
            return <TabsTrigger key={key} value={key}><Icon aria-hidden="true" />{modalityName(key)}<span className="catalog-category-count">{count}</span></TabsTrigger>;
          })}
        </TabsList>
      </Tabs>}
      <p className="catalog-result-count" role="status">
        {state === 'loading'
          ? t('Loading models…', '正在加载模型…')
          : state === 'error'
            ? t('Model catalog unavailable', '模型目录暂不可用')
            : isZh
              ? (filtered ? `已匹配 ${matches.length} / ${models.length} 个模型` : `共 ${models.length} 个模型`)
              : `${matches.length}${filtered ? ` of ${models.length}` : ''} ${models.length === 1 ? 'model' : 'models'}`}
      </p>
      {copyError && <p role="alert">{copyError}</p>}
      <span className="sr-only" role="status">{copiedId ? t('Model ID copied.', '已复制模型 ID。') : ''}</span>
      {state === 'loading' && <div className="catalog-model-list" aria-hidden="true">{[0, 1, 2].map(index => <div key={index} className="catalog-model catalog-model-skeleton">
        <Skeleton className="size-9 rounded-[10px]" />
        <div><Skeleton className="h-5 w-56 max-w-full" /><Skeleton className="mt-3 h-4 w-full" /><Skeleton className="mt-2 h-4 w-3/4" /></div>
      </div>)}</div>}
      {state === 'error' && <div className="catalog-empty" role="alert">
        <span className="catalog-empty-icon"><IconAlertTriangle size={20} aria-hidden="true" /></span>
        <p className="catalog-empty-title">{t('Could not load the public model catalog', '无法加载公开模型目录')}</p>
        <p>{t('Check your connection, then try again.', '请检查网络连接后重试。')}</p>
        <Button variant="outline" onClick={() => setRevision(value => value + 1)}><IconRefresh size={16} aria-hidden="true" />{t('Try again', '重试')}</Button>
      </div>}
      {state === 'ready' && models.length === 0 && <div className="catalog-empty">
        <span className="catalog-empty-icon"><IconLayoutGrid size={20} aria-hidden="true" /></span>
        <p className="catalog-empty-title">{t('No models published yet', '暂无公开模型')}</p>
        <p>{t('No models are published for public discovery on this gateway.', '此网关暂未公开发布任何可供浏览的模型。')}</p>
      </div>}
      {state === 'ready' && models.length > 0 && matches.length === 0 && <div className="catalog-empty">
        <span className="catalog-empty-icon"><IconSearchOff size={20} aria-hidden="true" /></span>
        <p className="catalog-empty-title">{t('No models match this filter', '没有符合当前筛选条件的模型')}</p>
        <p>{t('Try a different name, developer or modality.', '请尝试其他名称、开发商或模态。')}</p>
        <Button variant="outline" onClick={clearFilters}>{t('Clear filter', '清除筛选')}</Button>
      </div>}
      {state === 'ready' && matches.length > 0 && <div className="catalog-model-list">{matches.map(model => {
        const catalog = model.catalog;
        const name = catalog?.name || model.id;
        const developer = modelIdentity(model);
        const description = typeof catalog?.description === 'string' ? catalog.description : '';
        const context = tokenCount(catalog?.context_length);
        const output = tokenCount(catalog?.max_completion_tokens);
        const supported = protocols.filter(([key]) => model.capabilities?.[key] === true);
        const guides = supported.filter(([key]) => key !== 'streaming' && key !== 'messages_streaming').map(([, label, labelZh, slug]) => ({ label: isZh ? labelZh : label, slug }));
        const streaming = supported.some(([key]) => key === 'streaming' || key === 'messages_streaming');
        const inputs = strings(catalog?.input_modalities);
        const outputs = strings(catalog?.output_modalities);
        const copied = copiedId === model.id;
        return <article key={model.id} className="catalog-model">
          <ProviderLogo provider={developer} size="small" />
          <div className="catalog-model-body">
            <div className="catalog-model-heading">
              <h2>{name}</h2>
              {context && <span className="catalog-model-context" title={isZh ? `${context.full} Token 上下文窗口` : `${context.full} token context window`}>{isZh ? `${context.short} 上下文` : `${context.short} context`}</span>}
            </div>
            <div className="catalog-model-alias-row">
              <code className="catalog-model-alias">{model.id}</code>
              <Button type="button" variant="ghost" size="sm" className="catalog-model-copy" aria-label={`Copy model ID ${model.id}`} onClick={() => void copyModelId(model.id)}>
                {copied ? <IconCheck size={14} aria-hidden="true" /> : <IconCopy size={14} aria-hidden="true" />}
                <span>{copied ? t('Copied', '已复制') : t('Copy ID', '复制 ID')}</span>
              </Button>
            </div>
            {description && <><p className={expanded.has(model.id) ? 'catalog-description' : 'catalog-description catalog-description-preview'}>{description}</p>
              {description.length > 240 && <Button variant="link" className="catalog-description-toggle" aria-expanded={expanded.has(model.id)} onClick={() => setExpanded(previous => {
                const next = new Set(previous); if (next.has(model.id)) next.delete(model.id); else next.add(model.id); return next;
              })}>{expanded.has(model.id) ? t('Show less', '收起描述') : t('Read full description', '展开完整描述')}</Button>}</>}
            <div className="catalog-model-modalities">
              {inputs.map(value => chip('in-' + value, `input:${value}`, isZh ? `${modalityName(value)}输入` : `${value} input`, modalityIcons[value.toLocaleLowerCase()]))}
              {inputs.length > 0 && outputs.length > 0 && <IconArrowRight className="catalog-modality-arrow" size={14} aria-hidden="true" />}
              {outputs.map(value => chip('out-' + value, `output:${value}`, isZh ? `${modalityName(value)}输出` : `${value} output`, modalityIcons[value.toLocaleLowerCase()]))}
              {streaming && chip('streaming', 'streaming', t('Streaming', '流式输出'), IconBolt)}
            </div>
            <div className="catalog-model-footer">
              {developer.id !== 'other' && <span>{isZh ? `开发商 ${developer.name}` : `by ${developer.name}`}</span>}
              {output && <span title={isZh ? `最大输出 ${output.full} Token` : `${output.full} max output tokens`}>{isZh ? `最大输出 ${output.short}` : `${output.short} max output`}</span>}
              {guides.length > 0 && <nav className="catalog-model-guides" aria-label={`${name} API documentation`}>{guides.map(({ label, slug }) => <a key={slug} href={`/docs/api/rest/${slug}/`}>{label} API</a>)}</nav>}
            </div>
          </div>
        </article>;
      })}</div>}
      <p className="catalog-footnote">{t('Public discovery does not grant access. Your workspace key determines which models you can call and your customer prices.', '公开目录仅用于浏览，不直接授予调用权限。您的工作空间密钥决定了可调用的模型范围及客户计费价格。')}</p>
    </section>
    <p className="catalog-help">
      {isZh ? (
        <>
          需要为您的密钥启用模型别名？请<a href="/workspaces/default/keys">打开工作空间</a>或阅读<a href="/docs/configuration/models/">路由配置文档</a>。
        </>
      ) : (
        <>
          Need an alias enabled for your key?{" "}
          <a href="/workspaces/default/keys">Open the workspace</a> or{" "}
          <a href="/docs/configuration/models/">read route configuration</a>.
        </>
      )}
    </p>
  </>;
}
