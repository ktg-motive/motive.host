import { createRunCloudClient } from '@runcloud';

export function getRunCloudClient() {
  if (!process.env.RUNCLOUD_API_TOKEN) {
    throw new Error('RUNCLOUD_API_TOKEN is not set');
  }
  if (!process.env.RUNCLOUD_SERVER_ID) {
    throw new Error('RUNCLOUD_SERVER_ID is not set');
  }
  const serverId = parseInt(process.env.RUNCLOUD_SERVER_ID, 10);
  if (isNaN(serverId)) {
    throw new Error('RUNCLOUD_SERVER_ID must be a valid integer');
  }
  return createRunCloudClient({
    apiToken: process.env.RUNCLOUD_API_TOKEN,
    serverId,
  });
}
