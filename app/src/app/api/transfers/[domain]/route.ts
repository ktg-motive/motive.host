import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateDomain } from '@/lib/domain-validation'

interface RouteParams {
  params: Promise<{ domain: string }>
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { domain: rawDomain } = await params
    const domain = decodeURIComponent(rawDomain)

    const validation = validateDomain(domain)
    if (!validation.valid) {
      return NextResponse.json({ error: 'Invalid domain name' }, { status: 400 })
    }

    const { data: domainRecord, error } = await supabase
      .from('domains')
      .select('id, domain_name, status, transfer_order_id, transfer_status, transfer_initiated_at, transfer_completed_at')
      .eq('customer_id', user.id)
      .eq('domain_name', validation.domain)
      .single()

    if (error || !domainRecord) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
    }

    if (domainRecord.status !== 'transferring') {
      return NextResponse.json({ error: 'No active transfer for this domain' }, { status: 404 })
    }

    return NextResponse.json({
      domain: domainRecord.domain_name,
      status: domainRecord.status,
      transfer_status: domainRecord.transfer_status,
      transfer_order_id: domainRecord.transfer_order_id,
      transfer_initiated_at: domainRecord.transfer_initiated_at,
      transfer_completed_at: domainRecord.transfer_completed_at,
    })
  } catch (error) {
    console.error('Transfer status error:', error)
    return NextResponse.json({ error: 'Failed to fetch transfer status' }, { status: 500 })
  }
}
