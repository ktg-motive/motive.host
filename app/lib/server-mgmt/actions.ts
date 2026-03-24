// app/lib/server-mgmt/actions.ts
//
// Runtime actions for hosted apps: PM2 process management, SSL renewal,
// deploy log retrieval, and app log retrieval.
//
// Ownership boundary: Owns PM2 interactions for hosted apps.
// Delegates certbot to execSudo.
//
// These functions do server work only -- they do NOT touch the database.
// The API routes handle durable operations and activity logging.

import { readFile } from 'node:fs/promises';
import { execLocal, execSudo, CERTBOT_TIMEOUT, assertValidSlug } from './exec';

const WEBAPPS_DIR = '/home/motive-host/webapps';

/**
 * Restart a PM2-managed app process.
 * For Node.js apps only. Static apps have no PM2 process.
 *
 * Side effects: Restarts the named PM2 process.
 * Failure modes: Throws Error if process doesn't exist in PM2.
 */
export async function restartApp(appSlug: string): Promise<void> {
  assertValidSlug(appSlug);
  try {
    await execLocal('pm2', ['restart', appSlug], { timeout: 15_000 });
  } catch {
    throw new Error(`Failed to restart ${appSlug} -- process may not exist in PM2`);
  }
}

/**
 * Stop a PM2-managed app process.
 *
 * Side effects: Stops the named PM2 process.
 * Failure modes: Throws ExecError if process doesn't exist.
 */
export async function stopApp(appSlug: string): Promise<void> {
  assertValidSlug(appSlug);
  await execLocal('pm2', ['stop', appSlug], { timeout: 15_000 });
}

/**
 * Get PM2 process status for an app.
 * Returns 'not_found' for static apps (no PM2 process).
 *
 * Side effects: Reads PM2 process list.
 * Failure modes: Returns { status: 'not_found' } on any error.
 */
export async function getAppStatus(appSlug: string): Promise<{
  status: 'online' | 'stopped' | 'errored' | 'not_found';
  pid?: number;
  memory?: number;
  restarts?: number;
}> {
  try {
    const { stdout } = await execLocal('pm2', ['jlist'], { timeout: 10_000 });
    const processes = JSON.parse(stdout) as Array<{
      name: string;
      pm2_env: { status: string; pm_uptime: number; restart_time: number };
      pid: number;
      monit: { memory: number };
    }>;

    const proc = processes.find((p) => p.name === appSlug);
    if (!proc) return { status: 'not_found' };

    return {
      status: proc.pm2_env.status as 'online' | 'stopped' | 'errored',
      pid: proc.pid,
      memory: proc.monit.memory,
      restarts: proc.pm2_env.restart_time,
    };
  } catch {
    return { status: 'not_found' };
  }
}

/**
 * Renew or force-reinstall SSL for a domain.
 *
 * Side effects: Runs certbot renew with --force-renewal, reloads nginx.
 * Failure modes: ExecError if certbot fails (rate limit, DNS issues).
 * Idempotency: Safe to call repeatedly (certbot handles renewal internally).
 */
export async function renewSSL(domain: string): Promise<void> {
  await execSudo('certbot', [
    'renew',
    '--force-renewal',
    '--cert-name', domain,
    '--non-interactive',
  ], { timeout: CERTBOT_TIMEOUT });

  // Reload nginx to pick up any renewed certificates
  await execSudo('systemctl', ['reload', 'nginx-rc']);
}

/**
 * Get the last deploy log for an app.
 *
 * Side effects: Reads from disk.
 * Failure modes: Returns null if file doesn't exist.
 */
export async function getDeployLog(appSlug: string): Promise<string | null> {
  assertValidSlug(appSlug);
  try {
    const content = await readFile(`${WEBAPPS_DIR}/${appSlug}/.deploy.log`, 'utf-8');
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Get PM2 logs for an app (last N lines).
 *
 * Side effects: Reads PM2 log files.
 * Failure modes: Returns empty strings on error.
 */
export async function getAppLogs(
  appSlug: string,
  lines: number = 100,
): Promise<{ out: string; err: string }> {
  assertValidSlug(appSlug);
  const [outResult, errResult] = await Promise.all([
    execLocal('pm2', ['logs', appSlug, '--out', '--nostream', '--lines', String(lines)])
      .catch(() => ({ stdout: '' })),
    execLocal('pm2', ['logs', appSlug, '--err', '--nostream', '--lines', String(lines)])
      .catch(() => ({ stdout: '' })),
  ]);
  return { out: outResult.stdout, err: errResult.stdout };
}
