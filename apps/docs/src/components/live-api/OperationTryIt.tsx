import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCopy,
  IconExternalLink,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconRotateClockwise,
  IconTerminal2,
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
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '../../../../dashboard/app/shell/locale';
import WorkspaceKeyConnection, { type DocsKeySelection } from './WorkspaceKeyConnection';
import {
  buildCurlCommand,
  resolveRequestUrl,
  type OperationDescriptor,
} from './openapi';
import { displayName, docsLoginHref, useDocsSession } from './session';

const MAX_DISPLAY_BYTES = 65_536;

interface ResponseState {
  status: number;
  statusText: string;
  elapsedMs: number;
  contentType: string;
  attemptId: string | null;
  operationId: string | null;
  body: string;
  truncated: boolean;
  ok: boolean;
}

function initialParamMap(operation: OperationDescriptor, loc: 'path' | 'query' | 'header') {
  const map: Record<string, string> = {};
  for (const param of operation.parameters) {
    if (param.in !== loc) continue;
    map[param.name] = param.defaultValue || '';
  }
  return map;
}

function applyModelToBody(bodyText: string, modelId: string): string {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.hasOwn(parsed, 'model')) {
      return JSON.stringify({ ...parsed, model: modelId }, null, 2);
    }
  } catch {
    // Keep user's unparsed draft untouched.
  }
  return bodyText;
}

