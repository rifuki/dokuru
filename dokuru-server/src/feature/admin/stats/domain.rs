use std::time::Duration;

use crate::feature::admin::stats::dto::{ComponentHealth, HealthStatus};

const HEALTHY_RESPONSE_TIME_THRESHOLD_MS: u64 = 50;

#[must_use]
pub const fn component_health(is_available: bool, response_time_ms: u64) -> ComponentHealth {
    let status = if !is_available {
        HealthStatus::Down
    } else if response_time_ms < HEALTHY_RESPONSE_TIME_THRESHOLD_MS {
        HealthStatus::Healthy
    } else {
        HealthStatus::Degraded
    };

    ComponentHealth {
        status,
        response_time_ms,
    }
}

#[must_use]
pub fn duration_millis_u64(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

#[must_use]
pub fn relay_agents_count(count: usize) -> i64 {
    i64::try_from(count).unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_component_health_from_availability_and_latency() {
        assert_eq!(component_health(true, 49).status, HealthStatus::Healthy);
        assert_eq!(component_health(true, 50).status, HealthStatus::Degraded);
        assert_eq!(component_health(false, 1).status, HealthStatus::Down);
    }

    #[test]
    fn converts_durations_to_saturating_millis() {
        assert_eq!(duration_millis_u64(Duration::from_millis(42)), 42);
        assert_eq!(
            duration_millis_u64(Duration::from_millis(u64::MAX) + Duration::from_millis(1)),
            u64::MAX,
        );
    }

    #[test]
    fn converts_agent_count_to_saturating_i64() {
        assert_eq!(relay_agents_count(42), 42);
        assert_eq!(relay_agents_count(usize::MAX), i64::MAX);
    }
}
