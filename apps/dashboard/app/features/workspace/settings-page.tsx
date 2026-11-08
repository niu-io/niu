import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import {
  Link,
  Navigate,
  useFetcher,
  useLocation,
  useSearchParams,
  type ActionFunctionArgs,
} from 'react-router';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { settingsHref } from '@/features/account/settings-routes';
import { useDashboardContext } from '@/shell/dashboard-context';
import { readRouterSessionSnapshot } from '@/shell/router-context';
import { useLocale } from '@/shell/ui-locale';
import { workspaceDisplayName } from '@/shell/workspace-route';
import {
  requestWorkspaceRename,
  validateWorkspaceName,
  WORKSPACE_NAME_MAX_BYTES,
  WorkspaceRenameUnconfirmedError,
  workspaceNameByteLength,
} from './rename';

export type WorkspaceRenameErrorCode =
  | 'invalid-name'
  | 'unauthenticated'
  | 'forbidden'
  | 'workspace-missing'
  | 'unconfirmed'
  | 'request-failed';

export type WorkspaceSettingsActionData = {
  intent: 'rename-workspace';
  workspaceId: string;
  submittedName: string;
  ok: boolean;
  name?: string;
  code?: WorkspaceRenameErrorCode;
  message?: string;
  uncertain?: boolean;
};

type RenameOutcome =
  | { workspaceId: string; kind: 'success'; name: string }
  | { workspaceId: string; kind: 'error'; code?: WorkspaceRenameErrorCode; message?: string; uncertain: boolean };

/**
 * The dashboard runs without a server in SPA mode, so the route mutation is a
 * `clientAction`. Data Mode binds it to `action` through `bindLazy`; the
 * framework SPA build reads `clientAction` directly.
 *
 * The action owns validation, authorization pre-checks and the idempotent
 * PATCH. Rendering, pending state and confirmed shell updates stay in the
 * component through `useFetcher` and the dashboard context.
 */
export async function clientAction({
  request: actionRequest,
  context,
}: ActionFunctionArgs): Promise<WorkspaceSettingsActionData> {
  const form = await actionRequest.formData();
  const workspaceId = String(form.get('workspaceId') ?? '');
  const submittedName = String(form.get('name') ?? '');
  const base = { intent: 'rename-workspace' as const, workspaceId, submittedName };

  if (form.get('intent') !== 'rename-workspace') {
    return { ...base, ok: false, code: 'request-failed', message: 'Unsupported workspace settings action.' };
  }

  const snapshot = readRouterSessionSnapshot(context);
  if (!snapshot.token) return { ...base, ok: false, code: 'unauthenticated' };
  const workspace = snapshot.workspaces.find(item => item.id === workspaceId);
  if (!workspace) return { ...base, ok: false, code: 'workspace-missing' };
  if (!snapshot.session?.permissions.write) return { ...base, ok: false, code: 'forbidden' };

  if (validateWorkspaceName(submittedName)) return { ...base, ok: false, code: 'invalid-name' };

  try {
    const result = await requestWorkspaceRename(snapshot.token, workspace, submittedName);
    return { ...base, ok: true, name: result.name };
  } catch (cause) {
    if (cause instanceof WorkspaceRenameUnconfirmedError) {
      return { ...base, ok: false, code: 'unconfirmed', message: cause.message, uncertain: true };
    }
    if (cause instanceof ApiRequestError) {
      return { ...base, ok: false, code: 'request-failed', message: cause.message, uncertain: cause.status >= 500 };
    }
    // A transport failure after dispatch has an unknown outcome. The rename is
    // idempotent, so the form can offer a safe retry without reloading.
    return { ...base, ok: false, code: 'request-failed', uncertain: true };
  }
}

