import { UI_MESSAGES_ZH } from './locale-messages';
import { useLocale as useBaseLocale, readLocale, formatLocalizedMessage as formatBaseMessage, type Locale } from './locale';
import {
  GATEWAY_ERROR_MESSAGES_ZH,
  isRawTechnicalErrorText,
  sanitizeUserFacingErrorText,
} from '@/lib/user-facing-error';
export * from './locale';

const COMBINED_MESSAGES_ZH: Readonly<Record<string, string>> = {
  ...GATEWAY_ERROR_MESSAGES_ZH,
  ...UI_MESSAGES_ZH,
};

/** Product copy stays in the dashboard; public shell snapshots use the small base hook. */
export function useLocale() {
  const base = useBaseLocale(COMBINED_MESSAGES_ZH);
  return {
    ...base,
    format: (pattern: string, values: readonly unknown[]) =>
      formatLocalizedMessage(pattern, values, base.locale),
    t: <T,>(enText: T, zhText?: T): T => {
      if (typeof enText === 'string' && zhText === undefined && isRawTechnicalErrorText(enText)) {
        return sanitizeUserFacingErrorText(enText, base.locale) as T;
      }
      return base.t(enText, zhText);
    },
  };
}
export function translateUI(text: string, locale: Locale = readLocale()): string {
  if (isRawTechnicalErrorText(text)) {
    return sanitizeUserFacingErrorText(text, locale);
  }
  return locale === 'zh-CN' ? COMBINED_MESSAGES_ZH[text] ?? text : text;
}
export function formatLocalizedMessage(pattern: string, values: readonly unknown[], locale: Locale): string {
  const safeValues = values.map(value => {
    if (typeof value !== 'string') return value;
    if (isRawTechnicalErrorText(value)) {
      return sanitizeUserFacingErrorText(value, locale);
    }
    if (locale === 'zh-CN' && value in GATEWAY_ERROR_MESSAGES_ZH) {
      return GATEWAY_ERROR_MESSAGES_ZH[value];
    }
    return value;
  });
  return formatBaseMessage(pattern, safeValues, locale, COMBINED_MESSAGES_ZH);
}
