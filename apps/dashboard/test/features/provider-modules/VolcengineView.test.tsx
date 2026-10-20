import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import VolcengineView from '@/features/provider-modules/volcengine/VolcengineView';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const orgId = '22222222-2222-4222-8222-222222222222';
const keyId = '33333333-3333-4333-8333-333333333333';
const groupId = '44444444-4444-4444-8444-444444444444';
const assetId = '55555555-5555-4555-8555-555555555555';
const opId = '66666666-6666-4666-8666-666666666666';

vi.mock('@/app/dashboard-context', () => ({
  useDashboardContext: () => ({
    token: 'member-token',
    workspace: {
      id: workspaceId,
      organization_id: orgId,
      name: 'Media Workspace',
      organization_name: 'Niu Org',
    },
    session: {
      kind: 'member',
      operator: { id: '77777777-7777-4777-8777-777777777777' },
      permissions: { write: true },
    },
  }),
}));

it('exposes material inspection, rename, and deletion plus group deletion with revision checks and durable operations', async () => {
  const user = userEvent.setup();
  let groupRecord = {
    id: groupId,
    model: 'seedance-2.5',
    name: 'Earth Reference Group',
    description: null,
    kind: 'generated' as const,
    status: 'ready' as const,
    observation: {
      source: 'provider_get' as const,
      status: 'present' as const,
      name: 'Earth Reference Group',
      description: null,
      observed_at_ms: 1700000000000,
    },
    revision: '2',
    created_at_ms: 1700000000000,
    updated_at_ms: 1700000000000,
  };
  let assetRecord = {
    id: assetId,
    group_id: groupId,
    model: 'seedance-2.5',
    name: 'Blue Marble Frame',
    kind: 'image' as const,
    status: 'active' as const,
    observation: {
      source: 'provider_get' as const,
      status: 'active' as const,
      name: 'Blue Marble Frame',
      observed_at_ms: 1700000050000,
    },
    revision: '3',
    created_at_ms: 1700000000000,
    updated_at_ms: 1700000050000,
  };
  const operations: Array<{
    id: string;
    group_id: string;
    asset_id: string | null;
    model: string;
    action: string;
    status: string;
    http_status: number | null;
    request_id: string | null;
    created_at_ms: number;
    updated_at_ms: number;
  }> = [];
  const dispatchedBodies: unknown[] = [];

  let latestOpId = opId;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;

      if (url.includes('/media/capabilities')) {
        return Response.json({
          complete: true,
          modules: [
            {
              module: 'volcengine',
              model_alias: 'seedance-2.5',
              display_name: 'Seedance 2.5',
              context_label: 'Personal Volcengine',
            },
          ],
        });
      }
      if (url.includes('/media/verification')) {
        return Response.json({ data: [], next_cursor: null });
      }
      if (url.includes('/media/operations/prepare') && method === 'POST') {
        latestOpId = crypto.randomUUID();
        return Response.json({
          data: {
            id: latestOpId,
            group_id: groupId,
            asset_id: body.asset_id ?? null,
            model: 'seedance-2.5',
            action: body.action,
            status: 'prepared',
            http_status: null,
            request_id: null,
            created_at_ms: 1700000100000,
            updated_at_ms: 1700000100000,
          },
          group: null,
          asset: null,
        });
      }
      if (url.includes(`/media/operations/${latestOpId}/dispatch`) && method === 'POST') {
        dispatchedBodies.push(body);
        if (body.action === 'rename_asset') {
          assetRecord = {
            ...assetRecord,
            name: body.name,
            revision: '4',
            observation: {
              ...assetRecord.observation,
              name: body.name,
            },
          };
        } else if (body.action === 'delete_asset') {
          assetRecord = {
            ...assetRecord,
            status: 'deleted' as unknown as 'active',
            revision: '5',
          };
        } else if (body.action === 'delete_group') {
          groupRecord = {
            ...groupRecord,
            status: 'deleted' as unknown as 'ready',
            revision: '3',
          };
        }
        const op = {
          id: latestOpId,
          group_id: groupId,
          asset_id: body.asset_id ?? null,
          model: 'seedance-2.5',
          action: body.action,
          status: 'acknowledged',
          http_status: 200,
          request_id: 'req-1',
          created_at_ms: 1700000100000,
          updated_at_ms: 1700000101000,
        };
        operations.unshift(op);
        return Response.json({
          data: op,
          group: groupRecord,
          asset: assetRecord,
        });
      }
      if (url.includes('/media-operations') || url.includes('/media/operations')) {
        return Response.json({ data: operations, next_cursor: null });
      }
      if (url.includes(`/media/assets/${assetId}`) && method === 'GET') {
        return Response.json({ data: assetRecord });
      }
      if (url.includes('/media/assets')) {
        return Response.json({ data: [assetRecord], next_cursor: null });
      }
      if (url.includes('/media/groups')) {
        return Response.json({ data: [groupRecord], next_cursor: null });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );

  render(
    <VolcengineView
      workspaceName="Media Workspace"
      nativeContext={{ keyId, model: 'seedance-2.5' }}
    />,
  );

  expect(await screen.findByText('Blue Marble Frame')).toBeTruthy();

  // 1. Inspect material details without leaking internal UUIDs
  await user.click(screen.getByRole('button', { name: 'Inspect' }));
  const inspectDialog = await screen.findByRole('dialog', { name: 'Material details' });
  expect(within(inspectDialog).getByText('Active — ready for generation')).toBeTruthy();
  expect(within(inspectDialog).getByText('Revision 3')).toBeTruthy();
  expect(within(inspectDialog).getByText(/Observed active/)).toBeTruthy();
  expect(inspectDialog.textContent).not.toContain(assetId);
  expect(inspectDialog.textContent).not.toContain(groupId);
  await user.click(within(inspectDialog).getAllByRole('button', { name: 'Close' })[0]);

  // 2. Rename material with expected_revision check
  await user.click(screen.getByRole('button', { name: 'Rename' }));
  const renameDialog = await screen.findByRole('dialog', { name: 'Rename material' });
  const nameInput = within(renameDialog).getByLabelText('Material name') as HTMLInputElement;
  expect(nameInput.value).toBe('Blue Marble Frame');
  await user.clear(nameInput);
  await user.type(nameInput, 'Renamed Earth Horizon');
  await user.click(within(renameDialog).getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Renamed Earth Horizon')).toBeTruthy();
  expect(dispatchedBodies[0]).toEqual({
    action: 'rename_asset',
    model: 'seedance-2.5',
    asset_id: assetId,
    name: 'Renamed Earth Horizon',
    expected_revision: '3',
  });

  // 3. Delete material with explicit confirmation and updated revision
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  const deleteDialog = await screen.findByRole('dialog', { name: 'Delete material' });
  expect(within(deleteDialog).getByText(/Delete material “Renamed Earth Horizon” \(revision 4\)/)).toBeTruthy();
  await user.click(within(deleteDialog).getByRole('button', { name: 'Delete material' }));

  expect(await screen.findByText('No materials in this group')).toBeTruthy();
  expect(dispatchedBodies[1]).toEqual({
    action: 'delete_asset',
    model: 'seedance-2.5',
    asset_id: assetId,
    expected_revision: '4',
  });

  // 4. Delete material group from the group menu
  await user.click(screen.getByRole('button', { name: 'Material group' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete group' }));
  const deleteGroupDialog = await screen.findByRole('dialog', { name: 'Delete material group' });
  expect(within(deleteGroupDialog).getByText(/Delete material group “Earth Reference Group” \(revision 2\)/)).toBeTruthy();
  await user.click(within(deleteGroupDialog).getByRole('button', { name: 'Delete group' }));

  expect(await screen.findByText('No material groups yet')).toBeTruthy();
  expect(dispatchedBodies[2]).toEqual({
    action: 'delete_group',
    model: 'seedance-2.5',
    group_id: groupId,
    expected_revision: '2',
  });
});
