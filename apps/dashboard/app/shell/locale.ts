import { useEffect, useState } from 'react';

export type Locale = 'en' | 'zh-CN';

const STORAGE_KEY = 'niu-dashboard-locale';

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'zh-cn' || trimmed === 'zh' || trimmed.startsWith('zh-')) return 'zh-CN';
  if (trimmed === 'en' || trimmed.startsWith('en-')) return 'en';
  return null;
}

export function detectBrowserLocale(): Locale {
  try {
    if (typeof navigator !== 'undefined') {
      const candidates = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
      for (const candidate of candidates) {
        const resolved = normalizeLocale(candidate);
        if (resolved) return resolved;
      }
    }
  } catch {
    /* Navigator is optional in non-browser environments. */
  }
  return 'en';
}

export function readLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const normalized = normalizeLocale(saved);
    if (normalized) return normalized;
  } catch {
    /* Storage may be unavailable. */
  }
  return detectBrowserLocale();
}

export function applyLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
}

export function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* Keep the current session usable without storage. */
  }
  applyLocale(locale);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('niu-locale-change', { detail: { locale } }));
    window.dispatchEvent(new CustomEvent('niu:locale', { detail: locale }));
  }
}

export function subscribeLocale(onChange: () => void) {
  const storageChanged = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', storageChanged);
  window.addEventListener('niu-locale-change', onChange);
  return () => {
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener('niu-locale-change', onChange);
  };
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
};

export function useLocale() {
  // Keep the first client render equal to the public pages' English SSR output.
  // The effect restores the saved/browser locale immediately after hydration.
  const [locale, setLocaleState] = useState<Locale>('en');
  useEffect(() => {
    const sync = () => {
      const current = readLocale();
      setLocaleState(current);
      applyLocale(current);
    };
    sync();
    return subscribeLocale(sync);
  }, []);
  const isZh = locale === 'zh-CN';
  return {
    locale,
    isZh,
    setLocale: (next: Locale) => {
      setLocaleState(next);
      saveLocale(next);
    },
    t: <T,>(enText: T, zhText: T): T => (isZh ? zhText : enText),
  };
}
