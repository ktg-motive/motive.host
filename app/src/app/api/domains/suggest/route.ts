import { NextResponse } from 'next/server'
import { createOpenSRSClient } from '@opensrs'

const opensrs = createOpenSRSClient({
  apiKey: process.env.OPENSRS_API_KEY!,
  username: process.env.OPENSRS_RESELLER_USERNAME!,
  environment: (process.env.OPENSRS_ENVIRONMENT as 'test' | 'live') || 'test',
})

export async function POST(request: Request) {
  try {
    const { query } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 })
    }

    const suggestions = await opensrs.suggestDomains(query)

    return NextResponse.json({
      suggestions: suggestions
        .filter((s) => s.status === 'available')
        .slice(0, 8)
        .map((s) => ({ domain: s.domain })),
    })
  } catch (error) {
    console.error('Domain suggest error:', error)
    return NextResponse.json({ error: 'Suggestion failed' }, { status: 500 })
  }
}
