import { useState, type FormEvent } from 'react';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { RegistrationRequestRecord } from '@niu-io/sdk';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError, request } from '@/lib/api-client';
import { useLocale } from '@/shell/ui-locale';

const REGISTRATION_QUEUE_PATH = '/api/v1/admin/registrations';

export function ApproveRegistrationDialog({
  token,
  record,
  opener,
  onClose,
  onApproved,
}: {
  token: string;
  record: RegistrationRequestRecord;
  opener: HTMLElement | null;
  onClose: () => void;
  onApproved: (updated: RegistrationRequestRecord) => void;
}) {
  const { t } = useLocale();
  const [organizationName, setOrganizationName] = useState(record.organization_name);
  const [workspaceName, setWorkspaceName] = useState(record.workspace_name);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const trimmedOrg = organizationName.trim();
    const trimmedWs = workspaceName.trim();
    const trimmedNote = note.trim();
    if (!trimmedOrg || [...trimmedOrg].length > 120) {
      setErrorMessage(
        t('Organization name must be 1 to 120 characters.', '组织名称需为 1 至 120 个字符。'),
      );
      return;
    }
    if (!trimmedWs || [...trimmedWs].length > 120) {
      setErrorMessage(
        t('Workspace name must be 1 to 120 characters.', '工作空间名称需为 1 至 120 个字符。'),
      );
      return;
    }
    if ([...trimmedNote].length > 500) {
      setErrorMessage(t('Review note must be 500 characters or fewer.', '审批备注最多 500 个字符。'));
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const payload: Record<string, string> = {
        expected_revision: record.revision,
        organization_name: trimmedOrg,
        workspace_name: trimmedWs,
      };
      if (trimmedNote) payload.note = trimmedNote;
      const result = await request<{ data: RegistrationRequestRecord }>(
        token,
        `${REGISTRATION_QUEUE_PATH}/${encodeURIComponent(record.id)}/approve`,
        'POST',
        payload,
      );
      onApproved(result.data);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setErrorMessage(
          t(
            'This request was already reviewed or its email already belongs to an active account. Close and refresh the queue.',
            '该申请已被审批、修订版本已更新，或该邮箱已绑定有效账号。请关闭并刷新列表。',
          ),
        );
      } else {
        setErrorMessage(t('Approval failed. Please try again.', '批准失败，请重试。'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={event => {
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('Approve Limited Preview account', '批准有限预览账号申请')}</DialogTitle>
          <DialogDescription>
            {record.applicant_name} ({record.email})
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <p className="text-sm text-muted-foreground">
            {t(
              'Approving atomically provisions the organization, initial workspace, and owner credentials using the password the applicant submitted.',
              '批准后将自动创建组织、初始工作空间，并使用申请人提交的密码创建组织所有者账号。',
            )}
          </p>

          <div className="space-y-2">
            <Label htmlFor="approve-org-name">{t('Organization / company name', '组织或公司名称')}</Label>
            <Input
              id="approve-org-name"
              required
              maxLength={120}
              disabled={submitting}
              value={organizationName}
              onChange={event => {
                setOrganizationName(event.target.value);
                setErrorMessage('');
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approve-ws-name">{t('Initial workspace name', '初始工作空间名称')}</Label>
            <Input
              id="approve-ws-name"
              required
              maxLength={120}
              disabled={submitting}
              value={workspaceName}
              onChange={event => {
                setWorkspaceName(event.target.value);
                setErrorMessage('');
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="approve-note">{t('Review note (optional)', '审批备注（选填）')}</Label>
            <Textarea
              id="approve-note"
              rows={2}
              maxLength={500}
              disabled={submitting}
              placeholder={t('Optional internal note for the audit record…', '可选，记录于审批流水…')}
              value={note}
              onChange={event => {
                setNote(event.target.value);
                setErrorMessage('');
              }}
            />
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              {t('Cancel', '取消')}
            </Button>
            <Button type="submit" disabled={submitting}>
              <IconCheck size={16} aria-hidden="true" />
              <span>{submitting ? t('Provisioning…', '正在开通…') : t('Approve & provision', '批准并开通账号')}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RejectRegistrationDialog({
  token,
  record,
  opener,
  onClose,
  onRejected,
}: {
  token: string;
  record: RegistrationRequestRecord;
  opener: HTMLElement | null;
  onClose: () => void;
  onRejected: (updated: RegistrationRequestRecord) => void;
}) {
  const { t } = useLocale();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const trimmedNote = note.trim();
    if ([...trimmedNote].length > 500) {
      setErrorMessage(t('Review note must be 500 characters or fewer.', '审批备注最多 500 个字符。'));
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    try {
      const payload: Record<string, string> = { expected_revision: record.revision };
      if (trimmedNote) payload.note = trimmedNote;
      const result = await request<{ data: RegistrationRequestRecord }>(
        token,
        `${REGISTRATION_QUEUE_PATH}/${encodeURIComponent(record.id)}/reject`,
        'POST',
        payload,
      );
      onRejected(result.data);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setErrorMessage(
          t(
            'This request was already reviewed. Close and refresh the queue.',
            '该申请已被处理，请关闭并刷新列表。',
          ),
        );
      } else {
        setErrorMessage(t('Could not reject registration request. Try again.', '拒绝操作失败，请重试。'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={event => {
          if (opener?.isConnected) {
            event.preventDefault();
            opener.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('Reject registration request', '拒绝注册申请')}</DialogTitle>
          <DialogDescription>
            {record.applicant_name} ({record.email})
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={event => void submit(event)}>
          <p className="text-sm text-muted-foreground">
            {t(
              'Rejecting clears the submitted password credential without creating an account. The applicant may submit a fresh request later.',
              '拒绝操作将清除已提交的密码凭证且不创建账号。申请人日后可重新提交申请。',
            )}
          </p>

          <div className="space-y-2">
            <Label htmlFor="reject-note">{t('Reason / note (optional)', '拒绝说明（选填）')}</Label>
            <Textarea
              id="reject-note"
              rows={2}
              maxLength={500}
              disabled={submitting}
              placeholder={t('Optional reason recorded in review history…', '可选，记录于审批记录…')}
              value={note}
              onChange={event => {
                setNote(event.target.value);
                setErrorMessage('');
              }}
            />
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
              {t('Cancel', '取消')}
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              <IconX size={16} aria-hidden="true" />
              <span>{submitting ? t('Rejecting…', '正在拒绝…') : t('Reject request', '确认拒绝')}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
