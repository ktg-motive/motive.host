import type { RunCloudClient } from './client';
import type {
  RunCloudServerHealth,
  RunCloudService,
  RunCloudResponse,
  RunCloudPaginatedResponse,
} from './types';
import { cacheGet, cacheSet } from './cache';

const TTL = {
  health: 120_000,
  services: 120_000,
} as const;

export function createServerCommands(client: RunCloudClient) {
  const sid = client.serverId;

  async function getHealth(): Promise<RunCloudServerHealth> {
    const key = `rc:${sid}:health`;
    const cached = cacheGet<RunCloudServerHealth>(key);
    if (cached) return cached;

    const res = await client.get<RunCloudResponse<RunCloudServerHealth>>(
      `/servers/${sid}/stats/realtime`,
    );
    cacheSet(key, res.data, TTL.health);
    return res.data;
  }

  async function getServices(): Promise<RunCloudService[]> {
    const key = `rc:${sid}:services`;
    const cached = cacheGet<RunCloudService[]>(key);
    if (cached) return cached;

    const res = await client.get<RunCloudPaginatedResponse<RunCloudService>>(
      `/servers/${sid}/services`,
    );
    cacheSet(key, res.data, TTL.services);
    return res.data;
  }

  return { getHealth, getServices };
}
