//! Installation-only commercial projection. Authorization is enforced by the
//! HTTP boundary; no customer or Provider-member handler may reuse this read.
use crate::{Store, StoreError};
use serde_json::Value;

pub(crate) fn parse_rfc3339_ms(input: &str) -> Option<i64> {
    let bytes = input.as_bytes();
    if bytes.len() < 20 {
        return None;
    }
    if bytes[4] != b'-'
        || bytes[7] != b'-'
        || !matches!(bytes[10], b'T' | b't')
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return None;
    }
    let year: i64 = input.get(0..4)?.parse().ok()?;
    let month: u32 = input.get(5..7)?.parse().ok()?;
    let day: u32 = input.get(8..10)?.parse().ok()?;
    let hour: u32 = input.get(11..13)?.parse().ok()?;
    let minute: u32 = input.get(14..16)?.parse().ok()?;
    let second: u32 = input.get(17..19)?.parse().ok()?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }
    let is_leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap => 29,
        2 => 28,
        _ => return None,
    };
    if day > max_day {
        return None;
    }
    let mut idx = 19;
    let mut millis: i64 = 0;
    if bytes.get(idx) == Some(&b'.') {
        idx += 1;
        let frac_start = idx;
        while idx < bytes.len() && bytes[idx].is_ascii_digit() {
            idx += 1;
        }
        let frac_len = idx - frac_start;
        if frac_len == 0 || frac_len > 9 {
            return None;
        }
        for i in 0..3 {
            let digit = if i < frac_len {
                i64::from(bytes[frac_start + i] - b'0')
            } else {
                0
            };
            millis = millis * 10 + digit;
        }
    }
    let tz_offset_secs: i64 = match bytes.get(idx)? {
        b'Z' | b'z' => {
            if idx + 1 != bytes.len() {
                return None;
            }
            0
        }
        sign @ (b'+' | b'-') => {
            if idx + 6 != bytes.len() || bytes[idx + 3] != b':' {
                return None;
            }
            let tz_h: i64 = input.get(idx + 1..idx + 3)?.parse().ok()?;
            let tz_m: i64 = input.get(idx + 4..idx + 6)?.parse().ok()?;
            if tz_h > 23 || tz_m > 59 {
                return None;
            }
            let total = tz_h * 3600 + tz_m * 60;
            if *sign == b'+' { total } else { -total }
        }
        _ => return None,
    };
    let y = year - if month <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let m = i64::from(month);
    let d = i64::from(day);
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + i64::from(hour) * 3600 + i64::from(minute) * 60 + i64::from(second)
        - tz_offset_secs;
    Some(secs * 1000 + millis)
}

impl Store {
    /// Compare pinned commercial ledgers in one statement snapshot. Known zero
    /// amounts remain zero; absent amounts remain null. Never initiates payment
    /// or changes routing. Customer charges are not external cash receipts.
    pub async fn commercial_position(
        &self,
        currency: &str,
        days: i32,
    ) -> Result<Value, StoreError> {
        self.commercial_position_interval(currency, Some(days), None, None)
            .await
    }

    pub async fn commercial_position_interval(
        &self,
        currency: &str,
        days: Option<i32>,
        from: Option<&str>,
        until: Option<&str>,
    ) -> Result<Value, StoreError> {
        if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
            return Err(StoreError::InvalidPrice);
        }
        let (days_param, from_ms, until_ms) = match (days, from, until) {
            (_, Some(since_str), Some(end_str)) => {
                let Some(since_ms) = parse_rfc3339_ms(since_str) else {
                    return Err(StoreError::InvalidPrice);
                };
                let Some(end_ms) = parse_rfc3339_ms(end_str) else {
                    return Err(StoreError::InvalidPrice);
                };
                if since_ms < 0 || since_ms >= end_ms || end_ms - since_ms > 370 * 86_400_000 {
                    return Err(StoreError::InvalidPrice);
                }
                (None, Some(since_ms), Some(end_ms))
            }
            (Some(d), None, None) if matches!(d, 7 | 30 | 90) => (Some(d), None, None),
            (None, None, None) => (Some(30), None, None),
            _ => return Err(StoreError::InvalidPrice),
        };
        // Trigger provenance helpers are VOLATILE; a repeatable read keeps
        // their account/source reads consistent with all cohort aggregates.
        let mut tx = self.begin_bounded_financial_snapshot().await?;
        let (known_currency, position): (bool, Value) =
            sqlx::query_as(include_str!("commercial_position.sql"))
                .bind(currency)
                .bind(days_param)
                .bind(from_ms)
                .bind(until_ms)
                .fetch_one(&mut *tx)
                .await?;
        if !known_currency {
            return Err(StoreError::InvalidPrice);
        }
        tx.commit().await?;
        Ok(position)
    }
}

#[cfg(test)]
mod tests {
    use super::parse_rfc3339_ms;

    #[test]
    fn parses_rfc3339_timestamps_to_epoch_ms() {
        assert_eq!(parse_rfc3339_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_rfc3339_ms("1970-01-01T00:00:00.123Z"), Some(123));
        assert_eq!(
            parse_rfc3339_ms("2026-10-01T00:00:00.000Z"),
            Some(1_790_812_800_000)
        );
        assert_eq!(
            parse_rfc3339_ms("2026-10-01T08:00:00+08:00"),
            Some(1_790_812_800_000)
        );
        assert_eq!(parse_rfc3339_ms("2026-02-29T00:00:00Z"), None);
        assert_eq!(parse_rfc3339_ms("invalid"), None);
    }
}
