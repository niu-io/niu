# Personal assistant — built with Niu

A runnable outcome for [Build with Niu](https://niu.io/docs/guides/personal-assistant/). Paste notes, generate an action plan and follow-up draft through Niu, edit the result and reopen it from durable local storage. No messages are sent. This is a small complete workflow to extend with your coding agent, not a hosted Niu application.

Give your coding agent this instruction:

> Run `examples/personal-assistant` from this checkout (or copy that directory into a new repository). Read its README, install dependencies and configure its server-side `.env`. Use Niu MCP to discover a model my key can access. Ask me to enter a workspace API key securely, outside chat and Git. Start the app and give me the local URL. Load `fixtures/meeting.txt` and show me the intended workflow. Before making a paid request, agree on a bounded test with me. Verify the result against `fixtures/acceptance.md`, edit/save it and reopen it after restart. Read the Niu diagnostics yourself and help me review the request in Niu.

## Agent setup

Requires Node 24+ and npm. Run commands from this directory; this example is intentionally independent of the main workspace package install.

```sh
npm install --workspaces=false
cp .env.example .env
# Configure .env securely, then:
npm run dev
```

Open the URL printed by the server (default `http://127.0.0.1:4370`). `NIU_MODEL` must be an explicit accessible model, discovered through MCP; no model is guessed. `NIU_API_KEY` stays on the server. The model must support Chat Completions and `max_tokens`. The example requests at most 1,200 output tokens, uses a 60-second timeout and never retries automatically. Sample acceptance is a rubric, not prerecorded output. Every generation sends a real request to the configured Niu deployment and may incur charges.

The app uses Vite's local development server with a Node backend and SQLite at `.data/assistant.db`. That file contains notes and generated results; include it in backups and remove it deliberately when resetting local data. Browser storage is not used. In-flight records become interrupted on restart. Uncertain outcomes must be checked in Niu Logs before a new attempt. Click Save changes to persist edited output.

The backend saves Niu's returned attempt reference with each work record, including failed responses when a reference is available. Your coding agent can read `GET /api/work/:id` and use `niu_attempt_id` with Niu's `get_generation` tool; the interface does not display internal IDs. When no response reference was received, keep execution/charges uncertain and inspect Logs before another request. Review requests in the Niu workspace's Logs by model and time; the server attaches the harmless `personal-assistant-example` task tag. Payload capture is disabled. This app does not fetch customer charges; use Niu or have your agent inspect the generation through MCP. Unknown charges must not be treated as zero. Model inference cost and local infrastructure cost are separate.

## Scope and verification

`npm test` tests persistence, secret boundaries, invalid inputs, upstream failures and uncertain outcomes using a local fake upstream. It does not establish live Niu model compatibility or performance. `npm run build` checks the frontend build; use `npm run dev` to run the integrated example. Do not expose this development server publicly: it binds loopback and has no user authentication. A production deployment needs authentication, ownership controls, HTTPS, rate limits and protected durable storage.

The frontend uses installed shadcn primitives copied from Niu's dashboard, Radix UI, React and Niu theme tokens. shadcn/ui is MIT licensed, copyright (c) 2023 shadcn; Niu attribution is retained in LICENSE. Extend this source with your coding agent for your own tasks.
