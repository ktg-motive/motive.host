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

  const { data: domains } = await supabase
    .from('domains')
    .select('*')
    .eq('customer_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-muted-white">My Domains</h1>
          <p className="mt-1 text-sm text-slate">Manage your registered domains</p>
        </div>
        <Link
          href="/search"
          className="rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover"
        >
          Search for a domain
        </Link>
      </div>

      {!domains || domains.length === 0 ? (
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
          {domains.map((domain) => {
            const expiresAt = domain.expires_at ? new Date(domain.expires_at) : null
            const isExpiringSoon = expiresAt && expiresAt.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000

            return (
              <Card key={domain.id} className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-mono text-sm font-medium text-muted-white">
                      {domain.domain_name}
                    </p>
                    <div className="mt-1 flex items-center gap-3">
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
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
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
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
