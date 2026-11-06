//! "Super Dev" local HTTP/HTTPS forward proxy.
//!
//! Some local Wi-Fi servers only answer on plain HTTP, and system browsers can
//! refuse or upgrade those links. When Super Dev is enabled, AirLink starts a
//! localhost-only proxy and points the active macOS network service at it.
//! Safari/Chrome then send their HTTP requests through AirLink.
//!
//! Security properties:
//! - Listens on 127.0.0.1 only.
//! - HTTP CONNECT tunnels are passed through untouched, so TLS certificates
//!   are still validated end-to-end by the browser.
//! - No TLS interception, no certificate bypass, no credential inspection.
//! - The previous proxy configuration is snapshotted and restored when Super
//!   Dev is turned off, the app exits, or the app starts after a crash.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use url::Url;

use crate::errors::AppError;

const MARKER_FILE: &str = ".super-dev-proxy.json";
const MAX_HEADER_BYTES: usize = 64 * 1024;
const PROXY_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SuperDevStatus {
    pub enabled: bool,
    pub port: Option<u16>,
    pub proxy_url: Option<String>,
    pub service: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProxyEndpoint {
    enabled: bool,
    server: String,
    port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct AutoProxy {
    enabled: bool,
    url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProxySnapshot {
    service: String,
    web: ProxyEndpoint,
    secure: ProxyEndpoint,
    #[serde(default)]
    auto_proxy: AutoProxy,
    #[serde(default)]
    auto_discovery: bool,
    #[serde(default)]
    socks: Option<ProxyEndpoint>,
    #[serde(default)]
    bypass_domains: Vec<String>,
}

struct RunningProxy {
    handle: tauri::async_runtime::JoinHandle<()>,
    port: u16,
    service: String,
    snapshot: ProxySnapshot,
    marker: PathBuf,
}

pub struct SuperDevManager {
    running: Mutex<Option<RunningProxy>>,
    marker: PathBuf,
}

impl SuperDevManager {
    pub fn new(config_dir: &Path) -> Self {
        Self {
            running: Mutex::new(None),
            marker: config_dir.join(MARKER_FILE),
        }
    }

    pub fn status(&self) -> SuperDevStatus {
        let running = self
            .running
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        match running.as_ref() {
            Some(proxy) => SuperDevStatus {
                enabled: true,
                port: Some(proxy.port),
                proxy_url: Some(format!("http://127.0.0.1:{}", proxy.port)),
                service: Some(proxy.service.clone()),
                message: Some(
                    "Safari and Chrome now use AirLink's local proxy for HTTP and HTTPS.".into(),
                ),
            },
            None => SuperDevStatus::default(),
        }
    }

    /// Turn the proxy on and update the active network service's system proxy.
    pub fn enable(&self) -> Result<SuperDevStatus, AppError> {
        if self
            .running
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .is_some()
        {
            return Ok(self.status());
        }

        let service = active_network_service();
        let web = read_proxy(&service, ProxyKind::Web)?;
        let secure = read_proxy(&service, ProxyKind::Secure)?;
        let auto_proxy = read_auto_proxy(&service)?;
        let auto_discovery = read_auto_discovery(&service)?;
        let socks = read_proxy(&service, ProxyKind::Socks)?;
        let bypass_domains = read_bypass_domains(&service)?;
        let snapshot = ProxySnapshot {
            service: service.clone(),
            web,
            secure,
            auto_proxy,
            auto_discovery,
            socks: Some(socks),
            bypass_domains,
        };

        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|error| {
            AppError::Network(format!("Could not start the local proxy: {error}"))
        })?;
        listener
            .set_nonblocking(true)
            .map_err(|error| AppError::Network(error.to_string()))?;
        let port = listener
            .local_addr()
            .map_err(|error| AppError::Network(error.to_string()))?
            .port();
        let listener = TcpListener::from_std(listener)
            .map_err(|error| AppError::Network(error.to_string()))?;

        write_marker(&self.marker, &snapshot)?;

        if let Err(error) = set_proxy(&service, ProxyKind::Web, true, port)
            .and_then(|_| set_proxy(&service, ProxyKind::Secure, true, port))
            .and_then(|_| set_auto_proxy_off(&service))
            .and_then(|_| run_networksetup(&["-setproxyautodiscovery", &service, "off"]))
            .and_then(|_| run_networksetup(&["-setsocksfirewallproxystate", &service, "off"]))
            .and_then(|_| {
                let mut domains = snapshot.bypass_domains.clone();
                for local in ["localhost", "127.0.0.1", "ipc.localhost"] {
                    if !domains.iter().any(|domain| domain == local) {
                        domains.push(local.to_string());
                    }
                }
                let mut args = vec!["-setproxybypassdomains".to_string(), service.clone()];
                args.extend(domains);
                let refs: Vec<&str> = args.iter().map(String::as_str).collect();
                run_networksetup(&refs)
            })
        {
            restore_snapshot(&snapshot);
            let _ = std::fs::remove_file(&self.marker);
            return Err(error);
        }

        let handle = tauri::async_runtime::spawn(async move {
            run_proxy(listener).await;
        });

        {
            let mut running = self
                .running
                .lock()
                .unwrap_or_else(|poison| poison.into_inner());
            *running = Some(RunningProxy {
                handle,
                port,
                service,
                snapshot,
                marker: self.marker.clone(),
            });
        }

        log::info!("Super Dev proxy enabled on 127.0.0.1:{port}");
        Ok(self.status())
    }

    /// Restore the system proxy and stop the listener. Safe to call repeatedly.
    pub fn disable(&self) -> SuperDevStatus {
        let running = self
            .running
            .lock()
            .unwrap_or_else(|poison| poison.into_inner())
            .take();
        if let Some(proxy) = running {
            proxy.handle.abort();
            restore_snapshot(&proxy.snapshot);
            let _ = std::fs::remove_file(&proxy.marker);
            log::info!("Super Dev proxy disabled");
        }
        self.status()
    }

    /// If a previous AirLink process crashed while Super Dev was on, restore the
    /// proxy configuration before doing anything else.
    pub fn restore_stale(&self) {
        let Ok(contents) = std::fs::read_to_string(&self.marker) else {
            return;
        };
        match serde_json::from_str::<ProxySnapshot>(&contents) {
            Ok(snapshot) => {
                restore_snapshot(&snapshot);
                let _ = std::fs::remove_file(&self.marker);
                log::info!("restored stale Super Dev proxy settings");
            }
            Err(error) => {
                log::warn!("could not read stale Super Dev proxy snapshot: {error}");
                let _ = std::fs::remove_file(&self.marker);
            }
        }
    }
}

impl Drop for SuperDevManager {
    fn drop(&mut self) {
        self.disable();
    }
}

#[derive(Clone, Copy)]
enum ProxyKind {
    Web,
    Secure,
    Socks,
}

async fn run_proxy(listener: TcpListener) {
    loop {
        match listener.accept().await {
            Ok((client, _)) => {
                tauri::async_runtime::spawn(async move {
                    let _ = tokio::time::timeout(PROXY_TIMEOUT, handle_client(client)).await;
                });
            }
            Err(error) => {
                log::debug!("Super Dev proxy accept error: {error}");
                break;
            }
        }
    }
}

async fn handle_client(mut client: TcpStream) -> std::io::Result<()> {
    let (header, leftover) = match read_header(&mut client).await {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };

    let request = String::from_utf8_lossy(&header);
    let mut lines = request.split("\r\n");
    let Some(first_line) = lines.next() else {
        return write_bad_request(&mut client).await;
    };
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 3 {
        return write_bad_request(&mut client).await;
    }
    let method = parts[0];
    let target = parts[1];

    if method.eq_ignore_ascii_case("CONNECT") {
        return handle_connect(client, target, leftover).await;
    }

    let headers: Vec<&str> = lines.collect();
    let parsed = match parse_http_target(target, &headers) {
        Some(value) => value,
        None => return write_bad_request(&mut client).await,
    };

    let upstream = match TcpStream::connect((parsed.host.as_str(), parsed.port)).await {
        Ok(stream) => stream,
        Err(_) => return write_bad_gateway(&mut client).await,
    };

    let rewritten = rewrite_request(&header, &parsed, &headers);
    let mut upstream = upstream;
    upstream.write_all(rewritten.as_bytes()).await?;
    if !leftover.is_empty() {
        upstream.write_all(&leftover).await?;
    }

    let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
    Ok(())
}

async fn handle_connect(
    mut client: TcpStream,
    target: &str,
    leftover: Vec<u8>,
) -> std::io::Result<()> {
    let Some((host, port)) = parse_authority(target) else {
        return write_bad_request(&mut client).await;
    };
    let Ok(upstream) = TcpStream::connect((host.as_str(), port)).await else {
        return write_bad_gateway(&mut client).await;
    };
    client
        .write_all(b"HTTP/1.1 200 Connection Established\r\nProxy-Agent: AirLink\r\n\r\n")
        .await?;
    let mut upstream = upstream;
    if !leftover.is_empty() {
        upstream.write_all(&leftover).await?;
    }
    let _ = tokio::io::copy_bidirectional(&mut client, &mut upstream).await;
    Ok(())
}

struct ParsedTarget {
    host: String,
    port: u16,
    path: String,
}

fn parse_http_target(target: &str, headers: &[&str]) -> Option<ParsedTarget> {
    if let Ok(url) = Url::parse(target) {
        if url.scheme() != "http" {
            return None;
        }
        let host = url.host_str()?.to_string();
        let port = url.port_or_known_default().unwrap_or(80);
        let mut path = url.path().to_string();
        if let Some(query) = url.query() {
            path.push('?');
            path.push_str(query);
        }
        return Some(ParsedTarget { host, port, path });
    }

    if target.starts_with('/') {
        let host_header = headers.iter().find_map(|line| {
            line.strip_prefix("Host:")
                .or_else(|| line.strip_prefix("host:"))
        })?;
        let authority = host_header.trim();
        let (host, port) =
            parse_authority(authority).unwrap_or_else(|| (authority.to_string(), 80));
        return Some(ParsedTarget {
            host,
            port,
            path: target.to_string(),
        });
    }
    None
}

fn parse_authority(value: &str) -> Option<(String, u16)> {
    let value = value.trim();
    if let Some(rest) = value.strip_prefix('[') {
        let (host, after) = rest.split_once(']')?;
        let port = after
            .strip_prefix(':')
            .and_then(|port| port.parse().ok())
            .unwrap_or(80);
        return Some((host.to_string(), port));
    }
    match value.rsplit_once(':') {
        Some((host, port)) if !host.is_empty() && !port.is_empty() => {
            Some((host.to_string(), port.parse().ok()?))
        }
        _ => Some((value.to_string(), 80)),
    }
}

fn rewrite_request(header: &[u8], parsed: &ParsedTarget, headers: &[&str]) -> String {
    let request = String::from_utf8_lossy(header);
    let mut lines = request.split("\r\n");
    let first = lines.next().unwrap_or_default();
    let method = first.split_whitespace().next().unwrap_or("GET");

    let mut output = format!("{method} {} HTTP/1.1\r\n", parsed.path);
    let mut has_host = false;
    for line in headers {
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("proxy-connection:")
            || lower.starts_with("proxy-authorization:")
            || lower.starts_with("connection:")
        {
            continue;
        }
        if lower.starts_with("host:") {
            has_host = true;
            output.push_str(&format!("Host: {}:{}\r\n", parsed.host, parsed.port));
        } else if !line.is_empty() {
            output.push_str(line);
            output.push_str("\r\n");
        }
    }
    if !has_host {
        output.push_str(&format!("Host: {}:{}\r\n", parsed.host, parsed.port));
    }
    output.push_str("Connection: close\r\n\r\n");
    output
}

async fn read_header(stream: &mut TcpStream) -> std::io::Result<(Vec<u8>, Vec<u8>)> {
    let mut buffer = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];
    loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "client closed before headers",
            ));
        }
        buffer.extend_from_slice(&chunk[..read]);
        if let Some(position) = find_header_end(&buffer) {
            let end = position + 4;
            return Ok((buffer[..end].to_vec(), buffer[end..].to_vec()));
        }
        if buffer.len() > MAX_HEADER_BYTES {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "request headers too large",
            ));
        }
    }
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

