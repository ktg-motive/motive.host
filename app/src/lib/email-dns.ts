import { getOpenSRSClient } from '@/lib/opensrs-client';
import type { DnsRecordChange } from '@opensrs/types';
import type { GetDomainResponse } from '@opensrs-email';

// OpenSRS Email MX records (standard across OpenSRS email clusters)
const MX_RECORDS = [
  { priority: 10, hostname: 'mx1.emailsrvr.com' },
  { priority: 20, hostname: 'mx2.emailsrvr.com' },
];

const SPF_INCLUDE = 'include:emailsrvr.com';

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
  let zoneExists = true;
  try {
    await opensrs.getDnsZone(domain);
  } catch {
    zoneExists = false;
  }

  if (!zoneExists) {
    try {
      await opensrs.createDnsZone(domain);
      zoneExists = true;
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
  const zone = await opensrs.getDnsZone(domain);

  // MX Records — only add if not already present
  const existingMx = zone.records.filter(r => r.type === 'MX');
  for (const mx of MX_RECORDS) {
    const alreadyExists = existingMx.some(
      r => r.hostname === mx.hostname && r.priority === mx.priority
    );
    if (!alreadyExists) {
      changes.push({
        action: 'add',
        record: {
          type: 'MX',
          subdomain: '@',
          hostname: mx.hostname,
          priority: mx.priority,
        },
      });
    } else {
      skipped.push(`MX ${mx.hostname}`);
    }
  }

  // SPF — merge with existing
  const existingSpf = zone.records.find(
    r => r.type === 'TXT' && r.subdomain === '@' && r.text?.startsWith('v=spf1')
  );

  if (existingSpf && existingSpf.text) {
    if (!existingSpf.text.includes(SPF_INCLUDE)) {
      const updatedSpf = existingSpf.text.replace(
        /(\s+[~\-?+]all)/,
        ` ${SPF_INCLUDE}$1`
      );
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
    changes.push({
      action: 'add',
      record: {
        type: 'TXT',
        subdomain: `${domainInfo.dkim_selector}._domainkey`,
        text: domainInfo.dkim_record,
      },
    });
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
    configured.push('MX', 'SPF', 'DKIM', 'DMARC');
    for (const s of skipped) {
      const idx = configured.indexOf(s);
      if (idx !== -1) configured.splice(idx, 1);
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
    mx: MX_RECORDS,
    spf: `v=spf1 ${SPF_INCLUDE} ~all`,
    dkim: domainInfo.dkim_selector && domainInfo.dkim_record
      ? { selector: domainInfo.dkim_selector, record: domainInfo.dkim_record }
      : null,
    dmarc: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,
  };
}
