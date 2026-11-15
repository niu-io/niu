# AgentDoc & Connect-to-Agent UX Review (2026-11-15)

**Bead**: `niu-pxaw` (related: `niu-287.30`)  
**Branch / Base Revision**: `feat/agent-doc-and-connect` from `release/0.3` (`c26787fd1`)  
**Scope**: Agent-first onboarding, `/docs/agents/*` (`AgentDoc`), `/llms.txt`, `/docs/*.md`, `AgentConnection` dialog, `/connect` device-authorization page, `/api/v1/auth/agents*`, `sdks/agent-connect`, and packaged `integrations/coding-agents` skills.

---

## 1. Diagnosis of Current Rough Edges

An end-to-end review of Niu's coding-agent paradigm identified nine systemic friction points preventing frictionless, agent-native self-onboarding:

1. **Artificial 3-host lock-in on device authorization**: Storage constraint `agent_authorizations_client_name_check`, Rust validation, OpenAPI schema, and `sdks/agent-connect` reject every `client_name` outside `"Claude Code"`, `"Codex"`, and `"DeepSeek Harness"`. Agents running in Cursor, Windsurf, Zed, OpenCode, or custom HTTP harnesses receive `400 Bad Request` on `/api/v1/auth/agents` even though they can already execute `POST /api/v1/auth/agents` directly.
2. **OpenAPI contract drift on `invocation_protocols`**: `Decision` OpenAPI annotation in `apps/gateway/src/admin/agent_authorizations.rs` still declares `maxItems: 6` and omits `"decisions"`, diverging from the 7 protocols enforced in storage (`chat`, `responses`, `messages`, `content`, `embeddings`, `video`, `decisions`).
3. **Rigid single-prompt `AgentConnection` dialog**: The sidebar/overview modal sends a single fixed English/Chinese paragraph, cannot tailor guidance to what the user wants the agent to accomplish (discovery, routing policy, model evaluation, tracing, or app inference wiring), and lacks a fallback link to workspace API keys.
4. **`/connect` UX friction on direct visit, workspace context, TTL, and capability narrowing**:
   - Opening `/connect` directly without `?code=` immediately sets an alert-styled error (`role="alert"`) instead of a calm verification entry state.
   - Multi-workspace admins arriving from `?workspace=<slug>` do not get that workspace preselected.
   - Session duration (`ttl_seconds`) is hardcoded to `3600` (`1 hour`) in UI copy and request payload rather than selectable within the backend's `[60, 86400]` bound.
   - Approvers can narrow `allowed_models`, `invocation_allowed`, and `invocation_protocols`, yet cannot narrow `requested_capabilities` (management scopes) at approval time, forcing all-or-nothing rejection.
   - Post-approval confirmation drops back to the bare `terminal` card without echoing the approved workspace, duration, or grant boundaries.
5. **AgentDoc missing gateway-root `/llms.txt` and self-hosted portability**: Docs previously hardcoded `https://niu.io` in `/docs/llms.txt` and machine `.md` files, and the gateway did not serve `/llms.txt` at deployment root. Agents auditing localhost, staging, or private deployments risked reading production host examples instead of their active origin.
6. **Missing app inference contract (`/docs/inference.md`)**: Machine docs covered install, capabilities, routing, evaluations, and events, but omitted a concise machine contract for `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/decisions`, error envelopes, and environment-variable app integration.
7. **Broken release/download facts**: `guides/mcp.mdx` referenced `niu-io-mcp-0.3.0.tgz` while published GitHub release `v0.3.0` (`2026-11-08T03:37:32Z`) ships `niu-io-mcp-0.1.0.tgz` matching `sdks/mcp/package.json` (`0.1.0`), and `install.md` still warned that the `0.3.0` release was held/unpublished.
8. **Leaky HTML in AgentDoc Source tab & missing `.md` route symmetry**: `/docs/agents/` `Source` tab displayed raw `<div data-lang="...">` wrapper tags from `agents.mdx`, and `/docs/agents/<slug>.md` mirrors were absent.
9. **Terminology drift**: "Model pools" persisted in `pools.md`, `DocsHome.tsx`, and `PageFrame.astro` instead of "Workspace routing" / `模型路由` alongside `/docs/routing.md`.

---

## 2. Mature-Product Benchmarks & Design Standards Applied

