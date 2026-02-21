import { RunCloudClient } from './client';
import { createWebAppCommands } from './webapp';
import { createServerCommands } from './server';
import { createActionCommands } from './actions';
import { createProvisionCommands } from './provision';
import { cacheInvalidate } from './cache';
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
  CreateWebAppParams,
  InstallSSLParams,
  ConfigureGitParams,
  InstallWordPressParams,
} from './types';

export function createRunCloudClient(config: RunCloudConfig) {
  const client = new RunCloudClient(config);
  const sid = config.serverId;
  const webapp = createWebAppCommands(client);
  const server = createServerCommands(client);
  const actions = createActionCommands(client);
  const provision = createProvisionCommands(client);

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

    // Provisioning (Phase 4)
    createWebApp: provision.createWebApp,
    attachDomain: provision.attachDomain,
    installSSL: provision.installSSL,
    configureGit: provision.configureGit,
    installWordPress: provision.installWordPress,

    // Cache invalidation — call after any mutation so next page load is fresh
    invalidateApp: (appId: number) => cacheInvalidate(`rc:${sid}:webapp:${appId}`),
  };
}

export type RunCloudApiClient = ReturnType<typeof createRunCloudClient>;
