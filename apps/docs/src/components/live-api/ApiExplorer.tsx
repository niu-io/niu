import { useEffect, useMemo, useState } from 'react';
import {
  IconChevronDown,
  IconExternalLink,
  IconFileCode,
  IconSearch,
} from '@tabler/icons-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useLocale } from '../../../../dashboard/app/shell/locale';
import OperationTryIt from './OperationTryIt';
import {
  indexPublicOperations,
  type OpenApiDocument,
  type OperationDescriptor,
  type OperationGroup,
} from './openapi';

const DEFAULT_OPERATION_SLUG = 'createchatcompletion';

const GROUP_ZH: Record<string, string> = {
  'Model APIs': '模型推理 API',
  'Authentication and access': '认证与访问控制',
  'Workspaces and content': '工作空间与内容',
  'Usage and billing': '用量与计费',
  'Service and compatibility': '服务与兼容性',
};

export default function ApiExplorer() {
  const { isZh, t } = useLocale();
  const [groups, setGroups] = useState<OperationGroup[]>([]);
  const [operations, setOperations] = useState<OperationDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_OPERATION_SLUG;
    return window.location.hash.replace(/^#/, '').trim().toLowerCase() || DEFAULT_OPERATION_SLUG;
  });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/docs/openapi/public.json', {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as OpenApiDocument;
      })
      .then((doc) => {
        if (controller.signal.aborted) return;
        const indexed = indexPublicOperations(doc);
        setGroups(indexed.groups);
        setOperations(indexed.operations);
        setSelectedSlug((current) => {
          if (indexed.bySlug.has(current)) return current;
          if (indexed.bySlug.has(DEFAULT_OPERATION_SLUG)) return DEFAULT_OPERATION_SLUG;
          return indexed.operations[0]?.slug ?? '';
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(
            t(
              'Could not load the OpenAPI specification. Reload the page or browse the static REST reference.',
              '无法加载 OpenAPI 规范文档，请刷新页面或浏览静态 REST 接口规范。',
            ),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace(/^#/, '').trim().toLowerCase();
      if (next) setSelectedSlug(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((group) => groupFilter === 'all' || group.name === groupFilter)
      .map((group) => ({
        name: group.name,
        operations: group.operations.filter((op) => {
          if (!needle) return true;
          return (
            op.route.toLowerCase().includes(needle) ||
            op.method.toLowerCase().includes(needle) ||
            op.summary.toLowerCase().includes(needle) ||
            op.operationId.toLowerCase().includes(needle) ||
            op.tag.toLowerCase().includes(needle)
          );
        }),
      }))
      .filter((group) => group.operations.length > 0);
  }, [groups, groupFilter, query]);

  const totalMatching = useMemo(
    () => filteredGroups.reduce((sum, g) => sum + g.operations.length, 0),
    [filteredGroups],
  );

  const selectedOperation = useMemo(
    () =>
      operations.find((op) => op.slug === selectedSlug) ??
      filteredGroups[0]?.operations[0] ??
      operations[0] ??
      null,
    [operations, selectedSlug, filteredGroups],
  );

  function selectOperation(op: OperationDescriptor) {
    setSelectedSlug(op.slug);
    try {
      window.history.replaceState(null, '', `#${op.slug}`);
    } catch {
      // Ignore history errors.
    }
  }

  function groupLabel(name: string) {
    return isZh && Object.hasOwn(GROUP_ZH, name) ? GROUP_ZH[name]! : name;
  }

  if (loading) {
    return (
      <div className="docs-native-explorer not-content">
        <div className="rounded-[var(--radius-panel)] border border-border/80 bg-card p-6 text-sm text-muted-foreground" role="status">
          {t('Loading OpenAPI operations…', '正在加载 OpenAPI 接口目录…')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="docs-native-explorer not-content">
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button asChild variant="outline" size="sm">
              <a href="/docs/api/rest/">{t('Open REST specification', '打开 REST 接口规范')}</a>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="docs-native-explorer not-content">
      <div className="docs-explorer-toolbar">
        <div className="relative w-full min-w-0 sm:w-auto sm:flex-1">
          <IconSearch
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              'Filter operations by path, method, or summary…',
              '按路径、HTTP 方法或摘要筛选接口…',
            )}
            aria-label={t('Filter API operations', '筛选 API 接口')}
            className="pl-9"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 justify-between gap-2 font-normal">
                <span>
                  {groupFilter === 'all'
                    ? t('All groups', '全部分组')
                    : groupLabel(groupFilter)}
                </span>
                <IconChevronDown size={14} className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuRadioGroup value={groupFilter} onValueChange={setGroupFilter}>
                <DropdownMenuRadioItem value="all">
                  {t('All groups', '全部分组')}
                </DropdownMenuRadioItem>
                {groups.map((group) => (
                  <DropdownMenuRadioItem key={group.name} value={group.name}>
                    {groupLabel(group.name)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
            <a href="/docs/openapi/public.json" target="_blank" rel="noopener noreferrer">
              <IconFileCode size={14} />
              <span>OpenAPI JSON</span>
            </a>
          </Button>
        </div>
      </div>

      <div className="docs-explorer-grid">
        {/* Left operation directory */}
        <aside className="docs-explorer-list" aria-label={t('API operations', 'API 接口列表')}>
          <div className="docs-explorer-list-head">
            <span>
              {isZh
                ? `共 ${totalMatching} 个接口`
                : `${totalMatching} operation${totalMatching === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="docs-explorer-list-scroll">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                {t('No matching operations.', '没有匹配的接口。')}
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.name} className="docs-explorer-group">
                  <div className="docs-explorer-group-title">{groupLabel(group.name)}</div>
                  <div className="docs-explorer-group-items">
                    {group.operations.map((op) => {
                      const active = selectedOperation?.slug === op.slug;
                      return (
                        <button
                          key={op.slug}
                          type="button"
                          onClick={() => selectOperation(op)}
                          aria-current={active ? 'true' : undefined}
                          className="docs-explorer-op-btn"
                          data-active={active ? 'true' : undefined}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="docs-http-badge docs-http-badge-compact"
                              data-method={op.method.toLowerCase()}
                            >
                              {op.method}
                            </span>
                            <code className="truncate font-mono text-xs text-foreground">
                              {op.route}
                            </code>
                          </div>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {op.summary}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Right selected operation detail & live runner */}
        <div className="docs-explorer-detail">
          {selectedOperation ? (
            <>
              <div className="docs-explorer-detail-head">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className="docs-http-badge"
                      data-method={selectedOperation.method.toLowerCase()}
                    >
                      {selectedOperation.method}
                    </span>
                    <code className="docs-http-path">{selectedOperation.route}</code>
                  </div>
                  <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <a href={`/docs/api/rest/${selectedOperation.slug}/`}>
                      <span>{t('Open full spec', '查看完整文档')}</span>
                      <IconExternalLink size={13} />
                    </a>
                  </Button>
                </div>
                <h2 className="m-0 text-lg font-semibold tracking-tight text-foreground">
                  {selectedOperation.summary}
                </h2>
                {selectedOperation.description && (
                  <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                    {selectedOperation.description}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-mono text-[11px] font-normal">
                    {selectedOperation.operationId}
                  </Badge>
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {selectedOperation.tag}
                  </Badge>
                  {selectedOperation.requiredCapability && (
                    <Badge variant="outline" className="font-mono text-[11px] font-normal">
                      {selectedOperation.requiredCapability}
                    </Badge>
                  )}
                </div>
              </div>

              <OperationTryIt
                operation={selectedOperation}
                defaultExpanded={true}
                showSpecLink={false}
              />

              {selectedOperation.responses.length > 0 && (
                <div className="docs-explorer-responses">
                  <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('Documented responses', '文档定义的响应状态')}
                  </h3>
                  <div className="mt-2 divide-y divide-border/60 rounded-md border border-border/70 bg-background/60">
                    {selectedOperation.responses.map((resp) => (
                      <div
                        key={resp.status}
                        className="flex flex-wrap items-baseline gap-2.5 px-3 py-2 text-xs"
                      >
                        <span
                          className="font-mono font-semibold text-foreground"
                          data-http-status-group={
                            resp.status.startsWith('2')
                              ? '2xx'
                              : resp.status.startsWith('4')
                                ? '4xx'
                                : resp.status.startsWith('5')
                                  ? '5xx'
                                  : undefined
                          }
                        >
                          HTTP {resp.status}
                        </span>
                        <span className="min-w-0 flex-1 leading-relaxed text-muted-foreground">
                          {resp.description || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-[var(--radius-panel)] border border-border/80 bg-card p-6 text-sm text-muted-foreground">
              {t('Select an operation from the list to inspect and test it.', '从左侧列表选择一个接口进行查看和在线调试。')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
