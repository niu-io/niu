# Niu console

React and Vite console served by the Niu gateway on port 2555. Run `pnpm build:console` from the repository root to build its static assets.

Use the shared shadcn/ui primitives in `src/components/ui` for controls and `lucide-react` for icons. `components.json` configures the official registry and local aliases. Tailwind theme values map to the approved niu.io tokens in `branding/tokens.css`; preserve these tokens when adding components. Layout styles remain in `src/styles.css`.

Run `pnpm dev:console` for Vite development; API requests proxy to the gateway on port 2555. Admin credentials stay in memory for the current tab.
