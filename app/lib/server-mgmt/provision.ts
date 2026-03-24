// app/lib/server-mgmt/provision.ts
//
// Server provisioning pipeline. Creates app directories, writes initial
// nginx config, installs SSL, clones git repos, and generates deploy keys.
// Replaces RunCloud's createWebApp(), attachDomain(), installSSL(), configureGit().
//
// Ownership boundary: Owns /home/motive-host/webapps/{appSlug} and
// /home/motive-host/.ssh/{appSlug}_deploy. Delegates nginx config to nginx.ts.
//
// These functions do server work only -- they do NOT touch the database.
// The provision route handles DB inserts and rollback.

import { execLocal, execSudo, execBash, writeSudoFile, CLONE_TIMEOUT, CERTBOT_TIMEOUT } from './exec';
import {
  writeServerBlock,
  generateSslConf,
  generateRedirectConf,
  buildCertDomains,
  removeServerBlock,
  type AppTemplate,
  type ServerBlockOptions,
} from './nginx';

const WEBAPPS_DIR = '/home/motive-host/webapps';
const SSH_KEY_DIR = '/home/motive-host/.ssh';
const NGINX_CONF_DIR = '/etc/nginx-rc/conf.d';
const MOTIVE_USER = 'motive-host';
const SSL_EMAIL = 'ssl@motive.host';

export interface ProvisionAppOptions {
  appSlug: string;
  domain: string;
  template: AppTemplate;
  port?: number;
  gitRepo?: string;
  gitBranch?: string;
  gitSubdir?: string;
  aliases?: string[];
  wwwBehavior?: 'add_www' | 'no_www' | 'as_is';
  dnsOwnership?: 'motive' | 'external';
  staticOutputDir?: string;
}

/**
 * Step 1: Create the webapp directory with correct ownership.
 *
 * Side effects: Creates /home/motive-host/webapps/{appSlug} with 755 perms.
 * Failure modes: ExecError if mkdir or chown fails.
 * Idempotency: Safe to call repeatedly (mkdir -p, chown is idempotent).
 */
export async function createAppDirectory(appSlug: string): Promise<void> {
  const appDir = `${WEBAPPS_DIR}/${appSlug}`;
  await execSudo('mkdir', ['-p', appDir]);
  await execSudo('chown', [`${MOTIVE_USER}:${MOTIVE_USER}`, appDir]);
  await execLocal('chmod', ['755', appDir]);
}

/**
 * Remove the webapp directory. Used during provision rollback.
 *
 * Side effects: Removes /home/motive-host/webapps/{appSlug}.
 * Idempotency: Safe to call if directory doesn't exist (rm -rf).
 */
export async function removeAppDirectory(appSlug: string): Promise<void> {
  await execSudo('rm', ['-rf', `${WEBAPPS_DIR}/${appSlug}`]);
}

/**
 * Step 2: Write the Nginx server block and reload.
 * Delegates entirely to nginx.ts writeServerBlock().
 *
 * Side effects: Writes nginx config, reloads nginx.
 * Failure modes: ExecError if nginx-rc -t fails (config is rolled back by nginx.ts).
 * Idempotency: Safe to call repeatedly.
 */
export async function configureNginx(options: ServerBlockOptions): Promise<void> {
  await writeServerBlock(options);
}

/**
 * Step 3: Install SSL via certbot in webroot mode.
 *
 * Uses --webroot (NOT --nginx) so certbot never mutates our server block.
 * After cert issuance, writes ssl.conf + redirect.conf and rewrites main.conf
 * with sslOnly: true.
 *
 * Port 80 ownership rule:
 *   Before SSL: main.conf owns port 80 (listen 80).
 *   After SSL: redirect.conf owns port 80 (301 to HTTPS).
 *              main.conf owns port 443 (listen 443 ssl).
 *              ssl.conf provides cert paths (included by main.conf via glob).
 *
 * Side effects: Runs certbot, writes ssl.conf + redirect.conf, rewrites
 *   main.conf with sslOnly: true, reloads nginx.
 * Failure modes: ExecError if certbot fails (DNS not pointed, rate limit).
 *   In this case, NO files are written and main.conf is unchanged.
 * Idempotency: If cert already exists, certbot may fail or renew. Either
 *   way ssl.conf/redirect.conf are (re)written and nginx is reloaded.
 */
