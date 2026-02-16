import { NextResponse } from 'next/server';
import { OMAError } from '@opensrs-email';

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof OMAError) {
    console.error(`OMA Error ${error.code}: ${error.omaMessage}`);
    if (error.code === 404 || error.omaMessage.includes('not found')) {
      return NextResponse.json({ error: 'Resource not found on email platform' }, { status: 404 });
    }
    if (error.code === 409 || error.omaMessage.includes('already exists')) {
      return NextResponse.json({ error: 'Resource already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Email platform error' }, { status: 502 });
  }

  console.error('Unexpected error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
