use std::time::{Duration, Instant};

use chrono::{SecondsFormat, Utc};
use reqwest::{Client, StatusCode, Url};
use tokio::task::JoinSet;

use crate::models::connection_status::{
    ConnectivityClassification, ConnectivityReport, ProbeOutcome, ProbeResult,
};
use crate::models::settings::{ProbeEndpoint, Settings};

const MAX_BODY_BYTES: usize = 256 * 1024;
const USER_AGENT: &str = "AirLink/1.0 (macOS) CaptivePortalProbe";

/// Performs active connectivity probes and classifies the result.
///
/// The detector is intentionally conservative: a failed connection is not a
/// captive portal. A portal is only reported on an HTTP redirect, an explicit
/// 511 response, or content that clearly replaces the expected probe response.
#[derive(Debug, Clone)]
pub struct CaptivePortalDetector;

impl CaptivePortalDetector {
    /// Full check: HTTP probes detect interception, HTTPS probes establish
    /// whether the Mac genuinely has internet access.
    pub async fn check(&self, settings: &Settings) -> ConnectivityReport {
        let timeout = Duration::from_secs(settings.probe_timeout_secs);
        let client = match build_client(timeout) {
            Ok(client) => client,
            Err(error) => {
                return ConnectivityReport {
                    classification: ConnectivityClassification::NetworkError,
                    detail: format!("Could not create the network probe client: {error}"),
                    checked_at: now(),
                    ..ConnectivityReport::default()
                };
            }
        };

        let (http_results, https_results) = tokio::join!(
            probe_all(client.clone(), &settings.http_probes, timeout),
            probe_all(client, &settings.https_probes, timeout)
        );

        let mut probes = Vec::with_capacity(http_results.len() + https_results.len());
        probes.extend(http_results);
        probes.extend(https_results);
        classify_report(probes)
    }

    /// Verification is deliberately stricter than detection: we require a
    /// fresh HTTPS success from the system network path. A browser cookie or a
    /// successfully submitted form is not accepted as proof of authentication.
    pub async fn verify_internet(&self, settings: &Settings) -> ConnectivityReport {
        let mut last_report = None;
        for attempt in 0..3 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(1_200)).await;
            }
            let mut attempt_settings = settings.clone();
            // Keep each verification attempt snappy.
            attempt_settings.probe_timeout_secs = settings.probe_timeout_secs.min(5);
            let report = self.check(&attempt_settings).await;
            if report.internet_available {
                return report;
            }
            last_report = Some(report);
        }
        last_report.unwrap_or_default()
    }
}

fn build_client(timeout: Duration) -> Result<Client, reqwest::Error> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout)
        .connect_timeout(Duration::from_secs(5))
        .no_proxy()
        .user_agent(USER_AGENT)
        .pool_max_idle_per_host(0)
        .build()
}

async fn probe_all(
    client: Client,
    endpoints: &[ProbeEndpoint],
    timeout: Duration,
) -> Vec<ProbeResult> {
    let mut set = JoinSet::new();
    for endpoint in endpoints.iter().cloned() {
        let client = client.clone();
        set.spawn(async move { probe(client, endpoint, timeout).await });
    }

    let mut results = Vec::new();
    while let Some(result) = set.join_next().await {
        match result {
            Ok(probe) => results.push(probe),
            Err(error) => log::debug!("probe task failed: {error}"),
        }
    }
    // Keep results in a stable order (HTTP probes are supplied first).
    results.sort_by(|a, b| a.url.cmp(&b.url));
    results
}

