import { authenticatedFetch as fetch } from '@/lib/authenticated-fetch';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { IconArrowLeft } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormSectionSkeleton } from '@/components/PageSkeletons';
import { loadAuthConfig } from '@/lib/auth-config';
import { invalidateQueries, peekQuery } from '@/lib/query-cache';
import { useLocale } from '@/shell/ui-locale';

export default function PasswordSettings({ token, hasPassword = true, onChanged, onEditingChange }: {token: string; hasPassword?: boolean; onChanged: () => Promise<void>; onEditingChange?: (editing: boolean) => void}) {
  const { t } = useLocale();
  const saveController = useRef<AbortController | null>(null);
  useEffect(() => () => saveController.current?.abort(), [token]);
  const cachedConfig = peekQuery<{ password_login: boolean }>('public', '/api/v1/auth/config');
  const [enabled, setEnabled] = useState(() => cachedConfig?.password_login === true);
  const [loaded, setLoaded] = useState(() => typeof cachedConfig?.password_login === 'boolean');
  const [capabilityError, setCapabilityError] = useState(false);
  const [capabilityRevision, setCapabilityRevision] = useState(0);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const currentInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  useEffect(() => {
    onEditingChangeRef.current?.(editing);
    if (editing) currentInput.current?.focus();
    else if (wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const lastCapRevision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const force = lastCapRevision.current !== capabilityRevision;
    lastCapRevision.current = capabilityRevision;
    if (force) setLoaded(false);
    setCapabilityError(false);
    void loadAuthConfig({ signal: controller.signal, force })
      .then(value => {
        if (typeof value?.password_login !== 'boolean') {
          invalidateQueries(key => key.startsWith('public::/api/v1/auth/config'));
          throw new Error('Invalid capability response');
        }
        if (!controller.signal.aborted) {
          setEnabled(value.password_login === true);
          setLoaded(true);
        }
      })
      .catch(() => { invalidateQueries(key => key.startsWith('public::/api/v1/auth/config')); if (!controller.signal.aborted) { setCapabilityError(true); setLoaded(true); } });
    return () => controller.abort();
  }, [capabilityRevision]);
  if (capabilityError) return <div className="mt-6 grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{t('Could not load password settings.', '无法加载密码设置。')}</p><Button variant="secondary" onClick={() => setCapabilityRevision(value => value + 1)}>{t('Retry password settings', '重试加载密码设置')}</Button></div>;
  if (!loaded) return <FormSectionSkeleton fields={1} label={t('Loading password settings…', '正在加载密码设置…')} className="mt-6" />;
  if (!enabled) return null;
  if (!hasPassword) return <p className="mt-6 text-sm text-muted-foreground">{t('Password sign-in is not configured for this account.', '此账户尚未配置密码登录。')}</p>;
  function closeEditor() {
    if (saving) return;
    setCurrent('');
    setPassword('');
    setConfirmation('');
    setError('');
    setEditing(false);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setError('');
    if (password !== confirmation) {setError(t('The new passwords do not match.', '两次输入的新密码不一致。')); return;}
    if ([...password].length < 15 || new TextEncoder().encode(password).length > 1024) {
      setError(t('Use a password of at least 15 characters.', '请使用至少 15 个字符的密码。')); return;
    }
    setSaving(true);
    const controller = new AbortController();
    saveController.current = controller;
    try {
      const response = await fetch('/api/v1/auth/password', {
        method:'PUT', signal:controller.signal, cache:'no-store', headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify({current_password:current,password}),
      });
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(response.status === 401 ? t('The current password could not be verified.', '当前密码验证失败。')
          : response.status === 409 ? t('Your password changed while this request was running. Sign in again.', '密码在此请求执行期间已被修改，请重新登录。')
          : response.status === 429 ? t('Too many attempts. Try again in a minute.', '尝试次数过多，请一分钟后再试。') : t('Could not change your password. Try again.', '无法修改密码，请重试。'));
        return;
      }
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (result.sign_in_required !== true || !Number.isSafeInteger(result.revision) || result.revision < 1) throw new Error('Unconfirmed password change');
      setCurrent(''); setPassword(''); setConfirmation('');
      await onChanged();
    } catch {if (!controller.signal.aborted) setError(t('Could not confirm the password change. Try signing in before retrying.', '无法确认密码是否已修改，请尝试重新登录后再试。'));}
    finally {if (!controller.signal.aborted) setSaving(false);}
  }
  if (editing) {
    return (
      <section className="space-y-4" aria-labelledby="password-settings-title">
        <Button type="button" variant="ghost" size="sm" data-settings-back disabled={saving} onClick={closeEditor}>
          <IconArrowLeft size={16} aria-hidden="true" />
          {t('Back to account', '返回账户')}
        </Button>
        <header className="space-y-1">
          <h3 id="password-settings-title" className="text-base font-semibold">{t('Change password', '修改密码')}</h3>
          <p className="text-sm text-muted-foreground">{t('Changing your password signs you out on all devices.', '修改后将在所有设备退出登录。')}</p>
        </header>
        <form onSubmit={submit} className="grid max-w-md gap-4">
          <div className="grid gap-2"><Label htmlFor="account-current-password">{t('Current password', '当前密码')}</Label><Input ref={currentInput} id="account-current-password" autoComplete="current-password" type="password" required disabled={saving} value={current} onChange={event=>setCurrent(event.target.value)}/></div>
          <div className="grid gap-2"><Label htmlFor="account-new-password">{t('New password', '新密码')}</Label><Input id="account-new-password" autoComplete="new-password" type="password" required disabled={saving} value={password} onChange={event=>setPassword(event.target.value)} aria-describedby="account-password-policy"/><p id="account-password-policy" className="text-sm text-muted-foreground">{t('At least 15 characters.', '至少 15 个字符。')}</p></div>
          <div className="grid gap-2"><Label htmlFor="account-confirm-password">{t('Confirm new password', '确认密码')}</Label><Input id="account-confirm-password" autoComplete="new-password" type="password" required disabled={saving} value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></div>
          {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
          <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={closeEditor}>{t('Cancel', '取消')}</Button><Button type="submit" disabled={saving}>{saving ? t('Changing…', '修改中…') : t('Update password', '更新')}</Button></div>
        </form>
      </section>
    );
  }
  return <section aria-labelledby="password-settings-title">
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="space-y-0.5">
        <h3 id="password-settings-title" className="text-sm font-medium">{t('Password', '密码')}</h3>
        <p className="text-sm text-muted-foreground">{t('Update the password used to sign in to your account.', '用于登录此账户的密码。')}</p>
      </div>
      <Button ref={editButton} type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>{t('Change password', '修改')}</Button>
    </div>
  </section>;
}
