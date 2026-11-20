import { useLocale as useUILocale } from '@/shell/ui-locale';
import { useState } from 'react';
import { IconLink as LinkIcon } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formatDateTime,
  memberInvitationLink,
  type CreatedMemberInvitation,
} from '../api';

export default function InvitationLinkPanel({
  created,
  onDismiss,
}: {
  created: CreatedMemberInvitation;
  onDismiss: () => void;
}) {
  const { t: uiT } = useUILocale();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const link = memberInvitationLink(created.token);
  const emailSent = created.delivery.email_sent;
  return (
    <section className="operator-credential" aria-labelledby="invitation-link-title" role="status">
      <div className="operator-credential-title">
        <span>
          <LinkIcon size={16} aria-hidden="true" />
        </span>
        <div>
          <h3 id="invitation-link-title">{uiT('Invitation link ready', '邀请链接已生成')}</h3>
          <p>
            {uiT('Send this one-time link to', '请将此一次性链接发送给')}{' '}
            <strong>{created.invitation.recipient_email}</strong>
            {uiT('. It expires', '。有效期至')} {formatDateTime(created.invitation.expires_at)}.
          </p>
        </div>
      </div>
      {!emailSent && (
        <Alert className="invitation-delivery-alert">
          <LinkIcon aria-hidden="true" />
          <AlertTitle>
            {uiT('No email was sent', '未发送邮件')}
          </AlertTitle>
          <AlertDescription>
            {uiT(
              'Email delivery is not configured on this installation. Copy this link and share it with the recipient through a channel you trust.',
              '此实例未配置邮件发送。请复制此链接，并通过可信渠道发送给收件人。',
            )}
          </AlertDescription>
        </Alert>
      )}
      <Label htmlFor="new-invitation-link">
        {uiT('One-time invitation link', '一次性邀请链接')}
        <Input
          id="new-invitation-link"
          className="mono operator-token-input"
          readOnly
          value={link}
          onFocus={event => event.target.select()}
        />
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(link)
              .then(() => setCopyState('copied'))
              .catch(() => setCopyState('failed'));
          }}
        >
          {copyState === 'copied' ? uiT('Copied', '已复制') : uiT('Copy link', '复制链接')}
        </Button>
        <Button type="button" variant="outline" onClick={onDismiss}>
          {uiT('Done — hide link', '完成 — 隐藏链接')}
        </Button>
        {copyState === 'failed' && (
          <span role="alert" className="text-sm text-destructive">
            {uiT('Copy failed. Select the link and copy it manually.', '复制失败，请手动选择链接并复制。')}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {uiT(
          'This link is shown only now and works once. Creating another invitation for this email replaces it. The recipient must sign in with this email to accept.',
          '此链接仅在此时显示且只能使用一次。为同一邮箱重新创建邀请会使此链接失效。收件人必须使用此邮箱登录后接受邀请。',
        )}
      </p>
    </section>
  );
}
