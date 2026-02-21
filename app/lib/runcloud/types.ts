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
  server_id: number;
  name: string;
  rootPath: string;
  publicPath: string;
  type: string;
  stack: string;
  stackMode: string;
  state: string;
  phpVersion: string | null;
  created_at: string;
  clickjackingProtection: boolean;
  xssProtection: boolean;
  mimeSniffingProtection: boolean;
}

// ── SSL ───────────────────────────────────────────────────────────────────

export interface RunCloudSSL {
  id: number;
  webapp_id: number;
  method: string;
  ssl_enabled: boolean;
  encryption_type: string;
  hsts: boolean;
  hsts_subdomains: boolean;
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

// ── Cache Entry (internal) ────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
