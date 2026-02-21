import type { RunCloudClient } from './client';
import type {
  RunCloudWebApp,
  RunCloudSSL,
  RunCloudSSLDomain,
  RunCloudDomain,
  RunCloudGit,
  RunCloudActionLog,
  RunCloudResponse,
  RunCloudPaginatedResponse,
} from './types';
import { RunCloudError } from './types';
import { cacheGet, cacheSet } from './cache';

const TTL = {
  webapp: 60_000,
  ssl: 300_000,
  domains: 300_000,
  git: 60_000,
  logs: 30_000,
} as const;

export function createWebAppCommands(client: RunCloudClient) {
  const sid = client.serverId;

  async function getWebApp(appId: number): Promise<RunCloudWebApp> {
    const key = `rc:${sid}:webapp:${appId}`;
    const cached = cacheGet<RunCloudWebApp>(key);
    if (cached !== undefined) return cached;

    // v3 API returns the webapp object directly (no { data: ... } wrapper)
    const webapp = await client.get<RunCloudWebApp>(
      `/servers/${sid}/webapps/${appId}`,
    );
    cacheSet(key, webapp, TTL.webapp);
    return webapp;
  }

  async function getSSL(appId: number): Promise<RunCloudSSL | null> {
    const key = `rc:${sid}:webapp:${appId}:ssl`;
    const cached = cacheGet<RunCloudSSL | null>(key);
    if (cached !== undefined) return cached;

    try {
      // v3 API returns { data: RunCloudSSLDomain[] } — SSL is nested under each domain
      const res = await client.get<{ data: RunCloudSSLDomain[] }>(
        `/servers/${sid}/webapps/${appId}/ssl`,
      );
      const domainWithSsl = res.data.find((d) => d.ssl !== null);
      if (!domainWithSsl?.ssl) {
        cacheSet(key, null, TTL.ssl);
        return null;
      }
      const { ssl: sslInfo } = domainWithSsl;
      const normalized: RunCloudSSL = {
        id: sslInfo.id,
        webapp_id: appId,
        method: sslInfo.method,
        ssl_enabled: true,
        encryption_type: sslInfo.authorizationMethod,
        hsts: sslInfo.enableHsts,
        hsts_subdomains: false,
        hsts_preload: sslInfo.enableHstsPreload,
        validUntil: sslInfo.validUntil,
        created_at: sslInfo.created_at,
      };
      cacheSet(key, normalized, TTL.ssl);
      return normalized;
    } catch (err) {
      if (err instanceof RunCloudError && err.statusCode === 404) {
        cacheSet(key, null, TTL.ssl);
        return null;
      }
      throw err;
    }
  }

  async function getDomains(appId: number): Promise<RunCloudDomain[]> {
    const key = `rc:${sid}:webapp:${appId}:domains`;
    const cached = cacheGet<RunCloudDomain[]>(key);
    if (cached !== undefined) return cached;

    try {
      const res = await client.get<RunCloudPaginatedResponse<RunCloudDomain>>(
        `/servers/${sid}/webapps/${appId}/domains`,
      );
      cacheSet(key, res.data, TTL.domains);
      return res.data;
    } catch (err) {
      if (err instanceof RunCloudError && err.statusCode === 404) {
        cacheSet(key, [], TTL.domains);
        return [];
      }
      throw err;
    }
  }

  async function getGit(appId: number): Promise<RunCloudGit | null> {
    const key = `rc:${sid}:webapp:${appId}:git`;
    const cached = cacheGet<RunCloudGit | null>(key);
    if (cached !== undefined) return cached;

    try {
      // v3 API returns the git object directly (no { data: ... } wrapper)
      const git = await client.get<RunCloudGit>(
        `/servers/${sid}/webapps/${appId}/git`,
      );
      cacheSet(key, git, TTL.git);
      return git;
    } catch (err) {
      if (err instanceof RunCloudError && err.statusCode === 404) {
        cacheSet(key, null, TTL.git);
        return null;
      }
      throw err;
    }
  }

  async function getActionLog(appId: number): Promise<RunCloudActionLog[]> {
    const key = `rc:${sid}:webapp:${appId}:logs`;
    const cached = cacheGet<RunCloudActionLog[]>(key);
    if (cached !== undefined) return cached;

    try {
      const res = await client.get<RunCloudPaginatedResponse<RunCloudActionLog>>(
        `/servers/${sid}/webapps/${appId}/log`,
      );
      cacheSet(key, res.data, TTL.logs);
      return res.data;
    } catch (err) {
      if (err instanceof RunCloudError && err.statusCode === 404) {
        cacheSet(key, [], TTL.logs);
        return [];
      }
      throw err;
    }
  }

  return { getWebApp, getSSL, getDomains, getGit, getActionLog };
}
