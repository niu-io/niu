import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyTheme, cacheTheme, readTheme, readThemeOwner, setDeploymentPalette, type Theme } from './theme';
import defaultLogo from '../../../../branding/assets/niu-mark.png';
import tokenCss from '../../../../branding/tokens.css?raw';

export const brandingTokens = ['background','foreground','primary','primary-foreground','sidebar','sidebar-foreground','accent','accent-foreground'] as const;
export type BrandingToken = typeof brandingTokens[number];
export type BrandingSettings = {
  display_name: string; default_appearance: Theme;
  logo_data_url: string | null; favicon_data_url: string | null;
  light: Partial<Record<BrandingToken,string>>; dark: Partial<Record<BrandingToken,string>>;
};
export type BrandingConfiguration = {revision:string;settings:BrandingSettings};
export const defaultBranding: BrandingSettings = {display_name:'NIU.IO',default_appearance:'system',logo_data_url:null,favicon_data_url:null,light:{},dark:{}};
const BrandingContext = createContext({settings:defaultBranding,logo:defaultLogo,update:(_value:BrandingConfiguration)=>{}});
export function useBranding() { return useContext(BrandingContext); }

/** Display-only public payload. Never interpret arbitrary CSS or remote asset URLs. */
export function parseBranding(value: unknown): BrandingConfiguration {
  const result = value as {data?:BrandingConfiguration};
  const settings = result?.data?.settings;
  if (!settings || typeof result.data?.revision !== 'string' || !/^(0|[1-9][0-9]*)$/.test(result.data.revision)
    || typeof settings.display_name !== 'string' || !settings.display_name.trim() || [...settings.display_name].length > 80
    || !['system','light','dark'].includes(settings.default_appearance)) throw new Error('Invalid branding configuration');
  for (const palette of [settings.light,settings.dark]) {
    if (!palette || typeof palette !== 'object' || Array.isArray(palette) || Object.entries(palette).some(([key,color])=>!brandingTokens.includes(key as BrandingToken) || typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color))) throw new Error('Invalid theme colors');
  }
  for (const [asset,maximum] of [[settings.logo_data_url,349550],[settings.favicon_data_url,43714]] as const) {
    if (asset != null && (typeof asset !== 'string' || asset.length > maximum || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(asset))) throw new Error('Invalid branding image');
  }
  return {revision:result.data.revision,settings:{...settings,logo_data_url:settings.logo_data_url ?? null,favicon_data_url:settings.favicon_data_url ?? null}};
}


export function previewPalette(settings:BrandingSettings,mode:'light'|'dark'):Record<string,string> {
  const [light,dark] = tokenCss.split('.dark,');
  const source = mode === 'dark' ? dark:light;
  return Object.fromEntries(brandingTokens.map(token=>{
    const override = settings[mode][token];
    const inherited = source?.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]?.trim();
    return [`--${token}`,override && /^#[0-9a-fA-F]{6}$/.test(override) ? override:inherited ?? 'initial'];
  }));
}

export function BrandingProvider({children}:{children:ReactNode}) {
  const [configuration,setConfiguration] = useState<BrandingConfiguration>({revision:'0',settings:defaultBranding});
  useEffect(()=>{
    let controller:AbortController | undefined;
    async function load() {
      controller?.abort(); const current = new AbortController(); controller=current;
      try {
        const response = await fetch('/v1/branding',{cache:'no-store',signal:current.signal});
        if (!response.ok) return;
        const saved = parseBranding(await response.json());
        if (!current.signal.aborted) setConfiguration(saved);
      } catch { /* Retain the last good display settings; authentication is independent. */ }
    }
    void load(); window.addEventListener('focus',load);
    return ()=>{controller?.abort();window.removeEventListener('focus',load);};
  },[]);
  useEffect(()=>{
    const settings = configuration.settings;
    setDeploymentPalette(settings.light,settings.dark);
    if (!readThemeOwner()) cacheTheme(settings.default_appearance);
    else applyTheme(readTheme());
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (icon) {icon.href=settings.favicon_data_url ?? `${import.meta.env.BASE_URL}assets/favicon.ico`;icon.type=settings.favicon_data_url ? 'image/png':'image/x-icon';}
  },[configuration]);
  return <BrandingContext.Provider value={{settings:configuration.settings,logo:configuration.settings.logo_data_url ?? defaultLogo,update:setConfiguration}}>{children}</BrandingContext.Provider>;
}