| Reference Pattern | Observed Pattern Adopted in Niu | Standard / Rule Grounding |
| --- | --- | --- |
| **Stripe Docs (`/llms.txt` & `.md`)** | Root `/llms.txt` index with explicit routing + copyable clean Markdown contracts per resource without HTML chrome; deployment-relative paths + behavioral rules upfront. | Information architecture clarity; progressive machine discovery. |
| **OpenRouter Docs (`/docs/llms.txt`) & OAuth PKCE** | Distinct Track 1 (universal HTTP REST + MCP) vs Track 2 (native host plugin), concise copyable auth/inference quickstart, explicit model/spend scope selection before key issuance. | NN/g Visibility of System Status; Niu opt-in paid invocation boundary. |
| **GitHub Device Flow (`github.com/login/device`) & Stripe CLI (`stripe login`)** | Dedicated calm entry state on `/connect` when `code` is absent (no premature `role="alert"`), prominent single monospace code input + Enter submit, preselected org/workspace when passed via `?workspace=<slug>`, clear session TTL picker, explicit scope review before consent, and rich terminal confirmation receipt. | WCAG 3.3.1 / 4.1.3 (reserve `role="alert"` for actual failure/validation feedback); NN/g User Control & Freedom. |
| **Niu Shared UI & Choice Controls (`AGENTS.md`)** | All choice controls in `AgentConnection` (task preset) and `/connect` (workspace, session duration, allowed models) use installed shadcn `DropdownMenu` / `DropdownMenuRadioGroup` / `DropdownMenuCheckboxItem` directly—zero `<select>` elements or custom menu spacing overrides; full container width preserved; Lucide/Tabler icons only. | `AGENTS.md` Dashboard choice controls, Shared UI components, Reference-led design. |

---

## 3. Architecture & UX Decisions

1. **Universal `client_name` + Approver Capability Narrowing**:
   - Migration `0433_agent_authorization_universal_clients.sql` replaces the fixed 3-client `CHECK` constraint with trimmed printable 1–80 character validation (non-empty, non-control), and adds nullable `approved_capabilities TEXT[]` constrained as valid unique management scopes (`<= 6`).
   - Storage exchange resolves effective capabilities via `COALESCE(approved_capabilities, requested_capabilities)` so rejecting or unchecking a requested management scope on `/connect` safely narrows the issued `agent_key_capabilities` rows.
   - `AgentAuthorizationRequest::view` (`GET /api/v1/auth/agents?code=...`) requires valid pending request semantics unchanged while `Decision` validates optional `capabilities` alongside all 7 `invocation_protocols`.
2. **Task-Oriented Handoff (`AgentConnection`)**:
   - Users pick a task goal via shadcn `DropdownMenu`: Discover deployment, Configure routing (`routing.md`), Compare & evaluate models (`evaluations.md`), Inspect request traces (`events.md`), or Wire inference into an app (`inference.md`).
   - The generated setup prompt points the agent dynamically to `{origin}` + `?workspace={slug}` + `/docs/install.md` + task doc, paired with footer links to `AgentDoc` and workspace `API keys`.
3. **Calm & Controllable `/connect` Approval**:
   - Distinguishes "awaiting manual code entry" (no alert) from actual missing/expired/invalid codes (`role="alert"`).
   - Supports `?workspace=<slug>` hint matching slug, organization slug/id fallback, and auto-selecting single-workspace users.
   - Lets approvers choose session duration (`15 minutes`, `1 hour` default, `8 hours`, `24 hours`) via shadcn `DropdownMenu` and narrow management capabilities inside `Advanced options`, then displays an explicit post-approval boundary summary.
4. **Canonical AgentDoc Machine Surface**:
   - Gateway serves `/llms.txt` at root (via `ServeFile` from `docs_dir/llms.txt`) alongside `/docs/llms.txt`.
   - AgentDoc exposes clean machine contracts at `/docs/install.md`, `/docs/agents.md`, `/docs/inference.md`, `/docs/pools.md`, `/docs/routing.md` (mirror), `/docs/evaluations.md`, `/docs/events.md`, plus `/docs/agents/*.md` mirrors.
   - `AgentDocModes` adds a copyable canonical machine path pill + `Copy URL`, `Copy source`, and `Raw .md`; `/docs/agents/` serves clean `llms.txt` in `Source` mode without bilingual HTML wrappers.
   - Terminates stale "release held" copy and fixes `guides/mcp.mdx` tarball filename to `niu-io-mcp-0.1.0.tgz`.

---

## 4. Verification Record (2026-11-15)

### Automated Verification

- **Backend (Rust workspace, gateway & storage)**:
  - `cargo check --workspace --tests`: exit 0 (`0433_agent_authorization_universal_clients.sql`, `crates/storage`, and `apps/gateway` compiled cleanly).
  - `cargo test -p niu-gateway static_site`: **6 passed, 0 failed** (verifies `/llms.txt` and `/docs/llms.txt` in both marketing and community modes).
  - `cargo test -p niu-storage --test agent_authorizations`: **1 passed, 0 failed** (`validates_universal_agent_client_names_and_capabilities`); 5 PostgreSQL-backed `#[ignore]` integration tests skipped locally without a running PostgreSQL instance (`#[sqlx::test] universal_clients_and_narrowed_capabilities_are_enforced` in `apps/gateway/src/web/tests/agent_authorizations.rs` compiled via `cargo check --workspace --tests` and gated in CI/staging PostgreSQL).
