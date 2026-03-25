// app/lib/server-mgmt/analytics.ts
//
// Injects the Umami analytics tracking script into built HTML files
// during the deploy pipeline. Best-effort -- failures are logged
// but never block deploys.

import { execBash, assertValidSlug } from './exec';

const WEBAPPS_DIR = '/home/motive-host/webapps';
const UMAMI_SCRIPT_URL = process.env.UMAMI_SCRIPT_URL || 'https://analytics.motive.host/script.js';

/** Validates that a string is a valid UUID v4 format. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Inject the Umami tracking script into all HTML files in an app's webroot.
 *
 * Searches both `dist/` and `public/` directories under the app's webroot.
 * For each HTML file that doesn't already contain "analytics.motive.host",
 * injects the tracking script before </head>.
 *
 * Best-effort: logs warnings but never throws.
 *
 * @param appSlug - The app's slug (validated for path safety)
 * @param umamiWebsiteId - The Umami website ID for the data-website-id attribute
 */
export async function injectAnalyticsScript(
  appSlug: string,
  umamiWebsiteId: string,
): Promise<void> {
  try {
    assertValidSlug(appSlug);
  } catch (err) {
    console.warn('[analytics] Invalid app slug, skipping injection:', err instanceof Error ? err.message : err);
    return;
  }

  if (!UUID_RE.test(umamiWebsiteId)) {
    console.warn('[analytics] Invalid umamiWebsiteId format, skipping injection:', umamiWebsiteId);
    return;
  }

  const appDir = `${WEBAPPS_DIR}/${appSlug}`;
  const scriptTag = `<script defer src="${UMAMI_SCRIPT_URL}" data-website-id="${umamiWebsiteId}"></script>`;

  // Check both dist/ and public/ directories for HTML files
  const searchDirs = [`${appDir}/dist`, `${appDir}/public`];

  for (const dir of searchDirs) {
    try {
      // Check if directory exists
      await execBash(`test -d "${dir}"`, { timeout: 5_000 });
    } catch {
      // Directory doesn't exist -- skip
      continue;
    }

    try {
      // Find all .html files in the directory
      const { stdout } = await execBash(
        `find "${dir}" -name "*.html" -type f 2>/dev/null`,
        { timeout: 10_000 },
      );

      const htmlFiles = stdout.trim().split('\n').filter(Boolean);
      if (htmlFiles.length === 0) continue;

      console.log(`[analytics] Found ${htmlFiles.length} HTML file(s) in ${dir}`);

      for (const filePath of htmlFiles) {
        try {
          // Skip files that already have the analytics script
          await execBash(
            `grep -q "analytics.motive.host" "${filePath}"`,
            { timeout: 5_000 },
          );
          // grep succeeded = already has analytics, skip
          continue;
        } catch {
          // grep failed = doesn't have analytics, inject it
        }

        try {
          // Inject the script tag before </head>
          // Use sed with a different delimiter to avoid issues with URLs containing /
          await execBash(
            `sed -i 's|</head>|${scriptTag}\n</head>|i' "${filePath}"`,
            { timeout: 5_000 },
          );
          console.log(`[analytics] Injected tracking script into ${filePath}`);
        } catch (err) {
          console.warn(
            `[analytics] Failed to inject into ${filePath}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } catch (err) {
      console.warn(
        `[analytics] Failed to process ${dir}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
