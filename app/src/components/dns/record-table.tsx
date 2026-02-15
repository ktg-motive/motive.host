'use client'

import type { DnsRecord } from '@opensrs/types'
import RecordTypeBadge from './record-type-badge'
import Button from '@/components/ui/button'

function getRecordValue(record: DnsRecord): string {
  if (record.ip_address) return record.ip_address
  if (record.hostname) return record.hostname
  if (record.text) {
    // Truncate long TXT values for display
    return record.text.length > 60 ? record.text.slice(0, 57) + '...' : record.text
  }
  return '-'
}

function getRecordFullValue(record: DnsRecord): string {
  if (record.ip_address) return record.ip_address
  if (record.hostname) return record.hostname
  if (record.text) return record.text
  return '-'
}

interface RecordTableProps {
  records: DnsRecord[]
  onEdit: (record: DnsRecord) => void
  onDelete: (record: DnsRecord) => void
  filterType: string | null
}

export default function RecordTable({ records, onEdit, onDelete, filterType }: RecordTableProps) {
  const filtered = filterType
    ? records.filter((r) => r.type === filterType)
    : records

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-slate">
          {filterType ? `No ${filterType} records found` : 'No DNS records found'}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-card-content">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">Value</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">Priority</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate">TTL</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {filtered.map((record, idx) => {
            const isNS = record.type === 'NS'
            return (
              <tr key={`${record.type}-${record.subdomain}-${idx}`} className="transition-colors hover:bg-card-content/50">
                <td className="px-4 py-3">
                  <RecordTypeBadge type={record.type} />
                </td>
                <td className="px-4 py-3 font-mono text-sm text-muted-white">
                  {record.subdomain || '@'}
                </td>
                <td className="max-w-xs px-4 py-3 font-mono text-sm text-slate" title={getRecordFullValue(record)}>
                  {getRecordValue(record)}
                </td>
                <td className="px-4 py-3 text-sm text-slate">
                  {record.priority !== undefined ? record.priority : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-slate">
                  {record.ttl !== undefined ? record.ttl : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  {isNS ? (
                    <span className="text-xs text-slate">Managed</span>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" onClick={() => onEdit(record)} className="px-2 py-1 text-xs">
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => onDelete(record)} className="px-2 py-1 text-xs text-red-400 hover:text-red-300">
                        Delete
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
