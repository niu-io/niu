# Platform currency

An installation has one currency, configured once by a platform administrator in
**Admin → Settings → Platform currency**. Every new company, workspace
budget, API key budget, selling price, Provider rate, approved credit and top-up
uses that currency. Other product forms display the currency as a unit rather
than offering a currency setting. Reporting uses the configured currency.

The setting is persisted in PostgreSQL. `GET /v1/currency` is public and returns
`{"data":{"currency":null}}` before setup. `PUT /api/v1/platform/currency` accepts
`{"currency":"CNY"}` with platform administrator authorization. Repeating the
same value is safe. A different value returns 409; the database also rejects
updates and deletion. Configure deliberately: changing accounting units is a
financial migration, not a display preference.

Currency guards reject new financial configuration in a different currency,
including accounts, Provider offers, customer tariffs, retail price identities,
media rates, spending limits, noncash grants and top-up orders. Existing API
currency fields remain for compatibility and must match after configuration.
Omitted currency during company creation inherits the platform setting.

Historical records retain their original currency and amounts. No exchange rate,
conversion, or relabeling is implied. Existing accounts and terms are not rewritten. Existing prepaid companies receive an additional zero-funded account in the configured currency when needed; balances are never transferred. Legacy postpaid companies remain postpaid. Before setup, existing API workflows retain their legacy behavior;
the dashboard requires setup before entering new monetary configuration. The
currency endpoint exposes no balances, procurement prices or credentials.

The settings page offers searchable currency names, codes and symbols. Saving requires a final review because changing the configured currency requires a data migration. Load failures offer retry rather than presenting an empty setup form; financial reports link to settings while setup is incomplete.
