import { NextResponse } from 'next/server';
import { OMAError } from '@opensrs-email';
import { RunCloudError } from '@runcloud';

export function handleRunCloudError(error: unknown): NextResponse {
  if (error instanceof RunCloudError) {
    console.error(`RunCloud Error ${error.statusCode}: ${error.apiMessage}`);
    if (error.statusCode === 401) {
      return NextResponse.json(
        { error: 'Unable to fetch hosting status — contact support' },
        { status: 502 },
      );
    }
    if (error.statusCode === 404) {
      return NextResponse.json({ error: 'Hosting resource not found' }, { status: 404 });
    }
    if (error.statusCode === 429) {
      return NextResponse.json(
        { error: 'Hosting service is rate limited — try again shortly' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Hosting service error' }, { status: 502 });
  }
  return handleApiError(error);
}

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
