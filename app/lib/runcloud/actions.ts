import type { RunCloudClient } from './client';

export function createActionCommands(client: RunCloudClient) {
  const sid = client.serverId;

  /** Restart/rebuild the app process */
  async function rebuildApp(appId: number): Promise<void> {
    await client.patch(`/servers/${sid}/webapps/${appId}/rebuild`);
  }

  /** Force a git deploy (runs the deploy script) */
  async function forceDeploy(appId: number, gitId: number): Promise<void> {
    await client.put(`/servers/${sid}/webapps/${appId}/git/${gitId}/script`);
  }

  /** Redeploy SSL certificate (re-provisions Let's Encrypt) */
  async function redeploySSL(appId: number, sslId: number): Promise<void> {
    await client.put(`/servers/${sid}/webapps/${appId}/ssl/${sslId}`);
  }

  return { rebuildApp, forceDeploy, redeploySSL };
}
