'use client';

import { useState, useEffect } from 'react';
import Dialog from '@/components/ui/dialog';
import Select from '@/components/ui/select';
import Button from '@/components/ui/button';

interface Domain {
  id: string;
  domain_name: string;
}

interface EnableEmailModalProps {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
}

type Step = 'select' | 'done';

interface DnsResult {
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

export default function EnableEmailModal({ open, onClose, onEnabled }: EnableEmailModalProps) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState('');
  const [step, setStep] = useState<Step>('select');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [dnsResult, setDnsResult] = useState<DnsResult | null>(null);

  // Fetch domains that don't have email enabled yet
  useEffect(() => {
    if (!open) return;
    fetch('/api/domains')
      .then(res => res.json())
      .then(data => {
        // Filter out domains that already have email
        return fetch('/api/email/domains').then(r => r.json()).then(emailData => {
          const emailDomainNames = new Set(
            (emailData.domains ?? []).map((d: { domain_name: string }) => d.domain_name)
          );
          const available = (data.domains ?? []).filter(
            (d: Domain) => !emailDomainNames.has(d.domain_name)
          );
          setDomains(available);
          if (available.length === 1) {
            setSelectedDomainId(available[0].id);
          }
        });
      })
      .catch(() => setError('Failed to load domains'));
  }, [open]);

  async function handleEnable() {
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainId: selectedDomainId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to enable email');
        return;
      }

      setDnsResult(data.dnsResult);
      setStep('done');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (step === 'done') onEnabled();
    setStep('select');
    setSelectedDomainId('');
    setError('');
    setDnsResult(null);
    onClose();
  }

  const selectedDomain = domains.find(d => d.id === selectedDomainId);

  return (
    <Dialog open={open} onClose={handleClose} title="Enable Email for Domain">
      {step === 'select' && (
        <div className="space-y-4">
          <Select
            label="Select Domain"
            value={selectedDomainId}
            onChange={(e) => setSelectedDomainId(e.target.value)}
          >
            <option value="">Choose a domain...</option>
            {domains.map(d => (
              <option key={d.id} value={d.id}>{d.domain_name}</option>
            ))}
          </Select>

          {selectedDomain && (
            <div className="rounded-lg border border-border bg-card-content p-3">
              <p className="mb-2 text-xs font-medium text-slate">DNS records that will be configured:</p>
              <div className="space-y-1 font-mono text-xs text-muted-white">
                <p>MX @ &rarr; mx1.emailsrvr.com (priority 10)</p>
                <p>MX @ &rarr; mx2.emailsrvr.com (priority 20)</p>
                <p>TXT @ &rarr; v=spf1 include:emailsrvr.com ~all</p>
                <p>TXT default._domainkey &rarr; [DKIM key]</p>
                <p>TXT _dmarc &rarr; v=DMARC1; p=none</p>
              </div>
            </div>
          )}

          {domains.length === 0 && !error && (
            <p className="text-sm text-slate">
              All your domains already have email enabled, or you have no registered domains.
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleEnable} disabled={submitting || !selectedDomainId}>
              {submitting ? 'Enabling...' : 'Enable Email'}
            </Button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
            <p className="text-sm font-medium text-green-400">
              Email enabled for {selectedDomain?.domain_name}
            </p>
          </div>

          {dnsResult?.externalDnsRequired && dnsResult.requiredRecords && (
            <div className="space-y-2">
              <p className="text-sm text-slate">
                DNS is managed externally. Add these records to your DNS provider:
              </p>
              <div className="rounded-lg border border-border bg-card-content p-3 font-mono text-xs text-muted-white">
                {dnsResult.requiredRecords.mx.map((mx, i) => (
                  <p key={i}>MX @ &rarr; {mx.hostname} (priority {mx.priority})</p>
                ))}
                <p>TXT @ &rarr; {dnsResult.requiredRecords.spf}</p>
                {dnsResult.requiredRecords.dkim && (
                  <p>TXT {dnsResult.requiredRecords.dkim.selector}._domainkey &rarr; {dnsResult.requiredRecords.dkim.record.slice(0, 40)}...</p>
                )}
                <p>TXT _dmarc &rarr; {dnsResult.requiredRecords.dmarc}</p>
              </div>
            </div>
          )}

          {dnsResult && !dnsResult.externalDnsRequired && (
            <div className="space-y-1 text-sm text-slate">
              {dnsResult.configured.length > 0 && (
                <p>Configured: {dnsResult.configured.join(', ')}</p>
              )}
              {dnsResult.skipped.length > 0 && (
                <p>Already present: {dnsResult.skipped.join(', ')}</p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