async fn probe(client: Client, endpoint: ProbeEndpoint, _timeout: Duration) -> ProbeResult {
    let started = Instant::now();
    let protocol = if endpoint.url.starts_with("https://") {
        "https"
    } else {
        "http"
    };

    let parsed = match Url::parse(&endpoint.url) {
        Ok(url) => url,
        Err(error) => {
            return ProbeResult {
                url: endpoint.url,
                protocol: protocol.into(),
                outcome: ProbeOutcome::UnexpectedResponse,
                status: None,
                latency_ms: elapsed_ms(started),
                location: None,
                message: format!("Invalid probe URL: {error}"),
            };
        }
    };

    let response = match client.get(parsed.clone()).send().await {
        Ok(response) => response,
        Err(error) => {
            let outcome = classify_error(&error);
            return ProbeResult {
                url: endpoint.url,
                protocol: protocol.into(),
                outcome,
                status: None,
                latency_ms: elapsed_ms(started),
                location: None,
                message: clean_error(&error),
            };
        }
    };

    let status = response.status();
    let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string)
        .map(|value| resolve_location(&parsed, &value))
        .filter(|value| is_safe_url(value));

    if status.is_redirection() {
        return ProbeResult {
            url: endpoint.url,
            protocol: protocol.into(),
            outcome: ProbeOutcome::Redirect,
            status: Some(status.as_u16()),
            latency_ms: elapsed_ms(started),
            location: location.clone(),
            message: match &location {
                Some(location) => format!("The network redirected the request to {location}."),
                None => "The network returned a redirect without a usable destination.".into(),
            },
        };
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();

    let body = match response.bytes().await {
        Ok(bytes) => {
            let end = bytes.len().min(MAX_BODY_BYTES);
            String::from_utf8_lossy(&bytes[..end]).to_string()
        }
        Err(error) => {
            return ProbeResult {
                url: endpoint.url,
                protocol: protocol.into(),
                outcome: ProbeOutcome::ConnectionFailure,
                status: Some(status.as_u16()),
                latency_ms: elapsed_ms(started),
                location,
                message: clean_error(&error),
            };
        }
    };

    let expected_status = endpoint.expected_status.unwrap_or(204);
    let expected_body_matches = endpoint
        .expected_body_contains
        .as_ref()
        .map(|needle| contains_case_insensitive(&body, needle))
        .unwrap_or(true);
    let status_matches = status.as_u16() == expected_status;

    if status_matches && expected_body_matches {
        return ProbeResult {
            url: endpoint.url,
            protocol: protocol.into(),
            outcome: ProbeOutcome::Internet,
            status: Some(status.as_u16()),
            latency_ms: elapsed_ms(started),
            location,
            message: "Expected response received.".into(),
        };
    }

    let is_html = content_type.contains("text/html") || looks_like_html(&body);
    let portal_signal = status == StatusCode::NETWORK_AUTHENTICATION_REQUIRED
        || (is_html && looks_like_portal(&body))
        || (is_html && !expected_body_matches && !body.trim().is_empty());

    if portal_signal {
        let portal_url = location.clone().unwrap_or_else(|| parsed.to_string());
        return ProbeResult {
            url: endpoint.url,
            protocol: protocol.into(),
            outcome: ProbeOutcome::PortalContent,
            status: Some(status.as_u16()),
            latency_ms: elapsed_ms(started),
            location: Some(portal_url),
            message: "The response was replaced by a sign-in page.".into(),
        };
    }

    ProbeResult {
        url: endpoint.url,
        protocol: protocol.into(),
        outcome: if status.is_success() {
            ProbeOutcome::UnexpectedResponse
        } else {
            ProbeOutcome::HttpError
        },
        status: Some(status.as_u16()),
        latency_ms: elapsed_ms(started),
        location,
        message: format!(
            "Unexpected response (HTTP {}) from the connectivity test.",
            status.as_u16()
        ),
    }
}

