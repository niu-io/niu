import { UI_MESSAGES_ZH } from './locale-messages';
import { useLocale as useBaseLocale, readLocale, formatLocalizedMessage as formatBaseMessage, type Locale } from './locale';
export * from './locale';

/** Product copy stays in the dashboard; public shell snapshots use the small base hook. */
export function useLocale() {
  return useBaseLocale(UI_MESSAGES_ZH);
}
export function translateUI(text: string, locale: Locale = readLocale()): string {
  return locale === 'zh-CN' ? UI_MESSAGES_ZH[text] ?? text : text;
}
export function formatLocalizedMessage(pattern: string, values: readonly unknown[], locale: Locale): string {
  return formatBaseMessage(pattern, values, locale, UI_MESSAGES_ZH);
}
