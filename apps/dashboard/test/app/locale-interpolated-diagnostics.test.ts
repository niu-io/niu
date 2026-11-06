import { afterEach, describe, expect, it } from 'vitest';
import type { VideoModel } from '@niu-io/sdk';
import { formatLocalizedMessage } from '@/shell/ui-locale';
import { saveLocale } from '@/shell/locale';
import { videoRequest } from '@/features/video/request';
import { schemaInteger, schemaNames } from '@/features/providers/video-schema';
import { mediaAmountUnits } from '@/lib/media-price';
import { parseMediaPrice } from '@/lib/media-rate';

afterEach(() => saveLocale('en'));

function localized(pattern: string, values: readonly unknown[]): string {
  saveLocale('zh-CN');
  return formatLocalizedMessage(pattern, values, 'zh-CN');
}

function videoModel(controls: Record<string, unknown>, required: string[] = []): VideoModel {
  return {
    id: 'video-model',
    text: { maximum_bytes: 4096 },
    requires_image: false,
    input_types: [],
    image_url: null,
    controls,
    required_controls: required,
    exclusive_controls: [],
    maximum_content_items: 2,
    maximum_body_bytes: 100_000,
  } as unknown as VideoModel;
}

describe('interpolated application diagnostics in zh-CN', () => {
  it('localizes status-bearing request errors while preserving the status code', () => {
    expect(localized('Activity could not be loaded ({0}). Try again.', [503])).toBe('无法加载活动记录（503）。请重试。');
    expect(localized('Could not load gateway activity ({0}).', [502])).toBe('无法加载网关活动记录（502）。');
    expect(localized('Could not export requests ({0}). Try again.', [504])).toBe('无法导出请求（504）。请重试。');
    expect(localized('Request failed ({0}).', [500])).toBe('请求失败（500）。');
    expect(localized('Health check returned HTTP {0}.', [503])).toBe('健康检查返回 HTTP 503。');
    expect(localized('Could not create workspace ({0}).', [409])).toBe('无法创建工作空间（409）。');
    expect(localized('Could not create organization ({0}).', [500])).toBe('无法创建组织（500）。');
  });

  it('keeps file names, formats and currencies verbatim inside Chinese copy', () => {
    expect(localized('{0} exceeds 4 MB.', ['report.png'])).toBe('report.png 超过 4 MB。');
    expect(localized('{0}: use PNG, JPEG, WebP, or a text file.', ['notes.pdf'])).toBe('notes.pdf：请使用 PNG、JPEG、WebP 或文本文件。');
    expect(localized('Could not read {0}. Try attaching it again.', ['photo.png'])).toBe('无法读取 photo.png。请重新附加。');
    expect(localized('Choose up to {0} reference images.', [2])).toBe('最多选择 2 张参考图片。');
    expect(localized('{0} exceeds the reference size limit.', ['large.png'])).toBe('large.png 超过参考图片大小上限。');
    expect(localized('Choose up to {0} saved reference images.', [3])).toBe('最多选择 3 张已保存的参考图片。');
    expect(localized('These saved rates use {0}. Publish new {1} terms without copying amounts across currencies.', ['USD', 'CNY'])).toBe('这些已保存的费率使用 USD。请发布新的 CNY 条款，不要跨币种复制金额。');
    expect(localized('Use at most {0} decimal places.', [2])).toBe('最多使用 2 位小数。');
    expect(localized('Enter a nonnegative price with at most {0} decimal places.', [9])).toBe('请输入非负价格，且最多 9 位小数。');
  });

  it('localizes label-prefixed provider schema copy without dropping placeholders', () => {
    expect(localized('{0} MIME types must contain a slash.', ['图片'])).toBe('图片 MIME 类型必须包含斜杠。');
    expect(localized('{0} requires at least one allowed role.', ['图片'])).toBe('图片至少需要一个允许的角色。');
    expect(localized('{0} needs HTTPS input or an allowed Base64 MIME type.', ['视频'])).toBe('视频需要 HTTPS 输入或允许的 Base64 MIME 类型。');
    expect(localized('{0} needs choices and any default must be one of them.', ['宽高比'])).toBe('宽高比需要选项，且任何默认值都必须属于这些选项。');
    expect(localized('{0} must be an integer from {1} to {2}.', ['时长（秒）', 1, 30])).toBe('时长（秒）必须是 1 到 30 之间的整数。');
    expect(localized('{0} needs distinct comma-separated values (up to {1}).', ['不兼容控制项', 2])).toBe('不兼容控制项需要以逗号分隔且互不重复的值（最多 2 个）。');
  });

  it('leaves the English pattern and inserted values unchanged', () => {
    expect(formatLocalizedMessage('Use at most {0} decimal places.', [2], 'en')).toBe('Use at most 2 decimal places.');
    expect(formatLocalizedMessage('{0} exceeds the reference size limit.', ['large.png'], 'en')).toBe('large.png exceeds the reference size limit.');
  });
});

describe('zh-CN helper validation', () => {
  it('formats video control requirement, bound and choice failures', () => {
    saveLocale('zh-CN');
    const duration = videoModel({ duration: { kind: 'integer', minimum: 1, maximum: 10, default: null } }, ['duration']);
    expect(() => videoRequest(duration, 'prompt', {})).toThrow('请选择时长（秒）。');
    expect(() => videoRequest(duration, 'prompt', { duration: '0' })).toThrow('时长（秒）必须是 1 到 10 之间的整数。');
    const ratio = videoModel({ ratio: { kind: 'choice', values: ['16:9'], default: null } }, ['ratio']);
    expect(() => videoRequest(ratio, 'prompt', { ratio: '4:3' })).toThrow('请选择支持的宽高比。');
  });

  it('formats provider schema integer and distinct-value failures', () => {
    saveLocale('zh-CN');
    expect(() => schemaInteger('x', '输出宽度')).toThrow('输出宽度必须是 1 到 9007199254740991 之间的整数。');
    expect(() => schemaNames('a,a', '不兼容控制项', 2)).toThrow('不兼容控制项需要以逗号分隔且互不重复的值（最多 2 个）。');
  });

  it('formats media price precision failures for both locales', () => {
    saveLocale('zh-CN');
    expect(() => mediaAmountUnits('1.234', 2)).toThrow('最多使用 2 位小数。');
    expect(() => parseMediaPrice('1.1234567890')).toThrow('请输入非负价格，且最多 9 位小数。');
    saveLocale('en');
    expect(() => mediaAmountUnits('1.234', 2)).toThrow('Use at most 2 decimal places.');
  });
});
