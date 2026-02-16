import dns from 'dns/promises';

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
  const result: DnsVerificationResult = {
    mx:    { verified: false, expected: ['mx1.emailsrvr.com', 'mx2.emailsrvr.com'], actual: [] },
    spf:   { verified: false, expected: 'include:emailsrvr.com', actual: null },
    dkim:  { verified: false, expected: expectedDkim?.record ?? null, actual: null },
    dmarc: { verified: false, expected: 'v=DMARC1', actual: null },
  };

  // MX
  try {
    const mxRecords = await dns.resolveMx(domain);
    result.mx.actual = mxRecords.map(r => r.exchange.toLowerCase());
    result.mx.verified = result.mx.expected.every(
      expected => result.mx.actual.some(actual => actual.includes(expected))
    );
  } catch { /* no MX records */ }

  // SPF
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spf = txtRecords.flat().find(r => r.startsWith('v=spf1'));
    if (spf) {
      result.spf.actual = spf;
      result.spf.verified = spf.includes('emailsrvr.com');
    }
  } catch { /* no TXT records */ }

  // DKIM
  if (expectedDkim) {
    try {
      const dkimHost = `${expectedDkim.selector}._domainkey.${domain}`;
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
    const txtRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarc = txtRecords.flat().find(r => r.startsWith('v=DMARC1'));
    if (dmarc) {
      result.dmarc.actual = dmarc;
      result.dmarc.verified = true;
    }
  } catch { /* no DMARC record */ }

  return result;
}
