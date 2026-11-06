export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "authentication_required"
  | "portal_detected"
  | "authenticating"
  | "authenticated"
  | "internet_available"
  | "session_expired"
  | "connection_error";

export interface WifiNetwork {
  ssid: string | null;
  bssid: string | null;
  rssi: number | null;
  noise: number | null;
  signalQuality: number | null;
  signalBars: number | null;
  signalLabel: string | null;
  channel: number | null;
  band: string | null;
  channelWidthMhz: number | null;
  phyMode: string | null;
  security: string | null;
  interface: string | null;
  powered: boolean;
  associated: boolean;
  ssidRestricted: boolean;
}

export interface IpConfiguration {
  ipv4: string | null;
  subnetMask: string | null;
  gateway: string | null;
  dns: string[];
  interface: string | null;
  macAddress: string | null;
  ipv6: string[];
}

export type ConnectivityClassification =
  | "internet"
  | "captive_portal"
  | "no_internet"
  | "dns_failure"
  | "network_error"
  | "not_checked";

export type ProbeOutcome =
  | "internet"
  | "redirect"
  | "portal_content"
  | "http_error"
  | "unexpected_response"
  | "timeout"
  | "dns_failure"
  | "connection_failure"
  | "tls_error";

export interface ProbeResult {
  url: string;
  protocol: string;
  outcome: ProbeOutcome;
  status: number | null;
  latencyMs: number;
  location: string | null;
  message: string;
}

export interface ConnectivityReport {
  classification: ConnectivityClassification;
  internetAvailable: boolean;
  httpOk: boolean;
  httpsOk: boolean;
  dnsOk: boolean;
  portalSuspected: boolean;
  latencyMs: number | null;
  checkedAt: string;
  probes: ProbeResult[];
  detail: string;
}

export type PortalDetectionMethod =
  | "redirect"
  | "portal_content"
  | "http_status"
  | "known_profile"
  | "manual";

export interface PortalInfo {
  url: string;
  host: string;
  detectionMethod: PortalDetectionMethod;
  detectedAt: string;
  trusted: boolean;
  profileName: string | null;
}

export interface NetworkStatus {
  wifi: WifiNetwork;
  ip: IpConfiguration;
  state: ConnectionState;
  connectivity: ConnectivityReport;
  portal: PortalInfo | null;
  lastChecked: string | null;
  authenticatedAt: string | null;
  message: string | null;
}

export type ThemeMode = "system" | "light" | "dark";

export interface ProbeEndpoint {
  id: string;
  name: string;
  url: string;
  expectedStatus: number | null;
  expectedBodyContains: string | null;
}

export interface NetworkProfile {
  id: string;
  ssid: string;
  portalUrl: string | null;
  trustedDomains: string[];
  autoOpen: boolean;
  createdAt: string;
}

export interface ServerLink {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface HotspotClient {
  name: string | null;
  ipAddress: string;
  macAddress: string;
}

export interface HotspotStatus {
  sharingActive: boolean;
  bridgePresent: boolean;
  sourceInterface: string | null;
  sourceNetwork: string | null;
  hotspotName: string | null;
  wifiBroadcast: boolean;
  natEnabled: boolean;
  clients: HotspotClient[];
  clientListAvailable: boolean;
  note: string;
}

export interface SuperDevStatus {
  enabled: boolean;
  port: number | null;
  proxyUrl: string | null;
  service: string | null;
  message: string | null;
}

export interface SavedCredentialSummary {
  id: string;
  ssid: string;
  username: string;
  updatedAt: string;
}

export interface Settings {
  version: number;
  theme: ThemeMode;
  launchAtLogin: boolean;
  keepInMenuBar: boolean;
  autoDetectPortal: boolean;
  autoVerify: boolean;
  notifications: boolean;
  pollIntervalSecs: number;
  portalCheckIntervalSecs: number;
  probeTimeoutSecs: number;
  httpProbes: ProbeEndpoint[];
  httpsProbes: ProbeEndpoint[];
  trustedProfiles: NetworkProfile[];
  serverLinks: ServerLink[];
  rememberedUsernames: Record<string, string>;
  savedCredentials: SavedCredentialSummary[];
}

export interface BrowserState {
  open: boolean;
  url: string | null;
  title: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
  isSecure: boolean;
  onPortalDomain: boolean;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VerificationResult {
  verified: boolean;
  portalOnline: boolean;
  message: string;
  status: NetworkStatus;
}

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  developer: string;
  brand: string;
  tagline: string;
  copyright: string;
  platform: string;
}

export interface CredentialList {
  saved: SavedCredentialSummary[];
  rememberedUsernames: Record<string, string>;
}

export interface SaveCredentialRequest {
  ssid: string;
  username: string;
  password: string;
  rememberPassword: boolean;
  rememberUsername: boolean;
}

export type LocationAuthorization =
  | "not_determined"
  | "restricted"
  | "denied"
  | "authorized";

export type NavigationView = "overview" | "browser" | "hotspot" | "settings";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

export interface ActivityEntry {
  id: string;
  state: ConnectionState;
  label: string;
  detail: string;
  at: string;
}
