import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KeySourceAccess from '@/features/keys/components/KeySourceAccess';
import type { ProjectKey } from '@/features/keys/api';

const key: ProjectKey = { id: 'key-1', name: 'Application key', allowed_models: ['*'], expires_at_ms: null, revoked: false, expired: false };

it('distinguishes all three source IP modes without edit or history controls', () => {
  const { rerender } = render(<KeySourceAccess projectKey={{ ...key, ip_policy: { allowed_cidrs: null, revision: '1' } }} />);
  expect(screen.getByText('Allow all sources')).toBeTruthy();
  rerender(<KeySourceAccess projectKey={{ ...key, ip_policy: { allowed_cidrs: [], revision: '2' } }} />);
  expect(screen.getByText('Block all sources')).toBeTruthy();
  rerender(<KeySourceAccess projectKey={{ ...key, ip_policy: { allowed_cidrs: ['203.0.113.0/24'], revision: '3' } }} />);
  expect(screen.getByText('1 allowed network')).toBeTruthy();
  expect(screen.getByText('203.0.113.0/24')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
