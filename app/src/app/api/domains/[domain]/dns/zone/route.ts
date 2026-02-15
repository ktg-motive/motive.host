import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOpenSRSClient } from '@/lib/opensrs-client'

// POST /api/domains/[domain]/dns/zone -- create DNS zone if none exists
export async function POST(
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

    const opensrs = getOpenSRSClient()
    await opensrs.createDnsZone(domain)

    // Audit log
    await supabase.from('dns_audit_log').insert({
      customer_id: user.id,
      domain_name: domain,
      action: 'create_zone',
      record_type: 'NS',
      record_name: '@',
      old_value: null,
      new_value: { zone_created: true },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    // Zone may already exist
    if (message.includes('already exists') || message.includes('485')) {
      return NextResponse.json({ success: true, alreadyExists: true })
    }
    console.error('DNS zone creation error:', error)
    return NextResponse.json({ error: 'Failed to create DNS zone' }, { status: 500 })
  }
}
