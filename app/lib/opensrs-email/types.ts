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
  success?: boolean;
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

// Sizes are capped under OMA's per-mailbox quota_maximum of 20480 MB (20 GB), a
// reseller-level limit we cannot raise via API (BUG-15). `mb` is sent to OMA as
// the `quota`; `bytes` is stored in email_mailboxes.storage_quota_bytes.
export const STORAGE_TIERS = {
  basic:    { label: 'Basic (5 GB)',     mb: 5120,   bytes: 5368709120 },
  standard: { label: 'Standard (10 GB)', mb: 10240,  bytes: 10737418240 },
  plus:     { label: 'Plus (15 GB)',     mb: 15360,  bytes: 16106127360 },
} as const;

export type StorageTier = keyof typeof STORAGE_TIERS;
