use crate::{Store, StoreError};
impl Store {
    pub async fn platform_currency(&self) -> Result<Option<String>, StoreError> {
        Ok(
            sqlx::query_scalar("SELECT currency FROM platform_currency WHERE singleton")
                .fetch_optional(&self.pool)
                .await?,
        )
    }
    /// A repeat of the same configuration is safe; a different value never converts money.
    pub async fn configure_platform_currency(&self, currency: &str) -> Result<(), StoreError> {
        if !PLATFORM_CURRENCIES.contains(&currency) {
            return Err(StoreError::InvalidPrice);
        }
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu-platform-currency',0))")
            .execute(&mut *tx)
            .await?;
        let saved: Option<String> =
            sqlx::query_scalar("SELECT currency FROM platform_currency WHERE singleton")
                .fetch_optional(&mut *tx)
                .await?;
        match saved {
            Some(saved) if saved != currency => return Err(StoreError::Conflict),
            Some(_) => {}
            None => {
                sqlx::query("INSERT INTO platform_currency(currency) VALUES($1)")
                    .bind(currency)
                    .execute(&mut *tx)
                    .await?;
            }
        }
        // Provision the configured unit for existing prepaid companies without
        // moving funds or changing legacy postpaid organizations into prepaid.
        sqlx::query("INSERT INTO customer_balance_accounts(id,organization_id,currency) SELECT gen_random_uuid(),organization_id,$1 FROM (SELECT DISTINCT organization_id FROM customer_balance_accounts) companies ON CONFLICT (organization_id,currency) DO NOTHING")
            .bind(currency).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
}

// ISO 4217 accounting units supported by the dashboard runtime (ICU).
const PLATFORM_CURRENCIES: &[&str] = &[
    "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT",
    "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD",
    "CDF", "CHF", "CLP", "CNY", "COP", "CRC", "CUC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP",
    "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD", "GNF",
    "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK",
    "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK",
    "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU",
    "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR",
    "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR",
    "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SLL", "SOS", "SRD", "SSP", "STN", "SVC",
    "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX",
    "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XDR", "XOF", "XPF",
    "XSU", "YER", "ZAR", "ZMW", "ZWG", "ZWL",
];
