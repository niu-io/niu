import { UI_MESSAGES_ZH } from '@/shell/locale-messages';
import { readLocale, type Locale } from '@/shell/locale';

/**
 * Gateway `ApiError` English messages mapped to concise Chinese product copy.
 * Re-exported into `UI_MESSAGES_ZH` so `t(...)`, `AlertDescription`, `authenticatedFetch`,
 * and `formatUserFacingError` all share one source of truth.
 */
export const GATEWAY_ERROR_MESSAGES_ZH: Readonly<Record<string, string>> = {
  // Storage, conflict, and availability
  'This item was updated or is no longer available. Refresh and try again.': '数据状态已变更或已不存在，请刷新后重试。',
  'The record is unavailable or its state changed': '数据状态已变更或已不存在，请刷新后重试。',
  'Service is temporarily unavailable. Please try again in a moment.': '服务暂时不可用，请稍后重试。',
  'Durable storage is unavailable': '服务暂时不可用，请稍后重试。',
  'The requested resource is not available': '请求的资源不存在或当前不可用。',
  'The selected account is unavailable': '所选账户当前不可用。',
  'This service is not ready to process the request; contact the platform administrator': '服务尚未就绪，请联系平台管理员完成配置。',

  // Authentication, passwords, setup, and registration
  'A valid bearer token is required': '登录凭据无效或已过期，请重新登录。',
  'Email or password is incorrect': '邮箱或密码不正确。',
  'Sign-in is temporarily limited. Try again later.': '登录尝试过于频繁，请稍后再试。',
  'This administrator role cannot perform the requested action': '当前账号权限不足，无法执行此操作。',
  'This email address is already used by an existing account.': '该邮箱已被其他账号使用。',
  'An active account already uses this email address. Review existing members instead of approving a duplicate account.': '该邮箱已被现有账号使用，请更换邮箱或直接管理现有成员。',
  'Password must contain at least 8 characters and at most 1024 bytes': '密码长度须至少为 8 个字符（且不超过 1024 字节）。',
  'Password must contain at least 15 characters and at most 1024 bytes': '密码长度须至少为 8 个字符（且不超过 1024 字节）。',
  'Enter a valid email address': '请输入有效的邮箱地址。',
  'Invalid email address': '请输入有效的邮箱地址。',
  'Customer name is required': '请填写客户名称。',
  'Supply both email and password or omit both': '请同时填写登录邮箱与密码，或同时留空。',
  'That administrator token is invalid. Verify NIU_ADMIN_TOKENS and try again.': '管理员令牌无效，请核对 NIU_ADMIN_TOKENS 配置后重试。',
  'Initial administrator setup has already been completed. Sign in with your email and password.': '初始管理员已完成设置，请直接使用邮箱和密码登录。',
  'Your Limited Preview registration is awaiting administrator approval. Sign in again once an administrator approves your account.': '你的注册申请正在等待管理员审核，审核通过后即可登录。',
  'Limited Preview registration is closed on this deployment. Ask an administrator for an invitation or account setup.': '当前环境未开放自助注册，请联系管理员邀请或开通账号。',
  'Registration requests are temporarily limited. Try again later.': '注册请求过于频繁，请稍后再试。',
  'Enter a valid name, email, organization or workspace name, note, and a password of 8 to 1024 bytes': '请填写有效的姓名、邮箱、组织或工作空间名称，并设置至少 8 个字符的密码。',

  // Invitations, organizations, workspaces, and keys
  'This slug is already in use. Choose a different slug.': '此路径标识已被使用，请更换其他标识。',
  'This organization slug is already in use. Choose a different slug.': '此组织标识已被使用，请更换其他标识。',
  'This workspace has saved records or is the installation default and cannot be deleted': '该工作空间包含历史记录或是默认工作空间，无法删除。',
  'This invitation is invalid, expired, canceled, already used, or no longer authorized. Ask the organization owner for a new invitation.': '该邀请无效、已过期、已取消或已被使用，请联系组织所有者重新发送邀请。',
  'Sign in with the email this invitation was issued to': '请使用接收该邀请的邮箱账号登录。',
  "This email already belongs to a member of this organization. Change the existing member's role instead of inviting them again.": '该邮箱已是当前组织成员，请直接在成员列表中调整其角色。',
  'Invitation authority changed. Ask an organization owner to create a new invitation.': '邀请授权已变更，请联系组织所有者重新发起邀请。',
  'This invitation has already been accepted. Manage the member in the member list.': '该邀请已被接受，请在成员列表中管理该成员。',
  'Invalid key name, model permissions, or lifetime': 'API 密钥名称、模型权限或有效期无效。',
  'Invalid operator name, role, or session lifetime': '成员名称、角色或会话有效期无效。',

  // Billing, credit, limits, and pricing
  'Insufficient available funds for this request': '账户可用余额不足。',
  'This API key\'s customer spending limit is exhausted': '此 API 密钥的消费限额已用尽。',
  'This request exceeds the workspace spending limit': '此请求超出工作空间消费限额。',
  'Invalid price, currency or monetary amount': '价格、币种或金额格式无效。',
  'Invalid account or quota configuration': '账户或额度配置无效。',
  'Use the configured platform currency. Configure it once in Admin → Account balances.': '请使用已配置的平台币种（可在管理后台配置）。',
  'No unpaid earnings match the selected currency and cutoff. Refresh the unpaid balance and try again.': '所选币种与截止时间下没有待结算收益，请刷新后重试。',

  // Rate limits, guardrails, and upstream
  'This API key\'s rolling 60-second request limit is exhausted; retry after 60 seconds': '此 API 密钥已达每分钟请求上限，请稍后重试。',
  'This API key has reached its concurrent request limit; wait for active work to finish or resolve uncertain requests': '此 API 密钥已达并发请求上限，请等待进行中的请求完成。',
  'This API key\'s token budget is exhausted; wait for known usage to expire or resolve unknown usage': '此 API 密钥的令牌速率预算已用尽，请稍后重试。',
  'This API key does not allow the request source address': '此 API 密钥不允许当前来源 IP 访问。',
  'The request was rejected by configured guardrails before model dispatch': '请求在发送前被安全护栏策略拦截。',
  'The response was withheld by output guardrails after model dispatch; generation charges may apply': '响应内容被输出护栏拦截（可能已产生模型调用费用）。',
  'No eligible route is available for this model and protocol': '当前模型与协议暂无可用路由。',
  'The configured provider credential is unavailable': '模型供应商凭据当前不可用。',
  'The provider request timed out before completion': '模型供应商请求超时，请稍后重试。',
  'The provider connection failed. Check upstream connectivity': '无法连接模型供应商，请检查上游网络配置。',
  'The provider request failed': '模型供应商请求失败，请稍后重试。',
  'Request exceeds the configured body limit': '请求内容超出大小上限。',
  'Request body did not finish within the configured upload deadline': '请求上传超时，请重试。',
};

