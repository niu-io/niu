# Fetcher route actions for dashboard mutations

Status: first flow implemented 2026-11-06. Bead: `niu-wnr.8` (architecture review
2026-10-31). This record documents the pattern; it does not close the finding.
Other mutations remain on the manual `request()` + local busy/error path and are
listed at the end.

## Scope

The workspace rename form at `/workspaces/:workspace/settings` is the first
complete create/edit flow migrated to React Router Data Mode:

- the route module exports a `clientAction`;
- the form submits through `useFetcher` and renders `fetcher.state`;
- validation, authorization pre-checks, server errors and uncertain outcomes are
  explicit action data;
- the confirmed result updates the application shell and workspace cache without
  a second list request.

Files:

| File | Role |
| --- | --- |
| `apps/dashboard/app/features/workspace/rename.ts` | Shared idempotent PATCH helper, name validation and the `WorkspaceRenameUnconfirmedError` marker. |
| `apps/dashboard/app/features/workspace/settings-page.tsx` | `clientAction` plus the `useFetcher` form, pending/disabled state, validation and recovery copy. |
| `apps/dashboard/app/shell/useWorkspaceController.ts` | `applyWorkspaceRename(workspaceId, name)` applies a confirmed result to shell state and the `/api/v1/workspaces` cache entry. It does not make a network request. |
| `apps/dashboard/app/shell/lazy-route.ts` | Binds `clientAction` to the Data Mode `action` slot, like the existing `clientLoader` → `loader` binding. |
| `apps/dashboard/app/shell/dashboard-context.ts` | Replaces the old context rename mutation with the confirmed-result application method. |
| `apps/dashboard/test/app/workspace-settings.test.tsx` | Pending, success, validation, server error, uncertain retry and authorization tests. |

## Why this mutation

`PATCH /api/v1/organizations/{organization}/projects/{project}` is a single JSON
write with a canonical response (`{ id, name }`). Repeating the same request leaves
the workspace in the same state, so a retry after a transport failure is safe. The
form is central (the workspace name appears in the shell and directory) and small
enough to migrate without touching unrelated mutations.

The backend contract is unchanged: Bearer authorization, `Name` body, `1–200`
UTF-8 bytes, `Write` permission, and the existing error statuses. The action
pre-checks the verified session snapshot and workspace scope, but the gateway
remains the authorization boundary. No cookie/CSRF behavior is introduced; the
request uses the same Bearer-header API client as the rest of the dashboard.

## Pattern

### 1. Keep the network operation in a small shared helper

`rename.ts` owns the URL, request method, response-shape check and idempotency
assumption. The action does not duplicate the endpoint, and the old context method
no longer has a second copy of the PATCH.

The helper throws `WorkspaceRenameUnconfirmedError` when the response is missing
the expected `id`/`name`. That is different from an API error: the request may have
succeeded even though the client cannot verify the result.

### 2. Export a route `clientAction`

The dashboard is built with `ssr: false`, so the framework route consumes
`clientAction`. Data Mode (`createBrowserRouter`/`createMemoryRouter`) has no
server boundary; `bindLazy` maps `clientAction` to `action` so the same route works
in both assemblies. Do not export both `action` and `clientAction` from a
framework SPA route.

The action:

1. parses `intent`, `workspaceId` and `name` from `request.formData()`;
2. rejects unknown intents and missing/expired credentials;
3. resolves the target from the verified session snapshot rather than trusting
   the submitted organization id;
4. rejects a session without `write` permission;
5. validates the UTF-8 name length before dispatch;
6. returns discriminated data for success and every expected failure.

Expected failures are returned as action data, not thrown, so the fetcher can
render them without an error boundary. Throwing is reserved for bugs and
unexpected render errors.

```ts
export async function clientAction({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  // …validate intent, session, workspace, permission and name…
  try {
    const result = await requestWorkspaceRename(token, workspace, name);
    return { intent: 'rename-workspace', workspaceId, submittedName, ok: true, name: result.name };
  } catch (cause) {
    // ApiRequestError → definitive server error, or uncertain for 5xx.
    // Any other failure → uncertain outcome; the UI offers a safe retry.
  }
}
```

