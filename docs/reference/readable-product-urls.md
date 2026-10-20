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
| API key detail, edit links, and newly issued-key Generations links | Durable key slug within the workspace |
| Models | Existing model aliases |
| Account settings, users, pricing, pools, and payment configuration | Section routes; selected records stay in page state |
| Generations sessions, saved video inputs/jobs, request drill-downs, and diagnostic key filters | Existing record references; still contain internal identifiers and need a separate public-reference migration |

The last row is an explicit remaining boundary of this change. Do not treat this
as evidence that all browser URLs are UUID-free. Session or request references
must remain durable, authorized, and directly resolvable outside a limited
history page. Prompt-derived slugs would expose content in URLs and should not
be used as a shortcut.