async fn write_bad_request(client: &mut TcpStream) -> std::io::Result<()> {
    client
        .write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        .await
}

async fn write_bad_gateway(client: &mut TcpStream) -> std::io::Result<()> {
    client
        .write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        .await
}

fn read_proxy(service: &str, kind: ProxyKind) -> Result<ProxyEndpoint, AppError> {
    let flag = match kind {
        ProxyKind::Web => "-getwebproxy",
        ProxyKind::Secure => "-getsecurewebproxy",
        ProxyKind::Socks => "-getsocksfirewallproxy",
    };
    let output = Command::new("/usr/sbin/networksetup")
        .args([flag, service])
        .output()
        .map_err(|error| AppError::Network(format!("networksetup failed: {error}")))?;
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(parse_proxy_output(&text))
}

fn parse_proxy_output(output: &str) -> ProxyEndpoint {
    let mut endpoint = ProxyEndpoint {
        enabled: false,
        server: String::new(),
        port: 0,
    };
    for line in output.lines() {
        if let Some(value) = line.strip_prefix("Enabled:") {
            endpoint.enabled = value.trim().eq_ignore_ascii_case("yes");
        } else if let Some(value) = line.strip_prefix("Server:") {
            endpoint.server = value.trim().to_string();
        } else if let Some(value) = line.strip_prefix("Port:") {
            endpoint.port = value.trim().parse().unwrap_or(0);
        }
    }
    endpoint
}

