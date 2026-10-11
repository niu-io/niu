# Layered customer spending limits

## Actual cross-Gateway verification — 2026-10-11

Two native Gateway processes shared one isolated PostgreSQL database, one company,
two workspaces and three API keys. Current management APIs created all scopes,
keys, tariffs and policies. The configured customer price was an explicit internal
verification fee of 1,000,000 USD nanounits per request, with zero token rates.
Both workspaces initially had 10,000,000-nanounit spending limits; company approved
credit was 10,000,000 nanounits. There were no funding or Supplier qualification
records. OpenRouter access remained personal self-funded verification access,
not commercially qualified or discounted supply.

Keys A and B belonged to workspace A; key C belonged to workspace B. Key A had
a 1,000,000-nanounit cap, and B/C each had 4,000,000. Four simultaneous requests
across both Gateways used A twice, B once and C once. Exactly one A request
returned 402 `key_spending_limit_exceeded`; A's other request and both other keys
returned actual model output containing their fresh requested markers. Three
charges/debits settled with no remaining reservation.

The management API then reduced workspace A's limit to its existing commitment
of 2,000,000 nanounits. B still had key allowance and the company still had credit,
but another B call returned 402 `workspace_spending_limit_exceeded`. A new C call
through the other workspace succeeded and produced the fourth debit.

Reducing company approved credit to the resulting 4,000,000-nanounit consumption
made the next C call return 402 `budget_exceeded`, despite remaining key and
workspace allowance. Increasing approved credit to 5,000,000 restored company
capacity. B still failed its workspace limit, while C completed another actual
request. Credit-policy edits created no funding or other balance entries.

After restarting the Gateway, the company balance was -5,000,000 nanounits with
zero available capacity. A/B/C's remaining key allowances were respectively
0, 3,000,000 and 1,000,000 nanounits. All verification keys were then revoked.

## Independent final-artifact check

A separate process reopened the stopped database and rehashed all five saved
actual responses. It matched each fresh output marker and provider-reported token
count to the correct persisted attempt and key. Each charge used the attempt's
pinned tariff and equaled its single ledger debit. Per-key charges were exactly
1,000,000, 1,000,000 and 3,000,000 nanounits, attributed to the two workspaces within
one company. Independent commitment calculations reproduced all remaining key
allowances. Exactly five attempts and five charge entries remained, with no
funding, refund, open reservation or unrevoked key.

This verifies the observed fixed-fee, internal-credit text flow across layered
limits and two Gateway processes. It does not qualify externally funded payment,
video billing, unknown-usage liabilities, every rate combination or throughput
capacity. A key's remaining allowance alone is not overall admission capacity:
its workspace and shared company can independently deny a paid request.
