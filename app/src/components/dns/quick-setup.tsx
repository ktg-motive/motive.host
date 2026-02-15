'use client'

import { useState } from 'react'
import Dialog from '@/components/ui/dialog'
import Button from '@/components/ui/button'

const MOTIVE_IP = '144.202.27.86'

interface QuickSetupProps {
  domain: string
  onApply: (includeWww: boolean) => Promise<void>
}

export default function QuickSetup({ domain, onApply }: QuickSetupProps) {
  const [open, setOpen] = useState(false)
  const [includeWww, setIncludeWww] = useState(true)
  const [isApplying, setIsApplying] = useState(false)

  async function handleApply() {
    setIsApplying(true)
    try {
      await onApply(includeWww)
      setOpen(false)
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
        </svg>
        Connect to Motive Hosting
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Connect to Motive Hosting">
        <div className="space-y-4">
          <p className="text-sm text-slate">
            This will configure your DNS records to point <span className="font-mono text-muted-white">{domain}</span> to Motive Hosting servers.
          </p>

          <div className="rounded-lg border border-border bg-card-content p-4">
            <p className="text-sm font-medium text-muted-white">The following changes will be made:</p>
            <ul className="mt-3 space-y-2">
              <li className="flex items-center gap-2 text-sm">
                <span className="inline-block rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 font-mono text-xs text-blue-400">A</span>
                <span className="font-mono text-slate">@</span>
                <span className="text-slate">-&gt;</span>
                <span className="font-mono text-muted-white">{MOTIVE_IP}</span>
              </li>
              {includeWww && (
                <li className="flex items-center gap-2 text-sm">
                  <span className="inline-block rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 font-mono text-xs text-green-400">CNAME</span>
                  <span className="font-mono text-slate">www</span>
                  <span className="text-slate">-&gt;</span>
                  <span className="font-mono text-muted-white">{domain}</span>
                </li>
              )}
            </ul>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={includeWww}
              onChange={(e) => setIncludeWww(e.target.checked)}
              className="rounded border-border bg-card text-gold focus:ring-gold"
            />
            Also add www CNAME pointing to {domain}
          </label>

          <div className="rounded-lg border border-border bg-alt-bg p-3">
            <p className="text-xs text-slate">
              Existing A records for @ and CNAME records for www will be replaced.
              Other records will not be affected. Changes may take up to 48 hours to propagate globally.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={isApplying}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={isApplying}>
              {isApplying ? 'Applying...' : 'Apply Changes'}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
