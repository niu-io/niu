import { readLocale as readUILocale, translateUI, useLocale as useUILocale } from '@/shell/ui-locale';
import { useEffect, useRef, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { IconChevronDown, IconFolder, IconPlus, IconUpload } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { MediaAsset, MediaAssetMutation } from '@niu-io/sdk/media-assets';
import type { WorkspaceAsset } from '@niu-io/sdk/workspace-assets';
import { NiuAPIError } from '@niu-io/sdk';
import { Link, useInRouterContext } from 'react-router';
import { workspacePathSegment } from '@/shell/workspace-route';
import { useMaterials, type NativeMaterialsContext } from './useMaterials';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

type DialogKind = 'group' | 'edit' | 'delete-group' | 'material' | 'inspect-asset' | 'rename-asset' | 'delete-asset' | 'verification';
type SavedState = { kind: 'media' | 'verification'; id: string; status: string; keyId: string; model: string };
type MaterialSource = 'url' | 'workspace';
const WORKSPACE_MEDIA_TYPES: Record<string, { contentType: string; accept: string }> = {
  image: { contentType: 'image/png,image/jpeg,image/webp', accept: 'image/png,image/jpeg,image/webp' },
  video: { contentType: 'video/mp4,video/webm', accept: 'video/mp4,video/webm' },
  audio: { contentType: 'audio/wav,audio/mpeg,audio/ogg', accept: 'audio/wav,audio/mpeg,audio/ogg' },
};
function workspaceContentType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return ({
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
  } as Record<string, string>)[extension ?? ''] ?? '';
}
function mediaSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function VolcengineView({
  workspaceName,
  model: preferredModel,
  nativeContext,
  selection,
  onContextChange,
  initialSection = 'materials',
  hideSectionTabs = false,
}: {
  workspaceName: string;
  model?: string;
  nativeContext?: NativeMaterialsContext;
  selection?: NativeMaterialsContext;
  onContextChange?: (selection: NativeMaterialsContext) => void;
  initialSection?: string;
  hideSectionTabs?: boolean;
}) {
  const { t: uiT, format: uiF } = useUILocale();
  const inRouter = useInRouterContext();
  const [section, setSection] = useState(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [targetAsset, setTargetAsset] = useState<MediaAsset | null>(null);
  const [name, setName] = useState('');
  const [attempt, setAttempt] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [unconfirmed, setUnconfirmed] = useState<SavedState | null>(null);
  const [dialogUnconfirmed, setDialogUnconfirmed] = useState<SavedState | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'image' | 'video' | 'audio'>('image');
  const [sourceMode, setSourceMode] = useState<MaterialSource>('url');
  const [workspaceAssetId, setWorkspaceAssetId] = useState('');
  const [workspaceAssets, setWorkspaceAssets] = useState<WorkspaceAsset[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const autoSelected = useRef('');
  const contextLocked = busy || dialog !== null;
  const retainedSelection = useRef(selection);
  if (!contextLocked) retainedSelection.current = selection;
  const data = useMaterials(preferredModel, nativeContext, retainedSelection.current);
  const chosenKey = data.resolvedKeyId;
  const chosenModel = data.selection?.model ?? '';
  const choices = data.contextChoices.filter(choice => choice.keyId === chosenKey);
  const chosen = choices.find(choice => choice.module.model_alias === chosenModel);
  const modelChoices = [...new Set(choices.map(choice => choice.module.model_alias))];
  const chosenKeyRecord = data.contextKeys.find(key => key.id === chosenKey);
  const noActiveKeys = data.contextKeys.every(key => key.revoked || key.expired);
  const modelLabel = (model: string) => {
    const active = choices.find(choice => choice.module.model_alias === model);
    return active ? active.module.display_name ?? active.module.context_label ?? model : model;
  };
  const keyStatusSuffix = (key?: { id: string; revoked: boolean; expired: boolean }) =>
    !key ? '' : key.revoked ? ` ${uiT('· Revoked')}` : key.expired ? ` ${uiT('· Expired')}` : data.ipRestrictedKeyIds.includes(key.id) ? ` ${uiT('· Source IP restricted')}` : '';
  const workspaceSlug = data.workspace ? workspacePathSegment(data.workspace, data.workspaces ?? [data.workspace]) : 'default';
  const workspaceKeysHref = `/workspaces/${encodeURIComponent(workspaceSlug)}/keys`;
  const workspaceModelsHref = `/workspaces/${encodeURIComponent(workspaceSlug)}/models`;
  const restrictedTargetKey = data.selectedKeyIpRestricted
    ? chosenKeyRecord
    : !chosenKey && data.ipRestrictedKeys.length === 1
      ? data.ipRestrictedKeys[0]
      : undefined;
  const restrictedAllowedCidrs = restrictedTargetKey
    ? restrictedTargetKey.ip_policy
      ? restrictedTargetKey.ip_policy.allowed_cidrs
      : restrictedTargetKey.allowed_cidrs
    : undefined;
  const fallbackChoice = !nativeContext ? data.contextChoices[0] : undefined;
  const selected = data.groups.find(group => group.id === data.group);
  const visibleAssets = data.assets.filter(asset => asset.status !== 'deleted');
  const assetStatusDescriptions: Record<MediaAsset['status'], string> = {
    active: 'Active — ready for generation',
    processing: 'Processing — upload acknowledged; Provider processing is still in progress',
    pending: 'Pending — awaiting Provider acknowledgement',
    failed: 'Failed — Provider reported processing failure',
    unknown: 'Unknown — outcome unconfirmed; check status before modifying',
    deleted: 'Deleted',
  };
  const requiresNameInput = dialog === 'group' || dialog === 'edit' || dialog === 'material' || dialog === 'rename-asset' || dialog === 'verification';
  const isDestructiveDialog = dialog === 'delete-group' || dialog === 'delete-asset';
  const formLocked = busy || dialogUnconfirmed !== null;
  const selectedWorkspaceAsset = workspaceAssets.find(asset => asset.id === workspaceAssetId);
  const materialSourceReady = sourceMode === 'url' ? Boolean(url.trim()) : Boolean(workspaceAssetId);

  useEffect(() => {
    if (dialog !== 'material' || sourceMode !== 'workspace') return;
    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError('');
    void data
      .listWorkspaceAssets(kind)
      .then(rows => {
        if (!cancelled) setWorkspaceAssets(rows);
      })
      .catch(caught => {
        if (!cancelled)
          setWorkspaceError(
            caught instanceof Error ? caught.message : uiT('Workspace media could not be loaded.'),
          );
      })
      .finally(() => {
        if (!cancelled) setWorkspaceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dialog, sourceMode, kind, data.listWorkspaceAssets]);

  useEffect(() => {
    if (dialog !== 'material' || sourceMode !== 'workspace' || !selectedWorkspaceAsset) {
      setPreviewUrl('');
      return;
    }
    if (selectedWorkspaceAsset.media_kind !== 'image') {
      setPreviewUrl('');
      return;
    }
    if (typeof URL.createObjectURL !== 'function') return;
    let cancelled = false;
    let objectUrl = '';
    void data
      .downloadWorkspaceAsset(selectedWorkspaceAsset.id)
      .then(bytes => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: selectedWorkspaceAsset.content_type }),
        );
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl('');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [dialog, sourceMode, selectedWorkspaceAsset, data.downloadWorkspaceAsset]);

  // Discovery may fill a missing key/model. Persist that choice once so reloads
  // keep the same context, but never override an explicit pair.
  useEffect(() => {
    if (nativeContext || contextLocked || !onContextChange || !data.autoSelection) return;
    const signature = `${data.autoSelection.keyId}\u0000${data.autoSelection.model}`;
    if (autoSelected.current === signature) return;
    autoSelected.current = signature;
    onContextChange(data.autoSelection);
  }, [nativeContext, contextLocked, onContextChange, data.autoSelection?.keyId, data.autoSelection?.model]);
  useEffect(() => {
    // Let an explicitly cleared context auto-select again.
    if (!data.autoSelection) autoSelected.current = '';
  }, [data.autoSelection?.keyId, data.autoSelection?.model]);

  function open(value: DialogKind, asset?: MediaAsset) {
    setTargetAsset(asset ?? null);
    setName(value === 'edit' ? selected?.name ?? '' : value === 'rename-asset' ? asset?.name ?? '' : '');
    setUrl('');
    setSourceMode('url');
    setWorkspaceAssetId('');
    setPreviewUrl('');
    setWorkspaceError('');
    setAttempt(crypto.randomUUID());
    setDialogError('');
    setDialogUnconfirmed(null);
    setDialog(value);
    if (value === 'inspect-asset' && asset && data.client && data.model) {
      void data.client.assets.retrieve(asset.id, data.model).then(response => setTargetAsset(current => current?.id === asset.id ? response.data : current)).catch(() => {
        // Keep the last loaded record visible; the refresh status is reported inline.
        setDialogError(uiT('Showing the last loaded material details; latest status could not be refreshed.'));
      });
    }
  }

  async function act(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    data.setError('');
    try {
      await work();
      await data.reload();
    } catch (caught) {
      data.setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    setDialog(null);
    setTargetAsset(null);
    setDialogUnconfirmed(null);
    setDialogError('');
    try {
      await data.reload();
    } catch (caught) {
      data.setError(caught instanceof Error ? caught.message : 'The operation was confirmed, but the list could not be refreshed.');
    }
  }

  function editAttempt() {
    if (!dialogUnconfirmed) setAttempt(crypto.randomUUID());
  }

  function changeMaterialSource(next: MaterialSource) {
    if (next === sourceMode) return;
    setSourceMode(next);
    setDialogError('');
    setWorkspaceError('');
    editAttempt();
  }

  function chooseWorkspaceAsset(id: string) {
    setWorkspaceAssetId(id);
    setDialogError('');
    editAttempt();
    const asset = workspaceAssets.find(candidate => candidate.id === id);
    if (asset && !name.trim()) setName(asset.name.replace(/\.[^.]+$/, '').slice(0, 64));
  }

  function changeKind(next: 'image' | 'video' | 'audio') {
    if (next === kind) return;
    setKind(next);
    setWorkspaceAssetId('');
    setPreviewUrl('');
    editAttempt();
  }

  async function uploadWorkspaceFile(file: File) {
    if (uploading || formLocked) return;
    if (file.size > 8 * 1024 * 1024) {
      setDialogError(uiT('Workspace media must be 8 MiB or smaller.'));
      return;
    }
    const contentType = workspaceContentType(file);
    if (!WORKSPACE_MEDIA_TYPES[kind].contentType.split(',').includes(contentType)) {
      setDialogError(uiT('Choose a supported workspace media file type.'));
      return;
    }
    setUploading(true);
    setDialogError('');
    setWorkspaceError('');
    try {
      const asset = await data.uploadWorkspaceAsset({
        name: file.name,
        contentType,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      setWorkspaceAssets(current => [asset, ...current.filter(candidate => candidate.id !== asset.id)]);
      setWorkspaceAssetId(asset.id);
      editAttempt();
      if (!name.trim()) setName(asset.name.replace(/\.[^.]+$/, '').slice(0, 64));
    } catch (caught) {
      setDialogError(
        caught instanceof Error ? caught.message : uiT('The workspace media upload failed.'),
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function save() {
    if (!data.client || !data.model || busy || dialog === 'inspect-asset') return;
    if (dialogUnconfirmed && dialogUnconfirmed.id && dialogUnconfirmed.status !== 'prepared') return;
    if (dialog === 'material') {
      if (sourceMode === 'url') {
        try {
          if (new URL(url).protocol !== 'https:') throw new Error('Invalid material URL');
        } catch {
          setDialogError('Use a public HTTPS material URL.');
          return;
        }
      } else if (!workspaceAssetId) {
        setDialogError(uiT('Choose or upload workspace media.'));
        return;
      }
    }
    const api = data.client;
    const model = data.model;
    setBusy(true);
    setDialogError('');
    setOperationError('');
    try {
      let mutation: MediaAssetMutation | null = null;
      if (dialog === 'verification') {
        const result = await api.verification.create({ model, subjectName: name }, { idempotencyKey: attempt });
        if (['waiting_user', 'processing', 'verified'].includes(result.data.status)) {
          await complete();
          return;
        }
        const saved = { kind: 'verification' as const, id: result.data.id, status: result.data.status, keyId: data.resolvedKeyId, model };
        setDialogUnconfirmed(saved);
        setUnconfirmed(saved);
        setDialogError(uiT('The verification was saved but its outcome is not confirmed. Check its status before starting another attempt.'));
      } else if (dialog === 'material') {
        mutation = sourceMode === 'url'
          ? await api.assets.create({ model, group_id: data.group, url, name, kind }, { idempotencyKey: attempt })
          : await api.assets.create({ model, group_id: data.group, workspace_asset_id: workspaceAssetId, name, kind }, { idempotencyKey: attempt });
      } else if (dialog === 'group') {
        mutation = await api.groups.create({ model, name }, { idempotencyKey: attempt });
      } else if (dialog === 'edit') {
        if (!selected) throw new Error(uiT('The selected item is no longer available. Refresh and try again.'));
        mutation = await api.groups.update(selected.id, { model, name, expected_revision: selected.revision }, { idempotencyKey: attempt });
      } else if (dialog === 'delete-group') {
        if (!selected) throw new Error(uiT('The selected item is no longer available. Refresh and try again.'));
        mutation = await api.groups.delete(selected.id, { model, expected_revision: selected.revision }, { idempotencyKey: attempt });
      } else if (dialog === 'rename-asset') {
        if (!targetAsset) throw new Error(uiT('The selected item is no longer available. Refresh and try again.'));
        mutation = await api.assets.update(targetAsset.id, { model, name: name.trim(), expected_revision: targetAsset.revision }, { idempotencyKey: attempt });
      } else if (dialog === 'delete-asset') {
        if (!targetAsset) throw new Error(uiT('The selected item is no longer available. Refresh and try again.'));
        mutation = await api.assets.delete(targetAsset.id, { model, expected_revision: targetAsset.revision }, { idempotencyKey: attempt });
      } else {
        return;
      }
      if (!mutation) return;
      if (mutation.data.status === 'acknowledged') {
        if (mutation.group && dialog !== 'delete-group') data.setGroup(mutation.group.id);
        await complete();
      } else if (mutation.data.status === 'not_sent') {
        setAttempt(crypto.randomUUID());
        setDialogError(uiT('The Provider did not receive this change. You can try again.'));
      } else {
        const saved = { kind: 'media' as const, id: mutation.data.id, status: mutation.data.status, keyId: data.resolvedKeyId, model };
        setDialogUnconfirmed(saved);
        setUnconfirmed(saved);
        setDialogError(uiT(mutation.data.status === 'prepared'
          ? 'This change is saved but has not been sent yet. Send it, or check its status before editing.'
          : 'We could not confirm whether the Provider applied this change. Check its status before trying again.'));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The request could not be confirmed.';
      if (caught instanceof NiuAPIError && caught.gatewayCode === 'workspace_asset_source_unavailable') {
        setDialogError(uiT('Workspace media fetch is not configured for this deployment. Use a public HTTPS link instead.'));
      } else if (caught instanceof NiuAPIError && caught.operationId) {
        const saved = { kind: 'media' as const, id: caught.operationId, status: 'unknown', keyId: data.resolvedKeyId, model };
        setDialogUnconfirmed(saved);
        setUnconfirmed(saved);
        setDialogError(uiF('{0} The outcome is unconfirmed. Check its status before trying again.', [message]));
      } else if (caught instanceof NiuAPIError && [400, 401, 403, 404, 409, 422].includes(caught.status)) {
        setDialogError(message);
      } else {
        setDialogUnconfirmed({ kind: 'media', id: caught instanceof NiuAPIError ? caught.operationId ?? '' : '', status: 'unconfirmed', keyId: data.resolvedKeyId, model });
        setDialogError(uiF('{0} Retry the same request safely; editing is disabled to avoid creating a duplicate.', [message]));
      }
    } finally {
      setBusy(false);
    }
  }

  async function checkSaved() {
    if (!unconfirmed || busy || checking) return;
    setChecking(true);
    setOperationError('');
    setDialogError('');
    try {
      let status: string;
      if (unconfirmed.kind === 'verification') {
        if (!data.client || !data.model) throw new Error('Verification status is unavailable for this context.');
        status = (await data.client.verification.retrieve(unconfirmed.id, data.model)).data.status;
      } else {
        status = (await data.retrieveOperation(unconfirmed.id, unconfirmed.keyId, unconfirmed.model)).status;
      }
      const confirmed = unconfirmed.kind === 'verification'
        ? ['waiting_user', 'processing', 'verified'].includes(status)
        : status === 'acknowledged';
      if (confirmed) {
        setUnconfirmed(null);
        await complete();
      } else if (unconfirmed.kind === 'media' && status === 'not_sent') {
        setUnconfirmed(null);
        setDialogUnconfirmed(null);
        setAttempt(crypto.randomUUID());
        setOperationError(uiT('The Provider did not receive this change. You can try again.'));
      } else {
        const saved = { ...unconfirmed, status };
        setUnconfirmed(saved);
        if (dialogUnconfirmed) setDialogUnconfirmed(saved);
        setOperationError(uiT(status === 'prepared'
          ? dialogUnconfirmed
            ? 'The change is saved but has not been sent. Send it, or check again before editing.'
            : 'A saved change is waiting to be sent. Check its status before starting another attempt.'
          : 'The Provider still has not confirmed this change. Do not repeat it.'));
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not check the saved operation.';
      setOperationError(uiF('{0} The outcome remains unconfirmed. Try checking again.', [message]));
      if (dialog) setDialogError(uiF('{0} The outcome remains unconfirmed. Try checking again.', [message]));
    } finally {
      setChecking(false);
    }
  }

  async function openVerification(id: string) {
    await act(async () => {
      const link = await data.client!.verification.link(id, data.model!);
      const target = new URL(link.verification_url);
      if (target.protocol !== 'https:') throw new Error('Invalid verification link');
      window.open(target.href, '_blank', 'noopener,noreferrer');
    });
  }

  async function copyVerificationLink(id: string) {
    await act(async () => {
      const link = await data.client!.verification.link(id, data.model!);
      const target = new URL(link.verification_url);
      if (target.protocol !== 'https:') throw new Error('Invalid verification link');
      await navigator.clipboard?.writeText(target.href);
    });
  }

  return <div className="w-full min-w-0">
    {(unconfirmed || operationError) && <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
      <span>{operationError || (unconfirmed?.status === 'prepared'
        ? uiT('A saved change is waiting to be sent. Check its status before starting another attempt.')
        : uiT('A previous change is unconfirmed. Check its status before making the same change again.'))}</span>
      {unconfirmed?.id && <Button variant="outline" size="sm" disabled={busy || checking} onClick={() => void checkSaved()}>{checking ? uiT('Checking…') : uiT('Check status')}</Button>}
    </div>}
    <Tabs value={section === 'verification' ? 'verification' : 'materials'} onValueChange={setSection} className="gap-4">
      {(!hideSectionTabs || !nativeContext) && <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        {!hideSectionTabs ? <TabsList variant="line"><TabsTrigger value="materials">{uiT('Materials')}</TabsTrigger><TabsTrigger value="verification">{uiT('Human verification')}</TabsTrigger></TabsList> : <div />}
        {!nativeContext && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-0 max-w-full" aria-label={uiT('Native tools API key')} disabled={contextLocked || data.discoveryLoading}>
                <span className="min-w-0 truncate">{chosenKeyRecord?.name ?? uiT('Choose API key')}{keyStatusSuffix(chosenKeyRecord)}</span>
                <IconChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)]">
              <DropdownMenuRadioGroup value={chosenKey} onValueChange={keyId => {
                if (contextLocked) return;
                const nextKey = data.contextKeys.find(key => key.id === keyId);
                const nextModels = [...new Set(data.contextChoices.filter(choice => choice.keyId === keyId).map(choice => choice.module.model_alias))];
                const nextModel = preferredModel && nextModels.includes(preferredModel) ? preferredModel : nextModels[0] ?? '';
                onContextChange?.({ keyId: nextKey?.slug || keyId, model: nextModel });
              }}>
                {data.contextKeys.map(key => <DropdownMenuRadioItem key={key.id} value={key.id}>
                  <span className="min-w-0 whitespace-normal break-words">{key.name}{keyStatusSuffix(key)}</span>
                </DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-0 max-w-full" aria-label={uiT('Native tools model')} disabled={contextLocked || data.discoveryLoading || !chosenKey || modelChoices.length === 0}>
                <span className="min-w-0 truncate">{chosenModel ? modelLabel(chosenModel) : uiT('Choose model')}</span>
                <IconChevronDown size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={16} className="max-w-[calc(100vw-2rem)]">
              <DropdownMenuRadioGroup value={chosenModel} onValueChange={model => {
                if (contextLocked) return;
                onContextChange?.({ keyId: chosenKeyRecord?.slug || chosenKey, model });
              }}>
                {modelChoices.map(model => <DropdownMenuRadioItem key={model} value={model}>
                  <span className="min-w-0 whitespace-normal break-words">{modelLabel(model)}</span>
                </DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
      </div>}
      {!nativeContext && chosen && <p className="text-sm text-muted-foreground">{chosen.keyName} · {data.currentModule?.context_label ?? chosen.module.context_label}</p>}
      {nativeContext && data.currentModule && <p className="text-sm text-muted-foreground">{data.currentModule.context_label}</p>}
      {!nativeContext && data.discoveryLoading && <p role="status" className="text-sm text-muted-foreground">{uiT('Discovering native tool contexts…')}</p>}
      {(data.selectedKeyIpRestricted || (!nativeContext && !chosenKey && !data.discoveryLoading && data.ipRestrictedKeys.length > 0)) && <div role="status" className="space-y-3 rounded-md bg-muted/40 p-4 text-sm">
        <div className="space-y-1">
          <p className="font-medium">{restrictedTargetKey ? uiF('{0} is restricted to allowed source IP addresses', [restrictedTargetKey.name]) : uiT('Some API keys restrict your current source IP address')}</p>
          {restrictedAllowedCidrs !== undefined && restrictedAllowedCidrs !== null && <p className="text-xs text-muted-foreground">{restrictedAllowedCidrs.length > 0 ? uiF('Allowed source networks: {0}', [restrictedAllowedCidrs.join(', ')]) : uiT('Current policy: Block all source IP addresses')}</p>}
          <p className="text-muted-foreground">{data.selectedKeyIpRestricted && modelChoices.length > 0 ? uiT('Your current network is not in this key’s source IP allowlist, so live Provider materials and verification cannot be queried with this key. Choose another API key, or add your current IP address to this key’s source IP policy.') : restrictedTargetKey ? uiT('Your current network is not in this key’s source IP allowlist, so live Provider materials and verification cannot be accessed with this key. Choose another API key, or add your current IP address to this key’s source IP policy.') : uiF('Your current network is not in the source IP allowlist for: {0}. Choose an available API key, or update the key’s source IP access policy.', [data.ipRestrictedKeys.map(key => key.name).join(', ')])}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fallbackChoice && <Button variant="default" size="sm" disabled={contextLocked} onClick={() => {
            const fallbackKey = data.contextKeys.find(key => key.id === fallbackChoice.keyId);
            onContextChange?.({ keyId: fallbackKey?.slug || fallbackChoice.keyId, model: fallbackChoice.module.model_alias });
          }}>{uiF('Use {0}', [fallbackChoice.keyName])}</Button>}
          {restrictedTargetKey && <Button asChild variant="outline" size="sm">{inRouter ? <Link to={`${workspaceKeysHref}/${encodeURIComponent(restrictedTargetKey.slug || restrictedTargetKey.id)}`}>{uiT('Configure source IP access')}</Link> : <a href={`${workspaceKeysHref}/${encodeURIComponent(restrictedTargetKey.slug || restrictedTargetKey.id)}`}>{uiT('Configure source IP access')}</a>}</Button>}
          <Button asChild variant="outline" size="sm">{inRouter ? <Link to={workspaceKeysHref}>{uiT('Manage API keys')}</Link> : <a href={workspaceKeysHref}>{uiT('Manage API keys')}</a>}</Button>
          <Button variant="ghost" size="sm" disabled={contextLocked} onClick={data.retry}>{uiT('Recheck access')}</Button>
        </div>
      </div>}
      {!nativeContext && data.discoveryErrors.length > 0 && <div role="alert" className="space-y-2 py-3 text-sm">
        <p>{uiT('Some native tool contexts could not be discovered.')}</p>
        {data.discoveryErrors.map(error => <p key={error}>{error}</p>)}
        <Button variant="outline" disabled={contextLocked} onClick={data.retry}>{uiT('Retry discovery')}</Button>
      </div>}
      {!nativeContext && !data.discoveryLoading && !chosenModel && !data.selectedKeyIpRestricted && <div className="space-y-2 text-sm">
        {noActiveKeys && data.discoveryErrors.length === 0 && <p className="font-medium">{uiT('No active API keys')}</p>}
        <p className="text-muted-foreground">{noActiveKeys && data.discoveryErrors.length === 0 ? uiT('Add an API key and choose a supported model to read Provider materials.') : chosenKey && modelChoices.length === 0 ? data.discoveryErrors.length > 0 ? uiT('Native tool discovery is incomplete. Retry discovery or choose a discovered context.') : uiT('No models supporting Provider materials were found for this key. Choose another key or review your workspace models.') : data.contextKeys.length === 0 && data.discoveryErrors.length === 0 ? uiT('Add an API key and choose a supported model to read Provider materials.') : uiT('Choose an API key and model to read its materials.')}</p>
        {data.discoveryErrors.length === 0 && ((chosenKey && modelChoices.length === 0) || noActiveKeys) && <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">{inRouter ? <Link to={workspaceKeysHref}>{uiT('Manage API keys')}</Link> : <a href={workspaceKeysHref}>{uiT('Manage API keys')}</a>}</Button>
          <Button asChild variant="outline" size="sm">{inRouter ? <Link to={workspaceModelsHref}>{uiT('View models')}</Link> : <a href={workspaceModelsHref}>{uiT('View models')}</a>}</Button>
        </div>}
      </div>}
      {data.error && <div role="alert" className="flex items-center justify-between gap-3 py-3 text-sm"><span>{uiT(data.error)}</span><Button variant="outline" onClick={data.retry}>{uiT('Retry')}</Button></div>}
      <TabsContent value="materials"><section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-0 max-w-full" aria-label={uiT('Material group')} disabled={data.loading || !data.client || contextLocked}>
                <span className="min-w-0 truncate">{selected?.name ?? uiT('Choose group')}</span>
                <IconChevronDown className="shrink-0" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" collisionPadding={16} className="max-w-[calc(100vw-2rem)]">
              <DropdownMenuRadioGroup value={data.group} onValueChange={data.setGroup}>
                {data.groups.filter(group => group.status !== 'deleted').map(group => <DropdownMenuRadioItem key={group.id} value={group.id}>
                  <span className="min-w-0 whitespace-normal break-all">{group.name}</span>
                </DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!data.client || !data.canWrite || busy} onSelect={() => open('group')}><IconPlus size={16} />{uiT('New group')}</DropdownMenuItem>
              <DropdownMenuItem disabled={!data.client || !selected || !data.canWrite || busy || selected.kind === 'person'} onSelect={() => open('edit')}>{uiT('Edit group')}</DropdownMenuItem>
              <DropdownMenuItem disabled={!data.client || !selected || !data.canWrite || busy} onSelect={() => void act(() => data.client!.groups.refresh(selected!.id, data.model!))}>{uiT('Check group status')}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={!data.client || !selected || !data.canWrite || busy || selected.kind === 'person' || selected.status === 'unknown'} onSelect={() => open('delete-group')}>{uiT('Delete group')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" disabled={!data.client || !selected || selected.status !== 'ready' || !data.canWrite || busy} onClick={() => open('material')}><IconPlus size={14} />{uiT('Add material')}</Button>
        </div>
        {visibleAssets.length ? <Table>
          <TableHeader><TableRow><TableHead>{uiT('Name')}</TableHead><TableHead>{uiT('Type')}</TableHead><TableHead>{uiT('Status')}</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{visibleAssets.map(asset => <TableRow key={asset.id}>
            <TableCell className="whitespace-normal break-words">{asset.name || uiT('Untitled material')}</TableCell>
            <TableCell>{uiT(asset.kind)}</TableCell>
            <TableCell>{uiT(asset.status)}</TableCell>
            <TableCell><div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button variant="ghost" disabled={busy || !data.client} onClick={() => open('inspect-asset', asset)}>{uiT('Inspect')}</Button>
              <Button variant="ghost" disabled={busy || !data.canWrite} onClick={() => void act(() => data.client!.assets.refresh(asset.id, data.model!))}>{uiT('Check status')}</Button>
              <Button variant="ghost" disabled={busy || !data.client || !data.canWrite || asset.status === 'unknown'} onClick={() => open('rename-asset', asset)}>{uiT('Rename')}</Button>
              <Button variant="ghost" disabled={busy || !data.client || !data.canWrite || asset.status === 'unknown'} onClick={() => open('delete-asset', asset)}>{uiT('Delete')}</Button>
            </div></TableCell>
          </TableRow>)}</TableBody>
        </Table> : data.error ? <p className="text-sm text-muted-foreground">{uiT('Materials could not be loaded. Retry before continuing.')}</p> : <Empty className="min-h-40 border-0 py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconFolder size={20} stroke={1.5} aria-hidden="true" /></EmptyMedia>
            <EmptyTitle className="text-sm">{data.loading ? uiT('Loading materials…') : data.selectedKeyIpRestricted ? uiT('Source IP restricted for this API key') : !data.client ? uiT('Current materials unavailable') : !nativeContext && !chosenModel ? uiT('Choose an API key and model') : selected ? uiT('No materials in this group') : uiT('No material groups yet')}</EmptyTitle>
          </EmptyHeader>
          {!data.loading && data.client && data.canWrite && !selected && <Button variant="outline" disabled={busy} onClick={() => open('group')}>{uiT('Create group')}</Button>}
          {!data.loading && data.client && data.canWrite && selected && selected.status === 'ready' && <Button variant="outline" disabled={busy} onClick={() => open('material')}><IconPlus size={14} />{uiT('Add material')}</Button>}
        </Empty>}
      </section></TabsContent>
      <TabsContent value="verification" className="space-y-4">
        <div className="flex justify-end"><Button disabled={busy || !data.client || !data.canWrite} onClick={() => open('verification')}><IconPlus size={16} />{uiT('Start verification')}</Button></div>
        {data.sessions.length ? <Table>
          <TableHeader><TableRow><TableHead>{uiT('Person')}</TableHead><TableHead>{uiT('Status')}</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{data.sessions.map(verification => <TableRow key={verification.id}>
            <TableCell>{verification.subject_name || uiT('Unnamed person')}</TableCell>
            <TableCell>{uiT(verification.status.replaceAll('_', ' '))}</TableCell>
            <TableCell><div className="flex flex-wrap items-center justify-end gap-1.5">
              {['waiting_user', 'processing'].includes(verification.status) && <>
                <Button variant="ghost" disabled={busy} onClick={() => void openVerification(verification.id)}>{uiT('Open verification')}</Button>
                <Button variant="ghost" disabled={busy} onClick={() => void copyVerificationLink(verification.id)}>{uiT('Copy link', '复制链接')}</Button>
              </>}
              <Button variant="ghost" disabled={busy || !data.canWrite} onClick={() => void act(() => data.client!.verification.refresh(verification.id, data.model!))}>{uiT('Check status')}</Button>
            </div></TableCell>
          </TableRow>)}</TableBody>
        </Table> : <Unavailable heading="Verification sessions" title={!data.client ? data.loading ? uiT('Loading native context…') : data.selectedKeyIpRestricted ? uiT('Source IP restricted for this API key') : uiT('Choose an API key and model') : uiT('Verify a person')} description={!data.client ? data.selectedKeyIpRestricted ? uiT('Choose another API key or update this key’s source IP allowlist to use human verification.') : uiT('Select a discovered native context before reading or starting verification.') : uiT('The person verifies on the Provider’s page. A separate status check confirms the result.')} />}
      </TabsContent>
    </Tabs>
    <Dialog open={dialog !== null} onOpenChange={value => { if (!value && !busy) { setDialog(null); setTargetAsset(null); setDialogUnconfirmed(null); } }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialog === 'group' ? uiT('New material group') : dialog === 'edit' ? uiT('Edit group') : dialog === 'delete-group' ? uiT('Delete material group') : dialog === 'material' ? uiT('Add material') : dialog === 'inspect-asset' ? uiT('Material details') : dialog === 'rename-asset' ? uiT('Rename material') : dialog === 'delete-asset' ? uiT('Delete material') : uiT('Human verification')}</DialogTitle>
          <DialogDescription>{dialog === 'verification' ? uiT('The person completes verification on the Provider’s page. Niu then checks the result.') : dialog === 'inspect-asset' ? uiT('Inspect saved material readiness and Provider observation status. Source URLs and opaque Provider references remain private.') : dialog === 'delete-asset' ? uiT('Confirm material deletion from this Provider group.') : dialog === 'delete-group' ? uiT('Confirm material group deletion from the Provider.') : uiT('Manage materials in this workspace.')}</DialogDescription>
        </DialogHeader>
        {dialog === 'inspect-asset' && targetAsset ? <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">{uiT('Name')}</dt><dd className="font-medium break-words">{targetAsset.name || uiT('Untitled material')}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{uiT('Material type')}</dt><dd className="font-medium">{uiT(targetAsset.kind)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{uiT('Group')}</dt><dd className="font-medium break-words">{selected?.name ?? uiT('Current group')}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{uiT('Readiness status')}</dt><dd className="font-medium">{translateUI(assetStatusDescriptions[targetAsset.status])}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{uiT('Saved revision')}</dt><dd className="font-medium">{uiF('Revision {0}', [targetAsset.revision])}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{uiT('Last updated')}</dt><dd className="font-medium">{new Date(targetAsset.updated_at_ms).toLocaleString(readUILocale())}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">{uiT('Provider observation')}</dt><dd className="font-medium">{targetAsset.observation ? uiF('Observed {0}{1} at {2}', [targetAsset.observation.status, targetAsset.observation.name ? ` (“${targetAsset.observation.name}”)` : '', new Date(targetAsset.observation.observed_at_ms).toLocaleString(readUILocale())]) : uiT('No Provider status observation recorded yet. Use Check status to query the Provider.')}</dd></div>
          </dl>
          <p className="text-xs text-muted-foreground">{uiT('Workspace:')}{' '}{workspaceName}</p>
        </div> : isDestructiveDialog ? <div className="space-y-3 text-sm">
          <p>{dialog === 'delete-asset' ? uiF('Delete material “{0}” from {1}? This removes the material from the Provider and cannot be undone.', [targetAsset?.name || uiT('Untitled material'), selected?.name ?? uiT('this group')]) : uiF('Delete material group “{0}”? This removes the group from the Provider and cannot be undone.', [selected?.name ?? uiT('Untitled group')])}</p>
          <p className="text-muted-foreground">{uiT('Workspace:')}{' '}{workspaceName}</p>
        </div> : <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider-tool-name">{dialog === 'verification' ? uiT('Person name') : dialog === 'material' || dialog === 'rename-asset' ? uiT('Material name') : uiT('Group name')}</Label>
            <Input id="provider-tool-name" disabled={formLocked} value={name} onChange={event => { editAttempt(); setName(event.target.value); }} maxLength={64} />
          </div>
          {dialog === 'material' && <>
            <Tabs value={sourceMode} onValueChange={value => changeMaterialSource(value as MaterialSource)}>
              <TabsList className="w-full">
                <TabsTrigger value="url">{uiT('Public link')}</TabsTrigger>
                <TabsTrigger value="workspace">{uiT('Workspace media')}</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-2">
                <Label htmlFor="material-url">{uiT('Material URL')}</Label>
                <Input id="material-url" aria-invalid={dialogError === 'Use a public HTTPS material URL.'} aria-describedby={dialogError ? 'provider-tool-dialog-error' : 'material-url-help'} disabled={formLocked} type="url" value={url} onChange={event => { editAttempt(); setUrl(event.target.value); }} />
                <p id="material-url-help" className="text-xs text-muted-foreground">{uiT('The Provider downloads this file from a public HTTPS URL. Workspace media is private and cannot be reached by the Provider; use a public HTTPS link to the same file instead.')}</p>
              </TabsContent>
              <TabsContent value="workspace" className="space-y-2">
                <Label>{uiT('Workspace media')}</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="min-w-0 max-w-full" disabled={formLocked || workspaceLoading}>
                        <span className="min-w-0 truncate">{selectedWorkspaceAsset?.name ?? (workspaceLoading ? uiT('Loading…') : uiT('Choose media'))}</span>
                        <IconChevronDown className="shrink-0" size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 max-w-[calc(100vw-2rem)] overflow-y-auto">
                      <DropdownMenuRadioGroup value={workspaceAssetId} onValueChange={chooseWorkspaceAsset}>
                        {workspaceAssets.map(asset => <DropdownMenuRadioItem key={asset.id} value={asset.id}>
                          <span className="min-w-0 whitespace-normal break-words">{asset.name}</span>
                        </DropdownMenuRadioItem>)}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button variant="outline" disabled={formLocked || uploading} onClick={() => fileInput.current?.click()}>
                    <IconUpload size={16} />{uploading ? uiT('Uploading…') : uiT('Upload')}
                  </Button>
                  <Input ref={fileInput} type="file" className="hidden" accept={WORKSPACE_MEDIA_TYPES[kind].accept} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadWorkspaceFile(file); }} />
                </div>
                {previewUrl && <img src={previewUrl} alt={selectedWorkspaceAsset?.name ?? ''} className="h-24 w-24 rounded-md object-cover" />}
                {selectedWorkspaceAsset && <p className="text-xs text-muted-foreground">{selectedWorkspaceAsset.name} · {selectedWorkspaceAsset.content_type} · {mediaSize(selectedWorkspaceAsset.byte_length)}</p>}
                {!selectedWorkspaceAsset && !workspaceLoading && <p className="text-xs text-muted-foreground">{uiT('No saved media of this type.')}</p>}
                {workspaceError && <p role="alert" className="text-xs text-destructive">{uiT(workspaceError)}</p>}
                <p className="text-xs text-muted-foreground">{uiT('The Provider receives a short-lived link to this workspace file. The link is not saved.')}</p>
              </TabsContent>
            </Tabs>
            <div className="space-y-2">
              <Label>{uiT('Material type')}</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" disabled={formLocked}>{uiT(kind)}<IconChevronDown size={16} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent><DropdownMenuRadioGroup value={kind} onValueChange={value => changeKind(value as typeof kind)}>{['image', 'video', 'audio'].map(value => <DropdownMenuRadioItem key={value} value={value}>{uiT(value)}</DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>}
          <p className="text-sm text-muted-foreground">{uiT('Workspace:')}{' '}{workspaceName}</p>
        </div>}
        {dialogError && <p id="provider-tool-dialog-error" role="alert" className="text-sm text-destructive">{uiT(dialogError)}</p>}
        <DialogFooter className="flex-wrap gap-2 sm:flex-wrap">
          {dialog === 'inspect-asset' && targetAsset ? <>
            <Button variant="ghost" disabled={busy} onClick={() => { setDialog(null); setTargetAsset(null); }}>{uiT('Close')}</Button>
            <Button variant="outline" disabled={busy || !data.canWrite || !data.client} onClick={() => void act(async () => { const refreshed = await data.client!.assets.refresh(targetAsset.id, data.model!); setTargetAsset(refreshed.data); })}>{busy ? uiT('Checking…') : uiT('Check status')}</Button>
            <Button variant="outline" disabled={busy || !data.canWrite || targetAsset.status === 'unknown'} onClick={() => open('rename-asset', targetAsset)}>{uiT('Rename material')}</Button>
            <Button variant="destructive" disabled={busy || !data.canWrite || targetAsset.status === 'unknown'} onClick={() => open('delete-asset', targetAsset)}>{uiT('Delete material')}</Button>
          </> : <>
            <Button variant="ghost" disabled={busy} onClick={() => { setDialog(null); setTargetAsset(null); setDialogUnconfirmed(null); }}>{uiT('Close')}</Button>
            {dialogUnconfirmed?.id && <Button variant="outline" disabled={busy || checking} onClick={() => void checkSaved()}>{checking ? uiT('Checking…') : uiT('Check status')}</Button>}
            {dialogUnconfirmed && (!dialogUnconfirmed.id || dialogUnconfirmed.status === 'prepared') && <Button variant="outline" disabled={busy} onClick={() => void save()}>{busy ? uiT('Sending…') : dialogUnconfirmed.status === 'prepared' ? uiT('Send queued change') : uiT('Try again')}</Button>}
            {!dialogUnconfirmed && <Button variant={isDestructiveDialog ? 'destructive' : 'default'} disabled={busy || (requiresNameInput && !name.trim()) || (dialog === 'material' && !materialSourceReady)} onClick={() => void save()}>
              {busy ? isDestructiveDialog ? uiT('Deleting…') : uiT('Saving…') : dialog === 'verification' ? uiT('Start verification') : dialog === 'group' ? uiT('Create group') : dialog === 'delete-group' ? uiT('Delete group') : dialog === 'delete-asset' ? uiT('Delete material') : uiT('Save')}
            </Button>}
          </>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

function Unavailable({ title, description }: { heading: string; title: string; description: string }) {
  return <div className=""><Empty className="min-h-40 border-0 py-10"><EmptyHeader><EmptyMedia variant="icon"><ScanFace size={20} strokeWidth={1.5} aria-hidden="true" /></EmptyMedia><EmptyTitle className="text-sm font-medium">{title}</EmptyTitle><EmptyDescription className="max-w-sm text-sm">{description}</EmptyDescription></EmptyHeader></Empty></div>;
}