export default function WorkspaceSettings() {
  const { isZh, t, format: uiF } = useLocale();
  const context = useDashboardContext();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const workspace = context.workspace;
  const nameInputRef = useRef<HTMLInputElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const fetcher = useFetcher<WorkspaceSettingsActionData>();
  const [name, setName] = useState(workspace ? workspaceDisplayName(workspace.name) : '');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [renameOutcome, setRenameOutcome] = useState<RenameOutcome | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const operationScope = useRef(0);
  const handledFetcherData = useRef<WorkspaceSettingsActionData | null>(null);

  useLayoutEffect(() => {
    operationScope.current += 1;
    setDeleteBusy(false);
    setRenameOutcome(null);
    setConfirming(false);
    setConfirmation('');
    setDeleteError('');
    return () => {
      operationScope.current += 1;
    };
  }, [workspace?.id]);

  useEffect(() => {
    setName(workspace ? workspaceDisplayName(workspace.name) : '');
  }, [workspace?.id, workspace?.name]);

  const submittedWorkspaceId = fetcher.formData ? String(fetcher.formData.get('workspaceId') ?? '') : '';
  const renaming = fetcher.state !== 'idle' && submittedWorkspaceId === workspace?.id;
  const busy = renaming || deleteBusy;

  useEffect(() => {
    const data = fetcher.data;
    if (!data || handledFetcherData.current === data) return;
    handledFetcherData.current = data;
    const isCurrentWorkspace = workspace?.id === data.workspaceId;
    if (data.ok) {
      const confirmedName = data.name ?? data.submittedName;
      // The workspace directory outlives this form. Apply a confirmed rename
      // even when the user switched away while the request was in flight, but
      // only show the local success state for the workspace still on screen.
      context.applyWorkspaceRename(data.workspaceId, confirmedName);
      if (isCurrentWorkspace) {
        setName(confirmedName);
        setRenameOutcome({ workspaceId: data.workspaceId, kind: 'success', name: confirmedName });
      }
      return;
    }
    if (!isCurrentWorkspace) return;
    setRenameOutcome({
      workspaceId: data.workspaceId,
      kind: 'error',
      code: data.code,
      message: data.message,
      uncertain: Boolean(data.uncertain),
    });
  }, [context, fetcher.data, workspace]);

  if (!workspace) return null;

  const canEdit = Boolean(context.session?.permissions.write);
  const canDelete = Boolean(
    context.session?.permissions.manage_operators &&
      (context.session.kind === 'installation' || context.session.operator?.project_id === null),
  );
  const canFund =
    context.session?.operating_mode !== 'internal' &&
    context.organization?.id === workspace.organization_id &&
    Boolean(
      context.session?.kind === 'installation' ||
        (context.session?.operator?.organization_id === workspace.organization_id &&
          context.session?.operator?.project_id === null &&
          ['owner', 'admin'].includes(context.session.operator.role)),
    );
  const currentName = workspaceDisplayName(workspace.name);
  const visibleOutcome = renameOutcome?.workspaceId === workspace.id ? renameOutcome : null;
  const nameError = visibleOutcome?.kind === 'error' ? visibleOutcome : null;
  const nameChanged = name.trim() !== currentName;

  // Billing is owned by the dedicated workspace route. The legacy settings
  // tab (and its nested BillingRoute) resolves there rather than rendering a
  // second billing view inside settings.
  const billingQuery = new URLSearchParams(searchParams);
  billingQuery.delete('section');
  const billingHref = `${location.pathname.replace(/\/settings\/?$/, '/billing')}${billingQuery.size ? '?' + billingQuery.toString() : ''}${location.hash}`;
  if (searchParams.get('section') === 'billing') return <Navigate replace to={billingHref} />;

  function renameErrorText(outcome: Extract<RenameOutcome, { kind: 'error' }>): string {
    switch (outcome.code) {
      case 'invalid-name':
        return t('Workspace names must be 1–200 bytes.', '工作空间名称必须为 1–200 字节。');
      case 'unauthenticated':
        return t('Your session expired. Sign in again to rename this workspace.', '会话已过期，请重新登录后再重命名工作空间。');
      case 'forbidden':
        return t('You do not have permission to rename this workspace.', '你没有重命名此工作空间的权限。');
      case 'workspace-missing':
        return t('This workspace is no longer available. Reload the page.', '此工作空间已不可用，请刷新页面。');
      case 'unconfirmed':
        return t('Could not confirm the workspace name. Reload before retrying.', '无法确认工作空间名称，请刷新后重试。');
      default: {
        if (!outcome.uncertain) return outcome.message ?? t('Could not rename workspace.', '无法重命名工作空间。');
        const retryNote = t(
          'The rename may or may not have been saved. Check the current name and submit again; repeating a rename is safe.',
          '重命名可能已保存，也可能未保存。请确认当前名称后再次提交；重复重命名是安全的。',
        );
        return outcome.message ? `${outcome.message} ${retryNote}` : retryNote;
      }
    }
  }

  function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || busy) return;
    const trimmed = name.trim();
    if (
      !canEdit ||
      !trimmed ||
      workspaceNameByteLength(trimmed) > WORKSPACE_NAME_MAX_BYTES ||
      trimmed === currentName
    ) {
      if (!trimmed || workspaceNameByteLength(trimmed) > WORKSPACE_NAME_MAX_BYTES) {
        setRenameOutcome({ workspaceId: workspace.id, kind: 'error', code: 'invalid-name', uncertain: false });
        nameInputRef.current?.focus();
      }
      return;
    }
    setRenameOutcome(null);
    fetcher.submit({ intent: 'rename-workspace', workspaceId: workspace.id, name: trimmed }, { method: 'post' });
  }

  async function remove() {
    if (!workspace || workspace.is_default || busy || confirmation !== currentName) return;
    setDeleteBusy(true);
    setDeleteError('');
    const scope = operationScope.current;
    try {
      await context.deleteWorkspace(workspace);
      if (scope === operationScope.current) setConfirming(false);
    } catch (cause) {
      if (scope === operationScope.current) {
        setDeleteError(cause instanceof Error ? cause.message : t('Could not delete workspace.', '无法删除工作空间。'));
      }
    } finally {
      if (scope === operationScope.current) setDeleteBusy(false);
    }
  }

  return (
    <div className="w-full min-w-0 space-y-10">
      <section aria-labelledby="workspace-general-title" className="space-y-5">
        <h2 id="workspace-general-title" className="text-base font-semibold">
          {t('General', '常规设置')}
        </h2>
        <form onSubmit={rename} aria-busy={renaming} className="grid gap-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid min-w-[16rem] flex-1 gap-2">
            <Label htmlFor="workspace-name">{t('Workspace name', '工作空间名称')}</Label>
            <Input
              ref={nameInputRef}
              id="workspace-name"
              required
              maxLength={WORKSPACE_NAME_MAX_BYTES}
              value={name}
              disabled={!canEdit || busy}
              aria-invalid={nameError?.code === 'invalid-name' ? true : undefined}
              aria-describedby={nameError?.code === 'invalid-name' ? 'workspace-name-error' : undefined}
              onChange={event => {
                setName(event.target.value);
                setRenameOutcome(null);
              }}
            />
            </div>
          <div className="flex gap-2">
            {nameChanged && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setName(currentName);
                  setRenameOutcome(null);
                  nameInputRef.current?.focus();
                }}
              >
                {t('Cancel', '取消')}
              </Button>
            )}
            <Button disabled={!canEdit || busy || !name.trim() || !nameChanged}>
              {renaming ? t('Saving…', '保存中…') : t('Save changes', '保存更改')}
            </Button>
          </div>
          </div>
          {visibleOutcome?.kind === 'success' && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('Workspace renamed.', '工作空间已重命名。')}
            </p>
          )}
          {nameError && (
            <p id="workspace-name-error" role="alert" className="text-sm text-destructive">
              {renameErrorText(nameError)}
            </p>
          )}
        </form>
      </section>
      <section aria-labelledby="workspace-budget-shortcut-title" className="space-y-3 border-t border-border/60 pt-6">
        <h2 id="workspace-budget-shortcut-title" className="text-base font-semibold">
          {t('Spending limits & statements', '工作空间额度上限与账单')}
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'Set lifetime spending limits for this workspace or inspect settled usage statements and rates.',
              '为当前工作空间设置累计消费上限，或查看已结算账单明细与模型费率。',
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to={billingHref}>{t('Spending & statements', '额度上限与账单')}</Link>
            </Button>
            {canFund && (
              <Button asChild variant="ghost">
                <Link to={settingsHref('billing')}>{t('Manage credits', '管理共享充值额度')}</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
      {canDelete && !workspace.is_default && (
        <section aria-labelledby="workspace-delete-title" className="space-y-3 border-t border-border/60 pt-6">
          <h2 id="workspace-delete-title" className="text-base font-semibold">
            {t('Delete workspace', '删除工作空间')}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {t(
                    'Only empty workspaces can be deleted. Workspaces with saved records are protected.',
                    '仅空工作空间可以删除，包含历史记录的工作空间受到保护。',
                  )}
            </p>
            <Button
              ref={deleteButtonRef}
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirmation('');
                setDeleteError('');
                setConfirming(true);
              }}
            >
              {t('Delete workspace', '删除工作空间')}
            </Button>
          </div>
        </section>
      )}
      {!confirming && deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {t(deleteError)}
        </p>
      )}
      <Dialog
        open={confirming}
        onOpenChange={open => {
          if (!deleteBusy) {
            setConfirming(open);
            if (!open) setDeleteError('');
          }
        }}
      >
        <DialogContent
          onCloseAutoFocus={event => {
            if (deleteButtonRef.current) {
              event.preventDefault();
              deleteButtonRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{isZh ? `删除 ${currentName}？` : uiF('Delete {0}?', [currentName])}</DialogTitle>
            <DialogDescription>
              {t(
                'Deletion is permanent and only allowed when the workspace has no saved records.',
                '删除操作不可撤销，且仅在工作空间无任何保存记录时可用。',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="workspace-delete-confirmation">{t('Type the workspace name to confirm', '输入工作空间名称以确认删除')}</Label>
            <Input
              id="workspace-delete-confirmation"
              value={confirmation}
              disabled={deleteBusy}
              onChange={event => setConfirmation(event.target.value)}
            />
          </div>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {t(deleteError)}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={deleteBusy}
              onClick={() => {
                setConfirming(false);
                setDeleteError('');
              }}
            >
              {t('Cancel', '取消')}
            </Button>
            <Button variant="destructive" disabled={deleteBusy || confirmation !== currentName} onClick={() => void remove()}>
              {deleteBusy ? t('Deleting…', '删除中…') : t('Delete workspace', '删除工作空间')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
