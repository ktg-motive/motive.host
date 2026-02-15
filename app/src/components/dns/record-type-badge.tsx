import type { DnsRecordType } from '@opensrs/types'

const typeColors: Record<string, string> = {
  A: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  AAAA: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  CNAME: 'bg-green-500/10 text-green-400 border-green-500/20',
  MX: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  TXT: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  SRV: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  NS: 'bg-slate/10 text-slate border-slate/20',
}

export default function RecordTypeBadge({ type }: { type: DnsRecordType | string }) {
  const colors = typeColors[type] ?? 'bg-slate/10 text-slate border-slate/20'

  return (
    <span className={`inline-block rounded border px-2 py-0.5 font-mono text-xs font-medium ${colors}`}>
      {type}
    </span>
  )
}
