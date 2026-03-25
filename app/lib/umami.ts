// app/lib/umami.ts
//
// Lightweight Umami analytics API client.
// Used during provisioning (create/delete websites) and potentially
// from the admin dashboard. All operations are best-effort -- analytics
// should never block provisioning or deploys.
//
// Auth: Umami uses JWT tokens obtained via POST /api/auth/login.
// Tokens are cached in module scope and refreshed when expired.

const UMAMI_API_URL = process.env.UMAMI_API_URL || 'http://localhost:3002';
const UMAMI_API_USERNAME = process.env.UMAMI_API_USERNAME || 'admin';
const UMAMI_API_PASSWORD = process.env.UMAMI_API_PASSWORD;

interface UmamiWebsite {
  id: string;
  name: string;
  domain: string;
}

interface UmamiAuthResponse {
  token: string;
  user: { id: string; username: string };
}

// Module-scoped token cache
let cachedToken: string | null = null;
let tokenExpiresAt = 0; // Unix ms -- refresh before this time

/**
 * Obtain a JWT token from Umami, using the module-scoped cache.
 *
 * Umami tokens last ~24h by default. We cache for 23h to avoid
 * edge-case expiry during a request.
 *
 * Returns null if authentication fails (missing password, bad creds, etc).
 */
async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!UMAMI_API_PASSWORD) {
    console.warn('[umami] UMAMI_API_PASSWORD not set -- skipping analytics');
    return null;
  }

  try {
    const res = await fetch(`${UMAMI_API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: UMAMI_API_USERNAME,
        password: UMAMI_API_PASSWORD,
      }),
    });

    if (!res.ok) {
      console.warn(`[umami] Auth failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as UmamiAuthResponse;
    cachedToken = data.token;
    // Cache for 23 hours (Umami default token lifetime is 24h)
    tokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    return cachedToken;
  } catch (err) {
    console.warn('[umami] Auth request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Create a website in Umami for tracking.
 *
 * Returns the created website object, or null if the request fails.
 * Failures are logged but never thrown -- analytics is best-effort.
 */
export async function createWebsite(
  name: string,
  domain: string,
): Promise<UmamiWebsite | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${UMAMI_API_URL}/api/websites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, domain }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[umami] createWebsite failed: ${res.status} ${res.statusText} -- ${body}`);
      return null;
    }

    const website = (await res.json()) as UmamiWebsite;
    console.log(`[umami] Created website: ${website.id} for ${domain}`);
    return website;
  } catch (err) {
    console.warn('[umami] createWebsite request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Delete a website from Umami.
 *
 * Best-effort -- logs warnings but never throws.
 */
export async function deleteWebsite(websiteId: string): Promise<void> {
  const token = await getToken();
  if (!token) return;

  try {
    const res = await fetch(`${UMAMI_API_URL}/api/websites/${websiteId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[umami] deleteWebsite failed: ${res.status} ${res.statusText} -- ${body}`);
      return;
    }

    console.log(`[umami] Deleted website: ${websiteId}`);
  } catch (err) {
    console.warn('[umami] deleteWebsite request failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Get a website from Umami by ID.
 *
 * Returns the website object, or null if not found or request fails.
 * Best-effort -- logs warnings but never throws.
 */
export async function getWebsite(websiteId: string): Promise<UmamiWebsite | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    const res = await fetch(`${UMAMI_API_URL}/api/websites/${websiteId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      const body = await res.text().catch(() => '');
      console.warn(`[umami] getWebsite failed: ${res.status} ${res.statusText} -- ${body}`);
      return null;
    }

    return (await res.json()) as UmamiWebsite;
  } catch (err) {
    console.warn('[umami] getWebsite request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
