'use client'

import { useState } from 'react'
import type { DnsRecord, DnsRecordType } from '@opensrs/types'
import Button from '@/components/ui/button'
import Input from '@/components/ui/input'
import Select from '@/components/ui/select'

const RECORD_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV']

interface RecordFormProps {
  initialRecord?: DnsRecord
  onSubmit: (record: DnsRecord) => void
  onCancel: () => void
  isSubmitting: boolean
}

export default function RecordForm({ initialRecord, onSubmit, onCancel, isSubmitting }: RecordFormProps) {
  const [type, setType] = useState<DnsRecordType>(initialRecord?.type ?? 'A')
  const [subdomain, setSubdomain] = useState(initialRecord?.subdomain ?? '')
  const [ipAddress, setIpAddress] = useState(initialRecord?.ip_address ?? '')
  const [hostname, setHostname] = useState(initialRecord?.hostname ?? '')
  const [text, setText] = useState(initialRecord?.text ?? '')
  const [priority, setPriority] = useState(initialRecord?.priority?.toString() ?? '10')
  const [weight, setWeight] = useState(initialRecord?.weight?.toString() ?? '0')
  const [port, setPort] = useState(initialRecord?.port?.toString() ?? '0')
  const [ttl, setTtl] = useState('3600')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEdit = !!initialRecord

  function handleTypeChange(newType: DnsRecordType) {
    setType(newType)
    if (!isEdit) {
      setIpAddress('')
      setHostname('')
      setText('')
      setPriority('10')
      setWeight('0')
      setPort('0')
      setErrors({})
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!subdomain && type !== 'SRV') {
      // Allow empty subdomain (treated as @)
    }

    if (type === 'A') {
      const ipv4 = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/
      if (!ipv4.test(ipAddress)) {
        newErrors.ip_address = 'Enter a valid IPv4 address'
      }
    }

    if (type === 'AAAA') {
      if (!ipAddress || ipAddress.length < 2) {
        newErrors.ip_address = 'Enter a valid IPv6 address'
      }
    }

    if (type === 'CNAME') {
      if (!hostname) newErrors.hostname = 'Target hostname is required'
      if (subdomain === '@' || subdomain === '') {
        newErrors.subdomain = 'CNAME cannot be set on root domain'
      }
    }

    if (type === 'MX') {
      if (!hostname) newErrors.hostname = 'Mail server is required'
      const p = parseInt(priority, 10)
      if (isNaN(p) || p < 0 || p > 65535) newErrors.priority = 'Priority must be 0-65535'
    }

    if (type === 'TXT') {
      if (!text) newErrors.text = 'TXT value is required'
    }

    if (type === 'SRV') {
      if (!subdomain) newErrors.subdomain = 'Service name is required (e.g. _sip._tcp)'
      if (!hostname) newErrors.hostname = 'Target hostname is required'
      const p = parseInt(priority, 10)
      if (isNaN(p) || p < 0) newErrors.priority = 'Invalid priority'
      const w = parseInt(weight, 10)
      if (isNaN(w) || w < 0) newErrors.weight = 'Invalid weight'
      const pt = parseInt(port, 10)
      if (isNaN(pt) || pt < 0 || pt > 65535) newErrors.port = 'Port must be 0-65535'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const record: DnsRecord = {
      type,
      subdomain: subdomain || '@',
    }

    if (type === 'A' || type === 'AAAA') {
      record.ip_address = ipAddress
    }
    if (type === 'CNAME' || type === 'MX' || type === 'SRV') {
      record.hostname = hostname
    }
    if (type === 'TXT') {
      record.text = text
    }
    if (type === 'MX' || type === 'SRV') {
      record.priority = parseInt(priority, 10)
    }
    if (type === 'SRV') {
      record.weight = parseInt(weight, 10)
      record.port = parseInt(port, 10)
    }

    const parsedTtl = parseInt(ttl, 10)
    record.ttl = isNaN(parsedTtl) || parsedTtl < 300 ? 3600 : parsedTtl

    onSubmit(record)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Select
        id="record-type"
        label="Record Type"
        value={type}
        onChange={(e) => handleTypeChange(e.target.value as DnsRecordType)}
        disabled={isEdit}
      >
        {RECORD_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </Select>

      <Input
        id="subdomain"
        label={type === 'SRV' ? 'Service (e.g. _sip._tcp)' : 'Name / Subdomain'}
        placeholder={type === 'SRV' ? '_sip._tcp' : '@ for root, or subdomain'}
        value={subdomain}
        onChange={(e) => setSubdomain(e.target.value)}
        error={errors.subdomain}
      />

      {(type === 'A' || type === 'AAAA') && (
        <Input
          id="ip-address"
          label={type === 'A' ? 'IPv4 Address' : 'IPv6 Address'}
          placeholder={type === 'A' ? '192.168.1.1' : '2001:db8::1'}
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
          error={errors.ip_address}
        />
      )}

      {(type === 'CNAME' || type === 'MX' || type === 'SRV') && (
        <Input
          id="hostname"
          label={type === 'MX' ? 'Mail Server' : 'Target Hostname'}
          placeholder={type === 'MX' ? 'mail.example.com' : 'target.example.com'}
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          error={errors.hostname}
        />
      )}

      {type === 'TXT' && (
        <div>
          <label htmlFor="txt-value" className="mb-1.5 block text-sm font-medium text-slate">
            Value
          </label>
          <textarea
            id="txt-value"
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            rows={3}
            placeholder="v=spf1 include:example.com ~all"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {errors.text && <p className="mt-1 text-xs text-red-400">{errors.text}</p>}
        </div>
      )}

      {(type === 'MX' || type === 'SRV') && (
        <Input
          id="priority"
          label="Priority"
          type="number"
          min="0"
          max="65535"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          error={errors.priority}
        />
      )}

      {type === 'SRV' && (
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="weight"
            label="Weight"
            type="number"
            min="0"
            max="65535"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            error={errors.weight}
          />
          <Input
            id="port"
            label="Port"
            type="number"
            min="0"
            max="65535"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            error={errors.port}
          />
        </div>
      )}

      <Input
        id="ttl"
        label="TTL (seconds)"
        type="number"
        min="300"
        max="86400"
        value={ttl}
        onChange={(e) => setTtl(e.target.value)}
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEdit ? 'Update Record' : 'Add Record'}
        </Button>
      </div>
    </form>
  )
}
