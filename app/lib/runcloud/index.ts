import { RunCloudClient } from './client';
import { createWebAppCommands } from './webapp';
import { createServerCommands } from './server';
import { createActionCommands } from './actions';
import type { RunCloudConfig } from './types';

export type { RunCloudConfig } from './types';
export { RunCloudError } from './types';
export type {
  RunCloudWebApp,
  RunCloudSSL,
  RunCloudDomain,
  RunCloudGit,
  RunCloudActionLog,
  RunCloudServerHealth,
  RunCloudService,
  RunCloudResponse,
  RunCloudPaginatedResponse,
} from './types';

export function createRunCloudClient(config: RunCloudConfig) {
  const client = new RunCloudClient(config);
  const webapp = createWebAppCommands(client);
  const server = createServerCommands(client);
  const actions = createActionCommands(client);

  return {
    // WebApp reads
    getWebApp: webapp.getWebApp,
    getSSL: webapp.getSSL,
    getDomains: webapp.getDomains,
    getGit: webapp.getGit,
    getActionLog: webapp.getActionLog,

    // Server reads
    getHealth: server.getHealth,
    getServices: server.getServices,

    // Mutations (Phase 2)
    rebuildApp: actions.rebuildApp,
    forceDeploy: actions.forceDeploy,
    redeploySSL: actions.redeploySSL,
  };
}

export type RunCloudApiClient = ReturnType<typeof createRunCloudClient>;
