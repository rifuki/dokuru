use std::net::SocketAddr;

use axum::http::{HeaderMap, header};

/// Returns true only for browser requests that reached the agent through the
/// local loopback interface, not through a reverse proxy or public tunnel.
pub fn is_trusted_loopback_request(headers: &HeaderMap, client_addr: SocketAddr) -> bool {
    client_addr.ip().is_loopback()
        && host_header_is_loopback(headers)
        && !has_forwarded_client_header(headers)
}

fn host_header_is_loopback(headers: &HeaderMap) -> bool {
    let Some(host) = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };

    let hostname = host_header_hostname(host).to_ascii_lowercase();
    matches!(hostname.as_str(), "localhost" | "127.0.0.1" | "::1")
}

fn host_header_hostname(host: &str) -> &str {
    let host = host.trim();

    if let Some(rest) = host.strip_prefix('[') {
        return rest.split(']').next().unwrap_or(rest);
    }

    host.split(':').next().unwrap_or(host)
}

fn has_forwarded_client_header(headers: &HeaderMap) -> bool {
    headers.contains_key(header::FORWARDED)
        || headers.contains_key("x-forwarded-for")
        || headers.contains_key("x-real-ip")
        || headers.contains_key("cf-connecting-ip")
        || headers.contains_key("true-client-ip")
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn addr(ip: &str) -> SocketAddr {
        format!("{ip}:51122").parse().expect("valid socket addr")
    }

    fn headers(host: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::HOST,
            HeaderValue::from_str(host).expect("valid host"),
        );
        headers
    }

    #[test]
    fn trusts_localhost_over_loopback_socket() {
        assert!(is_trusted_loopback_request(
            &headers("localhost:3939"),
            addr("127.0.0.1")
        ));
        assert!(is_trusted_loopback_request(
            &headers("127.0.0.1:3939"),
            addr("127.0.0.1")
        ));
    }

    #[test]
    fn rejects_public_host_even_when_proxy_connects_from_loopback() {
        assert!(!is_trusted_loopback_request(
            &headers("reviews-richards-charming-veteran.trycloudflare.com"),
            addr("127.0.0.1"),
        ));
    }

    #[test]
    fn rejects_forwarded_requests() {
        let mut headers = headers("localhost:3939");
        headers.insert("cf-connecting-ip", HeaderValue::from_static("203.0.113.10"));

        assert!(!is_trusted_loopback_request(&headers, addr("127.0.0.1")));
    }

    #[test]
    fn rejects_lan_clients() {
        assert!(!is_trusted_loopback_request(
            &headers("localhost:3939"),
            addr("192.168.1.20")
        ));
    }
}
