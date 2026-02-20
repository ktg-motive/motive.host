import { createHash } from 'crypto';
import type { OpenSRSClient } from '../client';
import { OpenSRSError } from '../types';
import type {
  DnsRecord,
  DnsRecordType,
  DnsRecordChange,
  DnsUpdateOptions,
  DnsUpdateResult,
  DnsZoneResponse,
} from '../types';

/** Compute a version hash from a sorted, stable JSON serialization of records. */
function computeZoneVersion(records: DnsRecord[]): string {
  const sorted = [...records].sort((a, b) =>
    `${a.type}:${a.subdomain}`.localeCompare(`${b.type}:${b.subdomain}`)
  );
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 16);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function recordsMatch(a: DnsRecord, b: DnsRecord): boolean {
  return (
    a.type === b.type &&
    a.subdomain === b.subdomain &&
    a.ip_address === b.ip_address &&
    a.hostname === b.hostname &&
    a.text === b.text &&
    a.priority === b.priority &&
    a.weight === b.weight &&
    a.port === b.port &&
    a.ttl === b.ttl
  );
}

// OpenSRS returns DNS records in a nested structure grouped by type.
// This normalizes them into a flat array.
function parseZoneRecords(rawRecords: Record<string, unknown>): DnsRecord[] {
  const records: DnsRecord[] = [];

  const recordTypes: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'];

  for (const type of recordTypes) {
    const typeRecords = rawRecords[type] as Record<string, unknown> | unknown[] | undefined;
    if (!typeRecords) continue;

    const entries = Object.values(typeRecords) as Array<Record<string, string>>;
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;

      const record: DnsRecord = {
        type,
        subdomain: entry.subdomain || '@',
      };

      if (entry.ip_address) record.ip_address = entry.ip_address;
      if (entry.hostname) record.hostname = entry.hostname;
      if (entry.text) record.text = entry.text;
      if (entry.priority) record.priority = parseInt(entry.priority, 10);
      if (entry.weight) record.weight = parseInt(entry.weight, 10);
      if (entry.port) record.port = parseInt(entry.port, 10);
      if (entry.ttl) record.ttl = parseInt(entry.ttl, 10);

      records.push(record);
    }
  }

  return records;
}

// OpenSRS SET_DNS_ZONE expects records grouped by uppercase type key,
// with each group as a dt_array (JS array), and apex subdomain as '' not '@'.
function formatZoneRecords(records: DnsRecord[]): Record<string, Array<Record<string, string>>> {
  const grouped: Record<string, Array<Record<string, string>>> = {};

  for (const record of records) {
    const typeKey = record.type.toUpperCase();
    if (!grouped[typeKey]) grouped[typeKey] = [];

    const entry: Record<string, string> = {
      subdomain: record.subdomain === '@' ? '' : record.subdomain,
    };

    if (record.ip_address) entry.ip_address = record.ip_address;
    if (record.hostname) entry.hostname = record.hostname;
    if (record.text) entry.text = record.text;
    if (record.priority !== undefined) entry.priority = String(record.priority);
    if (record.weight !== undefined) entry.weight = String(record.weight);
    if (record.port !== undefined) entry.port = String(record.port);
    if (record.ttl !== undefined) entry.ttl = String(record.ttl);

    grouped[typeKey].push(entry);
  }

  return grouped;
}

// ─── Commands ────────────────────────────────────────────────────────────────

export function createDnsCommands(client: OpenSRSClient) {
  return {
    async createDnsZone(domain: string): Promise<void> {
      await client.request({
        action: 'CREATE_DNS_ZONE',
        object: 'DOMAIN',
        attributes: { domain },
      });
    },

    async getDnsZone(domain: string): Promise<DnsZoneResponse> {
      const response = await client.request<{
        records: Record<string, unknown>;
        nameservers_ok?: string;
      }>({
        action: 'GET_DNS_ZONE',
        object: 'DOMAIN',
        attributes: { domain },
      });

      // OpenSRS returns is_success=1 even when no zone exists — detect it explicitly.
      if (response.responseText === 'DNS zone not found for domain') {
        throw new OpenSRSError(0, 'DNS zone not found for domain');
      }

      const records = parseZoneRecords(response.attributes.records ?? {});
      return {
        records,
        nameservers: [],
        version: computeZoneVersion(records),
      };
    },

    async setDnsZone(domain: string, records: DnsRecord[]): Promise<void> {
      await client.request({
        action: 'SET_DNS_ZONE',
        object: 'DOMAIN',
        attributes: {
          domain,
          records: formatZoneRecords(records),
        },
      });
    },

    async deleteDnsZone(domain: string): Promise<void> {
      await client.request({
        action: 'DELETE_DNS_ZONE',
        object: 'DOMAIN',
        attributes: { domain },
      });
    },

    /**
     * Safe read-modify-write DNS update.
     * Fetches existing records, applies changes, and writes the merged set.
     * Use dryRun to preview changes without applying them.
     */
    async updateDnsRecords(
      domain: string,
      changes: DnsRecordChange[],
      options: DnsUpdateOptions = {}
    ): Promise<DnsUpdateResult> {
      // 1. Fetch existing records
      const zone = await this.getDnsZone(domain);
      const currentRecords = [...zone.records];

      // Optimistic locking: if caller provided a version, verify it matches
      if (options.expectedVersion && options.expectedVersion !== zone.version) {
        throw new Error(
          'DNS zone has been modified since you last loaded it. Please refresh and try again.'
        );
      }

      const added: DnsRecord[] = [];
      const removed: DnsRecord[] = [];
      const updated: Array<{ from: DnsRecord; to: DnsRecord }> = [];

      // 2. Apply changes
      for (const change of changes) {
        switch (change.action) {
          case 'add': {
            currentRecords.push(change.record);
            added.push(change.record);
            break;
          }

          case 'remove': {
            const idx = currentRecords.findIndex(r => recordsMatch(r, change.record));
            if (idx !== -1) {
              removed.push(currentRecords[idx]);
              currentRecords.splice(idx, 1);
            }
            break;
          }

          case 'update': {
            const match = change.existingRecord ?? change.record;
            const idx = currentRecords.findIndex(r => recordsMatch(r, match));
            if (idx !== -1) {
              updated.push({ from: currentRecords[idx], to: change.record });
              currentRecords[idx] = change.record;
            }
            break;
          }
        }
      }

      // 3. Write back (or return dry run results)
      if (!options.dryRun) {
        await this.setDnsZone(domain, currentRecords);
      }

      return {
        applied: !options.dryRun,
        added,
        removed,
        updated,
        finalRecords: currentRecords,
        newVersion: computeZoneVersion(currentRecords),
      };
    },

    async forceNameservers(domain: string): Promise<void> {
      await client.request({
        action: 'SET_DNS_ZONE',
        object: 'DOMAIN',
        attributes: {
          domain,
          force_nameservers: '1',
        },
      });
    },
  };
}
