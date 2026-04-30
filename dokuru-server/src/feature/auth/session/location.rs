use std::{
    net::{IpAddr, Ipv6Addr},
    time::Duration,
};

use axum::http::HeaderMap;
use serde::Deserialize;

use super::DeviceInfo;

#[derive(Debug, Deserialize)]
struct IpApiCoResponse {
    city: Option<String>,
    region: Option<String>,
    country_name: Option<String>,
    country: Option<String>,
    error: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct IpWhoIsResponse {
    success: Option<bool>,
    city: Option<String>,
    region: Option<String>,
    country: Option<String>,
}

#[derive(Debug, Deserialize)]
struct IpApiResponse {
    status: Option<String>,
    city: Option<String>,
    #[serde(rename = "regionName")]
    region_name: Option<String>,
    country: Option<String>,
}

pub async fn device_info_from_headers(headers: &HeaderMap) -> DeviceInfo {
    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("Unknown");

    let ip_address = client_ip_from_headers(headers);
    let location = lookup_ip_location(&ip_address).await;

    DeviceInfo::from_user_agent(user_agent, &ip_address).with_location(location)
}

pub fn client_ip_from_headers(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(parse_ip_list)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .and_then(parse_ip_candidate)
        })
        .or_else(|| {
            headers
                .get("forwarded")
                .and_then(|value| value.to_str().ok())
                .and_then(parse_forwarded_header)
        })
        .unwrap_or_else(|| "0.0.0.0".to_string())
}

#[must_use]
pub fn display_ip_address(ip: &str) -> String {
    normalized_ip(ip).unwrap_or_else(|| ip.to_string())
}

pub async fn lookup_ip_location(ip: &str) -> Option<String> {
    let ip = normalized_ip(ip)?;
    let ip_addr = ip.parse::<IpAddr>().ok()?;
    if !is_public_ip(ip_addr) {
        return None;
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .ok()?;

    if let Some(location) = lookup_ipapi_co(&client, &ip).await {
        return Some(location);
    }
    if let Some(location) = lookup_ipwho_is(&client, &ip).await {
        return Some(location);
    }
    if let Some(location) = lookup_ip_api(&client, &ip).await {
        return Some(location);
    }

    tracing::warn!(ip, "Failed to resolve session IP location");
    None
}

async fn lookup_ipapi_co(client: &reqwest::Client, ip: &str) -> Option<String> {
    let url = format!("https://ipapi.co/{ip}/json/");
    let geo = client
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json::<IpApiCoResponse>()
        .await
        .ok()?;

    if geo.error.unwrap_or(false) {
        return None;
    }

    format_location([
        geo.city.as_deref(),
        geo.region.as_deref(),
        geo.country_name.as_deref().or(geo.country.as_deref()),
    ])
}

async fn lookup_ipwho_is(client: &reqwest::Client, ip: &str) -> Option<String> {
    let url = format!("https://ipwho.is/{ip}");
    let geo = client
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json::<IpWhoIsResponse>()
        .await
        .ok()?;

    if geo.success == Some(false) {
        return None;
    }

    format_location([
        geo.city.as_deref(),
        geo.region.as_deref(),
        geo.country.as_deref(),
    ])
}

async fn lookup_ip_api(client: &reqwest::Client, ip: &str) -> Option<String> {
    let url = format!("http://ip-api.com/json/{ip}?fields=status,country,regionName,city");
    let geo = client
        .get(url)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json::<IpApiResponse>()
        .await
        .ok()?;

    if geo.status.as_deref() != Some("success") {
        return None;
    }

    format_location([
        geo.city.as_deref(),
        geo.region_name.as_deref(),
        geo.country.as_deref(),
    ])
}

fn parse_ip_list(value: &str) -> Option<String> {
    value.split(',').find_map(parse_ip_candidate)
}

fn parse_forwarded_header(value: &str) -> Option<String> {
    value.split(',').find_map(|entry| {
        entry.split(';').find_map(|part| {
            let (key, value) = part.trim().split_once('=')?;
            if key.eq_ignore_ascii_case("for") {
                parse_ip_candidate(value)
            } else {
                None
            }
        })
    })
}

fn parse_ip_candidate(value: &str) -> Option<String> {
    let candidate = value.trim().trim_matches('"');
    let host = if let Some(rest) = candidate.strip_prefix('[') {
        rest.split_once(']')?.0
    } else if candidate.matches(':').count() == 1 && candidate.contains('.') {
        candidate.rsplit_once(':')?.0
    } else {
        candidate
    };

    host.parse::<IpAddr>().ok().map(|ip| ip.to_string())
}

fn normalized_ip(ip: &str) -> Option<String> {
    let candidate = ip
        .trim()
        .split_once('/')
        .map_or_else(|| ip.trim(), |(ip, _)| ip);
    candidate.parse::<IpAddr>().ok().map(|ip| ip.to_string())
}

fn format_location<const N: usize>(parts: [Option<&str>; N]) -> Option<String> {
    let mut formatted: Vec<String> = Vec::new();

    for part in parts.into_iter().flatten() {
        let part = part.trim();
        if !part.is_empty()
            && !formatted
                .iter()
                .any(|existing| existing.eq_ignore_ascii_case(part))
        {
            formatted.push(part.to_string());
        }
    }

    if formatted.is_empty() {
        None
    } else {
        Some(formatted.join(", "))
    }
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_unspecified()
                || ip.is_multicast()
                || octets[0] == 0
                || (octets[0] == 100 && (64..=127).contains(&octets[1])))
        }
        IpAddr::V6(ip) => {
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || is_ipv6_unique_local(ip)
                || is_ipv6_link_local(ip)
                || is_ipv6_documentation(ip))
        }
    }
}

const fn is_ipv6_unique_local(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

const fn is_ipv6_link_local(ip: Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xffc0) == 0xfe80
}

const fn is_ipv6_documentation(ip: Ipv6Addr) -> bool {
    ip.segments()[0] == 0x2001 && ip.segments()[1] == 0x0db8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn client_ip_uses_first_forwarded_ip() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "8.8.8.8, 10.0.0.12".parse().unwrap());

        assert_eq!(client_ip_from_headers(&headers), "8.8.8.8");
    }

    #[test]
    fn client_ip_strips_ipv4_port() {
        let mut headers = HeaderMap::new();
        headers.insert("x-real-ip", "8.8.4.4:51234".parse().unwrap());

        assert_eq!(client_ip_from_headers(&headers), "8.8.4.4");
    }

    #[test]
    fn forwarded_header_supports_quoted_ipv6() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "forwarded",
            "for=\"[2001:4860:4860::8888]:443\";proto=https"
                .parse()
                .unwrap(),
        );

        assert_eq!(client_ip_from_headers(&headers), "2001:4860:4860::8888");
    }

    #[test]
    fn public_ip_filter_skips_local_ranges() {
        assert!(!is_public_ip("127.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("10.0.0.1".parse().unwrap()));
        assert!(!is_public_ip("100.64.0.1".parse().unwrap()));
        assert!(!is_public_ip("::1".parse().unwrap()));
        assert!(!is_public_ip("fc00::1".parse().unwrap()));
        assert!(is_public_ip("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn format_location_omits_duplicate_parts() {
        assert_eq!(
            format_location([Some("Singapore"), Some("Singapore"), Some("Singapore")]).as_deref(),
            Some("Singapore")
        );
    }

    #[test]
    fn display_ip_strips_cidr_suffix() {
        assert_eq!(display_ip_address("103.121.102.124/32"), "103.121.102.124");
    }
}
