# React Router architecture review — 2026-10-31

Read-only review requested after the frontend restructuring. Beads review: `niu-8hv`; findings `niu-8hv.1`, `niu-8hv.2`, `niu-8hv.3` own follow-up state. Source baseline: Git HEAD `8466799b9` plus the existing uncommitted working tree. The restructuring and earlier product changes coexist in that tree, so attribution to a particular author or isolated patch is not established. No product fixes or publication performed.

## Findings

### SESSION-SCOPE: identity replacement retains the previous user's workspace data

`app/shell/AppLayout.tsx:566–568` accepts a successful refreshed session with `setSession` only. Browser sessions use the common `niu-browser-member-session` string as their cache scope. Workspace loading at lines 630–703 depends on the token and manual reload revision, not the authenticated principal. Returning to a tab after its cookie identity changes can consequently render the new operator with the old operator's workspace list and selection.

An isolated AppLayout test with the actual shell and memory router reproduced: initial Alice session and Private Alice workspace; replace the mocked cookie-backed session response with Bob; dispatch browser focus; the context reports Bob together with Private Alice, and the workspace endpoint has still been called only once. This establishes stale private client data, not unauthorized backend access. Production browser-cookie replacement and persistent-storage restoration were not exercised against real accounts.

The reproducible test source is [the evidence attachment](evidence/router-session-probe-2026-10-31.tsx.txt). To repeat, temporarily copy it to `apps/dashboard/test/app/router-review-temporary.test.tsx`, run the dashboard Vitest executable with `--maxWorkers=1 test/app/router-review-temporary.test.tsx`, then remove the temporary test. Its assertions deliberately assert the defect. No credentials or live accounts are involved.

Repair acceptance: detect principal and effective-authority changes, purge old scoped snapshots and views, and resolve authorized workspaces before protected content is reused. Cover returning tabs and restored persisted snapshots as well as explicit sign-out.

### CACHE-RACE: obsolete responses overwrite current results and erase invalidation

`app/lib/query-cache.ts:281–302` writes every non-aborted completion into cache. `forceNew` replaces the in-flight map entry without preventing the old entry from later committing. The entry-identity check only protects deletion in `finally`. Separately, `invalidateQueries` at lines 407–429 only traverses completed memory entries; a pending first request is unaffected by mutation invalidation.

Direct execution of the current source reproduced both orders, with no server or UI writes:

```js
import { fetchQuery, peekQuery, invalidateQueries, clearSessionCache }
  from './apps/dashboard/app/lib/query-cache.ts';
clearSessionCache();
let resolveOld, resolveNew;
const old = fetchQuery('review', '/api/v1/providers',
  () => new Promise(r => { resolveOld = r; }));
const fresh = fetchQuery('review', '/api/v1/providers',
  () => new Promise(r => { resolveNew = r; }), { force: true });
resolveNew({ version: 'new-after-save' }); await fresh;
resolveOld({ version: 'old-before-save' }); await old;
console.log(peekQuery('review', '/api/v1/providers'));
// Actual: { version: 'old-before-save' }
clearSessionCache();
let finish;
const pending = fetchQuery('review', '/api/v1/keys',
  () => new Promise(r => { finish = r; }));
invalidateQueries('/api/v1/keys');
finish({ revoked: false }); await pending;
let calls = 0;
const result = await fetchQuery('review', '/api/v1/keys',
  async () => { calls++; return { revoked: true }; });
console.log(result, calls);
// Actual: { revoked: false }, 0
```

Run the snippet from the repository root with Node's `--input-type=module`; the reviewed Node supports stripping TypeScript. A real mutation was not performed: the direct probe controls read ordering and invokes the same invalidation primitive used by mutation helpers. Impact includes old configuration/list evidence being treated as freshly verified after saves or refreshes.

Repair acceptance: request/invalidation generations must prevent obsolete completions from committing to cache or mounted subscribers. Cover reverse completion, invalidation before the first response, and optimistic updates while reads are pending.

### DATA-OWNERSHIP: route-data migration is scaffolded but not connected

`app/routes.tsx:17–30` forwards optional loader/action/revalidation exports. Inspection found no feature route exporting a loader, action, clientLoader or shouldRevalidate and no useLoaderData/useFetcher consumers. `dashboardRouterContext` is declared but never read or populated through the router context API; its separate mutable global snapshot serves prefetch instead. Session and workspace orchestration remain in the 1,500+ line shell; feature data remains component effects plus custom cache requests.

This conflicts with `apps/dashboard/README.md:12–14`, which describes actual route loaders, revalidation policies and route-module exports. Data Mode is valid, and React Router does not require Framework Mode or prohibit a query cache. The gap is the claimed migration and ownership: route cancellation, action revalidation and route error handling do not automatically govern these imperative requests. The new cache must currently provide those guarantees itself, and the race above shows a missing guarantee.

Repair acceptance: explicitly define router/cache ownership, connect session/workspace and critical data lifecycles to that design, align the README, and test slow navigation, superseded reads, mutation refresh and recoverable errors through the real production route lifecycle.

## Verification and limits

- TypeScript build and dashboard hygiene script passed.
- Vite production build passed; existing large-chunk warnings remain (main JavaScript approximately 757 kB uncompressed). Bundle warning alone is not a measured performance finding.
- Initial full suite: 116 files, 993 passed tests, 17 failed tests, one secondary error. All failures were timeouts under default parallelism.
- Repeated all seven affected files with one worker: 182 tests passed. The cache test file added four passing tests, for 186 passing targeted tests total. No deterministic product regression is inferred from the initial timeout-only failures. The full suite was not repeated serially.
- Isolated identity diagnostic: one test passed by asserting the stale-data defect; temporary executable file removed, evidence source retained above.
- Browser against the local disposable Niu deployment: overview, API keys, pool listing/detail and URL-backed history tab opened. At 390 px, root and main measured 390 px; table scroll remains internal. This is a limited navigation/rendering smoke check, not complete workflow or performance acceptance. No inference, key issuance or configuration writes were performed.
- Browser console reported whitespace under a table row on the agent review history page. This was not attributed to the architecture refactor or elevated to a blocking finding.

The scope was architecture and regressions, not a visual redesign. The inspected task is navigating between workspace evidence surfaces while retaining correct identity and scope. Readable headings, controls and narrow-screen access were observed; all other page families and changed write/error states remain outside this rendered smoke check. Product identity and cache correctness fail the review regardless of those rendered passes.

Reference criteria: [React Router race conditions](https://reactrouter.com/explanation/race-conditions), [data loading](https://reactrouter.com/start/data/data-loading), and [actions and automatic revalidation](https://reactrouter.com/start/data/actions). These describe guarantees for router-owned operations, not arbitrary component fetches. UX criterion: the applied ux-review skill's evidence/traceability and interaction/recovery rules require distinguishing verified identity, scope and current evidence from cached presentation. Server authorization remains authoritative.