fn set_proxy(service: &str, kind: ProxyKind, enabled: bool, port: u16) -> Result<(), AppError> {
    let (set_flag, state_flag) = match kind {
        ProxyKind::Web => ("-setwebproxy", "-setwebproxystate"),
        ProxyKind::Secure => ("-setsecurewebproxy", "-setsecurewebproxystate"),
        ProxyKind::Socks => ("-setsocksfirewallproxy", "-setsocksfirewallproxystate"),
    };
    if enabled {
        run_networksetup(&[set_flag, service, "127.0.0.1", &port.to_string()])?;
        run_networksetup(&[state_flag, service, "on"])?;
    } else {
        run_networksetup(&[state_flag, service, "off"])?;
    }
    Ok(())
}

fn read_bypass_domains(service: &str) -> Result<Vec<String>, AppError> {
    let output = Command::new("/usr/sbin/networksetup")
        .args(["-getproxybypassdomains", service])
        .output()
        .map_err(|error| AppError::Network(format!("networksetup failed: {error}")))?;
    let text = String::from_utf8_lossy(&output.stdout);
    if text
        .trim()
        .eq_ignore_ascii_case("There are no bypass domains set on this service.")
    {
        return Ok(Vec::new());
    }
    Ok(text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn read_auto_proxy(service: &str) -> Result<AutoProxy, AppError> {
    let output = Command::new("/usr/sbin/networksetup")
        .args(["-getautoproxyurl", service])
        .output()
        .map_err(|error| AppError::Network(format!("networksetup failed: {error}")))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut auto = AutoProxy::default();
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("URL:") {
            let value = value.trim();
            if value != "(null)" {
                auto.url = value.to_string();
            }
        } else if let Some(value) = line.strip_prefix("Enabled:") {
            auto.enabled = value.trim().eq_ignore_ascii_case("yes");
        }
    }
    Ok(auto)
}

fn read_auto_discovery(service: &str) -> Result<bool, AppError> {
    let output = Command::new("/usr/sbin/networksetup")
        .args(["-getproxyautodiscovery", service])
        .output()
        .map_err(|error| AppError::Network(format!("networksetup failed: {error}")))?;
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(text
        .lines()
        .find_map(|line| line.strip_prefix("Auto Proxy Discovery:"))
        .map(|value| value.trim().eq_ignore_ascii_case("on"))
        .unwrap_or(false))
}

fn set_auto_proxy_off(service: &str) -> Result<(), AppError> {
    run_networksetup(&["-setautoproxystate", service, "off"])
}

fn run_networksetup(arguments: &[&str]) -> Result<(), AppError> {
    let output = Command::new("/usr/sbin/networksetup")
        .args(arguments)
        .output()
        .map_err(|error| AppError::Network(format!("networksetup failed: {error}")))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(AppError::Network(if message.is_empty() {
            "macOS could not update the proxy configuration.".into()
        } else {
            message
        }));
    }
    Ok(())
}

