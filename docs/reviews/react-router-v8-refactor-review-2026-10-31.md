# React Router v8 refactor review — 2026-10-31

Status: review-only evidence record. Live work state is Beads epic `niu-wnr`; this file records the review, evidence and limits.

**Reviewed revision:** working tree at HEAD `8466799b9` (v0.2.30 release notes), with the uncommitted 0.3.0 refactor: 599 modified/untracked files, dashboard moved from `apps/dashboard/src` to `apps/dashboard/app`, React Router `8.4.0` Data Mode, VERSION/Cargo 0.3.0, migrations 0392–0400 and new backend management APIs.

This pass responds to a missed area from the earlier architecture reviews: the dashboard's React Router v8 conformance. The refactor is a real improvement — typed routes, lazy modules, a data router, route handles and a query cache — but it stops halfway: the data APIs are used as a prefetch side-channel while pages keep their own fetch/state loops.

## Verification

| Check | Result |
| --- | --- |
| `pnpm --filter @niu-io/dashboard check` | pass |
| Dashboard Vitest | 118 files / 1021 tests pass |
| `cargo check -p niu-gateway` | pass |
| Browser scroll/focus/navigation | not run |
| Production EXPLAIN/load | not run |
| New migrations 0392–0400 | not applied to a database in this pass |

## Findings

### The router is Data Mode in name only

- **No `ScrollRestoration` and no route-change focus management** (`niu-wnr.3`). `app/root.tsx` renders `RouterProvider` without the component; Back/Forward and in-app navigation keep the previous scroll position, and focus stays on the trigger. Data Mode restores scroll only when `<ScrollRestoration />` is rendered.
- **Loaders return deferred snapshots that pages ignore or duplicate** (`niu-wnr.4`). Fifteen route modules export `loader` via `loadCriticalRouteEndpoint`; on a cold cache it returns `{status:'pending', promise}` and swallows the rejection. Most pages call `useOptionalRouteLoaderData()` and discard the result (`overview/page.tsx`, `customers/page.tsx`), then fetch again through `useCachedQuery`/effects. Loaders therefore add code and requests without owning data or errors. Only the keys page consumes a `ready` snapshot.
- **Router context is a mutable render-time global published after loaders** (`niu-wnr.5`). `AppLayout.tsx:1170` calls `setActiveSessionSnapshot` during render; `getContext` runs before each navigation's loaders. On the first deep link the snapshot is empty, loaders defer as unauthenticated/workspace-pending, and no auth-triggered revalidation occurs (only mutation events revalidate). Later navigations use the previous render's snapshot. A discarded concurrent render can publish a snapshot that never committed.
- **No route ids, no `useRouteLoaderData`, dead `handle` metadata, and an `UNSAFE_*` API** (`niu-wnr.7`). `routes.tsx` has no route `id`s; `handle` is attached at lines 183/297 but never read (`useMatches` = 0); `route-data.ts:304` reads `UNSAFE_DataRouterDataContext` to detect a data router. Titles are duplicated manually in `AppLayout`.
- **`bindLazy` is lossy** (`niu-wnr.6`). It maps only `Component`, `loader`, `clientLoader`, `action`, `shouldRevalidate`, `handle`; `clientLoader` is written into the `loader` slot, so a module exporting both loses the server loader; `ErrorBoundary`, `HydrateFallback` and `clientAction` can never pass through. No current module triggers it, so this is a latent extension break.
- **No `useNavigation`, `useFetcher`, `useSubmit` or route actions** (`niu-wnr.8`). Every mutation uses manual `request()` with local busy/error state. Data Mode's pending navigation, fetcher lifecycle, progressive enhancement and automatic revalidation are unused; each feature reimplements recovery.
- **Prefetch is a second route table** (`niu-wnr.9`). `prefetch.ts` hardcodes path-to-module mappings separately from `routes.tsx`; only rail links and one tab attach intent prefetch, so most `Link`s wait for the lazy chunk. Adding or renaming a route requires edits in two places.
- **Redirects are components, not loader redirects; the 404 catch-all uses an error-only hook** (`niu-wnr.10`). About 25 `Legacy*Redirect` components render `<Navigate>` with manual query/hash string concatenation; the root `{ path:'*', element:<RouteFallback notFound/> }` calls `useRouteError()` outside an `errorElement`. Redirects render the shell first, and the 404 surface depends on unspecified hook behavior.
- **One global active route load** (`niu-wnr.11`). `route-data.ts` keeps a single `activeRouteLoad`; any loader for a matched route aborts the previous one. This is latent while loaders exist only on leaf routes; normal parent+child loaders would abort each other.
- **No route-level `ErrorBoundary`/`HydrateFallback`** (`niu-wnr.12`). All failures fall back to the same generic `AppError`; there is no page-specific recovery and no lazy-route hydration fallback beyond the layout.

### Frontend maintainability (carried, revalidated)

- `app/styles.css` is 285,944 bytes with 774 top-level classes and ~371 unreferenced in TS/TSX; no ESLint/Biome configuration; 76 `any`/`ts-ignore` occurrences (`niu-4rp.14`).
- `AppLayout.tsx` is 2,044 lines; `route-pools/page.tsx` 2,302; `commercial-position/page.tsx` 1,618; `agent-review/page.tsx` 1,557; `query-cache.ts` 999 (`niu-4rp.15`).
- `workspace-route.ts:29` still derives URL suffixes from raw workspace ids (`niu-4rp.21`).

### Backend

- **P0: the refactor is uncommitted** (`niu-wnr.1`). 599 files, including the dashboard move, VERSION/Cargo 0.3.0, migrations and new APIs, exist only in the working tree. No SHA exists for CI, release evidence or rollback.
- **P0: startup silently grants `platform_admin` to `demo@niu.io`** (`niu-wnr.2`). `state.rs:325-330` runs whenever member password auth is configured, outside the loopback/demo-enabled provisioning guard. A database carrying that operator silently gains an installation administrator on every restart, and the grant persists after demo mode is disabled.
- **P2: event delivery scans all subscriptions globally** (`niu-wnr.13`). `workspace_events.rs:315` filters every `workspace_event_subscriptions` row by a JSON `enabled` cast, authority and an `EXISTS` over events, ordered by `checked_at`; migration 0396 has no due-work index. The worker runs every second, and a malformed `enabled` cast can abort the whole batch.

## Limits

- The router findings are source-derived; no browser session verified scroll, focus, 404 rendering or redirect flashes.
- The uncommitted tree was reviewed as requested; none of these findings has a CI result for the exact revision.
- New backend migrations and event delivery were not exercised against PostgreSQL; performance claims are static.
- The existing open findings in epic `niu-4rp` (hot-path reads, payload capture, compression, trigger concentration, observability) remain valid unless separately revalidated.

## Finding → bead map

| Area | Beads |
| --- | --- |
| Refactor provenance | `niu-wnr.1` |
| Demo privilege escalation | `niu-wnr.2` |
| Scroll/focus | `niu-wnr.3` |
| Loader ownership | `niu-wnr.4` |
| Router context timing | `niu-wnr.5` |
| Lossy lazy binding | `niu-wnr.6` |
| Route ids/UNSAFE/handle | `niu-wnr.7` |
| Mutations/actions | `niu-wnr.8` |
| Prefetch duplication | `niu-wnr.9` |
| Redirects/404 | `niu-wnr.10` |
| Global loader abort | `niu-wnr.11` |
| Route error boundaries | `niu-wnr.12` |
| Event delivery scan | `niu-wnr.13` |
| CSS/large modules/UUIDs | `niu-4rp.14`, `niu-4rp.15`, `niu-4rp.21` |
