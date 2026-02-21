import type { RunCloudClient } from './client';
import type {
  RunCloudWebApp,
  RunCloudSSL,
  RunCloudDomain,
  RunCloudGit,
  RunCloudActionLog,
  RunCloudResponse,
  RunCloudPaginatedResponse,
} from './types';
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
    if (cached) return cached;

    const res = await client.get<RunCloudResponse<RunCloudWebApp>>(
      `/servers/${sid}/webapps/${appId}`,
    );
    cacheSet(key, res.data, TTL.webapp);
    return res.data;
  }

  async function getSSL(appId: number): Promise<RunCloudSSL | null> {
    const key = `rc:${sid}:webapp:${appId}:ssl`;
    const cached = cacheGet<RunCloudSSL | null>(key);
    if (cached !== undefined) return cached;

    try {
      const res = await client.get<RunCloudResponse<RunCloudSSL>>(
        `/servers/${sid}/webapps/${appId}/ssl`,
      );
      cacheSet(key, res.data, TTL.ssl);
      return res.data;
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        cacheSet(key, null, TTL.ssl);
        return null;
      }
      throw err;
    }
  }

  async function getDomains(appId: number): Promise<RunCloudDomain[]> {
    const key = `rc:${sid}:webapp:${appId}:domains`;
    const cached = cacheGet<RunCloudDomain[]>(key);
    if (cached) return cached;

    const res = await client.get<RunCloudPaginatedResponse<RunCloudDomain>>(
      `/servers/${sid}/webapps/${appId}/domains`,
    );
    cacheSet(key, res.data, TTL.domains);
    return res.data;
  }

  async function getGit(appId: number): Promise<RunCloudGit | null> {
    const key = `rc:${sid}:webapp:${appId}:git`;
    const cached = cacheGet<RunCloudGit | null>(key);
    if (cached !== undefined) return cached;

    try {
      const res = await client.get<RunCloudResponse<RunCloudGit>>(
        `/servers/${sid}/webapps/${appId}/git`,
      );
      cacheSet(key, res.data, TTL.git);
      return res.data;
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) {
        cacheSet(key, null, TTL.git);
        return null;
      }
      throw err;
    }
  }

  async function getActionLog(appId: number): Promise<RunCloudActionLog[]> {
    const key = `rc:${sid}:webapp:${appId}:logs`;
    const cached = cacheGet<RunCloudActionLog[]>(key);
    if (cached) return cached;

    const res = await client.get<RunCloudPaginatedResponse<RunCloudActionLog>>(
      `/servers/${sid}/webapps/${appId}/log`,
    );
    cacheSet(key, res.data, TTL.logs);
    return res.data;
  }

  return { getWebApp, getSSL, getDomains, getGit, getActionLog };
}
