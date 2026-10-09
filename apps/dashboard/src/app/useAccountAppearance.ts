import { useEffect, useState } from 'react';
import { request } from '@/features/vendors/api';
import { cacheTheme, cacheThemeOwner, readThemeOwner, type Theme } from './theme';

function validMode(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Synchronize shared theme controls with the signed-in member's saved preference. */
export function useAccountAppearance(token: string, identity: string, personal: boolean, memberId = identity, deploymentDefault:Theme = 'system') {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({identity,ready:!personal,saving:false,error:''});
  useEffect(() => {
    if (!personal) {cacheThemeOwner('');cacheTheme(deploymentDefault);setState({identity,ready:true,saving:false,error:''});return;}
    const controller = new AbortController();
    let ready = false;
    let running = false;
    let confirmed: Theme = 'system';
    let queued: Theme | null = null;
    setState({identity,ready:false,saving:false,error:''});
    // Keep this member's cached mode while the authoritative preference loads.
    // A different member must not inherit the previous account's appearance.
    const sameMember = readThemeOwner() === memberId;
    cacheThemeOwner(memberId);
    if (!sameMember) cacheTheme('system');
    async function flush() {
      if (!ready || running || controller.signal.aborted) return;
      running = true;
      setState({identity,ready:true,saving:true,error:''});
      try {
        while (queued !== null) {
          const mode: Theme = queued;
          queued = null;
          const result = await request<{data:{color_mode:Theme}}>(token,'/admin/v1/auth/preferences','PUT',{color_mode:mode},controller.signal);
          if (controller.signal.aborted) return;
          if (!validMode(result.data?.color_mode) || result.data.color_mode !== mode) throw new Error('Invalid appearance response');
          confirmed = mode;
        }
      } catch {
        if (!controller.signal.aborted) {
          queued = null;
          cacheTheme(confirmed);
          setState({identity,ready:true,saving:false,error:'Could not save color mode. Your previous mode has been restored.'});
        }
        return;
      } finally { running = false; }
      if (!controller.signal.aborted) {
        cacheTheme(confirmed);
        setState({identity,ready:true,saving:false,error:''});
      }
    }
    const choose = (mode: Theme) => {queued=mode;void flush();};
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{theme:unknown;persist:boolean}>).detail;
      if (detail?.persist && validMode(detail.theme)) choose(detail.theme);
    };
    const storageChanged = (event: StorageEvent) => {
      // Docs use the same cache in a separate document. Clearing a cache never changes saved settings.
      if (event.key === null || (event.key === 'niu-dashboard-theme' && event.newValue === null)) {
        cacheThemeOwner(memberId);
        cacheTheme(queued ?? confirmed);
      } else if (event.key === 'niu-dashboard-theme-intent' && event.newValue) {
        try {
          const intent = JSON.parse(event.newValue);
          if (intent.owner === memberId && validMode(intent.theme)) choose(intent.theme);
        } catch { /* Ignore an invalid disposable cache event. */ }
      }
    };
    window.addEventListener('niu-theme-change',changed);
    window.addEventListener('storage',storageChanged);
    void request<{data:{color_mode:Theme}}>(token,'/admin/v1/auth/preferences','GET',undefined,controller.signal).then(result=>{
      if (controller.signal.aborted) return;
      if (!validMode(result.data?.color_mode)) throw new Error('Invalid appearance response');
      confirmed = result.data.color_mode;
      ready = true;
      cacheTheme(queued ?? confirmed);
      setState({identity,ready:true,saving:false,error:''});
      if (queued !== null) void flush();
    }).catch(()=>{
      if (!controller.signal.aborted) setState({identity,ready:false,saving:false,error:'Could not load your saved color mode.'});
    });
    return () => {
      controller.abort();
      window.removeEventListener('niu-theme-change',changed);
      window.removeEventListener('storage',storageChanged);
    };
  }, [token,identity,personal,memberId,revision,deploymentDefault]);
  return {...(state.identity === identity ? state : {ready:!personal,saving:false,error:''}),reload:()=>setRevision(value=>value+1)};
}
