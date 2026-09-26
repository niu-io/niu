# Niu console

React and Vite console served by the Niu gateway in production. Run `pnpm build:console` from the repository root to build its static assets.

Use the shared shadcn/ui primitives in `src/components/ui` for controls and `lucide-react` for icons. `components.json` configures the official registry and local aliases. Tailwind theme values map to the approved niu.io tokens in `branding/tokens.css`; preserve these tokens when adding components. Layout styles remain in `src/styles.css`. Workspace pages are nested under `/workspaces/:workspace/…`; the path is a UI selector and does not grant access. Server APIs remain responsible for authorization.

## Source layout

Keep route modules, feature UI, and shared code in separate places:

- `src/app` contains the React Router route table, persistent application layout, route navigation, and shared console context.
- `src/features/<feature>/page.tsx` is the route entry for that feature. `src/app/routes.tsx` maps URL paths to these route modules.
- `src/features/<feature>/components` contains page views and feature-only UI, with deeper folders for larger features.
- Feature-only request helpers, hooks, types, and pure utilities stay beside that feature. Shared controls live in `src/components/ui`; utilities shared across features live in `src/lib`.
- `test/app` and `test/features/<feature>/components` hold route and feature integration tests. `test/lib` holds focused tests for pure domain logic; shared visual primitives do not get isolated unit tests.

Use the `@/` alias for imports from `src`. Navigation is URL-backed, and cross-feature drill-down context is encoded in query parameters so deep links and reloads preserve the selected scope. Keep product behavior and API contracts in Niu-owned modules; the feature-local grouping follows the dashboard organization used by LiteLLM.

The root `pnpm dev` command serves the hot-reloading console and proxies API requests through one browser origin at `http://127.0.0.1:2555`. Admin credentials stay in the local dev server and never enter browser storage or the bundle.
