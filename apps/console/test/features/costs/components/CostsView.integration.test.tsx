import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CostsView from '../../../../src/features/costs/components/CostsView';

type Budget = { currency: string; limit_nanos: string; reserved_nanos: string; spent_nanos: string };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function stubAccountingApi() {
  let budget: Budget | null = null;
  let posted: { currency: string; limit_nanos: string } | null = null;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const path = String(input);
    if (path === '/admin/v1/organizations') return jsonResponse({ data: [{ id: 'org-1', name: 'Workspace' }] });
    if (path === '/admin/v1/organizations/org-1/projects') return jsonResponse({ data: [{ id: 'project-1', name: 'Default project' }] });
    if (path.endsWith('/budget') && init?.method === 'POST') {
      posted = JSON.parse(String(init.body)) as { currency: string; limit_nanos: string };
      budget = { ...posted, reserved_nanos: '0', spent_nanos: '0' };
      return jsonResponse({ data: budget }, 201);
    }
    if (path.endsWith('/budget')) return jsonResponse({ data: budget });
    if (path.includes('/costs?')) return jsonResponse({ data: [], next_cursor: null });
    return jsonResponse({ error: { message: 'Not found' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, getPosted: () => posted };
}

async function selectProject(user: ReturnType<typeof userEvent.setup>) {
  const organization = await screen.findByLabelText('Organization');
  await user.selectOptions(organization, 'org-1');
  const project = await screen.findByLabelText('Project');
  await waitFor(() => expect(project.querySelector('option[value="project-1"]')).toBeTruthy());
  await user.selectOptions(project, 'project-1');
  await screen.findByRole('button', { name: 'Set lifetime budget' });
}

describe('project cash budgets', () => {
  it('creates a lifetime budget with exact nanounits and displays the persisted value', async () => {
    const api = stubAccountingApi();
    const user = userEvent.setup();
    render(<CostsView token="admin-token" />);
    await selectProject(user);

    await user.clear(screen.getByLabelText('Cash limit'));
    await user.type(screen.getByLabelText('Cash limit'), '1250.123456789');
    await user.clear(screen.getByLabelText('Currency code'));
    await user.type(screen.getByLabelText('Currency code'), 'eur');
    await user.click(screen.getByRole('button', { name: 'Set lifetime budget' }));

    await screen.findByText('EUR 1250.123456789');
    expect(api.getPosted()).toEqual({ currency: 'EUR', limit_nanos: '1250123456789' });
    expect(await screen.findByText('Lifetime project budget saved.')).toBeTruthy();
  });

  it('rejects amounts with unsupported precision before sending a request', async () => {
    const api = stubAccountingApi();
    const user = userEvent.setup();
    render(<CostsView token="admin-token" />);
    await selectProject(user);

    await user.clear(screen.getByLabelText('Cash limit'));
    await user.type(screen.getByLabelText('Cash limit'), '1.1234567890');
    await user.click(screen.getByRole('button', { name: 'Set lifetime budget' }));

    expect((await screen.findByRole('alert')).textContent).toContain('no more than 9 decimal places');
    expect(api.getPosted()).toBeNull();
  });
});