- **Contracts & SDKs**:
  - `python3 scripts/extract-handler-openapi.py`: exit 0 (`425` operations).
  - `pnpm --dir apps/docs generate:api`: exit 0 (`531` REST operations, `452` public SDK exports).
  - `python3 scripts/check-openapi-entrypoints.py`: exit 0 (`345` registered paths, `425` generated methods).
  - `node --test sdks/agent-connect/test/*.test.mjs`: **19 passed, 0 failed** (universal trimmed `clientName`, `--workspace` preselection query propagation).
  - `pnpm --dir sdks/mcp test`: **25 passed, 0 failed** (`pools`, `evaluations`, and `events` schema parity and stdio tests).
  - `python3 scripts/build-agent-plugin.py --output /tmp/niu-plugin-verify-test`: exit 0 (built `0.3.0` bundle with bundled `references/inference.md`; cleaned up temp dir).
- **Dashboard (`apps/dashboard`)**:
  - `pnpm --dir apps/dashboard exec tsc -b --pretty false`: exit 0.
  - `node apps/dashboard/scripts/check-i18n.mjs`: exit 0 (`0 findings`).
  - `node apps/dashboard/scripts/check-hygiene.mjs`: exit 0.
  - `node apps/dashboard/scripts/lint.mjs`: exit 0 (`1180` Biome diagnostics vs `1206` baseline).
  - `node apps/dashboard/scripts/check-css-usage.mjs`: exit 0.
  - `pnpm --dir apps/dashboard exec vitest run test/features/connect/ConnectAgent.test.tsx test/features/overview/overview.test.tsx`: **19 passed, 0 failed** (`14` in `ConnectAgent.test.tsx`, `5` in `overview.test.tsx`).
  - `pnpm --dir apps/dashboard build`: exit 0 (`SPA Mode: Generated dist/client/index.html` and `apps/dashboard/dist/index.html`).
- **Documentation (`apps/docs` & repo doc checks)**:
  - `node apps/docs/scripts/generate-agent-docs.mjs`: exit 0.
  - `pnpm --dir apps/docs check` (`generate-agent-docs.mjs --check && astro check`): exit 0 (`0 errors, 0 warnings, 1 hint` pre-existing in `Sidebar.astro`).
  - `pnpm --dir apps/docs build`: exit 0 (`1029` pages built, EN + ZH Pagefind indexes).
  - `pnpm --dir apps/docs test:api`: **8 passed, 0 failed**.
  - `node --test apps/docs/scripts/test-navigation.mjs`: **3 passed, 0 failed**.
  - `python3 scripts/check-docs-audiences.py`: exit 0 (`Documentation audience entries and all six raw contracts verified.`).
  - `python3 -m unittest scripts/tests/test_operator_documentation.py`: **2 passed** (`OK`).

### Live Browser Verification (Built Docs + Built Dashboard Preview Server)

Served built `apps/dashboard/dist` and `apps/docs/dist` via local Node HTTP server on `http://127.0.0.1:4399` (`mock /api/v1/auth/agents/*` and workspace fixtures) and inspected rendered Chromium DOM, bounding boxes, and screenshots across `1440x900`, `1100x800`, and `390x844` in both English (`en`) and Chinese (`zh-CN`):

1. **AgentDoc (`/docs/agents/`, `/docs/agents/inference/`, `/docs/agents/pools/`, `/llms.txt`, `/docs/routing.md`)**:
   - `/docs/agents/` `Source` tab displays clean `llms.txt` (`# Niu — The Model Platform for Agents`) with zero `<div data-lang>` HTML tags (`hasDataLang: false`), `/docs/llms.txt` path badge, `Copy URL`, `llms.txt` link, and `Copy source`.
   - Zero horizontal overflow at `1440x900`, `1100x800`, and `390x844` (`width === viewport width`).
   - `/docs/agents/inference/` and `/docs/agents/pools/` render cleanly with `Raw .md` links; switching site locale to `zh-CN` translates sidebar labels (`模型推理`, `工作空间路由`) and page headings (`模型推理与应用集成契约`).
   - Direct raw HTTP fetches on `/llms.txt` and `/docs/routing.md` return plain Markdown beginning with `#`.
