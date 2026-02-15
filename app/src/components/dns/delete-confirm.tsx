'use client'

import type { DnsRecord } from '@opensrs/types'
import Dialog from '@/components/ui/dialog'
import Button from '@/components/ui/button'
import RecordTypeBadge from './record-type-badge'

function isCriticalRecord(record: DnsRecord): boolean {
  if (record.type === 'A' && (record.subdomain === '@' || record.subdomain === '')) return true
  if (record.type === 'CNAME' && record.subdomain === 'www') return true
  return false
}

function getRecordValue(record: DnsRecord): string {
  if (record.ip_address) return record.ip_address
  if (record.hostname) return record.hostname
  if (record.text) return record.text.length > 80 ? record.text.slice(0, 77) + '...' : record.text
  return '-'
}

interface DeleteConfirmProps {
  record: DnsRecord | null
  open: boolean
  onClose: () => void
  onConfirm: () => void
  isDeleting: boolean
}

export default function DeleteConfirm({ record, open, onClose, onConfirm, isDeleting }: DeleteConfirmProps) {
  if (!record) return null

  const critical = isCriticalRecord(record)

  return (
    <Dialog open={open} onClose={onClose} title="Delete DNS Record">
      <div className="space-y-4">
        {critical && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
            <p className="text-sm font-medium text-yellow-400">
              Warning: This is a critical record
            </p>
            <p className="mt-1 text-xs text-yellow-400/80">
              Deleting this record may cause your website to become unreachable.
              Make sure you understand the impact before proceeding.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-border bg-card-content p-4">
          <div className="flex items-center gap-3">
            <RecordTypeBadge type={record.type} />
            <span className="font-mono text-sm text-muted-white">{record.subdomain || '@'}</span>
          </div>
          <p className="mt-2 font-mono text-sm text-slate">{getRecordValue(record)}</p>
          {record.priority !== undefined && (
            <p className="mt-1 text-xs text-slate">Priority: {record.priority}</p>
          )}
        </div>

        <p className="text-sm text-slate">
          This action cannot be undone. The record will be permanently removed from your DNS zone.
        </p>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-500 text-white hover:bg-red-600"
          >
            {isDeleting ? 'Deleting...' : 'Delete Record'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