export default function OperationTryIt({
  operation,
  defaultExpanded = false,
  showSpecLink = false,
}: {
  operation: OperationDescriptor;
  defaultExpanded?: boolean;
  showSpecLink?: boolean;
}) {
  const { isZh, t } = useLocale();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [selection, setSelection] = useState<DocsKeySelection | null>(null);
  const { session, checking: sessionChecking } = useDocsSession();

  const [pathValues, setPathValues] = useState<Record<string, string>>(() =>
    initialParamMap(operation, 'path'),
  );
  const [queryValues, setQueryValues] = useState<Record<string, string>>(() =>
    initialParamMap(operation, 'query'),
  );
  const [headerValues, setHeaderValues] = useState<Record<string, string>>(() =>
    initialParamMap(operation, 'header'),
  );
  const [bodyText, setBodyText] = useState<string>(operation.defaultBody);
  const [showOptionalHeaders, setShowOptionalHeaders] = useState(false);

  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsRev, setModelsRev] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [outputTab, setOutputTab] = useState<'response' | 'curl'>('curl');
  const [copiedKey, setCopiedKey] = useState<'curl' | 'response' | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset form state cleanly whenever the selected operation changes (e.g. in ApiExplorer).
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setError('');
    setResponse(null);
    setOutputTab('curl');
    setPathValues(initialParamMap(operation, 'path'));
    setQueryValues(initialParamMap(operation, 'query'));
    setHeaderValues(initialParamMap(operation, 'header'));
    setBodyText(operation.defaultBody);
    setShowOptionalHeaders(false);
  }, [operation.slug]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Discover models for inference endpoints when a workspace key is connected.
  const keyId = selection?.keyId ?? '';
  useEffect(() => {
    if (!expanded || !operation.supportsModelPicker || !keyId) {
      setModels([]);
      setSelectedModel('');
      return;
    }
    const controller = new AbortController();
    setModelsLoading(true);
    void fetch('/v1/models', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        authorization: 'Bearer niu-browser-member-session',
        'x-niu-key-id': keyId,
      },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return [];
        const payload = (await res.json()) as { data?: Array<{ id?: unknown }> };
        return Array.isArray(payload.data)
          ? payload.data
              .map((entry) => (typeof entry?.id === 'string' ? entry.id : ''))
              .filter(Boolean)
          : [];
      })
      .then((list) => {
        if (controller.signal.aborted) return;
        setModels(list);
        if (list.length > 0) {
          const nextModel = list.includes(selectedModel) ? selectedModel : list[0]!;
          setSelectedModel(nextModel);
          if (operation.route === '/v1beta/models/{model_action}') {
            setPathValues((prev) => ({
              ...prev,
              model_action: prev.model_action?.trim()
                ? prev.model_action
                : `${nextModel}:generateContent`,
            }));
          } else {
            setBodyText((prev) => applyModelToBody(prev, nextModel));
          }
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setModels([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });
    return () => controller.abort();
  }, [expanded, operation.supportsModelPicker, operation.route, keyId, modelsRev]);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://niu.io';

  const curlSnippet = useMemo(
    () =>
      buildCurlCommand(
        operation,
        origin,
        pathValues,
        queryValues,
        headerValues,
        bodyText,
      ),
    [operation, origin, pathValues, queryValues, headerValues, bodyText],
  );

  const jsonValidationError = useMemo(() => {
    if (!operation.mediaType || operation.isBinaryBody || !operation.mutating) return '';
    if (!bodyText.trim()) return '';
    try {
      JSON.parse(bodyText);
      return '';
    } catch (failure) {
      return failure instanceof Error ? failure.message : 'Invalid JSON';
    }
  }, [operation.mediaType, operation.isBinaryBody, operation.mutating, bodyText]);

  const pathParams = useMemo(
    () => operation.parameters.filter((p) => p.in === 'path'),
    [operation.parameters],
  );
  const queryParams = useMemo(
    () => operation.parameters.filter((p) => p.in === 'query'),
    [operation.parameters],
  );
  const requiredHeaders = useMemo(
    () => operation.parameters.filter((p) => p.in === 'header' && p.required),
    [operation.parameters],
  );
  const optionalHeaders = useMemo(
    () => operation.parameters.filter((p) => p.in === 'header' && !p.required),
    [operation.parameters],
  );

  const canExecute = (() => {
    if (busy || operation.isBinaryBody || Boolean(jsonValidationError)) return false;
    if (operation.authMode === 'public') return true;
    if (operation.authMode === 'workspace-key') {
      if (!selection) return false;
      if (operation.mutating && !selection.canWrite) return false;
      return true;
    }
    if (operation.authMode === 'session') {
      if (!session) return false;
      if (operation.mutating && !session.permissions.write) return false;
      return true;
    }
    return false;
  })();

  async function copyText(key: 'curl' | 'response', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 1500);
    } catch {
      // Ignore clipboard permission errors.
    }
  }

  async function sendRequest() {
    if (!canExecute) return;
    setError('');

    const { url, missingPathParams } = resolveRequestUrl(
      operation.route,
      window.location.origin,
      pathValues,
      queryValues,
    );
    if (missingPathParams.length > 0) {
      setError(
        isZh
          ? `请填写必填路径参数：${missingPathParams.join('、')}`
          : `Fill required path parameter(s): ${missingPathParams.join(', ')}`,
      );
      return;
    }

    const target = new URL(url);
    if (target.origin !== window.location.origin) {
      setError(
        t(
          'Requests are restricted to this Niu origin.',
          '请求仅限发送至当前 Niu 同源地址。',
        ),
      );
      return;
    }

    const headers = new Headers();
    if (operation.authMode === 'workspace-key') {
      if (!selection || !/^\/v1(?:beta)?\//.test(target.pathname)) {
        setError(
          t(
            'The selected workspace key can only test /v1 and /v1beta APIs on this Niu origin.',
            '所选工作空间密钥仅限调试当前同源的 /v1 与 /v1beta 接口。',
          ),
        );
        return;
      }
      headers.set('authorization', 'Bearer niu-browser-member-session');
      headers.set('x-niu-key-id', selection.keyId);
    }

    for (const param of operation.parameters) {
      if (param.in !== 'header') continue;
      const val = (headerValues[param.name] ?? '').trim();
      if (val) headers.set(param.name, val);
    }

    let requestBody: string | undefined;
    if (operation.mediaType && !operation.isBinaryBody && operation.mutating && bodyText.trim()) {
      headers.set('content-type', operation.mediaType);
      requestBody = bodyText;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    const started = performance.now();

    setBusy(true);
    setResponse(null);
    setOutputTab('response');

    try {
      const res = await fetch(target.toString(), {
        method: operation.method,
        headers,
        body: requestBody,
        credentials: operation.authMode === 'public' ? 'omit' : 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') || '';
      const attemptId = res.headers.get('x-niu-attempt-id');
      const operationId = res.headers.get('x-niu-operation-id');

      let rawBody = '';
      let truncated = false;
      if (res.body && contentType.includes('text/event-stream')) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          rawBody += decoder.decode(value, { stream: true });
          if (rawBody.length >= MAX_DISPLAY_BYTES) {
            rawBody = rawBody.slice(0, MAX_DISPLAY_BYTES);
            truncated = true;
            await reader.cancel();
            break;
          }
          setResponse({
            status: res.status,
            statusText: res.statusText,
            elapsedMs: Math.round(performance.now() - started),
            contentType,
            attemptId,
            operationId,
            body: rawBody,
            truncated: false,
            ok: res.ok,
          });
        }
      } else {
        rawBody = await res.text();
        if (rawBody.length > MAX_DISPLAY_BYTES) {
          rawBody = rawBody.slice(0, MAX_DISPLAY_BYTES);
          truncated = true;
        }
      }

      let formattedBody = rawBody;
      if (!truncated && contentType.includes('json') && rawBody.trim()) {
        try {
          formattedBody = JSON.stringify(JSON.parse(rawBody), null, 2);
        } catch {
          // Preserve exact text when body isn't valid JSON.
        }
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        elapsedMs: Math.round(performance.now() - started),
        contentType,
        attemptId,
        operationId,
        body: formattedBody,
        truncated,
        ok: res.ok,
      });
    } catch (failure) {
      setError(
        controller.signal.aborted
          ? t(
              'Request cancelled in the browser. Upstream execution may still complete; check workspace Logs before retrying.',
              '已在浏览器侧中止等待。上游请求可能仍在继续执行，重试前请先在工作空间请求日志中确认结果。',
            )
          : failure instanceof Error
            ? failure.message
            : t('Request failed. Check your network and try again.', '请求失败，请检查网络连接后重试。'),
      );
    } finally {
      window.clearTimeout(timeout);
      abortRef.current = null;
      setBusy(false);
    }
  }

  function renderParamField(param: OperationDescriptor['parameters'][number]) {
    const store =
      param.in === 'path'
        ? pathValues
        : param.in === 'query'
          ? queryValues
          : headerValues;
    const setStore =
      param.in === 'path'
        ? setPathValues
        : param.in === 'query'
          ? setQueryValues
          : setHeaderValues;
    const value = store[param.name] ?? '';
    const fieldId = `tryit-${operation.slug}-${param.in}-${param.name}`;

    return (
      <div key={`${param.in}:${param.name}`} className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Label htmlFor={fieldId} className="font-mono text-xs font-medium text-foreground">
            {param.name}
          </Label>
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
            {param.in}
          </Badge>
          {param.required && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium text-foreground">
              {t('Required', '必填')}
            </Badge>
          )}
        </div>
        {param.enumValues ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                id={fieldId}
                variant="outline"
                size="sm"
                disabled={busy}
                className="w-full justify-between font-mono text-xs font-normal"
              >
                <span className="truncate">
                  {value || t('Select value…', '选择取值…')}
                </span>
                <IconChevronDown size={14} className="shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuRadioGroup
                value={value}
                onValueChange={(next) =>
                  setStore((prev) => ({ ...prev, [param.name]: next }))
                }
              >
                {!param.required && (
                  <DropdownMenuRadioItem value="">
                    <span className="text-muted-foreground">{t('Unset', '不传')}</span>
                  </DropdownMenuRadioItem>
                )}
                {param.enumValues.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    <span className="font-mono text-xs">{option}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Input
            id={fieldId}
            value={value}
            disabled={busy}
            placeholder={
              param.defaultValue ||
              (param.in === 'path' ? `{${param.name}}` : param.type)
            }
            className="h-8 font-mono text-xs"
            onChange={(event) =>
              setStore((prev) => ({ ...prev, [param.name]: event.target.value }))
            }
          />
        )}
        {param.description && (
          <p className="m-0 text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {param.description}
          </p>
        )}
      </div>
    );
  }

  const authSummaryBadge =
    operation.authMode === 'public'
      ? t('Public · No auth', '公开接口 · 无需鉴权')
      : operation.authMode === 'workspace-key'
        ? t('Workspace API key', '工作空间 API 密钥')
        : operation.authMode === 'session'
          ? t('Browser session', '当前登录会话')
          : t('External credential', '外部凭证');

  return (
    <section
      className="docs-try-it not-content"
      aria-label={t('Interactive API request runner', '交互式 API 调试面板')}
    >
      {!defaultExpanded && (
        <div className="docs-try-it-toggle-bar">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <IconTerminal2 size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {t('Try this endpoint', '在线调试此接口')}
            </span>
            <Badge variant="outline" className="text-[11px] font-normal">
              {authSummaryBadge}
            </Badge>
          </div>
          <Button
            type="button"
            variant={expanded ? 'outline' : 'default'}
            size="sm"
            onClick={() => setExpanded((prev) => !prev)}
            className="shrink-0 gap-1.5"
          >
            {expanded ? (
              <>
                <IconChevronUp size={14} />
                <span>{t('Hide', '收起')}</span>
              </>
            ) : (
              <>
                <IconPlayerPlay size={14} />
                <span>{t('Try it', '展开调试')}</span>
              </>
            )}
          </Button>
        </div>
      )}

      {expanded && (
        <div className="docs-try-it-body">
          {/* Authentication section — single source of truth */}
          <div className="docs-try-it-auth">
            {operation.authMode === 'workspace-key' ? (
              <WorkspaceKeyConnection
                onChange={setSelection}
                disabled={busy}
                description={t(
                  'Same-origin /v1 requests only · key secret stays on the server · requests may incur real charges',
                  '仅限同源 /v1 请求 · 密钥明文留在服务端 · 请求可能产生真实费用',
                )}
              />
            ) : operation.authMode === 'public' ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="font-normal">
                    {t('Public endpoint', '公开接口')}
                  </Badge>
                  <span>
                    {t(
                      'No workspace API key or sign-in required. Calls this Niu origin directly.',
                      '无需工作空间密钥或登录，可直接向当前 Niu 实例发送请求。',
                    )}
                  </span>
                </div>
              </div>
            ) : operation.authMode === 'session' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                {sessionChecking ? (
                  <span>{t('Checking your login…', '正在检查登录状态…')}</span>
                ) : session ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="gap-1.5 font-normal">
                        <span className="inline-block size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                        {t('Signed in', '已登录')}
                      </Badge>
                      <span>
                        {operation.mutating
                          ? t(
                              'Uses your active browser session. This write operation modifies real workspace data.',
                              '使用当前浏览器登录会话。该写操作会真实修改您的工作空间数据。',
                            )
                          : t(
                              'Uses your active same-origin browser session.',
                              '使用当前同源浏览器登录会话。',
                            )}
                      </span>
                    </div>
                    {operation.mutating && !session.permissions.write && (
                      <Badge variant="outline">
                        {t('Write permission required', '需要写权限')}
                      </Badge>
                    )}
                  </>
                ) : (
                  <>
                    <span>
                      {t(
                        'Sign in to run this management endpoint with your browser session.',
                        '登录后可使用当前浏览器会话调用该管理接口。',
                      )}
                    </span>
                    <Button asChild size="sm">
                      <a href={docsLoginHref()}>{t('Sign in', '登录')}</a>
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <p className="m-0 text-xs text-muted-foreground">
                {t(
                  'This endpoint requires credentials outside the browser session. Edit inputs below to generate an exact curl command.',
                  '该接口需要浏览器会话之外的专用凭证。你可以在下方调整参数以生成精确的 curl 命令。',
                )}
              </p>
            )}

            {/* Quick model picker for inference endpoints */}
            {operation.supportsModelPicker && selection && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('Model', '模型')}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || modelsLoading || models.length === 0}
                      className="max-w-72 justify-between gap-2 font-mono text-xs font-normal"
                    >
                      <span className="truncate">
                        {modelsLoading
                          ? t('Loading models…', '加载模型中…')
                          : selectedModel
                            ? displayName(selectedModel, selectedModel)
                            : models.length === 0
                              ? t('No models granted to key', '该密钥暂无授权模型')
                              : t('Choose model', '选择模型')}
                      </span>
                      <IconChevronDown size={14} className="shrink-0 text-muted-foreground" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
                    <DropdownMenuRadioGroup
                      value={selectedModel}
                      onValueChange={(nextModel) => {
                        setSelectedModel(nextModel);
                        if (operation.route === '/v1beta/models/{model_action}') {
                          setPathValues((prev) => ({
                            ...prev,
                            model_action: `${nextModel}:generateContent`,
                          }));
                        } else {
                          setBodyText((prev) => applyModelToBody(prev, nextModel));
                        }
                      }}
                    >
                      {models.map((id) => (
                        <DropdownMenuRadioItem key={id} value={id}>
                          <span className="truncate font-mono text-xs">{id}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || modelsLoading}
                  onClick={() => setModelsRev((v) => v + 1)}
                  className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <IconRefresh size={13} />
                  <span>{t('Refresh models', '刷新模型')}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Parameters */}
          {(pathParams.length > 0 || queryParams.length > 0 || requiredHeaders.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {pathParams.map(renderParamField)}
              {queryParams.map(renderParamField)}
              {requiredHeaders.map(renderParamField)}
            </div>
          )}

          {optionalHeaders.length > 0 && (
            <div className="grid gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-fit gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowOptionalHeaders((prev) => !prev)}
              >
                {showOptionalHeaders ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                <span>
                  {isZh
                    ? `可选请求头（${optionalHeaders.length}）`
                    : `Optional headers (${optionalHeaders.length})`}
                </span>
              </Button>
              {showOptionalHeaders && (
                <div className="grid gap-3 rounded-md border border-border/60 bg-background/60 p-3 sm:grid-cols-2">
                  {optionalHeaders.map(renderParamField)}
                </div>
              )}
            </div>
          )}

          {/* Request Body */}
          {operation.mediaType && operation.mutating && (
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`tryit-body-${operation.slug}`} className="text-xs font-medium">
                    {t('Request body', '请求体')}
                  </Label>
                  <Badge variant="outline" className="h-4 px-1.5 font-mono text-[10px] font-normal">
                    {operation.mediaType}
                  </Badge>
                </div>
                {!operation.isBinaryBody && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      setBodyText(
                        selectedModel && operation.supportsModelPicker
                          ? applyModelToBody(operation.defaultBody, selectedModel)
                          : operation.defaultBody,
                      )
                    }
                    className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <IconRotateClockwise size={13} />
                    <span>{t('Reset example', '重置示例')}</span>
                  </Button>
                )}
              </div>
              {operation.isBinaryBody ? (
                <p className="m-0 rounded-md border border-border/60 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  {t(
                    'This endpoint expects a binary payload. Use the generated curl command or SDK to upload local files.',
                    '该接口接收二进制请求体，请使用下方生成的 curl 命令或 SDK 上传本地文件。',
                  )}
                </p>
              ) : (
                <>
                  <Textarea
                    id={`tryit-body-${operation.slug}`}
                    value={bodyText}
                    disabled={busy}
                    rows={Math.min(12, Math.max(4, bodyText.split('\n').length + 1))}
                    spellCheck={false}
                    className="font-mono text-xs leading-relaxed"
                    onChange={(event) => setBodyText(event.target.value)}
                  />
                  {jsonValidationError && (
                    <p className="m-0 text-xs text-destructive">
                      {t('JSON syntax error: ', 'JSON 语法错误：')}
                      {jsonValidationError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {operation.authMode !== 'manual' && !operation.isBinaryBody && (
                <Button
                  type="button"
                  size="sm"
                  disabled={!canExecute}
                  onClick={() => void sendRequest()}
                  className="gap-1.5"
                >
                  <IconPlayerPlay size={14} />
                  <span>
                    {busy
                      ? t('Sending…', '发送中…')
                      : t('Send request', '发送请求')}
                  </span>
                </Button>
              )}
              {busy && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => abortRef.current?.abort()}
                  className="gap-1.5"
                >
                  <IconPlayerStop size={14} />
                  <span>{t('Stop', '停止')}</span>
                </Button>
              )}
              {selection && (
                <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
                  <a href={`/workspaces/${encodeURIComponent(selection.workspace.slug)}/executions/`}>
                    {t('Open request logs', '查看请求日志')}
                  </a>
                </Button>
              )}
            </div>
            {showSpecLink && (
              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
                <a href={`/docs/api/rest/${operation.slug}/`}>
                  <span>{t('Full specification', '查看完整文档')}</span>
                  <IconExternalLink size={13} />
                </a>
              </Button>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Output & Live curl Tabs */}
          <Tabs
            value={outputTab}
            onValueChange={(value) => setOutputTab(value as 'response' | 'curl')}
            className="gap-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList className="h-8">
                <TabsTrigger value="curl" className="px-2.5 text-xs">
                  curl
                </TabsTrigger>
                <TabsTrigger value="response" className="gap-1.5 px-2.5 text-xs">
                  <span>{t('Response', '响应结果')}</span>
                  {response && (
                    <span
                      className={`inline-flex items-center rounded px-1 py-0.5 font-mono text-[10px] font-semibold ${
                        response.ok
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-destructive/15 text-destructive'
                      }`}
                    >
                      {response.status}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              {outputTab === 'curl' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyText('curl', curlSnippet)}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copiedKey === 'curl' ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  <span>
                    {copiedKey === 'curl'
                      ? t('Copied', '已复制')
                      : t('Copy curl', '复制 curl')}
                  </span>
                </Button>
              ) : response ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyText('response', response.body)}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {copiedKey === 'response' ? <IconCheck size={13} /> : <IconCopy size={13} />}
                  <span>
                    {copiedKey === 'response'
                      ? t('Copied', '已复制')
                      : t('Copy body', '复制响应')}
                  </span>
                </Button>
              ) : null}
            </div>

            <TabsContent value="curl" className="m-0">
              <pre className="docs-try-it-code">
                <code>{curlSnippet}</code>
              </pre>
            </TabsContent>

            <TabsContent value="response" className="m-0">
              {response ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={
                        response.ok
                          ? 'border-emerald-500/30 bg-emerald-500/10 font-mono text-emerald-700 dark:text-emerald-400'
                          : 'border-destructive/30 bg-destructive/10 font-mono text-destructive'
                      }
                    >
                      HTTP {response.status} {response.statusText}
                    </Badge>
                    <span>{response.elapsedMs} ms</span>
                    {response.contentType && (
                      <span className="font-mono text-[11px]">{response.contentType.split(';')[0]}</span>
                    )}
                    {response.attemptId && (
                      <span className="font-mono text-[11px]">
                        x-niu-attempt-id: {response.attemptId}
                      </span>
                    )}
                    {response.truncated && (
                      <Badge variant="outline" className="text-[10px]">
                        {t('Truncated at 64 KB', '已截断至 64 KB')}
                      </Badge>
                    )}
                  </div>
                  <pre className="docs-try-it-code">
                    <code>{response.body || t('(Empty response body)', '（空响应体）')}</code>
                  </pre>
                </div>
              ) : (
                <div className="docs-try-it-empty">
                  {t(
                    'Send a request to inspect the live HTTP status, headers, and response body.',
                    '点击“发送请求”即可查看实时 HTTP 状态码、响应头与返回正文。',
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </section>
  );
}
