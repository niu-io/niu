# Niu dashboard

React Router v8 Data Mode and Vite dashboard served by the Niu gateway in production. Run `pnpm build:dashboard` from the repository root to build its static assets.

Use the shared shadcn/ui primitives in `app/components/ui` for controls and `@tabler/icons-react` / `lucide-react` for product icons. Keep icons embedded in installed shadcn components consistent with their upstream source. `components.json` configures the official registry and local aliases. Tailwind theme values map to the approved niu.io tokens in `branding/tokens.css`; preserve these tokens when adding components. Layout styles remain in `app/styles.css`. Workspace pages are nested under `/workspaces/:workspace/…`; the path is a UI selector and does not grant access. Server APIs remain responsible for authorization.

## Application layout & data ownership

Keep route modules, application shell, feature UI, and shared code in separate places under `app/`:

- `app/entry.client.tsx` and `app/root.tsx` mount the React Router v8 Data Mode provider (`<RouterProvider router={router} />`) and global branding/currency providers. The dashboard uses Data Mode (`createBrowserRouter` / `createMemoryRouter`), not React Router Framework Mode.
- `app/routes.tsx` defines the route tree, nested outlet `<AppError />` boundaries, lazy chunk binding (`bindLazy`), typed `handle` metadata, and `createDashboardRouter` / `createDashboardMemoryRouter` wired with `getContext: createRouterContextProvider` (`dashboardRouterContext`).
- `app/shell` owns the persistent application shell (`AppLayout`), authenticated principal and effective-authority verification (`/api/v1/session`), workspace directory resolution (`/api/v1/organizations`, `/api/v1/workspaces`), navigation hover/focus prefetching (`prefetchRouteIntent`), and router context publishing (`router-context.ts`). Protected workspace views do not render until the current session authority's workspaces are verified.
- **Router vs. SWR cache ownership**:
  - **React Router Data Mode (`app/lib/route-data.ts`)** owns URL matching, `dashboardRouterContext` injection via `RouterContextProvider`, critical route-entry `loader` execution (returning warm cache hits synchronously, starting non-blocking cancellation-bound loads on cold navigations so route skeletons render immediately without trapping transitions, and awaiting fresh reads when revalidating invalidated entries), `routeShouldRevalidate` policies (skipping transient hash/settings-modal URL changes while revalidating on scope changes and explicit `revalidator.revalidate()`), and outlet-scoped `<AppError />` boundary recovery that preserves the navigation shell.
  - **SWR Query Cache (`app/lib/query-cache.ts`)** owns principal/authority isolation (`syncCacheAuthority`, purging memory and `sessionStorage` on identity or permission changes), monotonic request/invalidation generation tracking (preventing obsolete or pre-mutation reads from overwriting newer state), Frame-0 synchronous reads (`peekQuery` / `useCachedQuery`), and mutation invalidation (`invalidateForMutation`, which invalidates matching cache/in-flight reads and notifies `AppLayout`'s `useRevalidator()`).
- `app/features/<feature>/page.tsx` is the lazy route entry for that feature. Critical data-bearing route entries export `loader` and `shouldRevalidate` alongside their default page component; static/utility pages and leaf interactive sub-panels read/write through `useCachedQuery` and `app/lib/api-client.ts` (`request`, `cachedGet`) rather than `useFetcher` form actions.
- `app/features/<feature>/components` contains page views and feature-only UI, with deeper folders for larger features. Feature-only request helpers, hooks, types, and pure utilities stay beside that feature; shared primitives live in `app/components/ui` and cross-feature utilities live in `app/lib`.
- `test/app` and `test/features/<feature>` hold route, lifecycle, and feature integration tests. `test/lib` holds focused tests for shared domain and cache logic; shared visual primitives do not get isolated unit tests.

Use the `@/` alias for imports from `app`. Navigation is URL-backed, and cross-feature drill-down context is encoded in query parameters so deep links and reloads preserve the selected scope. Keep product behavior and API contracts in Niu-owned modules.

The root `pnpm dev` command serves the hot-reloading dashboard and proxies API requests through one browser origin at `http://127.0.0.1:2566`. Sign-in uses a persisted member account and normal browser sessions. See [the development guide](../../scripts/DEV.md) for account seeding and startup details.

## Release metadata

The container build embeds the version from the repository's `VERSION` file in About. Distributors can override it with the `VITE_NIU_VERSION` Docker build argument and may provide a verified release date with `VITE_NIU_RELEASE_DATE` (ISO date, `YYYY-MM-DD`). Standalone dashboard builds can set the corresponding environment variables. An unversioned local build displays “Development build”; About omits the release date when none is supplied rather than treating build time as a release date.
