import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOpenSRSClient } from '@/lib/opensrs-client'
import { dnsRecordSchema } from '@/lib/dns-validation'
import type { DnsRecord, DnsRecordChange } from '@opensrs/types'

// GET /api/domains/[domain]/dns -- fetch all DNS records
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { domain } = await params

    // Verify the user owns this domain
    const { data: domainRecord } = await supabase
      .from('domains')
      .select('id')
      .eq('customer_id', user.id)
      .eq('domain_name', domain)
      .single()

    if (!domainRecord) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    const opensrs = getOpenSRSClient()
    const zone = await opensrs.getDnsZone(domain)

    return NextResponse.json({
      records: zone.records,
      nameservers: zone.nameservers,
      version: zone.version,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // OpenSRS returns a specific error when no DNS zone exists
    if (message.includes('does not exist') || message.includes('460')) {
      return NextResponse.json({ records: [], nameservers: [], zoneExists: false })
    }
    console.error('DNS fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch DNS records' }, { status: 500 })
  }
}

// PUT /api/domains/[domain]/dns -- update DNS records (read-modify-write)
const updateSchema = z.object({
  changes: z.array(z.object({
    action: z.enum(['add', 'update', 'remove']),
    record: dnsRecordSchema,
    existingRecord: dnsRecordSchema.optional(),
  })),
  version: z.string().optional(),
})

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { domain } = await params

    // Verify ownership
    const { data: domainRecord } = await supabase
      .from('domains')
      .select('id')
      .eq('customer_id', user.id)
      .eq('domain_name', domain)
      .single()

    if (!domainRecord) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { changes, version } = parsed.data
    const opensrs = getOpenSRSClient()

    // Convert validated input to DnsRecordChange format
    const dnsChanges: DnsRecordChange[] = changes.map((c) => ({
      action: c.action === 'remove' ? 'remove' : c.action,
      record: c.record as DnsRecord,
      existingRecord: c.existingRecord as DnsRecord | undefined,
    }))

    // Read-modify-write via OpenSRS client (with optimistic locking if version provided)
    const result = await opensrs.updateDnsRecords(domain, dnsChanges, {
      expectedVersion: version,
    })

    // Audit log each change
    const auditEntries = changes.map((change) => ({
      customer_id: user.id,
      domain_name: domain,
      action: change.action,
      record_type: change.record.type,
      record_name: change.record.subdomain,
      old_value: change.existingRecord ? change.existingRecord : null,
      new_value: change.action === 'remove' ? null : change.record,
    }))

    if (auditEntries.length > 0) {
      await supabase.from('dns_audit_log').insert(auditEntries)
    }

    return NextResponse.json({
      applied: result.applied,
      records: result.finalRecords,
      version: result.newVersion,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (message.includes('modified since you last loaded')) {
      return NextResponse.json({ error: message }, { status: 409 })
    }
    console.error('DNS update error:', error)
    return NextResponse.json({ error: 'Failed to update DNS records' }, { status: 500 })
  }
}