### 3. Use `useFetcher` at the call site

The component keeps the input value and presentation state, but the mutation
lifecycle comes from the router:

```tsx
const fetcher = useFetcher<WorkspaceSettingsActionData>();
const submittedWorkspaceId = fetcher.formData
  ? String(fetcher.formData.get('workspaceId') ?? '')
  : '';
const renaming = fetcher.state !== 'idle' && submittedWorkspaceId === workspace.id;

fetcher.submit(
  { intent: 'rename-workspace', workspaceId: workspace.id, name: trimmed },
  { method: 'post' },
);
```

- The form uses `aria-busy={renaming}`.
- The name input and Save button are disabled while this workspace's submission
  is pending.
- Save shows `Saving…` from `fetcher.state`, not from a local boolean.
- Double submits are guarded in the submit handler as well as by the disabled
  button.
- `fetcher.formData.workspaceId` scopes the pending state to the workspace that
  was actually submitted. This preserves the previous behavior where switching
  workspaces does not leave the new form disabled by an old save.
- A confirmed success is applied to the workspace directory even when the user
  switched away while the request was in flight; the local success message and
  the input update are shown only when the renamed workspace is still on screen.
  This keeps the workspace switcher truthful without showing a stale message.
- A failure is shown only for the workspace still on screen. A result from a
  workspace the user left is marked handled so it cannot resurface when they
  return.

### 4. Apply the confirmed result explicitly

The action returns the canonical name. The component calls
`context.applyWorkspaceRename(workspaceId, name)`, which:

- updates the current workspace and workspace list in the shell;
- primes the `/api/v1/workspaces` query-cache entry with the updated list;
- clears the workspace error;
- re-navigates to the canonical workspace path when the route is the renamed
  workspace.

`request()` already calls `invalidateForMutation`, which invalidates matching
query-cache entries and notifies the shell revalidation bridge. The explicit primer
avoids a second list request and a visible stale-name window. Rename does not
change a saved URL slug; the canonical-path reconciliation only protects old
bookmarks and aliases.

The choice is explicit refresh, not optimistic rename. The shell keeps showing the
old name until the server confirms the new one. That matches the existing product
behavior and avoids presenting an unconfirmed value as saved.

### 5. Keep uncertain-outcome recovery

| Outcome | Action data | UI behavior |
| --- | --- | --- |
| `204`/`200` with matching `{id,name}` | `ok: true` | Apply confirmed name, show “Workspace renamed.”, clear pending. |
| `400`/`401`/`403`/`404`/`422` | `ok: false`, `uncertain: false` | Show the backend message, keep the typed name, re-enable Save. A retry is allowed; the failure is definitive. |
| `5xx` | `ok: false`, `uncertain: true` | Explain that the change may or may not have been saved and that repeating a rename is safe. Keep the form editable. |
| Network/transport failure | `ok: false`, `uncertain: true` | Same recovery copy. The typed value is preserved for a retry. |
| Response shape mismatch | `code: 'unconfirmed'`, `uncertain: true` | Ask the user to reload before retrying, preserving the previous conservative behavior. |

No automatic retry is performed. Retrying is an explicit user action because the
request may have succeeded; the idempotency of the PATCH makes that action safe.

`useNavigation` is deliberately not used for this form. It reports document
navigations, while this is a fetcher submission and its lifecycle is
`fetcher.state`. A future mutation that intentionally navigates after submitting
(for example create-and-redirect) should render global pending feedback from
`useNavigation().state`; a background fetcher such as this rename should not make
the whole shell look busy.

## Tests

`apps/dashboard/test/app/workspace-settings.test.tsx` mounts the real route module
through `bindLazy` in a memory data router. It covers:

- pending: Save is disabled, `Saving…`/`aria-busy` render, and the input is locked;
- success: the confirmed name is applied and the status message appears;
- validation failure: a 300-byte CJK name is rejected before any PATCH request;
- server error: a `422` message is shown and the typed name remains for retry;
- uncertain network failure: recovery copy appears and a second submit succeeds;
- stale workspace failure: a result from a previous workspace is ignored;
- rename completing after a workspace switch: the confirmed name is applied to the
  directory but the old form does not show a stale success message;
