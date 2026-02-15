// OpenSRS XCP API TypeScript Types

// ─── Configuration ───────────────────────────────────────────────────────────

export interface OpenSRSConfig {
  apiKey: string;
  username: string;
  environment: 'test' | 'live';
}

// ─── Generic Response ────────────────────────────────────────────────────────

export interface OpenSRSResponse<T = Record<string, unknown>> {
  isSuccess: boolean;
  responseCode: number;
  responseText: string;
  attributes: T;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export class OpenSRSError extends Error {
  readonly responseCode: number;
  readonly responseText: string;

  constructor(responseCode: number, responseText: string) {
    super(`OpenSRS Error ${responseCode}: ${responseText}`);
    this.name = 'OpenSRSError';
    this.responseCode = responseCode;
    this.responseText = responseText;
  }
}

// ─── Domain Lookup ───────────────────────────────────────────────────────────

export type DomainStatus = 'available' | 'taken' | 'error';

export interface DomainAvailability {
  domain: string;
  status: DomainStatus;
  price?: number;
}

export interface DomainSuggestion {
  domain: string;
  status: DomainStatus;
}

export interface NameSuggestResponse {
  lookup: {
    items: Array<{ domain: string; status: string }>;
    count: number;
  };
  suggestion: {
    items: Array<{ domain: string; status: string }>;
    count: number;
  };
}

// ─── Domain Registration ─────────────────────────────────────────────────────

export interface DomainContact {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  fax?: string;
  org_name?: string;
  address1: string;
  address2?: string;
  address3?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface RegisterDomainParams {
  domain: string;
  period: number;
  contacts: {
    owner: DomainContact;
    admin: DomainContact;
    tech: DomainContact;
    billing: DomainContact;
  };
  autoRenew?: boolean;
  privacy?: boolean;
  customNameservers?: string[];
  handleNow?: boolean;
}

export interface RegisterDomainResponse {
  id: string;
  registration_text: string;
  registration_code: string;
  async_reason?: string;
  whois_privacy_state?: string;
}

export interface OrderInfoResponse {
  id: string;
  domain: string;
  status: string;
  order_date: string;
  contacts: Record<string, DomainContact>;
  nameservers: string[];
}

// ─── DNS ─────────────────────────────────────────────────────────────────────

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'NS';

export interface DnsRecord {
  type: DnsRecordType;
  subdomain: string;
  ip_address?: string;
  hostname?: string;
  text?: string;
  priority?: number;
  weight?: number;
  port?: number;
  ttl?: number;
}

export type DnsChangeAction = 'add' | 'remove' | 'update';

export interface DnsRecordChange {
  action: DnsChangeAction;
  record: DnsRecord;
  existingRecord?: DnsRecord;
}

export interface DnsUpdateOptions {
  dryRun?: boolean;
  /** If provided, the update will fail if the zone has changed since this version was read. */
  expectedVersion?: string;
}

export interface DnsUpdateResult {
  applied: boolean;
  added: DnsRecord[];
  removed: DnsRecord[];
  updated: Array<{ from: DnsRecord; to: DnsRecord }>;
  finalRecords: DnsRecord[];
}

export interface DnsZoneResponse {
  records: DnsRecord[];
  nameservers: string[];
  /** Hash of the zone contents for optimistic locking. */
  version?: string;
}

// ─── Renewal ─────────────────────────────────────────────────────────────────

export interface RenewDomainResponse {
  admin_email: string;
  auto_renew: string;
  expiredate: string;
  id: string;
  order_id: string;
  registration_text: string;
}

export interface DomainExpiryInfo {
  domain: string;
  expiredate: string;
  auto_renew: boolean;
  let_expire: boolean;
}

// ─── Internal XCP Protocol ───────────────────────────────────────────────────

export interface XCPRequest {
  action: string;
  object: string;
  attributes: Record<string, unknown>;
}

export type XCPValue = string | number | boolean | { [key: string]: XCPValue } | XCPValue[];
export type XCPAssoc = { [key: string]: XCPValue };
export type XCPArray = XCPValue[];
