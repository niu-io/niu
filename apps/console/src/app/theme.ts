export type Theme = 'light' | 'dark' | 'system';
const key = 'niu-console-theme';
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Storage may be unavailable. */ }
  return 'system';
}
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
export function saveTheme(theme: Theme) {
  try { localStorage.setItem(key, theme); } catch { /* Keep the current session usable. */ }
  applyTheme(theme);
}
