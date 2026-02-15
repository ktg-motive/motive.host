import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getOpenSRSClient } from '@/lib/opensrs-client'
import type { DnsRecord, DnsRecordChange } from '@opensrs/types'

// The recordId is a composite key encoded as: type:subdomain:value
// This is because OpenSRS DNS records don't have individual IDs --
// the zone is always written as a complete set.
function decodeRecordId(recordId: string): { type: string; subdomain: string; value: string } {
  const decoded = decodeURIComponent(recordId)
  const parts = decoded.split(':')
  if (parts.length < 3) {
    throw new Error('Invalid record identifier')
  }
  return {
    type: parts[0],
    subdomain: parts[1],
    value: parts.slice(2).join(':'),
  }
}

const deleteSchema = z.object({
  record: z.object({
    type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV']),
    subdomain: z.string(),
    ip_address: z.string().optional(),
    hostname: z.string().optional(),
    text: z.string().optional(),
    priority: z.number().optional(),
    weight: z.number().optional(),
    port: z.number().optional(),
  }),
})

// DELETE /api/domains/[domain]/dns/[recordId] -- delete specific record
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ domain: string; recordId: string }> }
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
    const parsed = deleteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { record } = parsed.data
    const opensrs = getOpenSRSClient()

    const changes: DnsRecordChange[] = [{
      action: 'remove',
      record: record as DnsRecord,
    }]

    const result = await opensrs.updateDnsRecords(domain, changes)

    // Audit log
    await supabase.from('dns_audit_log').insert({
      customer_id: user.id,
      domain_name: domain,
      action: 'delete',
      record_type: record.type,
      record_name: record.subdomain,
      old_value: record,
      new_value: null,
    })

    return NextResponse.json({
      applied: result.applied,
      records: result.finalRecords,
    })
  } catch (error) {
    console.error('DNS delete error:', error)
    return NextResponse.json({ error: 'Failed to delete DNS record' }, { status: 500 })
  }
}
