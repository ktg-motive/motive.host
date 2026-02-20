'use client'

import { useState } from 'react'

interface TransferAwayButtonProps {
  domain: string
}

type State = 'idle' | 'confirm' | 'loading' | 'done' | 'error'

export default function TransferAwayButton({ domain }: TransferAwayButtonProps) {
  const [state, setState] = useState<State>('idle')
  const [registrantEmail, setRegistrantEmail] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleRelease() {
    setState('loading')
    setErrorMsg(null)

    const res = await fetch(`/api/transfers/${encodeURIComponent(domain)}/release`, {
      method: 'POST',
    })

    const data = await res.json()

    if (!res.ok) {
      setErrorMsg(data.error ?? 'Failed to initiate transfer. Please contact support.')
      setState('error')
      return
    }

    setRegistrantEmail(data.registrant_email)
    setState('done')
  }

  if (state === 'done') {
    return (
      <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
        <p className="text-sm font-medium text-green-400">Domain unlocked — authorization code sent</p>
        {registrantEmail && (
          <p className="mt-1 text-sm text-slate">
            The EPP/auth code was emailed to{' '}
            <span className="font-mono text-muted-white">{registrantEmail}</span>.
          </p>
        )}
        <p className="mt-2 text-sm text-slate">
          Use the code to initiate the transfer at your new registrar. The transfer typically takes 5–7 days.
        </p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-sm text-red-400">{errorMsg}</p>
        <button
          onClick={() => { setState('idle'); setErrorMsg(null) }}
          className="mt-2 text-xs text-slate hover:text-muted-white"
        >
          Try again
        </button>
      </div>
    )
  }

  if (state === 'confirm') {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-3">
        <p className="text-sm text-muted-white font-medium">Are you sure?</p>
        <p className="text-sm text-slate">
          This will unlock <span className="font-mono text-muted-white">{domain}</span> and email the authorization code to the registrant address on file. The domain can then be transferred away from Motive Hosting.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setState('idle')}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-slate transition-colors hover:border-gold hover:text-muted-white"
          >
            Cancel
          </button>
          <button
            onClick={handleRelease}
            className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:border-red-400 hover:bg-red-500/20"
          >
            Yes, unlock and send auth code
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setState('confirm')}
      disabled={state === 'loading'}
      className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 transition-colors hover:border-red-400 hover:bg-red-500/5 disabled:opacity-50"
    >
      {state === 'loading' ? 'Processing…' : 'Transfer Away from Motive'}
    </button>
  )
}
