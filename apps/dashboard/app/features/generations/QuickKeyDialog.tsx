import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconKey, IconLoader2, IconSparkles } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { workspaceKeyPath, type ProjectKey } from '@/features/keys/api';
import { submitKeyMutation } from '@/features/keys/mutation-recovery';
import type { SessionChatKey } from '@/shell/dashboard-context';
import { useLocale as useUILocale } from '@/shell/ui-locale';

const QUICK_PLAYGROUND_KEY_NAME = 'Playground';
const QUICK_PLAYGROUND_KEY_TTL_SECONDS = 90 * 86400;

export type ProvisionedPlaygroundKey = ProjectKey & { token: string };

/**
 * Provision a standard, revocable workspace API key ("Playground") in place so
 * users with zero active keys can immediately try models without detouring to
 * the Keys page. Uses an idempotency key via submitKeyMutation.
 */
export async function provisionQuickPlaygroundKey({
  token,
  organizationId,
  workspaceId,
  rememberChatKey,
  reloadWorkspaces,
  signal,
}: {
  token: string;
  organizationId: string;
  workspaceId: string;
  rememberChatKey?: (key: SessionChatKey) => void;
  reloadWorkspaces?: () => void;
  signal?: AbortSignal;
}): Promise<ProvisionedPlaygroundKey> {
  const collectionPath = workspaceKeyPath(workspaceId);
  const outcome = await submitKeyMutation(
    token,
    collectionPath,
    {
      version: 1,
      requestId: crypto.randomUUID(),
      action: 'create',
      label: QUICK_PLAYGROUND_KEY_NAME,
      body: {
        name: QUICK_PLAYGROUND_KEY_NAME,
        ttl_seconds: QUICK_PLAYGROUND_KEY_TTL_SECONDS,
      },
    },
    signal,
  );
  if (outcome.kind === 'unconfirmed') {
    throw new Error('Could not confirm the new API key. Open Keys to check before retrying.');
  }
  const created: ProvisionedPlaygroundKey =
    outcome.kind === 'issued'
      ? {
          id: outcome.issued.id,
          slug: outcome.issued.key?.slug,
          name: outcome.issued.key?.name ?? QUICK_PLAYGROUND_KEY_NAME,
          allowed_models: outcome.issued.allowed_models ?? outcome.issued.key?.allowed_models ?? ['*'],
          invocation_allowed: outcome.issued.key?.invocation_allowed ?? true,
          expires_at_ms: outcome.issued.key?.expires_at_ms ?? Date.now() + QUICK_PLAYGROUND_KEY_TTL_SECONDS * 1000,
          revoked: false,
          expired: false,
          token: outcome.issued.token,
        }
      : {
          ...outcome.key,
          token: '',
        };
  if (created.token && created.invocation_allowed !== false) {
    rememberChatKey?.({
      id: created.id,
      name: created.name,
      token: created.token,
      allowedModels: created.allowed_models,
      organizationId,
      projectId: workspaceId,
    });
  }
  reloadWorkspaces?.();
  return created;
}

export function QuickKeyDialog({
  open,
  onOpenChange,
  mode,
  canWrite,
  workspaceRoot,
  returnTo,
  busy = false,
  error = '',
  onQuickCreate,
  onCustomCreate,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'try' | 'setup';
  canWrite: boolean;
  workspaceRoot: string;
  returnTo?: string;
  busy?: boolean;
  error?: string;
  onQuickCreate: () => void;
  onCustomCreate?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const { t: uiT } = useUILocale();
  const keysHref = `${workspaceRoot}/keys`;
  const primaryLabel =
    mode === 'create'
      ? uiT('Auto-create key', '自动创建试用密钥')
      : mode === 'try'
        ? uiT('Auto-create key & try', '自动创建并试用')
        : uiT('Auto-create & open Generations', '自动创建并开始生成');

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={event => {
          if (triggerRef?.current?.isConnected) {
            event.preventDefault();
            triggerRef.current.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconKey size={18} aria-hidden="true" />
            <span>
              {canWrite
                ? uiT('Create an API key first', '需要先创建一把 API 密钥')
                : uiT('API key required', '需要工作空间 API 密钥')}
            </span>
          </DialogTitle>
          <DialogDescription>
            {canWrite
              ? uiT(
                  'This workspace has no active API keys yet. Model requests require a workspace API key for authorization and billing. Auto-create a default “Playground” key (90-day expiry, all workspace models, revocable anytime in Keys) or configure one manually.',
                  '当前工作空间暂无可用 API 密钥，模型试用与调用需要通过工作空间密钥进行授权与计费。您可以一键自动创建默认的「Playground」密钥（90 天有效期、可用全部工作空间模型，随时可在「密钥」页管理或撤销），也可以前往自定义创建。',
                )
              : uiT(
                  'This workspace has no active API keys yet, and your account has read-only access. Ask a workspace administrator to create an API key before trying models.',
                  '当前工作空间暂无可用 API 密钥，您的账户当前为只读权限，无法创建密钥。请联系工作空间管理员创建密钥后再试用模型。',
                )}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {uiT(error)}
          </p>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {canWrite ? uiT('Cancel', '取消') : uiT('Close', '关闭')}
          </Button>
          {canWrite ? (
            <>
              {onCustomCreate ? (
                <Button type="button" variant="outline" disabled={busy} onClick={onCustomCreate}>
                  {uiT('Custom key', '自定义创建')}
                </Button>
              ) : (
                <Button asChild variant="outline" disabled={busy}>
                  <Link
                    to={keysHref}
                    state={returnTo ? { createKey: true, returnTo } : { createKey: true }}
                    onClick={() => onOpenChange(false)}
                  >
                    {uiT('Custom key', '自定义创建')}
                  </Link>
                </Button>
              )}
              <Button type="button" disabled={busy} onClick={onQuickCreate}>
                {busy ? (
                  <IconLoader2 size={15} className="animate-spin" aria-hidden="true" />
                ) : (
                  <IconSparkles size={15} aria-hidden="true" />
                )}
                <span>{busy ? uiT('Creating key…', '正在创建密钥…') : primaryLabel}</span>
              </Button>
            </>
          ) : (
            <Button asChild variant="outline">
              <Link to={keysHref} onClick={() => onOpenChange(false)}>
                {uiT('View keys', '查看密钥')}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shared hook for components that need 1-click Playground key provisioning. */
export function useQuickKeyProvisioner() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  async function run(
    params: Omit<Parameters<typeof provisionQuickPlaygroundKey>[0], 'signal'>,
  ): Promise<ProvisionedPlaygroundKey | null> {
    if (busy) return null;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    setError('');
    try {
      const created = await provisionQuickPlaygroundKey({ ...params, signal: controller.signal });
      if (controller.signal.aborted) return null;
      return created;
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Could not create an API key. Try again.');
      }
      return null;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  }

  return { busy, error, setError, run };
}