fn classify_report(probes: Vec<ProbeResult>) -> ConnectivityReport {
    let checked_at = now();
    let http_results: Vec<&ProbeResult> = probes.iter().filter(|p| p.protocol == "http").collect();
    let https_results: Vec<&ProbeResult> =
        probes.iter().filter(|p| p.protocol == "https").collect();

    let http_ok = http_results
        .iter()
        .any(|probe| probe.outcome == ProbeOutcome::Internet);
    let https_ok = https_results
        .iter()
        .any(|probe| probe.outcome == ProbeOutcome::Internet);

    let portal_probe = http_results
        .iter()
        .chain(https_results.iter())
        .find(|probe| {
            matches!(
                probe.outcome,
                ProbeOutcome::Redirect | ProbeOutcome::PortalContent
            )
        });

    let portal_suspected = portal_probe.is_some();
    let all_dns = !probes.is_empty()
        && probes
            .iter()
            .all(|probe| probe.outcome == ProbeOutcome::DnsFailure);

    let classification = if https_ok {
        ConnectivityClassification::Internet
    } else if portal_suspected {
        ConnectivityClassification::CaptivePortal
    } else if all_dns {
        ConnectivityClassification::DnsFailure
    } else if probes.iter().all(|probe| {
        matches!(
            probe.outcome,
            ProbeOutcome::Timeout | ProbeOutcome::ConnectionFailure
        )
    }) {
        ConnectivityClassification::NetworkError
    } else {
        ConnectivityClassification::NoInternet
    };

    let latency_ms = probes
        .iter()
        .filter(|probe| probe.outcome == ProbeOutcome::Internet)
        .map(|probe| probe.latency_ms)
        .min();

    let detail = match classification {
        ConnectivityClassification::Internet => {
            "A verified HTTPS connection to the internet is available.".to_string()
        }
        ConnectivityClassification::CaptivePortal => format!(
            "The network is intercepting web traffic. Sign in through the portal{}.",
            portal_probe
                .and_then(|probe| probe.location.as_deref())
                .map(|url| format!(" at {url}"))
                .unwrap_or_default()
        ),
        ConnectivityClassification::DnsFailure => {
            "DNS lookups are failing. The Wi-Fi link is up, but names cannot be resolved."
                .to_string()
        }
        ConnectivityClassification::NetworkError => {
            "The connection tests could not reach the network. The link may have dropped."
                .to_string()
        }
        ConnectivityClassification::NoInternet => {
            "The network responds, but no internet connection could be verified.".to_string()
        }
        ConnectivityClassification::NotChecked => "Connection has not been checked.".to_string(),
    };

    ConnectivityReport {
        classification,
        internet_available: https_ok,
        http_ok,
        https_ok,
        dns_ok: !all_dns,
        portal_suspected,
        latency_ms,
        checked_at,
        probes,
        detail,
    }
}

fn classify_error(error: &reqwest::Error) -> ProbeOutcome {
    if error.is_timeout() {
        return ProbeOutcome::Timeout;
    }
    let chain = error_chain(error);
    if chain.contains("dns")
        || chain.contains("nodename nor servname")
        || chain.contains("failed to lookup")
        || chain.contains("name or service not known")
    {
        return ProbeOutcome::DnsFailure;
    }
    if chain.contains("certificate")
        || chain.contains("tls")
        || chain.contains("handshake")
        || chain.contains("ssl")
    {
        return ProbeOutcome::TlsError;
    }
    if error.is_connect() {
        return ProbeOutcome::ConnectionFailure;
    }
    ProbeOutcome::ConnectionFailure
}

fn error_chain(error: &reqwest::Error) -> String {
    let mut text = error.to_string().to_lowercase();
    let mut source: Option<&(dyn std::error::Error + 'static)> = std::error::Error::source(error);
    while let Some(current) = source {
        text.push(' ');
        text.push_str(&current.to_string().to_lowercase());
        source = current.source();
    }
    text
}

fn clean_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "The connection test timed out.".to_string()
    } else if error.is_connect() {
        "The network could not be reached.".to_string()
    } else {
        "The connection test failed.".to_string()
    }
}

fn resolve_location(base: &Url, value: &str) -> String {
    base.join(value)
        .map(|url| url.to_string())
        .unwrap_or_else(|_| value.to_string())
}

