import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { request, VendorRequestError } from '@/features/vendors/api';
import type { MemberProfile } from '@/app/dashboard-context';

function validProfile(profile:MemberProfile) {
  return profile && typeof profile.name==='string' && Number.isSafeInteger(profile.revision) && profile.revision>=0
    && (profile.email===null || typeof profile.email==='string')
    && (profile.avatar_data_url===null || (typeof profile.avatar_data_url==='string' && profile.avatar_data_url.startsWith('data:image/png;base64,')));
}

export default function AccountProfile({token, initialProfile, onSaved}: {token:string; initialProfile?:MemberProfile | null; onSaved:(profile:MemberProfile)=>void}) {
  const [profile,setProfile]=useState<MemberProfile | null>(initialProfile ?? null);
  const [name,setName]=useState(initialProfile?.name ?? '');
  const [avatar,setAvatar]=useState<string | null>(initialProfile?.avatar_data_url ?? null);
  const [loading,setLoading]=useState(true);
  const [loadFailed,setLoadFailed]=useState(false);
  const [conflict,setConflict]=useState(false);
  const [saving,setSaving]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const [revision,setRevision]=useState(0);
  const input = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const photoRequest = useRef(0);
  useEffect(() => () => { photoRequest.current += 1; }, [token]);
  useEffect(() => {
    const read = new AbortController();setLoading(true);setLoadFailed(false);setError('');
    void request<{data:MemberProfile}>(token,'/admin/v1/auth/profile','GET',undefined,read.signal).then(result=>{
      if (read.signal.aborted) return;
      if (!validProfile(result.data)) throw new Error('Invalid profile response');
      setProfile(result.data);setName(result.data.name);setAvatar(result.data.avatar_data_url);
      setConflict(false);
    }).catch(()=>{if (!read.signal.aborted) {setLoadFailed(true);setError('Could not load your profile. Try again.');}})
      .finally(()=>{if (!read.signal.aborted) setLoading(false);});
    return ()=>{read.abort();controller.current?.abort();};
  },[token,revision]);
  async function choosePhoto(file:File | undefined) {
    if (!file) return;
    if (input.current) input.current.value='';
    setError('');setSaved(false);
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 5*1024*1024) {
      setError('Choose a PNG, JPEG, or WebP image up to 5 MB.');return;
    }
    const requestId = ++photoRequest.current;
    setProcessing(true);
    try {
      const bitmap=await createImageBitmap(file);
      try {
        if (requestId !== photoRequest.current) return;
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
        const context=canvas.getContext('2d');if (!context) throw new Error('Image processing unavailable');
        const side=Math.min(bitmap.width,bitmap.height);
        context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);
        const image=canvas.toDataURL('image/png');
        if (image.length > 175000) throw new Error('Image too large');
        setAvatar(image);
      } finally {bitmap.close();}
    } catch {if (requestId === photoRequest.current) setError('Could not process that image. Choose another image.');}
    finally {if (requestId === photoRequest.current) {setProcessing(false);if (input.current) input.current.value='';}}
  }
  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if (!profile || loading || loadFailed || conflict || saving || processing) return;
    const pending=new AbortController();controller.current=pending;setSaving(true);setError('');setSaved(false);
    try {
      const result=await request<{data:MemberProfile}>(token,'/admin/v1/auth/profile','PUT',{name:name.trim(),avatar_data_url:avatar,expected_revision:profile.revision},pending.signal);
      if (!validProfile(result.data)) throw new Error('Invalid profile response');
      if (!pending.signal.aborted) {setProfile(result.data);setName(result.data.name);setAvatar(result.data.avatar_data_url);onSaved(result.data);setSaved(true);}
    } catch (failure) {
      if (!pending.signal.aborted) {
        const stale = failure instanceof VendorRequestError && failure.status===409;
        setConflict(stale);
        setError(stale ? 'Your profile changed elsewhere. Reload before saving.' : 'Could not save your profile. Your changes are still here.');
      }
    } finally {if (!pending.signal.aborted) setSaving(false);}
  }
  const disabled=loading || loadFailed || saving || processing;
  const retryDisabled=loading || saving || processing;
  return <form onSubmit={save} className="grid gap-5" aria-label="Profile">
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className="size-16"><AvatarImage src={avatar ?? undefined} alt="Profile photo"/><AvatarFallback>{name.trim().slice(0,1).toUpperCase() || '?'}</AvatarFallback></Avatar>
      <div className="grid gap-2"><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" aria-describedby="account-photo-help" disabled={disabled} onClick={()=>input.current?.click()}>{processing ? 'Processing…' : 'Change photo'}</Button>{avatar && <Button type="button" variant="ghost" disabled={disabled} onClick={()=>{setAvatar(null);setSaved(false);}}>Remove photo</Button>}</div><p id="account-photo-help" className="text-xs text-muted-foreground">PNG, JPEG, or WebP · Up to 5 MB</p></div>
      <Input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label="Upload profile photo" disabled={disabled} onChange={event=>void choosePhoto(event.target.files?.[0])}/>
    </div>
    <div className="grid min-w-0 gap-2"><Label htmlFor="account-profile-name">Display name</Label><Input ref={nameInput} id="account-profile-name" autoComplete="name" required maxLength={100} value={name} disabled={disabled} onChange={event=>{setName(event.target.value);setSaved(false);}}/></div>
    {profile?.email && <div className="grid min-w-0 gap-2"><Label htmlFor="account-profile-email">Email</Label><Input id="account-profile-email" type="email" autoComplete="email" value={profile.email} readOnly/></div>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading profile…</p>}
    {(error || conflict) && <div className="grid justify-items-start gap-2"><p role="alert" className="text-sm text-destructive">{error || 'Your profile changed elsewhere. Reload before saving.'}</p>{(!profile || conflict || loadFailed) && <Button type="button" variant="outline" disabled={retryDisabled} onClick={()=>setRevision(value=>value+1)}>Reload profile</Button>}</div>}
    {saved && <p role="status" className="text-sm text-muted-foreground">Profile saved.</p>}
    <div className="flex justify-end gap-2">{profile && (name !== profile.name || avatar !== profile.avatar_data_url) && <Button type="button" variant="ghost" disabled={disabled} onClick={()=>{setName(profile.name);setAvatar(profile.avatar_data_url);setError('');setSaved(false);nameInput.current?.focus();}}>Cancel</Button>}<Button type="submit" disabled={disabled || conflict || !profile || !name.trim() || (name.trim()===profile.name && avatar===profile.avatar_data_url)}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
  </form>;
}
