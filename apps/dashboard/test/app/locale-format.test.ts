import { expect, it } from 'vitest';
import { formatLocalizedMessage } from '@/shell/ui-locale';
it('reorders localized placeholders while preserving customer values verbatim', () => {
  expect(formatLocalizedMessage('Open {0} request in {1} at {2}', ['Unknown', 'My workspace', '10:00'], 'zh-CN')).toBe('在 My workspace 打开 10:00 的 Unknown 请求');
  expect(formatLocalizedMessage('Open {0} request in {1} at {2}', ['Unknown', 'My workspace', '10:00'], 'en')).toBe('Open Unknown request in My workspace at 10:00');
});
it('does not recursively interpret placeholders inside customer data', () => {
  expect(formatLocalizedMessage('Edit {0}', ['{1}'], 'zh-CN')).toBe('编辑 {1}');
});
it('keeps exact large amounts as text without numeric conversion', () => {
  expect(formatLocalizedMessage('{0} tokens', ['9007199254740993000'], 'zh-CN')).toBe('9007199254740993000 个 Token');
});
