# Niu dashboard

React and Vite dashboard served by the Niu gateway in production. Run `pnpm build:dashboard` from the repository root to build its static assets.

Use the shared shadcn/ui primitives in `src/components/ui` for controls and `@tabler/icons-react` for product icons. Keep icons embedded in installed shadcn components consistent with their upstream source. `components.json` configures the official registry and local aliases. Tailwind theme values map to the approved niu.io tokens in `branding/tokens.css`; preserve these tokens when adding components. Layout styles remain in `src/styles.css`. Workspace pages are nested under `/workspaces/:workspace/…`; the path is a UI selector and does not grant access. Server APIs remain responsible for authorization.

## Source layout

Keep route modules, feature UI, and shared code in separate places:

- `src/app` contains the React Router route table, persistent application layout, route navigation, and shared dashboard context.
- `src/features/<feature>/page.tsx` is the route entry for that feature. `src/app/routes.tsx` maps URL paths to these route modules.
- `src/features/<feature>/components` contains page views and feature-only UI, with deeper folders for larger features.
- Feature-only request helpers, hooks, types, and pure utilities stay beside that feature. Shared controls live in `src/components/ui`; utilities shared across features live in `src/lib`.
- `test/app` and `test/features/<feature>/components` hold route and feature integration tests. `test/lib` holds focused tests for pure domain logic; shared visual primitives do not get isolated unit tests.

Use the `@/` alias for imports from `src`. Navigation is URL-backed, and cross-feature drill-down context is encoded in query parameters so deep links and reloads preserve the selected scope. Keep product behavior and API contracts in Niu-owned modules; the feature-local grouping follows the dashboard organization used by LiteLLM.

The root `pnpm dev` command serves the hot-reloading dashboard and proxies API requests through one browser origin at `http://127.0.0.1:2566`. Sign-in uses a persisted member account and normal browser sessions. See [the development guide](../../scripts/DEV.md) for account seeding and startup details.

## Release metadata

Set `VITE_NIU_VERSION` and `VITE_NIU_RELEASE_DATE` (ISO date, `YYYY-MM-DD`) when building a published dashboard artifact. About uses these release values; an unversioned local build displays “Development build” and “Not released” rather than treating its build time as a release date.
