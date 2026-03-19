import { Resolver } from 'dns/promises';

// Use a reliable public resolver instead of the system resolver.
// Node's default resolver caches aggressively and behaves inconsistently
// across calls, causing flaky verification results.
const dns = new Resolver();
dns.setServers(['8.8.8.8', '1.1.1.1']);

const DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

interface DnsVerificationResult {
  mx: { verified: boolean; expected: string[]; actual: string[] };
  spf: { verified: boolean; expected: string; actual: string | null };
  dkim: { verified: boolean; expected: string | null; actual: string | null };
  dmarc: { verified: boolean; expected: string; actual: string | null };
}

export async function verifyEmailDns(
  domain: string,
  expectedDkim?: { selector: string; record: string } | null
): Promise<DnsVerificationResult> {
  if (!DOMAIN_RE.test(domain)) {
    throw new Error(`Invalid domain name: ${domain}`);
  }

  const normalizedDomain = domain.toLowerCase();
  const expectedMx = `mx.${normalizedDomain}.cust.b.hostedemail.com`;

  // Accept both current (cluster b) and legacy (Rackspace) MX/SPF schemes
  // so domains provisioned before the migration don't false-fail verification.
  const legacyMxHosts = ['mx1.emailsrvr.com', 'mx2.emailsrvr.com'];
  const legacySpfInclude = 'emailsrvr.com';

  const result: DnsVerificationResult = {
    mx:    { verified: false, expected: [expectedMx], actual: [] },
    spf:   { verified: false, expected: 'include:_spf.hostedemail.com', actual: null },
    dkim:  { verified: false, expected: expectedDkim?.record ?? null, actual: null },
    dmarc: { verified: false, expected: 'v=DMARC1', actual: null },
  };

  // MX
  try {
    const mxRecords = await dns.resolveMx(normalizedDomain);
    result.mx.actual = mxRecords.map(r => r.exchange.toLowerCase());
    const hasCurrentMx = result.mx.actual.some(
      actual => actual === expectedMx || actual === expectedMx + '.'
    );
    const hasLegacyMx = result.mx.actual.some(
      actual => legacyMxHosts.some(legacy => actual === legacy || actual === legacy + '.')
    );
    result.mx.verified = hasCurrentMx || hasLegacyMx;
  } catch { /* no MX records */ }

  // SPF
  try {
    const txtRecords = await dns.resolveTxt(normalizedDomain);
    const spf = txtRecords.flat().find(r => r.startsWith('v=spf1'));
    if (spf) {
      result.spf.actual = spf;
      result.spf.verified = spf.includes('_spf.hostedemail.com') || spf.includes(legacySpfInclude);
    }
  } catch { /* no TXT records */ }

  // DKIM
  if (expectedDkim) {
    try {
      const dkimHost = `${expectedDkim.selector}._domainkey.${normalizedDomain}`;
      const txtRecords = await dns.resolveTxt(dkimHost);
      const dkim = txtRecords.flat().join('');
      if (dkim) {
        result.dkim.actual = dkim;
        result.dkim.verified = dkim.includes('DKIM1');
      }
    } catch { /* no DKIM record */ }
  }

  // DMARC
  try {
    const txtRecords = await dns.resolveTxt(`_dmarc.${normalizedDomain}`);
    const dmarc = txtRecords.flat().find(r => r.startsWith('v=DMARC1'));
    if (dmarc) {
      result.dmarc.actual = dmarc;
      result.dmarc.verified = true;
    }
  } catch { /* no DMARC record */ }

  return result;
}
