export type Theme = 'light' | 'dark' | 'system';
const key = 'niu-dashboard-theme';
const tokens = ['background','foreground','primary','primary-foreground','sidebar','sidebar-foreground','accent','accent-foreground'] as const;
let deploymentLight: Partial<Record<typeof tokens[number],string>> = {};
let deploymentDark: Partial<Record<typeof tokens[number],string>> = {};
export function setDeploymentPalette(light: typeof deploymentLight, dark: typeof deploymentDark) {
  deploymentLight=light; deploymentDark=dark;
  applyTheme(readTheme());
}
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Storage may be unavailable. */ }
  return 'system';
}
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const palette = dark ? deploymentDark : deploymentLight;
  for (const token of tokens) {
    const value = palette[token];
    if (value && /^#[0-9a-fA-F]{6}$/.test(value)) document.documentElement.style.setProperty(`--${token}`,value);
    else document.documentElement.style.removeProperty(`--${token}`);
  }
}
export function saveTheme(theme: Theme) {
  cacheTheme(theme, true);
}

export function cacheTheme(theme: Theme, persist = false) {
  try {
    localStorage.setItem(key, theme);
    if (persist) localStorage.setItem('niu-dashboard-theme-intent', JSON.stringify({theme,owner:localStorage.getItem('niu-dashboard-theme-owner'),nonce:crypto.randomUUID()}));
  } catch { /* Keep the current session usable. */ }
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('niu-theme-change', {detail:{theme,persist}}));
}

export function cacheThemeOwner(owner: string) {
  try { localStorage.setItem('niu-dashboard-theme-owner',owner); } catch { /* Cache is optional. */ }
}

export function readThemeOwner(): string {
  try { return localStorage.getItem('niu-dashboard-theme-owner') ?? ''; }
  catch { return ''; }
}

export function subscribeTheme(onChange: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === key || event.key === null) onChange();
  };
  window.addEventListener('storage', storageChanged);
  window.addEventListener('niu-theme-change', onChange);
  return () => {
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener('niu-theme-change', onChange);
  };
}