- authorization: no-write sessions cannot submit, and the action returns
  `forbidden` without a request;
- existing deletion confirmation, default-workspace protection, error preservation
  and focus-return behavior.

`test/app/route-data-lifecycle.integration.test.tsx` asserts that `bindLazy` exposes
`clientAction` to both the `clientAction` and Data Mode `action` slots.
`test/app/AppLayout.integration.test.tsx` retains the shell-level regression:
a rename that finishes after switching workspaces keeps the selected workspace and
updates the switcher name without a second list request.

## Verification

Run from `apps/dashboard`. The test tooling needs the development React build,
while the production build keeps the normal production environment:

```sh
NODE_ENV=test pnpm exec vitest run \
  test/app/workspace-settings.test.tsx \
  test/app/route-data-lifecycle.integration.test.tsx \
  test/app/AppLayout.integration.test.tsx
NODE_ENV=test pnpm exec react-router typegen
NODE_ENV=test pnpm exec tsc -b --pretty false
NODE_ENV=test pnpm check:i18n:new
NODE_ENV=test pnpm lint
NODE_ENV=test pnpm test
pnpm build
```

Dated results (2026-11-06):

| Check | Result |
| --- | --- |
| Focused workspace settings + route lifecycle + AppLayout | 89/89 pass |
| Full dashboard Vitest | 1267/1267 pass (146 files) |
| TypeScript / route typegen | pass |
| i18n audit (`--new`) | 0 findings |
| Lint + module size + CSS usage | 1207 diagnostics vs 1210 baseline; module/CSS gates pass |
| `pnpm build` (`react-router build`, SPA mode) | pass (chunk-size warning only) |
| Browser rename, desktop | Pending: input and Save disabled, `aria-busy=true`, `Saving…`; success: status “Workspace renamed.”, switcher updated, Save disabled at the confirmed name. |
| Browser validation, desktop | 100 CJK characters → “Workspace names must be 1–200 bytes.”, `aria-invalid=true`, no request. |
| Browser uncertain outcome, desktop | Offline transport failure → retry-safe message; reconnect + resubmit succeeded. |
| Browser narrow layout, 390 px | General section stacks, `scrollWidth = 390`, Save visible; no horizontal overflow. |

Browser evidence was captured on the local development stack with the seeded
member account. The temporary rename was restored to `Default`.


## Remaining mutations not migrated

The dashboard still has manual `request()`/`fetch` mutation paths in roughly 45
feature and shell modules. These are not regressions; many are deliberately
excluded from this first flow because they are streaming, autosave, upload,
OAuth/connect or multi-step prepare/publish operations rather than a single
idempotent form save.

| Area | Examples still on the manual path |
| --- | --- |
| Workspace/shell | Workspace create/delete, organization create/rename, invitations, session sign-in/out, role switch, appearance save. |
| Keys | Issue/rotate/delete key, key settings PATCH, guardrail assignment PUT, unit limit PUT; `mutation-recovery.ts` intentionally handles uncertain retries. |
| Customers | Create company, credit-grant prepare/publish, gift corrections, unit accounts, spending policy PUT. |
| Billing | Top-up funding, workspace spending limits, account billing. |
| Providers / Provider business | Provider create/update/delete, integration settings, connect/import, model mappings, media rate publish/history, admin actions. |
| Retail pricing | Text/media/promotion editors, promotion retire, unit tariffs. |
| Platform settings | Branding PUT, platform currency PUT, unit definitions/rules/mode, payment gateway verification. |
| Routing / route pools | Routing PUT and route-pool mutations. |
| Guardrails / operators | Rule and history mutations; operator role/delete/invite mutations. |
| Playground / video | Chat draft autosave, chat rename/delete, video draft/submit/refresh. |

Next candidates for the same pattern are single-request form saves with a stable
canonical response, for example organization rename, platform currency, guardrail
rule save or a simple operator profile edit. Do not convert streaming, autosave,
upload or multi-step flows without designing their recovery semantics first.
