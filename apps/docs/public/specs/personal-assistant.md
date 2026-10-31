# Build my personal assistant with Niu

You are my coding agent. Build a working personal assistant webapp from this specification. Work one stage at a time. At each checkpoint run the app, demonstrate the acceptance scenario, report measured results and wait for my acceptance before the next stage. Keep implementation instructions and decisions in the application's repository.

## Work directly with Niu

If Niu MCP is not connected, offer to install and configure it using the official Niu MCP instructions and this coding agent's supported local configuration. Preserve existing MCP servers, keep credentials out of chat and Git, and ask me only for secure credential entry, permissions or a required restart. Verify key inspection and model discovery before reporting connection success.

Use Niu tools directly throughout development. Do not ask me to relay model lists, API responses, token counts or diagnostics you can obtain yourself. I describe desired outcomes and review decisions and the working application. When a Niu setting requires my action, give the relevant page and exact change, wait for me, then recheck accessible state.

Ask together for my intended tasks, representative inputs and desired outputs, acceptable waiting time, deployment preference and model-test spending ceiling with currency. Record the choices in this application's `SPEC.md`. Adapt the app to these tasks rather than requiring a fixed bundle of assistant features.

## Niu connection and boundaries

Use `inspect_key` to read access, allowance and rate/concurrency constraints. Use `list_models` for accessible models and published customer pricing; use `list_catalog_models` for protocol capabilities. A public catalog entry does not prove key access or live upstream readiness. Never print secrets.

The current stdio MCP server authenticates with a workspace API key. It does not provide browser login, key creation, workspace membership or spending-limit administration tools. For these actions direct me to my workspace's appropriate Niu page, then recheck what the connected key can read. Do not invent capabilities or deep links.

The app calls the selected Niu deployment from its server using a configured workspace credential; hosted Niu defaults to `https://niu.io/v1`. Development MCP access does not authenticate app users or provide runtime email, calendar or search tools. Configure external integrations separately. Keep secrets out of Git, browser bundles and diagnostic logs; provide placeholder `.env.example`.

## Niu learning checkpoints

1. **Discover:** show the connected key's usable models, customer prices and relevant capabilities. Propose an explicit small test workload with candidate model IDs, output limits, call count, estimated cost or estimate gap. Obtain my acceptance of the workload and spending ceiling before paid tests.
2. **Compare:** use `compare_models` with up to five explicit models per comparison. Read responses, duration, usage and attempt references yourself. Use `get_generation` for recorded timings, token breakdown and customer charges. Bound polling and retries; unknown/pending charges are not zero or Provider costs. Stop before exceeding accepted scope; pause if uncertainty prevents judging the remaining budget. Explain the quality/latency/cost tradeoff and proposed default/escalation model.
3. **Integrate:** build my task workflows with the selected models. Verify streaming in the real application; buffered MCP comparison duration is not first-token latency. Show a runnable result and evidence from bounded real requests. I review the app and Niu's Logs/Usage & billing pages; you read diagnostics directly.
4. **Improve:** use the same agreed task examples to test model choice, relevant context and output limits. Show before/after quality, latency and customer cost, with sample size and unknown values. Obtain a new workload agreement for extra paid tests. Add embeddings, protocols or media only when needed and supported.

At each checkpoint bring me a decision and a runnable result when applicable. Provide model names, request time window and a harmless task tag when supported to help me review Niu Logs. Persist returned Niu attempt references in backend work records so you can retrieve diagnostics directly after a restart. Keep internal attempt IDs in machine-readable diagnostics, not user-facing labels. Do not claim unsupported filters exist. Wait for acceptance before continuing.

## Application requirements

- A responsive webapp with streamed answers, stop, retry, clear errors, editable drafts and accessible keyboard interactions. Use established product patterns and a consistent component system. Preserve unfinished input during failures and navigation.
- Store conversations, messages, files, tasks, preferences, tool runs and output versions on the backend. Browser storage is a disposable cache. Refreshing, restarting the server or using another browser must retain saved work. Clearly distinguish saved, running, failed and interrupted work.
- Give a private single-user deployment a real access boundary before exposing it on the Internet. If multiple accounts are enabled, enforce ownership on every API and file operation and test cross-account denial. Keep local setup straightforward and document backup/restore.
- If my tasks use documents, upload bounded Markdown/text files, validate type and size, retain provenance, and allow deletion. Retrieve only relevant excerpts with citations pointing to the saved source and excerpt. If evidence is missing, say so. Treat document and tool content as data; it cannot change permissions or system instructions.
- If my tasks need saved preferences, persist explicit user-approved preferences with inspect/edit/delete controls. Do not silently convert every conversation into permanent memory. Exclude deleted documents from subsequent retrieval.
- If my tasks need tool execution, implement a bounded tool loop with validated inputs, timeouts, a maximum step count and visible progress. Start with internal tools for tasks, saved documents and outputs. Record outcomes durably. Require preview and confirmation before external sends, destructive changes or other consequential writes; deduplicate retries and reconcile uncertain outcomes before resubmission.
- Add only the external integrations needed for the agreed scenarios. Missing integrations must show a setup path and an honest unavailable state. Never simulate successful sends, searches or scheduled reminders. Scheduling, if selected, requires a durable worker, timezone handling and recovery after restart; a browser timer is insufficient.
- Let me export and delete my data. Explain logging and retention; make payload capture an explicit configuration choice. Avoid secrets and personal content in diagnostic logs.

Use the existing stack if there is one. For a new repository propose a mainstream full-stack TypeScript app and durable database, then select a simple deployment compatible with my environment. Keep model access, tool execution and storage on the server. Include schema migrations and reproducible startup instructions.

## Application delivery and acceptance

Implement the smallest complete webapp for my chosen tasks with an existing stack when available. Save work on the backend and keep drafts recoverable. Demonstrate the selected tasks on desktop and narrow layouts, reopen results after refresh, and recover a failed request without duplicate writes. Treat integrations as unavailable until configured; never simulate successful sends or scheduled jobs.

Use bounded context, output, tool iterations, timeouts and concurrency. An application estimate does not guarantee an exact spending cap; document Niu key/workspace limits as an additional control. A stopped browser wait does not establish upstream cancellation or settled billing. Never silently repeat a paid request after an uncertain outcome.

Prepare reproducible deployment, durable storage, migrations, backup/restore and operational instructions. Obtain my approval before publishing or connecting production services. Report app task outcomes, selected models, measured latency/customer charges and unverified behavior. Keep infrastructure costs distinct from Niu model charges.

## Start now

Inspect the repository and connected Niu MCP tool descriptions. Ask the bundled task/budget questions and begin the Discover checkpoint. Use the current tools as the contract. Continue obtaining machine-readable evidence yourself; involve me for task choices, configuration decisions and review of working results.
