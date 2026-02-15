'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Card from '@/components/ui/card'

interface ContactInfo {
  first_name: string
  last_name: string
  email: string
  phone: string
  address1: string
  address2: string
  city: string
  state: string
  postal_code: string
  country: string
  org_name: string
}

const emptyContact: ContactInfo = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  org_name: '',
}

function RegisterForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const domain = searchParams.get('domain') || ''

  const [contact, setContact] = useState<ContactInfo>(emptyContact)
  const [useForAll, setUseForAll] = useState(true)
  const [period, setPeriod] = useState(1)
  const [privacy, setPrivacy] = useState(true)
  const [autoRenew, setAutoRenew] = useState(false)

  const [price, setPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [priceLoading, setPriceLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [step, setStep] = useState<'form' | 'paying' | 'registering'>('form')

  // Fetch price on load
  useEffect(() => {
    if (!domain) return

    async function fetchPrice() {
      try {
        const res = await fetch('/api/domains/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: domain }),
        })
        if (!res.ok) throw new Error('Price fetch failed')
        const data = await res.json()
        if (data.exact?.price) {
          setPrice(data.exact.price)
        }
      } catch {
        setError('Unable to fetch pricing. Please go back and try again.')
      } finally {
        setPriceLoading(false)
      }
    }

    fetchPrice()
  }, [domain])

  function updateContact(field: keyof ContactInfo, value: string) {
    setContact((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    setStep('paying')

    const payload = {
      domain,
      period,
      contact,
      useForAll,
      privacy,
      autoRenew,
    }

    try {
      // Phase 1: Create PaymentIntent
      const intentRes = await fetch('/api/domains/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!intentRes.ok) {
        const data = await intentRes.json()
        setError(data.error || 'Failed to create payment')
        setLoading(false)
        setStep('form')
        return
      }

      const { paymentIntentId } = await intentRes.json()

      // Phase 2: Confirm payment server-side
      // In production, this will be replaced by Stripe Elements confirmPayment() on the client.
      // For now, the server PATCH endpoint confirms with a test payment method.
      const confirmRes = await fetch('/api/domains/register', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId }),
      })

      if (!confirmRes.ok) {
        const confirmData = await confirmRes.json()
        setError(confirmData.error || 'Payment confirmation failed')
        setLoading(false)
        setStep('form')
        return
      }

      const confirmData = await confirmRes.json()
      if (confirmData.status !== 'succeeded') {
        setError('Payment was not completed. Please try again.')
        setLoading(false)
        setStep('form')
        return
      }

      // Phase 3: Register domain after payment confirmed
      setStep('registering')

      const registerRes = await fetch('/api/domains/register', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId,
          ...payload,
        }),
      })

      const registerData = await registerRes.json()

      if (!registerRes.ok) {
        setError(registerData.error || 'Registration failed')
        setLoading(false)
        setStep('form')
        return
      }

      setSuccess(true)
      setTimeout(() => router.push('/domains'), 2000)
    } catch {
      setError('Something went wrong. Please try again.')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  if (!domain) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-slate">No domain specified.</p>
        <a href="/search" className="mt-4 inline-block text-gold hover:text-gold-hover">
          Search for a domain
        </a>
      </div>
    )
  }

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <Card>
          <div className="py-8">
            <div className="mb-4 text-4xl">&#10003;</div>
            <h2 className="font-display text-2xl font-bold text-muted-white">Domain Registered!</h2>
            <p className="mt-2 font-mono text-gold">{domain}</p>
            <p className="mt-4 text-sm text-slate">Redirecting to your domains...</p>
          </div>
        </Card>
      </div>
    )
  }

  const totalPrice = price ? price * period : null

  const stepLabel = step === 'paying' ? 'Processing payment...' : step === 'registering' ? 'Registering domain...' : 'Complete Registration'

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-3xl font-bold text-muted-white">Register Domain</h1>
      <p className="mt-2 text-slate">Complete your registration for <span className="font-mono text-gold">{domain}</span></p>

      <form onSubmit={handleSubmit} className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main form */}
        <div className="space-y-6 lg:col-span-2">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Contact Information */}
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-muted-white">Contact Information</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-slate">First Name *</label>
                <input
                  type="text" required value={contact.first_name}
                  onChange={(e) => updateContact('first_name', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-slate">Last Name *</label>
                <input
                  type="text" required value={contact.last_name}
                  onChange={(e) => updateContact('last_name', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-slate">Email *</label>
                <input
                  type="email" required value={contact.email}
                  onChange={(e) => updateContact('email', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-slate">Phone *</label>
                <input
                  type="tel" required value={contact.phone}
                  onChange={(e) => updateContact('phone', e.target.value)}
                  placeholder="+1.5551234567"
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm text-slate">Organization (optional)</label>
              <input
                type="text" value={contact.org_name}
                onChange={(e) => updateContact('org_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm text-slate">Address *</label>
              <input
                type="text" required value={contact.address1}
                onChange={(e) => updateContact('address1', e.target.value)}
                className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
              />
            </div>
            <div className="mt-2">
              <input
                type="text" value={contact.address2}
                onChange={(e) => updateContact('address2', e.target.value)}
                placeholder="Apt, Suite, etc. (optional)"
                className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1.5 block text-sm text-slate">City *</label>
                <input
                  type="text" required value={contact.city}
                  onChange={(e) => updateContact('city', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-slate">State *</label>
                <input
                  type="text" required value={contact.state}
                  onChange={(e) => updateContact('state', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-slate">ZIP *</label>
                <input
                  type="text" required value={contact.postal_code}
                  onChange={(e) => updateContact('postal_code', e.target.value)}
                  className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-sm text-slate">Country</label>
              <select
                value={contact.country}
                onChange={(e) => updateContact('country', e.target.value)}
                className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
              >
                <option value="US">United States</option>
                <option value="CA">Canada</option>
              </select>
            </div>

            <label className="mt-4 flex items-center gap-2">
              <input
                type="checkbox" checked={useForAll}
                onChange={(e) => setUseForAll(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-slate">Use same contact for admin, tech, and billing</span>
            </label>
          </Card>

          {/* Registration Options */}
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-muted-white">Registration Options</h2>

            <div>
              <label className="mb-1.5 block text-sm text-slate">Registration Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-card-content px-3 py-2 text-sm text-muted-white focus:border-gold focus:outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => (
                  <option key={y} value={y}>
                    {y} year{y > 1 ? 's' : ''}{price ? ` — $${price * y}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <label className="mt-4 flex items-center gap-2">
              <input
                type="checkbox" checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-slate">WHOIS Privacy Protection (recommended)</span>
            </label>

            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox" checked={autoRenew}
                onChange={(e) => setAutoRenew(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-sm text-slate">Auto-renew before expiration</span>
            </label>
          </Card>
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <h2 className="mb-4 font-display text-lg font-semibold text-muted-white">Order Summary</h2>

            <div className="space-y-3 border-b border-border pb-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate">Domain</span>
                <span className="font-mono text-muted-white">{domain}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate">Period</span>
                <span className="text-muted-white">{period} year{period > 1 ? 's' : ''}</span>
              </div>
              {privacy && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate">WHOIS Privacy</span>
                  <span className="text-green-400">Included</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-between">
              <span className="font-medium text-muted-white">Total</span>
              {priceLoading ? (
                <span className="text-slate">Loading...</span>
              ) : totalPrice !== null ? (
                <span className="text-xl font-bold text-gold">${totalPrice}</span>
              ) : (
                <span className="text-slate">--</span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !price}
              className="mt-6 w-full rounded-lg bg-gold px-4 py-3 font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50"
            >
              {loading ? stepLabel : 'Complete Registration'}
            </button>

            <p className="mt-3 text-center text-xs text-slate">
              Payment processed securely via Stripe
            </p>
          </Card>
        </div>
      </form>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  )
}