export async function installSSL(options: {
  domain: string;
  appSlug: string;
  template: AppTemplate;
  port?: number;
  aliases?: string[];
  wwwBehavior?: 'add_www' | 'no_www' | 'as_is';
  staticOutputDir?: string;
  staging?: boolean;
}): Promise<boolean> {
  const { domain, appSlug, template, port, aliases, wwwBehavior, staticOutputDir, staging } = options;
  const appDir = `${WEBAPPS_DIR}/${appSlug}`;
  const confDir = `${NGINX_CONF_DIR}/${appSlug}.d`;

  // Build the list of domains for the cert
  const certDomains = buildCertDomains({ domain, aliases, wwwBehavior });

  // Step 1: Obtain cert via webroot
  const certbotArgs = [
    'certonly', '--webroot',
    '-w', appDir,
    '--non-interactive',
    '--agree-tos',
    '--email', SSL_EMAIL,
  ];
  for (const d of certDomains) {
    certbotArgs.push('-d', d);
  }
  if (staging) {
    certbotArgs.push('--staging');
  }
  await execSudo('certbot', certbotArgs, { timeout: CERTBOT_TIMEOUT });

  // Steps 2-5: Write ssl.conf, rewrite main.conf, write redirect.conf, reload.
  // If any step fails after certbot succeeded, roll back to pre-SSL nginx state
  // (http-only). The cert files in /etc/letsencrypt/ are left in place for retry.
  try {
    // Step 2: Write ssl.conf (cert paths only, NO listen directives)
    const sslConf = generateSslConf(domain);
    await writeSudoFile(`${confDir}/ssl.conf`, sslConf);

    // Step 3: Rewrite main.conf with sslOnly: true (listen 443 ssl)
    await writeServerBlock({
      appSlug, domain, template, port, sslOnly: true,
      aliases, wwwBehavior, staticOutputDir,
    });

    // Step 4: Write redirect.conf (owns port 80 -> 301 to HTTPS)
    const redirectConf = generateRedirectConf(appSlug, { domain, aliases, wwwBehavior });
    await writeSudoFile(`${confDir}/redirect.conf`, redirectConf);

    // Step 5: Test and reload
    await execSudo('/usr/local/sbin/nginx-rc', ['-t']);
    await execSudo('systemctl', ['reload', 'nginx-rc']);
  } catch (err) {
    // Rollback: remove ssl.conf and redirect.conf, restore main.conf to http-only
    console.error(`[installSSL] Post-certbot step failed for ${domain}, rolling back nginx config:`, err);
    try {
      await execSudo('rm', ['-f', `${confDir}/ssl.conf`]);
      await execSudo('rm', ['-f', `${confDir}/redirect.conf`]);
      // Restore main.conf to http-only (no sslOnly flag)
      await writeServerBlock({
        appSlug, domain, template, port,
        aliases, wwwBehavior, staticOutputDir,
      });
    } catch (rollbackErr) {
      console.error(`[installSSL] Rollback also failed for ${domain}:`, rollbackErr);
    }
    throw err;
  }

  return true;
}

/**
 * Generate an ed25519 deploy key for an app.
 *
 * Side effects: Creates /home/motive-host/.ssh/{appSlug}_deploy (private)
 *   and {appSlug}_deploy.pub (public) with 600/644 permissions.
 * Failure modes: ExecError if ssh-keygen fails.
 */
export async function generateDeployKey(appSlug: string): Promise<{
  publicKey: string;
  keyPath: string;
}> {
  const keyPath = `${SSH_KEY_DIR}/${appSlug}_deploy`;

  await execLocal('ssh-keygen', [
    '-t', 'ed25519',
    '-f', keyPath,
    '-N', '',
    '-C', `deploy@${appSlug}`,
    '-q',
  ]);

  await execLocal('chmod', ['600', keyPath]);
  await execLocal('chmod', ['644', `${keyPath}.pub`]);

  const { stdout: publicKey } = await execLocal('cat', [`${keyPath}.pub`]);
  return { publicKey: publicKey.trim(), keyPath };
}

/**
 * Seed known_hosts with git provider host keys.
 *
 * Must be called once during provision to prevent interactive prompts.
 *
 * Side effects: Appends to /home/motive-host/.ssh/known_hosts.
 * Idempotency: Duplicate entries are harmless.
 */
