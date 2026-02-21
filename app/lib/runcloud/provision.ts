import type { RunCloudClient } from './client';
import type {
  RunCloudWebApp,
  RunCloudDomain,
  RunCloudSSL,
  RunCloudGit,
  CreateWebAppParams,
  InstallSSLParams,
  ConfigureGitParams,
  InstallWordPressParams,
} from './types';

export function createProvisionCommands(client: RunCloudClient) {
  const sid = client.serverId;

  /** Create a new web app on the server */
  async function createWebApp(params: CreateWebAppParams): Promise<RunCloudWebApp> {
    return client.post<RunCloudWebApp>(
      `/servers/${sid}/webapps/custom`,
      params,
    );
  }

  /** Attach a domain to an existing web app */
  async function attachDomain(appId: number, domain: string): Promise<RunCloudDomain> {
    return client.post<RunCloudDomain>(
      `/servers/${sid}/webapps/${appId}/domains`,
      { name: domain },
    );
  }

  /** Install SSL (Let's Encrypt) on an app */
  async function installSSL(appId: number, params: InstallSSLParams): Promise<RunCloudSSL> {
    return client.post<RunCloudSSL>(
      `/servers/${sid}/webapps/${appId}/ssl`,
      params,
    );
  }

  /** Configure git deployment for an app */
  async function configureGit(appId: number, params: ConfigureGitParams): Promise<RunCloudGit> {
    return client.post<RunCloudGit>(
      `/servers/${sid}/webapps/${appId}/git`,
      {
        provider: params.provider,
        repository: params.repository,
        branch: params.branch,
        auto_deploy: params.autoDeploy,
        ...(params.deployScript ? { deploy_script: params.deployScript } : {}),
      },
    );
  }

  /**
   * Install WordPress via RunCloud's installer.
   * NOTE: RunCloud's installer endpoint may return an async job ID rather than completing
   * synchronously. If WordPress installs are unreliable, check whether the response contains
   * a job token that requires polling. For now we treat the response as fire-and-confirm.
   */
  async function installWordPress(appId: number, params: InstallWordPressParams): Promise<void> {
    await client.post<unknown>(
      `/servers/${sid}/webapps/${appId}/installer`,
      {
        title: params.title,
        admin_user: params.adminUser,
        admin_password: params.adminPassword,
        admin_email: params.adminEmail,
        ...(params.dbName ? { db_name: params.dbName } : {}),
      },
    );
  }

  return { createWebApp, attachDomain, installSSL, configureGit, installWordPress };
}
