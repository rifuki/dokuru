use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    Extension,
    extract::{ConnectInfo, Request},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
struct Window {
    count: u32,
    reset_at: Instant,
}

#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<RateLimiterInner>,
}

struct RateLimiterInner {
    map: DashMap<IpAddr, Window>,
    max: u32,
    window: Duration,
}

impl RateLimiter {
    pub fn new(max: u32, window: Duration) -> Self {
        Self {
            inner: Arc::new(RateLimiterInner {
                map: DashMap::new(),
                max,
                window,
            }),
        }
    }

    fn is_allowed(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let mut entry = self.inner.map.entry(ip).or_insert_with(|| Window {
            count: 0,
            reset_at: now + self.inner.window,
        });

        if now >= entry.reset_at {
            entry.count = 1;
            entry.reset_at = now + self.inner.window;
            true
        } else if entry.count < self.inner.max {
            entry.count += 1;
            true
        } else {
            false
        }
    }

    pub fn cleanup(&self) {
        let now = Instant::now();
        self.inner.map.retain(|_, v| v.reset_at > now);
    }
}

pub async fn rate_limit_middleware(
    Extension(limiter): Extension<RateLimiter>,
    request: Request,
    next: Next,
) -> Response {
    // ConnectInfo is set by the server in production; falls back to localhost in tests
    let ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0.ip())
        .unwrap_or_else(|| IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));

    if limiter.is_allowed(ip) {
        next.run(request).await
    } else {
        (
            StatusCode::TOO_MANY_REQUESTS,
            "Rate limit exceeded. Please try again later.",
        )
            .into_response()
    }
}