fn is_safe_url(value: &str) -> bool {
    Url::parse(value)
        .map(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
        .unwrap_or(false)
}

fn looks_like_html(body: &str) -> bool {
    let head = body.trim_start().to_ascii_lowercase();
    head.starts_with("<!doctype html") || head.starts_with("<html") || head.contains("<form")
}

fn looks_like_portal(body: &str) -> bool {
    let lower = body.to_ascii_lowercase();
    let signals = [
        "<form",
        "type=\"password\"",
        "type='password'",
        "sign in",
        "sign-in",
        "log in",
        "login",
        "captive",
        "authentication",
        "authorize",
        "network access",
        "terms of use",
        "accept",
        "http-equiv=\"refresh\"",
        "http-equiv='refresh'",
    ];
    signals
        .iter()
        .filter(|signal| lower.contains(**signal))
        .count()
        >= 2
        || lower.contains("<form")
        || lower.contains("type=\"password\"")
        || lower.contains("type='password'")
}

fn contains_case_insensitive(haystack: &str, needle: &str) -> bool {
    haystack
        .to_ascii_lowercase()
        .contains(&needle.to_ascii_lowercase())
}

fn elapsed_ms(started: Instant) -> u64 {
    started.elapsed().as_millis().min(u64::MAX as u128) as u64
}

pub fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// Extract the most useful portal URL from a connectivity report.
pub fn portal_url_from_report(report: &ConnectivityReport) -> Option<String> {
    report
        .probes
        .iter()
        .find(|probe| {
            probe.outcome == ProbeOutcome::Redirect
                && probe.location.as_deref().is_some_and(is_safe_url)
        })
        .and_then(|probe| probe.location.clone())
        .or_else(|| {
            report
                .probes
                .iter()
                .find(|probe| {
                    probe.outcome == ProbeOutcome::PortalContent
                        && probe.location.as_deref().is_some_and(is_safe_url)
                })
                .and_then(|probe| probe.location.clone())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe(url: &str, protocol: &str, outcome: ProbeOutcome) -> ProbeResult {
        ProbeResult {
            url: url.into(),
            protocol: protocol.into(),
            outcome,
            status: None,
            latency_ms: 10,
            location: None,
            message: String::new(),
        }
    }

    #[test]
    fn redirect_is_a_portal() {
        let mut redirect = probe("http://example.com", "http", ProbeOutcome::Redirect);
        redirect.location = Some("http://portal.example.edu/login".into());
        let report = classify_report(vec![
            redirect,
            probe(
                "https://example.com",
                "https",
                ProbeOutcome::ConnectionFailure,
            ),
        ]);
        assert_eq!(
            report.classification,
            ConnectivityClassification::CaptivePortal
        );
        assert!(report.portal_suspected);
        assert_eq!(
            portal_url_from_report(&report).as_deref(),
            Some("http://portal.example.edu/login")
        );
    }

    #[test]
    fn timeouts_are_not_portals() {
        let report = classify_report(vec![
            probe("http://example.com", "http", ProbeOutcome::Timeout),
            probe("https://example.com", "https", ProbeOutcome::Timeout),
        ]);
        assert_eq!(
            report.classification,
            ConnectivityClassification::NetworkError
        );
        assert!(!report.portal_suspected);
    }

    #[test]
    fn dns_failure_is_not_a_portal() {
        let report = classify_report(vec![
            probe("http://example.com", "http", ProbeOutcome::DnsFailure),
            probe("https://example.com", "https", ProbeOutcome::DnsFailure),
        ]);
        assert_eq!(
            report.classification,
            ConnectivityClassification::DnsFailure
        );
        assert!(!report.portal_suspected);
    }

    #[test]
    fn https_success_wins_even_if_http_probe_is_blocked() {
        let report = classify_report(vec![
            probe(
                "http://example.com",
                "http",
                ProbeOutcome::ConnectionFailure,
            ),
            probe("https://example.com", "https", ProbeOutcome::Internet),
        ]);
        assert_eq!(report.classification, ConnectivityClassification::Internet);
        assert!(report.internet_available);
    }

    #[test]
    fn portal_content_detection_is_conservative() {
        assert!(looks_like_portal(
            "<html><body><form><input type=\"password\"></form></body></html>"
        ));
        assert!(!looks_like_portal(
            "<html><body>Welcome to the campus homepage</body></html>"
        ));
    }

    #[test]
    fn relative_redirects_resolve() {
        let base = Url::parse("http://captive.apple.com/hotspot-detect.html").unwrap();
        assert_eq!(
            resolve_location(&base, "/login?next=1"),
            "http://captive.apple.com/login?next=1"
        );
    }
}
