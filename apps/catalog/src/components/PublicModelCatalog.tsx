import { useEffect, useMemo, useState } from 'react';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { Button } from '../../../dashboard/src/components/ui/button';
import { Input } from '../../../dashboard/src/components/ui/input';
import { Badge } from '../../../dashboard/src/components/ui/badge';
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

const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];

export default function PublicModelCatalog() {
  const { locale, isZh, t } = useLocale();
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const tokenCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? numberFormat.format(value) : null;
  const [models, setModels] = useState<PublicModel[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
      ...protocols.filter(([key]) => model.capabilities?.[key] === true).flatMap(([key, label, labelZh]) => [key, label, labelZh])].join(' ').toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  return <>
    <h1>{t('Models', '模型目录')}</h1>
    <p className="catalog-lede">
      {t(
        'Explore models published on this gateway. Filter by name, input or output modality, or supported API.',
        '浏览此网关公开发布的模型。支持按名称、输入/输出模态或支持的 API 协议筛选。',
      )}
    </p>
    <section className="catalog-browser" aria-label="Published models">
      <div className="catalog-toolbar">
        <div className="catalog-filter"><IconSearch size={18} aria-hidden="true" />
          <Input type="search" aria-label="Filter models" placeholder={t('Filter by name, modality or API…', '按模型名称、模态或 API 协议筛选…')} value={query}
            onChange={event => setQuery(event.target.value)} disabled={state === 'loading'} />
        </div>
        <Button variant="outline" disabled={state === 'loading'} onClick={() => setRevision(value => value + 1)}><IconRefresh size={16} aria-hidden="true" />{t('Refresh', '刷新')}</Button>
      </div>
      <p className="catalog-result-count" role="status">
        {state === 'loading'
          ? t('Loading models…', '正在加载模型…')
          : state === 'error'
            ? t('Model catalog unavailable', '模型目录暂不可用')
            : isZh
              ? (terms.length ? `已匹配 ${matches.length} / ${models.length} 个模型` : `共 ${models.length} 个模型`)
              : `${matches.length}${terms.length ? ` of ${models.length}` : ''} ${models.length === 1 ? 'model' : 'models'}`}
      </p>
      {state === 'error' && <div role="alert"><p>{t('Could not load the public model catalog. Try refreshing.', '无法加载公开模型目录，请刷新重试。')}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>{t('Try again', '重试')}</Button></div>}
      {state === 'ready' && models.length === 0 && <p>{t('No models are published for public discovery on this gateway.', '此网关暂未公开发布任何可供浏览的模型。')}</p>}
      {state === 'ready' && models.length > 0 && matches.length === 0 && <div><p>{t('No models match this filter.', '没有符合当前筛选条件的模型。')}</p><Button variant="ghost" onClick={() => setQuery('')}>{t('Clear filter', '清除筛选')}</Button></div>}
      {state === 'ready' && <div className="catalog-model-list">{matches.map(model => {
        const catalog = model.catalog;
        const name = catalog?.name || model.id;
        const description = typeof catalog?.description === 'string' ? catalog.description : '';
        const context = tokenCount(catalog?.context_length);
        const output = tokenCount(catalog?.max_completion_tokens);
        const supported = protocols.filter(([key]) => model.capabilities?.[key] === true);
        const guides = supported.filter(([key]) => key !== 'streaming' && key !== 'messages_streaming').map(([, label, labelZh, slug]) => ({ label: isZh ? labelZh : label, slug }));
        return <article key={model.id} className="catalog-model">
          <h2>{name}</h2>
          {name !== model.id && <p className="catalog-model-alias">{model.id}</p>}
          {description && <><p className={expanded.has(model.id) ? 'catalog-description' : 'catalog-description catalog-description-preview'}>{description}</p>
            {description.length > 240 && <Button variant="link" className="catalog-description-toggle" aria-expanded={expanded.has(model.id)} onClick={() => setExpanded(previous => {
              const next = new Set(previous); if (next.has(model.id)) next.delete(model.id); else next.add(model.id); return next;
            })}>{expanded.has(model.id) ? t('Show less', '收起描述') : t('Read full description', '展开完整描述')}</Button>}</>}
          <div className="catalog-model-modalities">
            {strings(catalog?.input_modalities).map(value => <Badge key={'in-' + value} variant="secondary">{isZh ? `${modalityZh[value.toLowerCase()] ?? value}输入` : `${value} input`}</Badge>)}
            {strings(catalog?.output_modalities).map(value => <Badge key={'out-' + value} variant="secondary">{isZh ? `${modalityZh[value.toLowerCase()] ?? value}输出` : `${value} output`}</Badge>)}
            {supported.some(([key]) => key === 'streaming' || key === 'messages_streaming') && <Badge variant="secondary">{t('Streaming', '流式输出')}</Badge>}
          </div>
          <div className="catalog-model-footer">{(context || output) && <p className="catalog-model-limits">{[context && (isZh ? `${context} 上下文窗口` : `${context} token context`), output && (isZh ? `最大输出 ${output} Token` : `${output} max output tokens`)].filter(Boolean).join(' · ')}</p>}
          {guides.length > 0 && <nav className="catalog-model-guides" aria-label={`${name} API documentation`}>{guides.map(({ label, slug }) => <a key={slug} href={`/docs/api/rest/${slug}/`}>{isZh ? `${label} API` : `${label} API`}</a>)}</nav>}
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