const SQL_OR_INTERNAL_ERROR_PATTERNS: readonly RegExp[] = [
  /\bSQLSTATE\b/i,
  /\bPgDatabaseError\b/,
  /\bsqlx::/i,
  /\bStoreError\b/,
  /\bduplicate key value violates unique constraint\b/i,
  /\bviolates (?:foreign key|check|not-null|unique|exclusion) constraint\b/i,
  /\bnull value in column "[^"]+" violates not-null constraint\b/i,
  /\brelation "[^"]+" does not exist\b/i,
  /\bcolumn "[^"]+" (?:of relation "[^"]+" )?does not exist\b/i,
  /\bsyntax error at or near\b/i,
  /\bdeadlock detected\b/i,
  /\bcould not serialize access\b/i,
  /\bvalue too long for type character varying\b/i,
  /\binvalid input syntax for type\b/i,
  /\bconnection to server at\b/i,
  /\bremaining connection slots are reserved\b/i,
  /\bout of shared memory\b/i,
  /\bpanicked at\b/,
  /\n\s+at\s+\S+\s+\(/,
];

const LEGACY_STORAGE_CONFLICT_RE = /\bThe record is unavailable or its state changed\.?/i;
const LEGACY_STORAGE_UNAVAILABLE_RE = /\bDurable storage is unavailable\.?/i;
const NETWORK_FETCH_ERROR_RE =
  /^(?:TypeError:\s*)?(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?|fetch failed)$/i;
const GENERIC_API_STATUS_RE =
  /^(?:Niu API request failed with status (\d{3})|Request failed \((\d{3})\)\.?)$/i;
const RAW_HTML_RE = /^\s*(?:<!DOCTYPE\s+html|<html[\s>])/i;