export async function seedKnownHosts(provider: 'github' | 'gitlab'): Promise<void> {
  const host = provider === 'github' ? 'github.com' : 'gitlab.com';
  const knownHostsPath = `${SSH_KEY_DIR}/known_hosts`;

  const { stdout: hostKeys } = await execLocal('ssh-keyscan', ['-t', 'ed25519,rsa', host], {
    timeout: 10_000,
  });

  // Append to known_hosts (create if doesn't exist)
  // Using execBash because we need shell append redirect
  const sanitizedKeys = hostKeys.replace(/"/g, '\\"');
  await execBash(`echo "${sanitizedKeys}" >> "${knownHostsPath}"`, { timeout: 5_000 });
  await execLocal('chmod', ['644', knownHostsPath]);
}

/**
 * Verify repository access with git ls-remote.
 *
 * Must succeed before the app record is marked as git-enabled.
 *
 * Side effects: Makes an SSH connection to the git provider.
 * Failure modes: ExecError if auth fails, repo doesn't exist, or network issue.
 */
export async function verifyRepoAccess(gitRepo: string, appSlug: string): Promise<boolean> {
  const keyPath = `${SSH_KEY_DIR}/${appSlug}_deploy`;
  await execLocal('git', ['ls-remote', '--exit-code', gitRepo], {
    env: {
      GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=accept-new`,
    },
    timeout: 15_000,
  });
  return true;
}

/**
 * Clone the git repository into the webapp directory.
 *
 * Clones the full repository. For monorepo projects with a subdirectory,
 * the subdir is handled at deploy time by the deploy script (see __SUBDIR_CD__
 * in deploy-scripts.ts), not at clone time.
 *
 * Side effects: Populates /home/motive-host/webapps/{appSlug} with repo contents.
 * Failure modes: ExecError if auth fails, repo doesn't exist, or directory non-empty.
 * Idempotency: NOT idempotent. Fails if directory is non-empty.
 */
export async function cloneRepo(options: {
  appSlug: string;
  gitRepo: string;
  gitBranch?: string;
  deployKeyName?: string;
}): Promise<void> {
  const { appSlug, gitRepo, gitBranch = 'main', deployKeyName } = options;
  const appDir = `${WEBAPPS_DIR}/${appSlug}`;
  const keyName = deployKeyName ?? `${appSlug}_deploy`;
  const keyPath = `${SSH_KEY_DIR}/${keyName}`;

  await execLocal('git', ['clone', '--branch', gitBranch, '--single-branch', gitRepo, appDir], {
    env: {
      GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=accept-new`,
    },
    timeout: CLONE_TIMEOUT,
  });
}

/**
 * Full provisioning pipeline for a new app.
 *
 * Steps: create dir -> nginx config -> SSL (best-effort) -> deploy key ->
 *   seed known_hosts -> clone repo.
 *
 * Side effects: All side effects of the individual steps.
 * Failure modes: Throws on directory or nginx failures (these are fatal).
 *   SSL and git failures are caught and returned as metadata.
 */
export async function provisionApp(options: ProvisionAppOptions): Promise<{
  appDir: string;
  sslInstalled: boolean;
  gitCloned: boolean;
  deployKeyPublic?: string;
}> {
  const {
    appSlug, domain, template, port,
    // gitSubdir is stored in the DB by the provision route and used at deploy
    // time (see __SUBDIR_CD__ in deploy-scripts.ts). Not needed during provision.
    gitRepo, gitBranch, gitSubdir: _gitSubdir, aliases, wwwBehavior,
    dnsOwnership, staticOutputDir,
  } = options;

  // Step 1: Create directory
  await createAppDirectory(appSlug);

  // Step 2: Write Nginx config (HTTP only initially)
  await configureNginx({
    appSlug, domain, template, port,
    aliases, wwwBehavior, staticOutputDir,
  });

  // Step 3: SSL (best-effort -- DNS may not be pointed yet)
  let sslInstalled = false;
  if (dnsOwnership !== 'external') {
    try {
      sslInstalled = await installSSL({
        domain, appSlug, template, port,
        aliases, wwwBehavior, staticOutputDir,
      });
    } catch (err) {
      console.warn(`[provision] SSL installation failed for ${domain}:`, err);
    }
  }

  // Step 4: Deploy key + git clone (if repo specified)
  let gitCloned = false;
  let deployKeyPublic: string | undefined;

  if (gitRepo) {
    try {
      const keyResult = await generateDeployKey(appSlug);
      deployKeyPublic = keyResult.publicKey;
    } catch (err) {
      console.warn(`[provision] Deploy key generation failed for ${appSlug}:`, err);
    }

    const provider = gitRepo.includes('gitlab') ? 'gitlab' : 'github';
    try {
      await seedKnownHosts(provider as 'github' | 'gitlab');
    } catch (err) {
      console.warn(`[provision] known_hosts seeding failed:`, err);
    }

    try {
      await cloneRepo({ appSlug, gitRepo, gitBranch });
      gitCloned = true;
    } catch (err) {
      console.warn(`[provision] Git clone failed for ${appSlug}:`, err);
    }
  }

  return {
    appDir: `${WEBAPPS_DIR}/${appSlug}`,
    sslInstalled,
    gitCloned,
    deployKeyPublic,
  };
}

/**
 * Clean up server-side state during provision rollback.
 * Removes the app directory and nginx config. Best-effort, logs errors.
 */
export async function rollbackProvision(appSlug: string): Promise<void> {
  try {
    await removeAppDirectory(appSlug);
  } catch (err) {
    console.error(`[provision rollback] Failed to remove app directory for ${appSlug}:`, err);
  }
  try {
    await removeServerBlock(appSlug);
  } catch (err) {
    console.error(`[provision rollback] Failed to remove nginx config for ${appSlug}:`, err);
  }
  // Clean up deploy keys to prevent ssh-keygen collisions on retry
  try {
    const keyPath = `${SSH_KEY_DIR}/${appSlug}_deploy`;
    await execLocal('rm', ['-f', keyPath]);
    await execLocal('rm', ['-f', `${keyPath}.pub`]);
  } catch (err) {
    console.error(`[provision rollback] Failed to remove deploy keys for ${appSlug}:`, err);
  }
}
