use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuditSummary {
    pub total: i32,
    pub passed: i32,
    pub failed: i32,
    pub score: i32,
}

impl AuditSummary {
    pub fn from_wire(total: usize, passed: usize, failed: usize, score: u8) -> Self {
        Self {
            total: usize_to_i32_or_zero(total),
            passed: usize_to_i32_or_zero(passed),
            failed: usize_to_i32_or_zero(failed),
            score: i32::from(score),
        }
    }

    pub const fn from_record(total: i32, passed: i32, failed: i32, score: i32) -> Self {
        Self {
            total,
            passed,
            failed,
            score,
        }
    }
}

pub fn usize_to_i32_or_zero(value: usize) -> i32 {
    i32::try_from(value).unwrap_or(0)
}

pub fn calculate_score(total: usize, passed: usize) -> u8 {
    if total == 0 {
        return 100;
    }

    let percentage = passed.saturating_mul(100) / total;
    u8::try_from(percentage.min(100)).unwrap_or(100)
}

pub fn parse_ran_at_or_now(timestamp: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(timestamp).map_or_else(|_| Utc::now(), |dt| dt.with_timezone(&Utc))
}

pub fn parse_ran_at(timestamp: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_wire_summary_to_storage_summary() {
        let summary = AuditSummary::from_wire(10, 8, 2, 80);

        assert_eq!(
            summary,
            AuditSummary {
                total: 10,
                passed: 8,
                failed: 2,
                score: 80,
            }
        );
    }

    #[test]
    fn overflowing_usize_converts_to_zero_to_match_existing_storage_behavior() {
        let huge = usize::MAX;

        assert_eq!(usize_to_i32_or_zero(huge), 0);
    }

    #[test]
    fn calculates_score_from_passed_and_total() {
        assert_eq!(calculate_score(10, 8), 80);
        assert_eq!(calculate_score(3, 2), 66);
        assert_eq!(calculate_score(0, 0), 100);
        assert_eq!(calculate_score(10, 12), 100);
    }

    #[test]
    fn parses_rfc3339_timestamp_to_utc() {
        let parsed = parse_ran_at("2026-04-21T05:00:00+07:00").unwrap();

        assert_eq!(parsed.to_rfc3339(), "2026-04-20T22:00:00+00:00");
    }

    #[test]
    fn invalid_timestamp_returns_none_for_strict_parse() {
        assert!(parse_ran_at("not-a-date").is_none());
    }
}