2. **Dashboard `AgentConnection` (`/workspaces/acme-dev`)**:
   - Opens with 3-step summary strip, shadcn `DropdownMenuRadioGroup` task selector (`Connect & inspect models`, `Configure workspace routing`, `Evaluate & compare models`, `Inspect traces & events`, `Wire inference into my app`) using right-aligned checkmarks with no left radio dots or `<select>`.
   - Selecting `Configure workspace routing` updates the prompt cleanly to `/docs/routing.md`, `capabilities ["pools:read","pools:write"]`, `--workspace acme-dev --capability pools:read --capability pools:write`, and `/connect?workspace=acme-dev`.
   - Renders in `zh-CN` (`连接你的 Agent`, `任务目标`) and fits within `390x844` mobile viewport (`width: 390`, `height: 700.75`, `scrollWidth: 390`).
3. **Dashboard `/connect` Verification & Approval**:
   - Direct `/connect` entry renders the manual 12-character verification code card without any `role="alert"` banner (`alerts: []`).
   - `/connect?code=ABCDEF123456&workspace=acme-dev` preselects `Cursor` and `Acme Dev`, shows shadcn `DropdownMenuRadioGroup` `Session duration` (`15 minutes`, `1 hour`, `8 hours`, `24 hours`) with right-side checkmarks, keeps `Allow model calls` unchecked by default, reveals requested task (`Configure workspace routing policy pool/assistant`) and interactive capability checkboxes under `Advanced options`, and renders the post-approval boundary summary (`Cursor`, `Acme Dev`, selected duration, `Disabled (discovery only)` or model count, narrowed capability list, and `Open API keys`) in both `en` and `zh-CN`.

### Evidence Boundaries (Pre-Existing Out-of-Scope Drift Left Untouched)

- Full `pnpm --dir apps/dashboard check` (`check-module-size.mjs`) was not cleared on `locale-messages.ts` (`4932` vs `4931` lines) because that file was already over baseline in upstream commit `0f7e22f4e` and untouched in this change (`AgentConnection.tsx` and `connect/page.tsx` remain well below module limits).
- Full `apps/dashboard` `vitest run` has pre-existing unrelated failures in `AccountMenu.permissions.test.tsx` / `AppLayout.integration.test.tsx` (`Appearance` menu item renamed to `Settings`), left untouched outside `niu-pxaw` scope.
- PostgreSQL-backed `#[ignore]` / `#[sqlx::test]` storage and gateway tests require a live PostgreSQL server (CI / staging gate).

### Follow-up Naming Refinement (2026-11-15)

- **Navigation & Page Title (`AgentDoc` → `Agents`)**:
  - Updated top documentation navigation (`apps/docs/src/navigation.ts`), header/sidebar/title dictionaries (`apps/docs/src/components/Header.astro`, `apps/docs/src/components/PageFrame.astro`), `/docs/agents/` title and bilingual opening copy (`apps/docs/src/content/docs/agents.mdx`), `/llms.txt` contract heading (`## Agent contracts`), generator messages (`apps/docs/scripts/generate-agent-docs.mjs`), and `apps/docs/scripts/test-navigation.mjs` from `AgentDoc` to `Agents` (`Docs · Agents · API · SDK` / `文档 · Agents · API · SDK`).
  - Preserved all canonical machine and rendered routes (`/docs/agents/*`, `/llms.txt`, `/docs/*.md`) and internal React component symbol names (`AgentDocModes`).
- **Verification**:
  - `node --test apps/docs/scripts/test-navigation.mjs`: **3 passed, 0 failed**.
  - `pnpm --dir apps/docs check`: exit 0 (`0 errors, 0 warnings, 1 hint` pre-existing in `Sidebar.astro`).
  - `pnpm --dir apps/docs build`: exit 0 (`1029` pages built + EN/ZH Pagefind indexes).
  - `pnpm --dir apps/docs test:api`: **8 passed, 0 failed**.
  - `python3 scripts/check-docs-audiences.py`: exit 0 (`Documentation audience entries and all six raw contracts verified.`).
  - **Live Browser (`http://127.0.0.1:4398`, Chromium)**: Verified `1440x900` and `390x844` in `en` and `zh-CN`: header links render cleanly on a single row (`Docs`, `Agents`, `API`, `SDK` / `文档`, `Agents`, `API`, `SDK`), `aria-current="page"` highlights `Agents` across `/docs/agents/` and `/docs/agents/install/` without activating on `/docs/`, `/docs/agents/` H1 renders `Agents` with clean `llms.txt` (`## Agent contracts`) in `Source` mode and zero `AgentDoc` occurrences, and the mobile navigation drawer fits within `390x844` (`390px` viewport width, zero horizontal overflow).
