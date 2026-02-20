// ── Configuration ──────────────────────────────────────────────────────────

export interface OMAConfig {
  user: string;
  password: string;
  cluster: string;
  environment: 'test' | 'live';
}

// ── Authentication ─────────────────────────────────────────────────────────

export interface OMACredentials {
  user: string;
  password?: string;
  token?: string;
}

// ── Domain Types ───────────────────────────────────────────────────────────

export type EmailDomainStatus = 'active' | 'suspended' | 'deleted' | 'pending';
export type SpamFilterLevel = 'aggressive' | 'moderate' | 'permissive';

export interface GetDomainResponse {
  success: boolean;
  domain: string;
  status: EmailDomainStatus;
  catch_all?: string;
  spam_filter_level?: SpamFilterLevel;
  num_users?: number;
  total_storage_bytes?: number;
  used_storage_bytes?: number;
  dkim_selector?: string;
  dkim_record?: string;
  created_at?: string;
  error?: number;
  error_message?: string;
}

export interface SearchDomainsResponse {
  success: boolean;
  domains: Array<{
    domain: string;
    status: EmailDomainStatus;
    num_users: number;
  }>;
  total: number;
  error?: number;
  error_message?: string;
}

export interface DeleteDomainResponse {
  success: boolean;
  error?: number;
  error_message?: string;
}

// ── User (Mailbox) Types ───────────────────────────────────────────────────

export type MailboxType = 'mailbox' | 'forward' | 'filter';
export type MailboxStatus = 'active' | 'suspended';

export interface GetUserResponse {
  success: boolean;
  user: string;
  type: MailboxType;
  display_name?: string;
  disk_space: number;
  disk_usage: number;
  suspended: boolean;
  password_change_required: boolean;
  forward_email?: string;
  last_login?: string;
  created_at?: string;
  error?: number;
  error_message?: string;
}

export interface SearchUsersResponse {
  success: boolean;
  users: Array<{
    user: string;
    type: MailboxType;
    display_name?: string;
    disk_space: number;
    disk_usage: number;
    suspended: boolean;
  }>;
  total: number;
  error?: number;
  error_message?: string;
}

export interface DeleteUserResponse {
  success: boolean;
  error?: number;
  error_message?: string;
}

// ── Error ──────────────────────────────────────────────────────────────────

export class OMAError extends Error {
  readonly code: number;
  readonly omaMessage: string;

  constructor(code: number, message: string) {
    super(`OMA Error ${code}: ${message}`);
    this.name = 'OMAError';
    this.code = code;
    this.omaMessage = message;
  }
}

// ── Storage Tier Mapping ───────────────────────────────────────────────────

export const STORAGE_TIERS = {
  basic:    { label: 'Basic (10 GB)',    mb: 10240,  bytes: 10737418240 },
  standard: { label: 'Standard (25 GB)', mb: 25600,  bytes: 26843545600 },
  plus:     { label: 'Plus (50 GB)',     mb: 51200,  bytes: 53687091200 },
} as const;

export type StorageTier = keyof typeof STORAGE_TIERS;
