import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import DnsManager from '@/components/dns/dns-manager'

interface DnsPageProps {
  params: Promise<{ domain: string }>
}

export default async function DnsPage({ params }: DnsPageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { domain } = await params
  const decodedDomain = decodeURIComponent(domain)

  // Verify the user owns this domain
  const { data: domainRecord } = await supabase
    .from('domains')
    .select('id, domain_name, status')
    .eq('customer_id', user.id)
    .eq('domain_name', decodedDomain)
    .single()

  if (!domainRecord) {
    redirect('/domains')
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate">
        <Link href="/domains" className="transition-colors hover:text-muted-white">
          My Domains
        </Link>
        <span>/</span>
        <span className="font-mono text-muted-white">{decodedDomain}</span>
        <span>/</span>
        <span className="text-gold">DNS</span>
      </nav>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-muted-white">DNS Records</h1>
        <p className="mt-1 text-sm text-slate">
          Manage DNS records for <span className="font-mono text-muted-white">{decodedDomain}</span>
        </p>
      </div>

      {/* DNS Manager (client component) */}
      <DnsManager domain={decodedDomain} />
    </div>
  )
}
