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
    // OMA Error 6 = known attribute with a bad/out-of-range value (e.g. a quota above
    // the per-mailbox cap). Return a 422 instead of an opaque 502, but with a fixed
    // message — do not forward the raw omaMessage, which is untrusted platform text
    // that could leak internal details (BUG-15). Call sites that know the specific
    // field (e.g. the mailbox-create route) return their own precise message.
    if (error.code === 6) {
      return NextResponse.json(
        { error: 'The email platform rejected that value. Choose a different setting or contact support.' },
        { status: 422 },
      );
    }
    // OMA Error 4 = unknown attribute or requestor lacks permission. This is a
    // config/programming error on our side, not something the user can fix — the raw
    // reason is already logged above; return a generic 400.
    if (error.code === 4) {
      return NextResponse.json(
        { error: "That change isn't permitted by the email platform." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Email platform error' }, { status: 502 });
  }

  console.error('Unexpected error:', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
