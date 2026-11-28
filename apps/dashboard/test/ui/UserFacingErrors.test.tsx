import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  formatUserFacingError,
  isRawTechnicalErrorText,
  sanitizeUserFacingErrorText,
} from '@/lib/user-facing-error';
import { saveLocale } from '@/shell/locale';
import { formatLocalizedMessage } from '@/shell/ui-locale';

afterEach(() => {
  saveLocale('en');
  vi.restoreAllMocks();
});

describe('user-facing error sanitization and localization', () => {
  it('blocks raw PostgreSQL, SQLx, storage, HTML, and fetch engine strings in both locales', () => {
    const rawSamples = [
      'ERROR: duplicate key value violates unique constraint "member_password_credentials_email_key"',
      'PgDatabaseError { code: "23505", SQLSTATE: "23505" }',
      'relation "organizations" does not exist',
      'The record is unavailable or its state changed',
      'Durable storage is unavailable',
      '<!DOCTYPE html><html><body>502 Bad Gateway</body></html>',
      'TypeError: Failed to fetch',
      'Niu API request failed with status 503',
    ];

    for (const sample of rawSamples) {
      expect(isRawTechnicalErrorText(sample)).toBe(true);
      const en = sanitizeUserFacingErrorText(sample, 'en');
      const zh = sanitizeUserFacingErrorText(sample, 'zh-CN');
      expect(en).not.toContain('SQLSTATE');
      expect(en).not.toContain('PgDatabaseError');
      expect(en).not.toContain('unique constraint');
      expect(en).not.toContain('The record is unavailable');
      expect(en).not.toContain('Durable storage');
      expect(en).not.toContain('<!DOCTYPE');
      expect(en).not.toContain('Failed to fetch');
      expect(zh).not.toMatch(/[A-Za-z]{4,}/);
    }
  });

  it('sanitizes and localizes raw error arguments interpolated into composite UI notifications', () => {
    const rendered = formatLocalizedMessage(
      'Customer "{0}" was created, but setup paused: {1} Click retry to continue without duplicating the customer.',
      ['Tiwater', 'The record is unavailable or its state changed'],
      'zh-CN',
    );
    expect(rendered).toContain('客户“Tiwater”已创建');
    expect(rendered).toContain('数据状态已变更或已不存在，请刷新后重试。');
    expect(rendered).not.toContain('The record is unavailable');
  });

  it('automatically intercepts raw database and gateway errors rendered inside AlertDescription', () => {
    saveLocale('zh-CN');
    const { rerender } = render(
      <Alert variant="destructive">
        <AlertDescription>
          {'ERROR: duplicate key value violates unique constraint "member_password_credentials_email_key"'}
        </AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert').textContent).toBe('该邮箱已被其他账号使用。');

    rerender(
      <Alert variant="destructive">
        <AlertDescription>Password must contain at least 8 characters and at most 1024 bytes</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert').textContent).toBe('密码长度须至少为 8 个字符（且不超过 1024 字节）。');

    rerender(
      <Alert variant="destructive">
        <AlertDescription>
          {'The record is unavailable or its state changed'}
          <Button asChild variant="outline" size="sm">
            <a href="/login">重新登录</a>
          </Button>
        </AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert').textContent).toContain('数据状态已变更或已不存在，请刷新后重试。');
    expect(screen.getByRole('link', { name: '重新登录' })).toBeTruthy();

    saveLocale('en');
    rerender(
      <Alert variant="default">
        <AlertDescription>Name must contain 1 to 200 bytes</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Name must contain 1 to 200 bytes');
  });

  it('rewrites raw API error envelopes and HTML proxy failures in authenticatedFetch while keeping status and error codes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    saveLocale('zh-CN');
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: 'The record is unavailable or its state changed',
            type: 'conflict_error',
            param: null,
            code: 409,
          },
        }),
        {
          status: 409,
          headers: {
            'content-type': 'application/json',
            'x-niu-error-code': 'conflict_error',
          },
        },
      ),
    );

    const conflictRes = await authenticatedFetch(`${window.location.origin}/api/v1/members/123/password`, {
      method: 'PUT',
    });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.headers.get('x-niu-error-code')).toBe('conflict_error');
    const conflictBody = await conflictRes.json();
    expect(conflictBody.error.type).toBe('conflict_error');
    expect(conflictBody.error.message).toBe('数据状态已变更或已不存在，请刷新后重试。');

    fetchSpy.mockResolvedValueOnce(
      new Response('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    const htmlRes = await authenticatedFetch(`${window.location.origin}/api/v1/admin/customers`);
    expect(htmlRes.status).toBe(502);
    const htmlBody = await htmlRes.json();
    expect(htmlBody.error.message).toBe('服务暂时不可用，请稍后重试。');
    expect(formatUserFacingError({ status: 409, gatewayCode: 'registration_email_exists' }, undefined, 'zh-CN')).toBe(
      '该邮箱已被其他账号使用。',
    );
  });
});
