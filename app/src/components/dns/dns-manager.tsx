'use client'

import { useState, useCallback, useEffect } from 'react'
import type { DnsRecord, DnsRecordType } from '@opensrs/types'
import RecordTable from './record-table'
import RecordForm from './record-form'
import DeleteConfirm from './delete-confirm'
import QuickSetup from './quick-setup'
import Dialog from '@/components/ui/dialog'
import Button from '@/components/ui/button'
import RecordTypeBadge from './record-type-badge'
import { useToast } from '@/components/ui/toast'

const MOTIVE_IP = '144.202.27.86'
const FILTER_TYPES: Array<DnsRecordType | 'ALL'> = ['ALL', 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV']

interface DnsManagerProps {
  domain: string
}

export default function DnsManager({ domain }: DnsManagerProps) {
  const { toast } = useToast()
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoneExists, setZoneExists] = useState(true)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [zoneVersion, setZoneVersion] = useState<string | undefined>(undefined)

  // Modal state
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DnsRecord | null>(null)
  const [deletingRecord, setDeletingRecord] = useState<DnsRecord | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/domains/${encodeURIComponent(domain)}/dns`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch records')
      }

      if (data.zoneExists === false) {
        setZoneExists(false)
        setRecords([])
        setZoneVersion(undefined)
      } else {
        setZoneExists(true)
        setRecords(data.records ?? [])
        setZoneVersion(data.version)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch DNS records')
    } finally {
      setLoading(false)
    }
  }, [domain])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  async function createZone() {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/domains/${encodeURIComponent(domain)}/dns/zone`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create DNS zone')
      }

      await fetchRecords()
      toast('DNS zone created')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create DNS zone')
    } finally {
      setIsSubmitting(false)
    }
  }

  /** Check a mutation response; on 409 conflict, auto-refresh and throw. */
  async function checkResponse(res: Response) {
    const data = await res.json()
    if (res.status === 409) {
      await fetchRecords()
      throw new Error(data.error || 'Zone was modified. Records have been refreshed — please try again.')
    }
    if (!res.ok) {
      throw new Error(data.error || 'Request failed')
    }
    return data
  }

  async function handleAddRecord(record: DnsRecord) {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/domains/${encodeURIComponent(domain)}/dns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: [{ action: 'add', record }],
          version: zoneVersion,
        }),
      })
      const data = await checkResponse(res)

      setRecords(data.records ?? [])
      setZoneVersion(data.version)
      setShowAddForm(false)
      toast('DNS record added')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add DNS record')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleEditRecord(record: DnsRecord) {
    if (!editingRecord) return
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/domains/${encodeURIComponent(domain)}/dns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changes: [{
            action: 'update',
            record,
            existingRecord: editingRecord,
          }],
          version: zoneVersion,
        }),
      })
      const data = await checkResponse(res)

      setRecords(data.records ?? [])
      setZoneVersion(data.version)
      setEditingRecord(null)
      toast('DNS record updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update DNS record')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteRecord() {
    if (!deletingRecord) return
    setIsSubmitting(true)
    setError(null)
    try {
      const recordId = `${deletingRecord.type}:${deletingRecord.subdomain}:${deletingRecord.ip_address || deletingRecord.hostname || deletingRecord.text || ''}`
      const res = await fetch(`/api/domains/${encodeURIComponent(domain)}/dns/${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: deletingRecord }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete record')
      }

      setRecords(data.records ?? [])
      setZoneVersion(data.version)
      setDeletingRecord(null)
      toast('DNS record deleted')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete DNS record')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleQuickSetup(includeWww: boolean) {
    setError(null)
    const changes: Array<{ action: string; record: DnsRecord; existingRecord?: DnsRecord }> = []

    // Find existing root A records to replace
    const existingRootA = records.filter((r) => r.type === 'A' && (r.subdomain === '@' || r.subdomain === ''))
    for (const existing of existingRootA) {
      changes.push({
        action: 'remove',
        record: existing,
      })
    }

    // Add the Motive Hosting A record
    changes.push({
      action: 'add',
      record: { type: 'A', subdomain: '@', ip_address: MOTIVE_IP },
    })

    if (includeWww) {
      // Remove existing www CNAME if present
      const existingWww = records.filter((r) => r.type === 'CNAME' && r.subdomain === 'www')
      for (const existing of existingWww) {
        changes.push({
          action: 'remove',
          record: existing,
        })
      }

      changes.push({
        action: 'add',
        record: { type: 'CNAME', subdomain: 'www', hostname: domain },
      })
    }

    try {
      const res = await fetch(`/api/domains/${encodeURIComponent(domain)}/dns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, version: zoneVersion }),
      })
      const data = await checkResponse(res)

      setRecords(data.records ?? [])
      setZoneVersion(data.version)
      toast('Quick setup applied — DNS pointing to Motive Hosting')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply quick setup')
      throw err // Re-throw so QuickSetup dialog knows it failed
    }
  }

  // Count records by type for the filter bar
  const typeCounts: Record<string, number> = {}
  for (const r of records) {
    typeCounts[r.type] = (typeCounts[r.type] || 0) + 1
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
          <p className="text-sm text-slate">Loading DNS records...</p>
        </div>
      </div>
    )
  }

  if (!zoneExists) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-alt-bg">
          <svg className="h-6 w-6 text-slate" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-muted-white">No DNS Zone</h3>
        <p className="mt-2 text-sm text-slate">
          A DNS zone hasn't been created for this domain yet. Create one to start managing DNS records.
        </p>
        <Button onClick={createZone} disabled={isSubmitting} className="mt-6">
          {isSubmitting ? 'Creating...' : 'Create DNS Zone'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <QuickSetup domain={domain} onApply={handleQuickSetup} />
          <Button variant="secondary" onClick={() => setShowAddForm(true)}>
            Add Record
          </Button>
        </div>
        <Button variant="ghost" onClick={fetchRecords} disabled={loading} className="text-xs">
          Refresh
        </Button>
      </div>

      {/* Type filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TYPES.map((t) => {
          const isAll = t === 'ALL'
          const isActive = isAll ? filterType === null : filterType === t
          const count = isAll ? records.length : (typeCounts[t] || 0)

          return (
            <button
              key={t}
              onClick={() => setFilterType(isAll ? null : t)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-border text-slate hover:border-gold/50 hover:text-muted-white'
              }`}
            >
              {isAll ? 'All' : <RecordTypeBadge type={t} />}
              <span className="tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      {/* Records table */}
      <RecordTable
        records={records}
        filterType={filterType}
        onEdit={(record) => setEditingRecord(record)}
        onDelete={(record) => setDeletingRecord(record)}
      />

      {/* Add Record Dialog */}
      <Dialog open={showAddForm} onClose={() => setShowAddForm(false)} title="Add DNS Record">
        <RecordForm
          onSubmit={handleAddRecord}
          onCancel={() => setShowAddForm(false)}
          isSubmitting={isSubmitting}
        />
      </Dialog>

      {/* Edit Record Dialog */}
      <Dialog
        open={editingRecord !== null}
        onClose={() => setEditingRecord(null)}
        title="Edit DNS Record"
      >
        {editingRecord && (
          <RecordForm
            initialRecord={editingRecord}
            onSubmit={handleEditRecord}
            onCancel={() => setEditingRecord(null)}
            isSubmitting={isSubmitting}
          />
        )}
      </Dialog>

      {/* Delete Confirmation */}
      <DeleteConfirm
        record={deletingRecord}
        open={deletingRecord !== null}
        onClose={() => setDeletingRecord(null)}
        onConfirm={handleDeleteRecord}
        isDeleting={isSubmitting}
      />
    </div>
  )
}
