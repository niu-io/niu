import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import WorkspaceAssetsRoute from '@/features/assets/page';
import VolcengineView from '@/features/provider-modules/volcengine/VolcengineView';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const orgId = '22222222-2222-4222-8222-222222222222';
const keyId = '33333333-3333-4333-8333-333333333333';
const groupId = '44444444-4444-4444-8444-444444444444';
const assetId = '55555555-5555-4555-8555-555555555555';
const opId = '66666666-6666-4666-8666-666666666666';

vi.mock('@/shell/dashboard-context', () => ({
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

it('inspects, renames, and deletes materials and groups through idempotent direct mutations', async () => {
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
  const mutationBodies: unknown[] = [];
  const mutationKeys: string[] = [];
  const mutationUrls: string[] = [];
  const operationRecords = new Map<string, Record<string, unknown>>();

  function operation(action: string, assetIdValue: string | null) {
    const id = crypto.randomUUID();
    const record = {
      id,
      group_id: groupId,
      asset_id: assetIdValue,
      model: 'seedance-2.5',
      action,
      status: 'acknowledged',
      http_status: 200,
      request_id: 'req-1',
      created_at_ms: 1700000100000,
      updated_at_ms: 1700000101000,
    };
    operationRecords.set(id, record);
    return record;
  }

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
      if (method === 'PATCH' && url.includes(`/media/assets/${assetId}`)) {
        mutationBodies.push(body);
        mutationKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
        mutationUrls.push(url);
        assetRecord = {
          ...assetRecord,
          name: body.name,
          revision: '4',
          observation: { ...assetRecord.observation, name: body.name },
        };
        return Response.json({ data: operation('rename_asset', assetId), group: groupRecord, asset: assetRecord });
      }
      if (method === 'DELETE' && url.includes(`/media/assets/${assetId}`)) {
        mutationBodies.push(body);
        mutationKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
        mutationUrls.push(url);
        assetRecord = { ...assetRecord, status: 'deleted' as unknown as 'active', revision: '5' };
        return Response.json({ data: operation('delete_asset', assetId), group: groupRecord, asset: assetRecord });
      }
      if (method === 'DELETE' && url.includes(`/media/groups/${groupId}`)) {
        mutationBodies.push(body);
        mutationKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
        mutationUrls.push(url);
        groupRecord = { ...groupRecord, status: 'deleted' as unknown as 'ready', revision: '3' };
        return Response.json({ data: operation('delete_group', null), group: groupRecord, asset: null });
      }
      if (method === 'GET' && url.includes(`/media/assets/${assetId}`)) {
        return Response.json({ data: assetRecord });
      }
      if (method === 'GET' && url.includes('/media/assets')) {
        return Response.json({ data: assetRecord.status === 'deleted' ? [] : [assetRecord], next_cursor: null });
      }
      if (method === 'GET' && url.includes('/media/groups')) {
        return Response.json({ data: [groupRecord], next_cursor: null });
      }
      if (method === 'GET' && url.includes('/media/operations/')) {
        const id = url.split('/media/operations/')[1]?.split('?')[0] ?? '';
        const record = operationRecords.get(id);
        if (!record) return Response.json({ error: { type: 'not_found' } }, { status: 404 });
        return Response.json({ data: record });
      }
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );

  render(<VolcengineView workspaceName="Media Workspace" nativeContext={{ keyId, model: 'seedance-2.5' }} />);

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

  // 2. Rename material with an expected revision in the same direct request
  await user.click(screen.getByRole('button', { name: 'Rename' }));
  const renameDialog = await screen.findByRole('dialog', { name: 'Rename material' });
  const nameInput = within(renameDialog).getByLabelText('Material name') as HTMLInputElement;
  expect(nameInput.value).toBe('Blue Marble Frame');
  await user.clear(nameInput);
  await user.type(nameInput, 'Renamed Earth Horizon');
  await user.click(within(renameDialog).getByRole('button', { name: 'Save' }));

  expect(await screen.findByText('Renamed Earth Horizon')).toBeTruthy();
  expect(mutationBodies[0]).toEqual({
    model: 'seedance-2.5',
    name: 'Renamed Earth Horizon',
    expected_revision: '3',
  });
  expect(mutationKeys[0]).toMatch(/^[0-9a-f-]{36}$/);

  // 3. Delete material with explicit confirmation; revision is enforced in the
  // request but no longer exposed as internal-sounding confirmation copy.
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  const deleteDialog = await screen.findByRole('dialog', { name: 'Delete material' });
  expect(within(deleteDialog).getByText(/Delete material “Renamed Earth Horizon” from Earth Reference Group/)).toBeTruthy();
  expect(deleteDialog.textContent).not.toMatch(/revision/i);
  await user.click(within(deleteDialog).getByRole('button', { name: 'Delete material' }));

  expect(await screen.findByText('No materials in this group')).toBeTruthy();
  expect(mutationUrls[1]).toContain('expected_revision=4');
  expect(mutationBodies[1]).toBeNull();
  expect(mutationKeys[1]).toMatch(/^[0-9a-f-]{36}$/);

  // 4. Delete material group from the group menu
  await user.click(screen.getByRole('button', { name: 'Material group' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Delete group' }));
  const deleteGroupDialog = await screen.findByRole('dialog', { name: 'Delete material group' });
  expect(within(deleteGroupDialog).getByText(/Delete material group “Earth Reference Group”/)).toBeTruthy();
  expect(deleteGroupDialog.textContent).not.toMatch(/revision/i);
  await user.click(within(deleteGroupDialog).getByRole('button', { name: 'Delete group' }));

  expect(await screen.findByText('No material groups yet')).toBeTruthy();
  expect(mutationUrls[2]).toContain('expected_revision=2');
  expect(mutationKeys[2]).toMatch(/^[0-9a-f-]{36}$/);
  expect(mutationKeys[0]).not.toBe(mutationKeys[1]);
});

it('treats source IP policy rejection during discovery as a key policy state with actionable remedies instead of a discovery failure', async () => {
  const user = userEvent.setup();
  const restrictedKeyId = '88888888-8888-4888-8888-888888888888';
  const revokedUnusedKeyId = '99999999-9999-4999-8999-999999999999';
  const onContextChange = vi.fn();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      const requestedKeyId = headers.get('x-niu-key-id');

      if (url.includes(`/workspaces/${workspaceId}/keys`)) {
        return Response.json({
          data: [
            {
              id: restrictedKeyId,
              slug: 'production-gateway-key-2',
              name: 'Production Gateway Key',
              allowed_models: ['*'],
              allowed_cidrs: ['10.0.0.0/8', '192.168.1.0/24'],
              revoked: false,
              expired: false,
            },
            {
              id: keyId,
              slug: 'demo-api-key',
              name: 'Demo API key',
              allowed_models: ['*'],
              allowed_cidrs: null,
              revoked: false,
              expired: false,
            },
            {
              id: revokedUnusedKeyId,
              slug: 'revoked-unused-key',
              name: 'Revoked Unused Key',
              allowed_models: ['*'],
              allowed_cidrs: null,
              revoked: true,
              expired: false,
            },
          ],
          next_cursor: null,
        });
      }
      if (
        url.includes('/media/asset-operation-models') ||
        url.includes('/media-operations') ||
        url.includes('/media/operations')
      ) {
        return Response.json({ data: [], next_cursor: null });
      }
      if (url.includes('/media/capabilities')) {
        if (requestedKeyId === restrictedKeyId) {
          return Response.json(
            {
              error: {
                type: 'key_ip_not_allowed',
                message: 'This API key does not allow the request source address',
              },
            },
            { status: 403 },
          );
        }
        return Response.json({
          complete: true,
          modules: [
            {
              module: 'volcengine',
              model_alias: 'seedance-2.5',
              display_name: 'Seedance 2.5',
              context_label: 'Volcengine Seedance 2.5',
            },
          ],
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }),
  );

  const view = render(
    <VolcengineView
      workspaceName="Media Workspace"
      selection={{ keyId: 'production-gateway-key-2', model: '' }}
      onContextChange={onContextChange}
    />,
  );

  expect(
    await screen.findByText('Production Gateway Key is restricted to allowed source IP addresses'),
  ).toBeTruthy();
  expect(screen.getByText('Allowed source networks: 10.0.0.0/8, 192.168.1.0/24')).toBeTruthy();
  expect(screen.queryByText('Some native tool contexts could not be discovered.')).toBeNull();
  expect(
    screen.queryByText(/This API key does not allow the request source address/),
  ).toBeNull();

  const keyTrigger = screen.getByRole('button', { name: 'Native tools API key' });
  expect(keyTrigger.textContent).toContain('Production Gateway Key · Source IP restricted');

  await user.click(keyTrigger);
  expect(await screen.findByRole('menuitemradio', { name: 'Demo API key' })).toBeTruthy();
  expect(
    screen.getByRole('menuitemradio', { name: 'Production Gateway Key · Source IP restricted' }),
  ).toBeTruthy();
  expect(screen.queryByRole('menuitemradio', { name: /Revoked Unused Key/ })).toBeNull();
  await user.keyboard('{Escape}');

  const configureLink = screen.getByRole('link', { name: 'Configure source IP access' });
  expect(configureLink.getAttribute('href')).toBe(
    '/workspaces/media-workspace/keys/production-gateway-key-2',
  );
  const manageLink = screen.getByRole('link', { name: 'Manage API keys' });
  expect(manageLink.getAttribute('href')).toBe('/workspaces/media-workspace/keys');

  await user.click(screen.getByRole('button', { name: 'Use Demo API key' }));
  expect(onContextChange).toHaveBeenCalledWith({
    keyId: 'demo-api-key',
    model: 'seedance-2.5',
  });

  view.unmount();

  window.localStorage.setItem('niu-dashboard-locale', 'zh-CN');
  try {
    render(
      <VolcengineView
        workspaceName="Media Workspace"
        selection={{ keyId: 'production-gateway-key-2', model: '' }}
        onContextChange={onContextChange}
      />,
    );
    expect(
      await screen.findByText('「Production Gateway Key」仅允许指定来源 IP 地址访问'),
    ).toBeTruthy();
    expect(screen.getByText('当前允许的来源网段：10.0.0.0/8, 192.168.1.0/24')).toBeTruthy();
    expect(screen.queryByText('部分原生工具上下文发现失败。')).toBeNull();
    expect(screen.getByRole('button', { name: '使用 Demo API key' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '配置来源 IP 访问' })).toBeTruthy();
  } finally {
    window.localStorage.removeItem('niu-dashboard-locale');
  }
});

it('keeps Workspace Assets isolated from provider-specific tabs until a registered provider module capability is discovered', async () => {
  let capabilityModules: Array<Record<string, unknown>> = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/workspaces/${workspaceId}/keys`)) {
        return Response.json({
          data: [
            {
              id: keyId,
              slug: 'demo-api-key',
              name: 'Demo API key',
              allowed_models: ['*'],
              allowed_cidrs: null,
              revoked: false,
              expired: false,
            },
          ],
          next_cursor: null,
        });
      }
      if (url.includes(`/workspaces/${workspaceId}/assets`)) {
        return Response.json({ data: [], next_cursor: null });
      }
      if (
        url.includes('/media/asset-operation-models') ||
        url.includes('/media-operations') ||
        url.includes('/media/operations')
      ) {
        return Response.json({ data: [], next_cursor: null });
      }
      if (url.includes('/media/capabilities')) {
        return Response.json({
          complete: true,
          modules: capabilityModules,
        });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    }),
  );

  const firstRender = render(
    <MemoryRouter initialEntries={['/workspaces/media-workspace/assets']}>
      <WorkspaceAssetsRoute />
    </MemoryRouter>,
  );

  expect(await screen.findByText('No saved media yet')).toBeTruthy();
  expect(screen.queryByRole('tab', { name: 'Provider materials' })).toBeNull();
  expect(screen.queryByRole('tab', { name: 'Real-person verification' })).toBeNull();
  firstRender.unmount();

  capabilityModules = [
    {
      module: 'volcengine',
      model_alias: 'seedance-2.5',
      display_name: 'Seedance 2.5',
      adapter: 'ark',
      video_channel: 'ark-direct-v1',
      management_channel: 'fastrouter-actions-v1',
      context_label: 'Seedance 2.5 · ark · fastrouter-actions-v1',
      materials: {
        groups: true,
        assets: true,
        kinds: ['image', 'audio', 'video'],
        reference_requires_active: true,
        reference_requires_same_context: true,
        reference_requires_dispatch_authorization: true,
      },
      human_verification: true,
      reference_inputs: [],
    },
  ];

  render(
    <MemoryRouter initialEntries={['/workspaces/media-workspace/assets']}>
      <WorkspaceAssetsRoute />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByRole('tab', { name: 'Workspace media' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Provider materials' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Real-person verification' })).toBeTruthy();
  });
});



it('auto-selects a capable workspace key and model when the caller has not chosen a context', async () => {
  const user = userEvent.setup();
  const firstKeyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const secondKeyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const autoGroupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const onContextChange = vi.fn();
  let capabilityCalls = 0;
  let operationModelCalls = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const requestedKeyId = new Headers(init?.headers).get('x-niu-key-id');
      if (url.includes(`/workspaces/${workspaceId}/keys`)) {
        return Response.json({
          data: [
            {
              id: firstKeyId,
              slug: 'no-tools-key',
              name: 'No tools key',
              allowed_models: ['*'],
              allowed_cidrs: null,
              revoked: false,
              expired: false,
            },
            {
              id: secondKeyId,
              slug: 'capable-key',
              name: 'Capable key',
              allowed_models: ['*'],
              allowed_cidrs: null,
              revoked: false,
              expired: false,
            },
          ],
          next_cursor: null,
        });
      }
      if (url.includes('/media/asset-operation-models')) {
        operationModelCalls += 1;
        return Response.json({ data: [], next_cursor: null });
      }
      if (url.includes('/media/capabilities')) {
        capabilityCalls += 1;
        return Response.json({
          complete: true,
          modules: requestedKeyId === secondKeyId
            ? [
                {
                  module: 'volcengine',
                  model_alias: 'seedance-2.5',
                  display_name: 'Seedance 2.5',
                  context_label: 'Capable Volcengine context',
                },
              ]
            : [],
        });
      }
      if (url.includes('/media/groups')) {
        return Response.json({
          data: [
            {
              id: autoGroupId,
              model: 'seedance-2.5',
              name: 'Auto Group',
              description: null,
              kind: 'generated',
              status: 'ready',
              observation: null,
              revision: '1',
              created_at_ms: 1700000000000,
              updated_at_ms: 1700000000000,
            },
          ],
          next_cursor: null,
        });
      }
      if (url.includes('/media/verification')) return Response.json({ data: [], next_cursor: null });
      if (url.includes('/media/assets')) return Response.json({ data: [], next_cursor: null });
      throw new Error(`Unhandled fetch: ${url}`);
    }),
  );

  render(<VolcengineView workspaceName="Media Workspace" selection={{ keyId: '', model: '' }} onContextChange={onContextChange} />);

  expect(await screen.findByText('Auto Group')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Native tools API key' }).textContent).toContain('Capable key');
  expect(screen.getByRole('button', { name: 'Native tools model' }).textContent).toContain('Seedance 2.5');
  expect(onContextChange).toHaveBeenCalledWith({ keyId: 'capable-key', model: 'seedance-2.5' });
  expect(capabilityCalls).toBe(3);
  expect(operationModelCalls).toBe(0);

  await user.click(screen.getByRole('button', { name: 'Native tools model' }));
  expect(await screen.findByRole('menuitemradio', { name: 'Seedance 2.5' })).toBeTruthy();
});

it('keeps an unconfirmed direct mutation recoverable without locking unrelated CRUD', async () => {
  const user = userEvent.setup();
  let groupRecord = {
    id: groupId,
    model: 'seedance-2.5',
    name: 'Earth Reference Group',
    description: null,
    kind: 'generated' as const,
    status: 'ready' as const,
    observation: null,
    revision: '2',
    created_at_ms: 1700000000000,
    updated_at_ms: 1700000000000,
  };
  const assetRecord = {
    id: assetId,
    group_id: groupId,
    model: 'seedance-2.5',
    name: 'Blue Marble Frame',
    kind: 'image' as const,
    status: 'active' as const,
    observation: null,
    revision: '3',
    created_at_ms: 1700000000000,
    updated_at_ms: 1700000050000,
  };
  let savedStatus: 'unknown' | 'acknowledged' = 'unknown';
  const savedOperation = {
    id: opId,
    group_id: groupId,
    asset_id: assetId,
    model: 'seedance-2.5',
    action: 'rename_asset',
    status: 'unknown' as const,
    http_status: null,
    request_id: null,
    created_at_ms: 1700000100000,
    updated_at_ms: 1700000100000,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
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
      if (method === 'PATCH' && url.includes(`/media/assets/${assetId}`)) {
        return Response.json({ data: savedOperation, group: groupRecord, asset: assetRecord }, { status: 202 });
      }
      if (method === 'GET' && url.includes('/media/operations/')) {
        return Response.json({ data: { ...savedOperation, status: savedStatus } });
      }
      if (method === 'GET' && url.includes('/media/verification')) return Response.json({ data: [], next_cursor: null });
      if (method === 'GET' && url.includes('/media/assets')) return Response.json({ data: [assetRecord], next_cursor: null });
      if (method === 'GET' && url.includes('/media/groups')) return Response.json({ data: [groupRecord], next_cursor: null });
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );

  render(<VolcengineView workspaceName="Media Workspace" nativeContext={{ keyId, model: 'seedance-2.5' }} />);
  expect(await screen.findByText('Blue Marble Frame')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Saved operations' })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Rename' }));
  const renameDialog = await screen.findByRole('dialog', { name: 'Rename material' });
  await user.clear(within(renameDialog).getByLabelText('Material name'));
  await user.type(within(renameDialog).getByLabelText('Material name'), 'Unconfirmed rename');
  await user.click(within(renameDialog).getByRole('button', { name: 'Save' }));

  expect(await within(renameDialog).findByText(/We could not confirm whether the Provider applied this change/)).toBeTruthy();
  expect(within(renameDialog).queryByRole('button', { name: 'Save' })).toBeNull();
  expect(within(renameDialog).getByRole('button', { name: 'Check status' })).toBeTruthy();
  await user.click(within(renameDialog).getAllByRole('button', { name: 'Close' })[0]);

  expect(screen.getByText(/A previous change is unconfirmed/)).toBeTruthy();

  // A past uncertain operation must not disable unrelated create actions.
  await user.click(screen.getByRole('button', { name: 'Material group' }));
  const newGroupItem = await screen.findByRole('menuitem', { name: 'New group' });
  expect(newGroupItem.getAttribute('aria-disabled')).not.toBe('true');
  await user.click(newGroupItem);
  expect(await screen.findByRole('dialog', { name: 'New material group' })).toBeTruthy();
  await user.click(within(screen.getByRole('dialog', { name: 'New material group' })).getAllByRole('button', { name: 'Close' })[0]);

  await user.click(screen.getAllByRole('button', { name: 'Check status' })[0]);
  expect(await screen.findByText(/The Provider still has not confirmed this change. Do not repeat it./)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Saved operations' })).toBeNull();

  savedStatus = 'acknowledged';
  await user.click(screen.getAllByRole('button', { name: 'Check status' })[0]);
  await waitFor(() => expect(screen.queryByText(/A previous change is unconfirmed/)).toBeNull());
  expect(screen.getByText('Blue Marble Frame')).toBeTruthy();
});

it('opens the material form without a saved-operation ledger and explains the public URL requirement', async () => {
  const user = userEvent.setup();
  const readyGroup = {
    id: groupId,
    model: 'seedance-2.5',
    name: 'Ready Group',
    description: null,
    kind: 'generated' as const,
    status: 'ready' as const,
    observation: null,
    revision: '1',
    created_at_ms: 1700000000000,
    updated_at_ms: 1700000000000,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
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
      if (method === 'GET' && url.includes('/media/verification')) return Response.json({ data: [], next_cursor: null });
      if (method === 'GET' && url.includes('/media/assets')) return Response.json({ data: [], next_cursor: null });
      if (method === 'GET' && url.includes('/media/groups')) return Response.json({ data: [readyGroup], next_cursor: null });
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );

  render(<VolcengineView workspaceName="Media Workspace" nativeContext={{ keyId, model: 'seedance-2.5' }} />);
  expect(await screen.findByText('Ready Group')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Saved operations' })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Add material' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add material' });
  expect(within(dialog).getByLabelText('Material URL')).toBeTruthy();
  expect(within(dialog).getByText(/Workspace media is private and cannot be reached by the Provider/)).toBeTruthy();
  expect(within(dialog).queryByRole('button', { name: 'Upload' })).toBeNull();
  expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);

  await user.type(within(dialog).getByLabelText('Material name'), 'New material');
  const urlInput = within(dialog).getByLabelText('Material URL');
  await user.type(urlInput, 'https://media.example.test/new.png');
  expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
});

it('creates a material group with one direct idempotent request and no ledger', async () => {
  const user = userEvent.setup();
  let groups: Array<Record<string, unknown>> = [];
  const createdBodies: unknown[] = [];
  const createdKeys: string[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
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
      if (method === 'POST' && url.includes('/media/groups')) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        createdBodies.push(body);
        createdKeys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
        const record = {
          id: groupId,
          model: 'seedance-2.5',
          name: body.name,
          description: null,
          kind: 'generated',
          status: 'pending',
          observation: null,
          revision: '1',
          created_at_ms: 1700000000000,
          updated_at_ms: 1700000000000,
        };
        groups = [record];
        return Response.json({
          data: {
            id: opId,
            group_id: groupId,
            asset_id: null,
            model: 'seedance-2.5',
            action: 'create_group',
            status: 'acknowledged',
            http_status: 200,
            request_id: 'req-1',
            created_at_ms: 1700000100000,
            updated_at_ms: 1700000101000,
          },
          group: record,
          asset: null,
        });
      }
      if (method === 'GET' && url.includes('/media/verification')) return Response.json({ data: [], next_cursor: null });
      if (method === 'GET' && url.includes('/media/assets')) return Response.json({ data: [], next_cursor: null });
      if (method === 'GET' && url.includes('/media/groups')) return Response.json({ data: groups, next_cursor: null });
      throw new Error(`Unhandled fetch: ${method} ${url}`);
    }),
  );

  render(<VolcengineView workspaceName="Media Workspace" nativeContext={{ keyId, model: 'seedance-2.5' }} />);
  expect(await screen.findByText('No material groups yet')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Saved operations' })).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Create group' }));
  const dialog = await screen.findByRole('dialog', { name: 'New material group' });
  await user.type(within(dialog).getByLabelText('Group name'), 'New Provider Group');
  await user.click(within(dialog).getByRole('button', { name: 'Create group' }));

  expect(await screen.findByText('New Provider Group')).toBeTruthy();
  expect(createdBodies[0]).toEqual({ model: 'seedance-2.5', name: 'New Provider Group' });
  expect(createdKeys[0]).toMatch(/^[0-9a-f-]{36}$/);
});


const workspaceImage = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  name: 'Saved frame',
  media_kind: 'image' as const,
  content_type: 'image/png',
  content_sha256: 'a'.repeat(64),
  byte_length: 68,
  revision: '1',
  created_at_ms: 1700000000000,
  updated_at_ms: 1700000000000,
};

function providerMaterialFetch(input: RequestInfo | URL, init: RequestInit | undefined, createBodies: unknown[]) {
  const url = String(input);
  const method = init?.method ?? 'GET';
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
  if (method === 'POST' && url.endsWith('/v1/media/assets')) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    createBodies.push(body);
    return Response.json({
      data: {
        id: opId,
        group_id: groupId,
        asset_id: assetId,
        model: 'seedance-2.5',
        action: 'create_asset',
        status: 'acknowledged',
        http_status: 200,
        request_id: 'req-1',
        created_at_ms: 1700000100000,
        updated_at_ms: 1700000101000,
      },
      group: {
        id: groupId,
        model: 'seedance-2.5',
        name: 'Ready Group',
        description: null,
        kind: 'generated',
        status: 'ready',
        observation: null,
        revision: '1',
        created_at_ms: 1700000000000,
        updated_at_ms: 1700000000000,
      },
      asset: { ...workspaceImage, id: assetId, group_id: groupId, model: 'seedance-2.5', kind: 'image', status: 'processing', observation: null },
    });
  }
  if (method === 'GET' && url.includes('/media/verification')) return Response.json({ data: [], next_cursor: null });
  if (method === 'GET' && url.includes('/media/assets')) return Response.json({ data: [], next_cursor: null });
  if (method === 'GET' && url.includes('/media/groups')) {
    return Response.json({
      data: [
        {
          id: groupId,
          model: 'seedance-2.5',
          name: 'Ready Group',
          description: null,
          kind: 'generated',
          status: 'ready',
          observation: null,
          revision: '1',
          created_at_ms: 1700000000000,
          updated_at_ms: 1700000000000,
        },
      ],
      next_cursor: null,
    });
  }
  throw new Error(`Unhandled fetch: ${method} ${url}`);
}

async function openWorkspaceMediaMaterialDialog() {
  const user = userEvent.setup();
  render(<VolcengineView workspaceName="Media Workspace" nativeContext={{ keyId, model: 'seedance-2.5' }} />);
  expect(await screen.findByText('Ready Group')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Add material' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add material' });
  await user.click(within(dialog).getByRole('tab', { name: 'Workspace media' }));
  return { user, dialog };
}

it('creates a Provider material from a selected workspace image without a public URL', async () => {
  const createBodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.includes(`/api/v1/workspaces/${workspaceId}/assets?kind=image`)) {
        return Response.json({ data: [workspaceImage], next_cursor: null });
      }
      if (method === 'GET' && url.includes(`/api/v1/workspaces/${workspaceId}/assets/${workspaceImage.id}/content`)) {
        return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
      }
      return providerMaterialFetch(input, init, createBodies);
    }),
  );

  const { user, dialog } = await openWorkspaceMediaMaterialDialog();
  expect(await within(dialog).findByText('No saved media of this type.')).toBeTruthy();
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Choose media' })).toBeTruthy());
  await user.click(within(dialog).getByRole('button', { name: 'Choose media' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Saved frame' }));
  expect((within(dialog).getByLabelText('Material name') as HTMLInputElement).value).toBe('Saved frame');
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(createBodies).toHaveLength(1));
  expect(createBodies[0]).toEqual({
    model: 'seedance-2.5',
    group_id: groupId,
    workspace_asset_id: workspaceImage.id,
    name: 'Saved frame',
    kind: 'image',
  });
  expect(JSON.stringify(createBodies[0])).not.toContain('"url"');
});

it('uploads a workspace image and creates a Provider material from it', async () => {
  const uploaded = {
    ...workspaceImage,
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    name: 'uploaded.png',
  };
  const createBodies: unknown[] = [];
  let workspaceAssets: Array<typeof workspaceImage> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.includes(`/api/v1/workspaces/${workspaceId}/assets?kind=image`)) {
        return Response.json({ data: workspaceAssets, next_cursor: null });
      }
      if (method === 'POST' && url.includes(`/api/v1/workspaces/${workspaceId}/assets?name=uploaded.png`)) {
        workspaceAssets = [uploaded];
        return Response.json({ data: uploaded }, { status: 201 });
      }
      if (method === 'GET' && url.includes(`/api/v1/workspaces/${workspaceId}/assets/${uploaded.id}/content`)) {
        return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
      }
      return providerMaterialFetch(input, init, createBodies);
    }),
  );

  const { user, dialog } = await openWorkspaceMediaMaterialDialog();
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Choose media' })).toBeTruthy());
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, {
    target: { files: [new File([new Uint8Array([137, 80, 78, 71])], 'uploaded.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(within(dialog).getAllByText(/uploaded.png/).length).toBeGreaterThan(0));
  expect((within(dialog).getByLabelText('Material name') as HTMLInputElement).value).toBe('uploaded');
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(createBodies).toHaveLength(1));
  expect(createBodies[0]).toEqual({
    model: 'seedance-2.5',
    group_id: groupId,
    workspace_asset_id: uploaded.id,
    name: 'uploaded',
    kind: 'image',
  });
});