fn active_network_service() -> String {
    let interface = Command::new("/sbin/route")
        .args(["-n", "get", "default"])
        .output()
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
        .and_then(|output| {
            output.lines().find_map(|line| {
                line.trim()
                    .strip_prefix("interface:")
                    .map(|value| value.trim().to_string())
            })
        });

    let Some(interface) = interface else {
        return "Wi-Fi".to_string();
    };
    let Ok(output) = Command::new("/usr/sbin/networksetup")
        .args(["-listnetworkserviceorder"])
        .output()
    else {
        return "Wi-Fi".to_string();
    };
    let text = String::from_utf8_lossy(&output.stdout);
    let mut current_service: Option<String> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.contains(&format!("Device: {interface}"))
            && let Some(service) = current_service.clone()
        {
            return service;
        }
        if trimmed.starts_with('(')
            && trimmed
                .as_bytes()
                .get(1)
                .is_some_and(|byte| byte.is_ascii_digit())
            && let Some(close) = trimmed.find(')')
        {
            current_service = Some(trimmed[close + 1..].trim().to_string());
        }
    }
    "Wi-Fi".to_string()
}

fn write_marker(path: &Path, snapshot: &ProxySnapshot) -> Result<(), AppError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("tmp");
    let json = serde_json::to_string_pretty(snapshot)
        .map_err(|error| AppError::Settings(error.to_string()))?;
    std::fs::write(&temporary, json)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&temporary, path)?;
    Ok(())
}