export function isRawTechnicalErrorText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (
    RAW_HTML_RE.test(trimmed) ||
    LEGACY_STORAGE_CONFLICT_RE.test(trimmed) ||
    LEGACY_STORAGE_UNAVAILABLE_RE.test(trimmed) ||
    NETWORK_FETCH_ERROR_RE.test(trimmed) ||
    GENERIC_API_STATUS_RE.test(trimmed)
  ) {
    return true;
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown; sqlstate?: unknown };
      if (parsed && typeof parsed === 'object' && ('error' in parsed || 'sqlstate' in parsed)) {
        return true;
      }
    } catch {
      /* Not JSON. */
    }
  }
  return SQL_OR_INTERNAL_ERROR_PATTERNS.some(pattern => pattern.test(trimmed));
}

function localizedCopy(locale: Locale, en: string, zh: string): string {
  return locale === 'zh-CN' ? zh : en;
}

function statusFallbackCopy(status: number | undefined, locale: Locale): string {
  if (status === 401) {
    return localizedCopy(locale, 'Your session has expired. Please sign in again.', '登录会话已过期，请重新登录。');
  }
  if (status === 403) {
    return localizedCopy(locale, 'You do not have permission to perform this action.', '当前账号没有执行此操作的权限。');
  }
  if (status === 404) {
    return localizedCopy(locale, 'The requested item could not be found.', '未找到所请求的内容。');
  }
  if (status === 409) {
    return localizedCopy(locale, 'This item was updated or is no longer available. Refresh and try again.', '数据状态已变更或已不存在，请刷新后重试。');
  }
  if (status === 413) {
    return localizedCopy(locale, 'The submitted content is too large.', '提交的内容超出大小上限。');
  }
  if (status === 429) {
    return localizedCopy(locale, 'Too many requests. Please wait a moment and try again.', '请求过于频繁，请稍后再试。');
  }
  if (status !== undefined && status >= 500) {
    return localizedCopy(locale, 'Service is temporarily unavailable. Please try again in a moment.', '服务暂时不可用，请稍后重试。');
  }
  return localizedCopy(locale, 'Unable to complete this request. Please try again.', '无法完成请求，请稍后重试。');
}

export function messageForGatewayErrorType(
  errorType: string | undefined,
  status: number | undefined,
  locale: Locale,
): string | null {
  switch (errorType) {
    case 'conflict_error':
      return localizedCopy(locale, 'This item was updated or is no longer available. Refresh and try again.', '数据状态已变更或已不存在，请刷新后重试。');
    case 'storage_error':
      return localizedCopy(locale, 'Service is temporarily unavailable. Please try again in a moment.', '服务暂时不可用，请稍后重试。');
    case 'registration_email_exists':
      return localizedCopy(locale, 'This email address is already used by an existing account.', '该邮箱已被其他账号使用。');
    case 'organization_slug_taken':
      return localizedCopy(locale, 'This organization slug is already in use. Choose a different slug.', '此组织标识已被使用，请更换其他标识。');
    case 'workspace_slug_taken':
      return localizedCopy(locale, 'This slug is already in use. Choose a different slug.', '此路径标识已被使用，请更换其他标识。');
    default:
      return status !== undefined && status >= 500 ? statusFallbackCopy(status, locale) : null;
  }
}

