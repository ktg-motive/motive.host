import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Card from '@/components/ui/card'

export default async function DomainsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: customer }, { data: domains }, { data: recentActivity }] = await Promise.all([
    supabase.from('customers').select('name').eq('id', user.id).single(),
    supabase
      .from('domains')
      .select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('dns_audit_log')
      .select('action, domain_name, record_type, record_name, created_at')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const domainList = domains ?? []
  const now = Date.now()
  const thirtyDays = 30 * 24 * 60 * 60 * 1000

  const totalDomains = domainList.length
  const expiringCount = domainList.filter((d) => {
    if (!d.expires_at) return false
    const diff = new Date(d.expires_at).getTime() - now
    return diff > 0 && diff < thirtyDays
  }).length
  const activeDomains = domainList.filter((d) => d.status === 'active').length

  const firstName = customer?.name?.split(' ')[0] || 'there'

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-muted-white sm:text-3xl">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate">Here&apos;s what&apos;s happening with your domains.</p>
      </div>

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 text-center sm:p-6">
          <p className="text-2xl font-bold text-muted-white sm:text-3xl">{totalDomains}</p>
          <p className="mt-1 text-xs text-slate sm:text-sm">Total Domains</p>
        </Card>
        <Card className="p-4 text-center sm:p-6">
          <p className="text-2xl font-bold text-green-400 sm:text-3xl">{activeDomains}</p>
          <p className="mt-1 text-xs text-slate sm:text-sm">Active</p>
        </Card>
        <Card className={`p-4 text-center sm:p-6 ${expiringCount > 0 ? 'border-yellow-500/30' : ''}`}>
          <p className={`text-2xl font-bold sm:text-3xl ${expiringCount > 0 ? 'text-yellow-400' : 'text-muted-white'}`}>
            {expiringCount}
          </p>
          <p className="mt-1 text-xs text-slate sm:text-sm">Expiring Soon</p>
        </Card>
      </div>

      {/* Quick links */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Link
          href="/search"
          className="rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
        >
          Search Domains
        </Link>
        <Link
          href="https://my.motive.host"
          className="rounded-lg border border-border px-4 py-2.5 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
        >
          Hosting Portal
        </Link>
      </div>

      {/* Domain list */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-muted-white">My Domains</h2>
        {domainList.length === 0 ? (
          <Card className="py-12 text-center">
            <p className="text-lg text-slate">No domains yet</p>
            <p className="mt-2 text-sm text-slate">
              Find the perfect domain for your business
            </p>
            <Link
              href="/search"
              className="mt-6 inline-block rounded-lg bg-gold px-6 py-2.5 font-medium text-primary-bg transition-colors hover:bg-gold-hover"
            >
              Search Domains
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {domainList.map((domain) => {
              const expiresAt = domain.expires_at ? new Date(domain.expires_at) : null
              const isExpiringSoon = expiresAt && expiresAt.getTime() - now < thirtyDays

              return (
                <Card key={domain.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-muted-white">
                      {domain.domain_name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        domain.status === 'active'
                          ? 'bg-green-500/10 text-green-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                      }`}>
                        {domain.status}
                      </span>
                      {expiresAt && (
                        <span className={`text-xs ${isExpiringSoon ? 'text-yellow-400' : 'text-slate'}`}>
                          Expires {expiresAt.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                      {domain.auto_renew && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-slate">
                          Auto-renew
                        </span>
                      )}
                      {domain.privacy_enabled && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-slate">
                          Privacy
                        </span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/domains/${encodeURIComponent(domain.domain_name)}/dns`}
                    className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition-colors hover:border-gold hover:text-gold sm:self-auto"
                  >
                    Manage DNS
                  </Link>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {recentActivity && recentActivity.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-muted-white">Recent Activity</h2>
          <Card className="divide-y divide-border p-0">
            {recentActivity.map((entry, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                    entry.action === 'add' ? 'bg-green-500/10 text-green-400'
                      : entry.action === 'delete' ? 'bg-red-500/10 text-red-400'
                        : entry.action === 'quick_setup' ? 'bg-blue-500/10 text-blue-400'
                          : 'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {entry.record_type.slice(0, 2)}
                  </span>
                  <div>
                    <p className="text-sm text-muted-white">
                      <span className="capitalize">{entry.action === 'quick_setup' ? 'Quick setup' : entry.action}</span>
                      {' '}{entry.record_type} record
                      {entry.record_name !== '@' ? ` for ${entry.record_name}` : ''}
                    </p>
                    <p className="font-mono text-xs text-slate">{entry.domain_name}</p>
                  </div>
                </div>
                <time className="hidden text-xs text-slate sm:block">
                  {new Date(entry.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  )
}