fn restore_snapshot(snapshot: &ProxySnapshot) {
    // Restore standard web proxies.
    if snapshot.web.enabled {
        let _ = run_networksetup(&[
            "-setwebproxy",
            &snapshot.service,
            &snapshot.web.server,
            &snapshot.web.port.to_string(),
        ]);
        let _ = run_networksetup(&["-setwebproxystate", &snapshot.service, "on"]);
    } else {
        let _ = run_networksetup(&["-setwebproxystate", &snapshot.service, "off"]);
    }

    if snapshot.secure.enabled {
        let _ = run_networksetup(&[
            "-setsecurewebproxy",
            &snapshot.service,
            &snapshot.secure.server,
            &snapshot.secure.port.to_string(),
        ]);
        let _ = run_networksetup(&["-setsecurewebproxystate", &snapshot.service, "on"]);
    } else {
        let _ = run_networksetup(&["-setsecurewebproxystate", &snapshot.service, "off"]);
    }

    // Restore automatic configuration and SOCKS settings, which are switched
    // off while Super Dev is active so browsers use the local proxy.
    if snapshot.auto_proxy.enabled && !snapshot.auto_proxy.url.is_empty() {
        let _ = run_networksetup(&[
            "-setautoproxyurl",
            &snapshot.service,
            &snapshot.auto_proxy.url,
        ]);
        let _ = run_networksetup(&["-setautoproxystate", &snapshot.service, "on"]);
    } else {
        let _ = run_networksetup(&["-setautoproxystate", &snapshot.service, "off"]);
    }

    let _ = run_networksetup(&[
        "-setproxyautodiscovery",
        &snapshot.service,
        if snapshot.auto_discovery { "on" } else { "off" },
    ]);

    if snapshot.bypass_domains.is_empty() {
        let _ = run_networksetup(&["-setproxybypassdomains", &snapshot.service, "Empty"]);
    } else {
        let mut args = vec![
            "-setproxybypassdomains".to_string(),
            snapshot.service.clone(),
        ];
        args.extend(snapshot.bypass_domains.iter().cloned());
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let _ = run_networksetup(&refs);
    }

    if let Some(socks) = &snapshot.socks {
        if socks.enabled && !socks.server.is_empty() {
            let _ = run_networksetup(&[
                "-setsocksfirewallproxy",
                &snapshot.service,
                &socks.server,
                &socks.port.to_string(),
            ]);
            let _ = run_networksetup(&["-setsocksfirewallproxystate", &snapshot.service, "on"]);
        } else {
            let _ = run_networksetup(&["-setsocksfirewallproxystate", &snapshot.service, "off"]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_networksetup_proxy_output() {
        let parsed = parse_proxy_output("Enabled: Yes\nServer: 127.0.0.1\nPort: 8787\n");
        assert!(parsed.enabled);
        assert_eq!(parsed.server, "127.0.0.1");
        assert_eq!(parsed.port, 8787);
    }

    #[test]
    fn parses_absolute_and_origin_targets() {
        let absolute = parse_http_target("http://192.168.0.5:8080/admin?x=1", &[]).unwrap();
        assert_eq!(absolute.host, "192.168.0.5");
        assert_eq!(absolute.port, 8080);
        assert_eq!(absolute.path, "/admin?x=1");

        let origin = parse_http_target("/hello", &["Host: server.local"]).unwrap();
        assert_eq!(origin.host, "server.local");
        assert_eq!(origin.port, 80);
        assert_eq!(origin.path, "/hello");
    }

    #[test]
    fn parses_ipv6_authority() {
        assert_eq!(
            parse_authority("[::1]:8080"),
            Some(("::1".to_string(), 8080))
        );
    }

    #[tokio::test]
    async fn forwards_absolute_http_requests() {
        let upstream = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let upstream_port = upstream.local_addr().unwrap().port();
        let upstream_task = tauri::async_runtime::spawn(async move {
            let (mut socket, _) = upstream.accept().await.unwrap();
            let mut buffer = [0u8; 8192];
            let read = socket.read(&mut buffer).await.unwrap();
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();
            assert!(request.starts_with("GET /hello HTTP/1.1"));
            assert!(request.to_ascii_lowercase().contains("connection: close"));
            socket
                .write_all(
                    b"HTTP/1.1 200 OK
Content-Length: 5
Connection: close

hello",
                )
                .await
                .unwrap();
        });

        let proxy = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let proxy_port = proxy.local_addr().unwrap().port();
        let proxy_task = tauri::async_runtime::spawn(run_proxy(proxy));

        let mut client = TcpStream::connect(("127.0.0.1", proxy_port)).await.unwrap();
        let request = format!(
            "GET http://127.0.0.1:{upstream_port}/hello HTTP/1.1\r\nHost: 127.0.0.1:{upstream_port}\r\nProxy-Connection: keep-alive\r\n\r\n"
        );
        client.write_all(request.as_bytes()).await.unwrap();
        let mut response = Vec::new();
        client.read_to_end(&mut response).await.unwrap();
        assert!(String::from_utf8_lossy(&response).contains("hello"));

        proxy_task.abort();
        upstream_task.await.unwrap();
    }

    #[tokio::test]
    async fn tunnels_connect_requests() {
        let upstream = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let upstream_port = upstream.local_addr().unwrap().port();
        let upstream_task = tauri::async_runtime::spawn(async move {
            let (mut socket, _) = upstream.accept().await.unwrap();
            let mut buffer = [0u8; 32];
            let read = socket.read(&mut buffer).await.unwrap();
            socket.write_all(&buffer[..read]).await.unwrap();
        });

        let proxy = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let proxy_port = proxy.local_addr().unwrap().port();
        let proxy_task = tauri::async_runtime::spawn(run_proxy(proxy));

        let mut client = TcpStream::connect(("127.0.0.1", proxy_port)).await.unwrap();
        client
            .write_all(
                format!(
                    "CONNECT 127.0.0.1:{upstream_port} HTTP/1.1\r\nHost: 127.0.0.1:{upstream_port}\r\n\r\n"
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        let mut headers = [0u8; 128];
        let read = client.read(&mut headers).await.unwrap();
        assert!(String::from_utf8_lossy(&headers[..read]).contains("200 Connection Established"));

        client.write_all(b"ping").await.unwrap();
        let mut echoed = [0u8; 4];
        client.read_exact(&mut echoed).await.unwrap();
        assert_eq!(&echoed, b"ping");

        proxy_task.abort();
        upstream_task.await.unwrap();
    }

    #[test]
    fn finds_header_boundary() {
        assert_eq!(
            find_header_end(b"GET / HTTP/1.1\r\nHost: x\r\n\r\nbody"),
            Some(23)
        );
    }
}