export function sanitizeUserFacingErrorText(
  raw: string,
  locale: Locale = readLocale(),
  options?: { errorType?: string; status?: number },
): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  // 1. Unwrap accidental raw JSON error envelopes.
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { message?: unknown; type?: unknown; code?: unknown } | string;
        message?: unknown;
      };
      if (typeof parsed?.error === 'string') {
        return sanitizeUserFacingErrorText(parsed.error, locale, options);
      }
      if (parsed?.error && typeof parsed.error === 'object') {
        const innerType = typeof parsed.error.type === 'string' ? parsed.error.type : options?.errorType;
        const innerStatus = typeof parsed.error.code === 'number' ? parsed.error.code : options?.status;
        if (typeof parsed.error.message === 'string' && parsed.error.message.trim()) {
          return sanitizeUserFacingErrorText(parsed.error.message, locale, {
            errorType: innerType,
            status: innerStatus,
          });
        }
        return statusFallbackCopy(innerStatus, locale);
      }
      if (typeof parsed?.message === 'string' && parsed.message.trim()) {
        return sanitizeUserFacingErrorText(parsed.message, locale, options);
      }
    } catch {
      /* Fall through. */
    }
  }

  // 2. Intercept raw HTML error pages from reverse proxies / CDNs.
  if (RAW_HTML_RE.test(trimmed)) {
    return statusFallbackCopy(options?.status ?? 502, locale);
  }

  // 3. Intercept browser fetch engine errors.
  if (NETWORK_FETCH_ERROR_RE.test(trimmed)) {
    return localizedCopy(
      locale,
      'Network connection failed. Check your connection and try again.',
      '网络连接失败，请检查网络后重试。',
    );
  }

  // 4. Intercept generic status-only SDK/client error strings.
  const statusMatch = GENERIC_API_STATUS_RE.exec(trimmed);
  if (statusMatch) {
    const code = Number(statusMatch[1] ?? statusMatch[2]);
    return statusFallbackCopy(Number.isFinite(code) ? code : options?.status, locale);
  }

  // 5. Intercept raw SQL / PostgreSQL / driver / Rust panic / stack traces.
  if (SQL_OR_INTERNAL_ERROR_PATTERNS.some(pattern => pattern.test(trimmed))) {
    if (/duplicate key value|unique constraint/i.test(trimmed)) {
      if (/email/i.test(trimmed)) {
        return localizedCopy(locale, 'This email address is already used by an existing account.', '该邮箱已被其他账号使用。');
      }
      return localizedCopy(locale, 'A conflicting item already exists. Check your input and try again.', '已存在冲突的同名记录，请检查后重试。');
    }
    return (
      messageForGatewayErrorType(options?.errorType, options?.status, locale) ??
      localizedCopy(
        locale,
        'Unable to complete this action right now. Please refresh and try again.',
        '当前操作暂时无法完成，请刷新后重试。',
      )
    );
  }

  // 6. Replace legacy storage jargon even if embedded inside a longer message.
  if (LEGACY_STORAGE_CONFLICT_RE.test(trimmed)) {
    const replacement = localizedCopy(
      locale,
      'This item was updated or is no longer available. Refresh and try again.',
      '数据状态已变更或已不存在，请刷新后重试。',
    );
    if (LEGACY_STORAGE_CONFLICT_RE.test(trimmed) && trimmed.replace(LEGACY_STORAGE_CONFLICT_RE, '').trim() === '') {
      return replacement;
    }
    return raw.replace(LEGACY_STORAGE_CONFLICT_RE, replacement);
  }
  if (LEGACY_STORAGE_UNAVAILABLE_RE.test(trimmed)) {
    const replacement = localizedCopy(
      locale,
      'Service is temporarily unavailable. Please try again in a moment.',
      '服务暂时不可用，请稍后重试。',
    );
    if (trimmed.replace(LEGACY_STORAGE_UNAVAILABLE_RE, '').trim() === '') {
      return replacement;
    }
    return raw.replace(LEGACY_STORAGE_UNAVAILABLE_RE, replacement);
  }

  // 7. Exact gateway error type mapping when message is generic, or zh-CN catalog lookup.
  if (locale === 'zh-CN') {
    const direct = GATEWAY_ERROR_MESSAGES_ZH[trimmed] ?? UI_MESSAGES_ZH[trimmed];
    if (direct) return direct;
    const byType = messageForGatewayErrorType(options?.errorType, options?.status, locale);
    if (byType && (options?.errorType === 'conflict_error' || options?.errorType === 'storage_error')) {
      return byType;
    }
  }

  return raw;
}

export function formatUserFacingError(
  error: unknown,
  fallback?: string,
  locale: Locale = readLocale(),
): string {
  if (typeof error === 'string' && error.trim()) {
    return sanitizeUserFacingErrorText(error, locale);
  }
  if (error && typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      status?: unknown;
      gatewayCode?: unknown;
      errorType?: unknown;
      code?: unknown;
      responseBody?: { error?: { type?: unknown; message?: unknown } };
    };
    const status = typeof candidate.status === 'number' ? candidate.status : undefined;
    const errorType =
      typeof candidate.gatewayCode === 'string'
        ? candidate.gatewayCode
        : typeof candidate.errorType === 'string'
          ? candidate.errorType
          : typeof candidate.responseBody?.error?.type === 'string'
            ? candidate.responseBody.error.type
            : undefined;
    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return sanitizeUserFacingErrorText(candidate.message, locale, { errorType, status });
    }
    const mapped = messageForGatewayErrorType(errorType, status, locale);
    if (mapped) return mapped;
    if (status !== undefined) return statusFallbackCopy(status, locale);
  }
  if (fallback) {
    return locale === 'zh-CN' ? (GATEWAY_ERROR_MESSAGES_ZH[fallback] ?? UI_MESSAGES_ZH[fallback] ?? fallback) : fallback;
  }
  return statusFallbackCopy(undefined, locale);
}
