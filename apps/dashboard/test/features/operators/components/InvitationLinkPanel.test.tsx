import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InvitationLinkPanel from '@/features/operators/components/InvitationLinkPanel';

const created = {
  invitation: {
    id: 'invitation-1',
    organization_id: 'org-1',
    organization_name: 'Niu Labs',
    organization_slug: 'niu-labs',
    project_id: null,
    project_name: null,
    project_slug: null,
    role: 'admin' as const,
    recipient_email: 'person@example.test',
    recipient_name: 'Person',
    status: 'pending' as const,
    delivery: 'not_configured' as const,
    created_at: '2026-11-05T00:00:00Z',
    expires_at: '2026-11-12T00:00:00Z',
    accepted_at: null,
    revoked_at: null,
    invited_by: 'Owner',
  },
  token: 'niu_invite_once_only_secret',
  accept_path: '/invite/niu_invite_once_only_secret',
  delivery: { state: 'not_configured' as const, email_sent: false as const },
};

describe('invitation link handoff', () => {
  it('states that no email was sent and copies the one-time link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<InvitationLinkPanel created={created} onDismiss={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Invitation link ready' })).toBeTruthy();
    expect(screen.getByText('No email was sent')).toBeTruthy();
    expect(screen.queryByText(/invitation sent/i)).toBeNull();
    const link = (screen.getByLabelText('One-time invitation link') as HTMLInputElement).value;
    expect(link).toContain('/invite/niu_invite_once_only_secret');

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(link);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  });
});
