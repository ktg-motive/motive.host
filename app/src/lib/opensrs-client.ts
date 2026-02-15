import { createOpenSRSClient } from '@opensrs'

export function getOpenSRSClient() {
  return createOpenSRSClient({
    apiKey: process.env.OPENSRS_API_KEY!,
    username: process.env.OPENSRS_RESELLER_USERNAME!,
    environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
  })
}
