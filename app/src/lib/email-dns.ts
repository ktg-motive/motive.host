import { getOpenSRSClient } from '@/lib/opensrs-client';
import type { DnsRecordChange } from '@opensrs/types';
import type { GetDomainResponse } from '@opensrs-email';

// OpenSRS Email cluster b — MX hostname is domain-specific
function getMxHostname(domain: string): string {
  return `mx.${domain}.cust.b.hostedemail.com`;
}

const SPF_INCLUDE = 'include:_spf.hostedemail.com';

interface DnsAutoConfigResult {
  success: boolean;
  configured: string[];
  skipped: string[];
  errors: string[];
  externalDnsRequired: boolean;
  requiredRecords?: {
    mx: Array<{ priority: number; hostname: string }>;
    spf: string;
    dkim: { selector: string; record: string } | null;
    dmarc: string;
  };
}

export async function autoConfigureDns(
  domain: string,
  domainInfo: GetDomainResponse
): Promise<DnsAutoConfigResult> {
  const opensrs = getOpenSRSClient();
  const configured: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Check if we manage DNS; if not, try to create the zone automatically
  let zone;
  try {
    zone = await opensrs.getDnsZone(domain);
  } catch {
    // Zone doesn't exist — try to create it, then fetch
    try {
      await opensrs.createDnsZone(domain);
      zone = await opensrs.getDnsZone(domain);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        configured: [],
        skipped: [],
        errors: [`Failed to create DNS zone: ${msg}`],
        externalDnsRequired: true,
        requiredRecords: buildRequiredRecords(domain, domainInfo),
      };
    }
  }

  // DNS is managed by us — add records via read-modify-write
  const changes: DnsRecordChange[] = [];

  // MX Record — single domain-specific record for cluster b
  const mxHostname = getMxHostname(domain);
  const existingMx = zone.records.filter(r => r.type === 'MX');
  const alreadyExists = existingMx.some(
    r => r.hostname === mxHostname && r.priority === 0
  );
  if (!alreadyExists) {
    changes.push({
      action: 'add',
      record: {
        type: 'MX',
        subdomain: '@',
        hostname: mxHostname,
        priority: 0,
      },
    });
  } else {
    skipped.push(`MX ${mxHostname}`);
  }

  // SPF — merge with existing
  const existingSpf = zone.records.find(
    r => r.type === 'TXT' && r.subdomain === '@' && r.text?.startsWith('v=spf1')
  );

  if (existingSpf && existingSpf.text) {
    if (!existingSpf.text.includes(SPF_INCLUDE)) {
      const updatedSpf = existingSpf.text.match(/\s+[~\-?+]all/)
        ? existingSpf.text.replace(/(\s+[~\-?+]all)/, ` ${SPF_INCLUDE}$1`)
        : `${existingSpf.text} ${SPF_INCLUDE}`;
      changes.push({
        action: 'update',
        record: { type: 'TXT', subdomain: '@', text: updatedSpf },
        existingRecord: existingSpf,
      });
    } else {
      skipped.push('SPF');
    }
  } else {
    changes.push({
      action: 'add',
      record: { type: 'TXT', subdomain: '@', text: `v=spf1 ${SPF_INCLUDE} ~all` },
    });
  }

  // DKIM
  if (domainInfo.dkim_selector && domainInfo.dkim_record) {
    const existingDkim = zone.records.find(
      r => r.type === 'TXT' && r.subdomain === `${domainInfo.dkim_selector}._domainkey`
    );
    if (!existingDkim) {
      changes.push({
        action: 'add',
        record: {
          type: 'TXT',
          subdomain: `${domainInfo.dkim_selector}._domainkey`,
          text: domainInfo.dkim_record,
        },
      });
    } else {
      skipped.push('DKIM');
    }
  }

  // DMARC
  const existingDmarc = zone.records.find(
    r => r.type === 'TXT' && r.subdomain === '_dmarc'
  );
  if (!existingDmarc) {
    changes.push({
      action: 'add',
      record: {
        type: 'TXT',
        subdomain: '_dmarc',
        text: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
      },
    });
  } else {
    skipped.push('DMARC');
  }

  // Apply all changes
  try {
    await opensrs.updateDnsRecords(domain, changes);
    // Build configured list from what was actually changed
    for (const c of changes) {
      if (c.record.type === 'MX') configured.push('MX');
      else if (c.record.type === 'TXT' && c.record.subdomain === '@' && c.record.text?.startsWith('v=spf1')) configured.push('SPF');
      else if (c.record.type === 'TXT' && c.record.subdomain?.endsWith('._domainkey')) configured.push('DKIM');
      else if (c.record.type === 'TXT' && c.record.subdomain === '_dmarc') configured.push('DMARC');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    errors.push(`DNS update failed: ${msg}`);
  }

  return {
    success: errors.length === 0,
    configured,
    skipped,
    errors,
    externalDnsRequired: false,
  };
}

function buildRequiredRecords(domain: string, domainInfo: GetDomainResponse) {
  return {
    mx: [{ priority: 0, hostname: getMxHostname(domain) }],
    spf: `v=spf1 ${SPF_INCLUDE} ~all`,
    dkim: domainInfo.dkim_selector && domainInfo.dkim_record
      ? { selector: domainInfo.dkim_selector, record: domainInfo.dkim_record }
      : null,
    dmarc: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
  };
}
