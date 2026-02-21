// ── Configuration ─────────────────────────────────────────────────────────

export interface RunCloudConfig {
  apiToken: string;
  serverId: number;
}

// ── Error ─────────────────────────────────────────────────────────────────

export class RunCloudError extends Error {
  readonly statusCode: number;
  readonly apiMessage: string;

  constructor(statusCode: number, apiMessage: string) {
    super(`RunCloud Error ${statusCode}: ${apiMessage}`);
    this.name = 'RunCloudError';
    this.statusCode = statusCode;
    this.apiMessage = apiMessage;
  }
}

// ── Generic API Response ──────────────────────────────────────────────────

export interface RunCloudResponse<T> {
  data: T;
}

export interface RunCloudPaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

// ── Web Application ───────────────────────────────────────────────────────

export interface RunCloudWebApp {
  id: number;
  server_user_id: number;
  name: string;
  rootPath: string;
  publicPath: string;
  type: string;
  stack: string;
  stackMode: string;
  state?: string; // Not returned by v3 API; retained for cached_status fallback
  phpVersion: string | null;
  created_at: string;
}

// ── SSL ───────────────────────────────────────────────────────────────────

// Actual v3 API response: { data: RunCloudSSLDomain[] }
export interface RunCloudSSLDomain {
  id: number;
  name: string;
  ssl: {
    id: number;
    method: string;
    validUntil: string | null;
    renewalDate: string | null;
    enableHttp: boolean;
    enableHsts: boolean;
    enableHstsPreload: boolean;
    authorizationMethod: string;
    staging: boolean;
    created_at: string;
  } | null;
}

// Normalized shape used internally after parsing the API response.
// Note: hsts_subdomains is not exposed by the v3 read API (only used in write params).
export interface RunCloudSSL {
  id: number;
  webapp_id: number;
  method: string;
  ssl_enabled: boolean;
  encryption_type: string;
  hsts: boolean;
  hsts_subdomains: false; // v3 API does not return this field; always false on read
  hsts_preload: boolean;
  validUntil: string | null;
  created_at: string;
}

// ── Domain ────────────────────────────────────────────────────────────────

export interface RunCloudDomain {
  id: number;
  name: string;
  webapp_id: number;
  created_at: string;
}

// ── Git Configuration ─────────────────────────────────────────────────────

export interface RunCloudGit {
  id: number;
  webapp_id: number;
  provider: string;
  repository: string;
  branch: string;
  auto_deploy: boolean;
  deploy_script: string;
  created_at: string;
  updated_at: string;
}

// ── Action Log ────────────────────────────────────────────────────────────

export interface RunCloudActionLog {
  id: number;
  action: string;
  description: string | null;
  status: string;
  created_at: string;
}

// ── Server Health ─────────────────────────────────────────────────────────

export interface RunCloudServerHealth {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  uptime: string;
  load: number[];
}

// ── Server Services ───────────────────────────────────────────────────────

export interface RunCloudService {
  name: string;
  status: string;
}

// ── Provisioning: Create Web App ─────────────────────────────────────────

export interface CreateWebAppParams {
  name: string;
  domainName: string;
  user: string;
  publicPath: string;
  phpVersion?: string;
  stack: string;
  stackMode: string;
  clickjackingProtection: boolean;
  xssProtection: boolean;
  mimeSniffingProtection: boolean;
}

// ── Provisioning: Install SSL ────────────────────────────────────────────

export interface InstallSSLParams {
  provider: string;
  type: string;
  hsts: boolean;
  hsts_subdomains: boolean;
  hsts_preload: boolean;
}

// ── Provisioning: Configure Git ──────────────────────────────────────────

export interface ConfigureGitParams {
  provider: string;
  repository: string;
  branch: string;
  autoDeploy: boolean;
  deployScript?: string;
}

// ── Provisioning: Install WordPress ──────────────────────────────────────

export interface InstallWordPressParams {
  title: string;
  adminUser: string;
  adminPassword: string;
  adminEmail: string;
  dbName?: string;
}

// ── Cache Entry (internal) ────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
