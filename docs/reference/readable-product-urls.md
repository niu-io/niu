# Readable product URLs

Workspaces, Providers, and API key detail pages use stable slugs in browser URLs.
Internal UUIDs remain unchanged in storage, authorization, and existing API
contracts. A slug is a routing reference, never an authorization grant.

Workspace creation presents Name and Slug separately, following the inspected
OpenRouter workspace creation flow. The slug updates with the name until the
user edits it. Chinese names produce lowercase, toneless pinyin; whitespace,
punctuation, and other separators collapse into single hyphens. Accents and
full-width Latin characters normalize to ASCII. Empty normalized names use a
readable fallback. A chosen slug must contain 1–48 lowercase ASCII letters,
numbers, or single separating hyphens. `default` is reserved for workspace
selection. Duplicate chosen workspace slugs return an actionable conflict;
server-generated slugs use numeric suffixes when needed.

Saved slugs do not change when display names change. Existing workspace URLs
with UUID suffixes are retained as durable aliases. Provider and key UUID
bookmarks still resolve, then redirect to the canonical slug without dropping
the section, query, or fragment. Provider slugs are globally unique. Key slugs
are unique within their workspace, including retained revoked keys. Rotation
creates a distinct key slug and preserves the previous key's history.

## Route audit

| Surface | URL identity |
| --- | --- |
| Workspace pages and workspace query scopes | Durable workspace slug |
| Provider administration, portal, navigation, and financial report links | Durable Provider slug |
| API key detail, edit links, Generations key selection, and key-detail-to-Logs links | Durable key slug within the workspace |
| Models | Existing model aliases |
| Account settings, users, pricing, pools, and payment configuration | Section routes; selected records stay in page state |
| Logs key filters and Activity key drill-downs | Authorized key slug; legacy `keyId` bookmarks resolve and canonicalize while retaining filters and request fragments |
| Saved video task reads and Library source links | Permanent public run reference (`run-1000`); legacy UUID reads remain authorized aliases and canonicalize after resolution |
| Chat sessions / Video sessions / saved video inputs | Permanent `chat-`, `video-`, and `input-` references; authorized legacy UUID reads canonicalize after resolution |
| Request drill-downs from Logs, Activity, Chat and Video | Permanent `run-` reference in the request fragment; legacy attempt UUIDs resolve within the authorized workspace |

Session and request references remain durable, authorized, and directly
resolvable outside a limited history page. Prompt-derived slugs would expose content in URLs and should not
be used as a shortcut.

## Saved video run references

Run references are allocated independently of internal UUIDs and private prompt
content. They are permanent even when a displayed model or asset name changes.
A reference is not a permission grant: resolution is scoped to the current
workspace and applies the same actor-private session and intent checks as saved
history. Missing and unauthorized source tasks return the same not-found result.

Library metadata includes original-generation context only when the requesting
actor can read that task. Workspace access to a retained copy does not grant
access to its private source. API clients continue to use the resolved internal
identifier for diagnostics and mutations; accepting public references on saved
reads does not widen those action contracts. Canonical browser navigation retains
other query parameters and the fragment.

## Saved sessions and inputs

Public references are server-generated and immutable. Saved input dispatch, erasure,
and session mutations retain their internal UUID contracts. The client resolves a
public bookmark first and uses the returned internal identity for subsequent actions.
Session and turn UUID query hints are removed after the saved record supplies its
authoritative binding. This preserves continuation without putting internal context
identifiers in newly generated links. Chat reference resolution remains owner-scoped.
