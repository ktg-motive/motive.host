import { z } from 'zod'
import type { DnsRecordType } from '@opensrs/types'

// Valid hostname: alphanumeric, hyphens, dots, or @ for root
const hostnameRegex = /^(@|(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*)$/

// IPv4 address
const ipv4Regex = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/

// IPv6 address (simplified)
const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^([0-9a-fA-F]{1,4}:){1,7}:$|^:(:([0-9a-fA-F]{1,4})){1,7}$|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/

const RECORD_TYPES: DnsRecordType[] = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV']

export const dnsRecordSchema = z.discriminatedUnion('type', [
  // A record
  z.object({
    type: z.literal('A'),
    subdomain: z.string().regex(hostnameRegex, 'Invalid hostname'),
    ip_address: z.string().regex(ipv4Regex, 'Invalid IPv4 address'),
    ttl: z.number().int().min(300).max(86400).optional(),
  }),
  // AAAA record
  z.object({
    type: z.literal('AAAA'),
    subdomain: z.string().regex(hostnameRegex, 'Invalid hostname'),
    ip_address: z.string().regex(ipv6Regex, 'Invalid IPv6 address'),
    ttl: z.number().int().min(300).max(86400).optional(),
  }),
  // CNAME record
  z.object({
    type: z.literal('CNAME'),
    subdomain: z.string().regex(hostnameRegex, 'Invalid hostname').refine(
      (v) => v !== '@',
      'CNAME records cannot be set on the root domain'
    ),
    hostname: z.string().min(1, 'Target hostname is required'),
    ttl: z.number().int().min(300).max(86400).optional(),
  }),
  // MX record
  z.object({
    type: z.literal('MX'),
    subdomain: z.string().regex(hostnameRegex, 'Invalid hostname'),
    hostname: z.string().min(1, 'Mail server hostname is required'),
    priority: z.number().int().min(0).max(65535),
    ttl: z.number().int().min(300).max(86400).optional(),
  }),
  // TXT record
  z.object({
    type: z.literal('TXT'),
    subdomain: z.string().regex(hostnameRegex, 'Invalid hostname'),
    text: z.string().min(1, 'TXT value is required').max(4096, 'TXT value too long'),
    ttl: z.number().int().min(300).max(86400).optional(),
  }),
  // SRV record
  z.object({
    type: z.literal('SRV'),
    subdomain: z.string().min(1, 'Service name is required'),
    hostname: z.string().min(1, 'Target hostname is required'),
    priority: z.number().int().min(0).max(65535),
    weight: z.number().int().min(0).max(65535),
    port: z.number().int().min(0).max(65535),
    ttl: z.number().int().min(300).max(86400).optional(),
  }),
])

export type DnsRecordInput = z.infer<typeof dnsRecordSchema>

export const VALID_RECORD_TYPES = RECORD_TYPES

// Check if a record type is considered critical (deleting it may break the site)
export function isCriticalRecord(type: string, subdomain: string): boolean {
  if (type === 'A' && (subdomain === '@' || subdomain === '')) return true
  if (type === 'CNAME' && subdomain === 'www') return true
  return false
}
