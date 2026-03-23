// ── Nginx Proxy Config Generator ─────────────────────────────────────────
//
// Generates and writes Nginx proxy configuration files for Node.js apps
// hosted on the RunCloud-managed server. Based on the customer-hub pattern.

import { execFile } from 'child_process';
import { writeFile, access } from 'fs/promises';
import { promisify } from 'util';

import type { DeployTemplate } from './deploy-scripts';

const execFileAsync = promisify(execFile);

/** Path where RunCloud stores extra Nginx config snippets. */
const NGINX_EXTRA_DIR = '/etc/nginx-rc/extra.d';

/** Path where RunCloud stores per-app Nginx config directories. */
const NGINX_CONF_DIR = '/etc/nginx-rc/conf.d';

/** Options for generating Nginx proxy configs. */
export interface NginxConfigOptions {
  /** The RunCloud webapp slug (e.g., "aiwithkai-com"). */
  appSlug: string;
  /** The port this app listens on (e.g., 3001). */
  port: number;
  /** Deploy template type -- determines whether Next.js static config is needed. */
  template: DeployTemplate;
}

/** A generated config file with its target filename and content. */
export interface NginxConfigFile {
  /** The filename (without path) for the config file. */
  filename: string;
  /** The Nginx config content. */
  content: string;
}

// ── Config Generators ────────────────────────────────────────────────────

/**
 * Generate the proxy fallback config.
 *
 * Defines the `@backend` named location and sets error_page 404 to fall
 * through to the Node.js backend.
 */
function generateProxyFallback(appSlug: string, port: number): NginxConfigFile {
  return {
    filename: `${appSlug}.location.main-before.proxy-fallback.conf`,
    content: `location @backend {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

error_page 404 = @backend;
`,
  };
}

/**
 * Generate the root location proxy config.
 *
 * This is included inside the `location /` block by RunCloud and proxies
 * all requests to the Node.js backend.
 */
function generateRootProxy(appSlug: string, port: number): NginxConfigFile {
  return {
    filename: `${appSlug}.location.root.proxy.conf`,
    content: `proxy_pass http://127.0.0.1:${port};
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_cache_bypass $http_upgrade;
break;
`,
  };
}

/**
 * Generate the Next.js static asset proxy config.
 *
 * Proxies `/_next/` requests to the Node.js backend for static asset serving.
 * Only needed for Next.js apps.
 */
function generateNextjsStatic(appSlug: string, port: number): NginxConfigFile {
  return {
    filename: `${appSlug}.location.main.nextjs-static.conf`,
    content: `location /_next/ {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
`,
  };
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Generate Nginx config file contents for a Node.js app.
 *
 * Returns 2 config files for Express/Generic apps, or 3 for Next.js apps
 * (includes the `/_next/` static asset proxy). This is a pure function
 * with no side effects.
 *
 * @param options - Nginx config options
 * @returns Array of config files with filenames and content
 */
export function generateNginxConfigs(options: NginxConfigOptions): NginxConfigFile[] {
  const { appSlug, port, template } = options;

  const configs: NginxConfigFile[] = [
    generateProxyFallback(appSlug, port),
    generateRootProxy(appSlug, port),
  ];

  if (template === 'nextjs') {
    configs.push(generateNextjsStatic(appSlug, port));
  }

  return configs;
}

/**
 * Write Nginx proxy configs to the server, fix try_files, and reload Nginx.
 *
 * This function performs the following steps:
 * 1. Generates config files via `generateNginxConfigs`
 * 2. Writes each file to `/tmp` then `sudo mv` to `/etc/nginx-rc/extra.d/`
 * 3. Fixes the `try_files` directive in RunCloud's managed `main.conf`
 * 4. Tests the Nginx config with `nginx-rc -t`
 * 5. Reloads Nginx
 *
 * Uses `child_process.execFile` (not `exec`) to avoid shell injection.
 * This only works when the Customer Hub is running on the same server as
 * the target app (which is the case for our single-server architecture).
 *
 * @param options - Nginx config options
 * @throws If any file write, config test, or reload fails
 */
export async function writeNginxConfigs(options: NginxConfigOptions): Promise<void> {
  const { appSlug } = options;
  const configs = generateNginxConfigs(options);

  // Step 1: Write each config file to /tmp, then sudo mv to target
  for (const config of configs) {
    const tmpPath = `/tmp/${config.filename}`;
    await writeFile(tmpPath, config.content, 'utf-8');
    await execFileAsync('sudo', ['mv', tmpPath, `${NGINX_EXTRA_DIR}/${config.filename}`]);
  }

  // Step 2: Fix try_files in RunCloud's managed main.conf for this app
  // RunCloud creates this file asynchronously after createWebApp — wait for it
  const mainConfPath = `${NGINX_CONF_DIR}/${appSlug}.d/main.conf`;
  const MAX_WAIT = 15;
  for (let i = 0; i < MAX_WAIT; i++) {
    try {
      await execFileAsync('sudo', ['test', '-f', mainConfPath]);
      break;
    } catch {
      if (i === MAX_WAIT - 1) {
        throw new Error(`Timed out waiting for RunCloud to create ${mainConfPath}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  await execFileAsync('sudo', [
    'sed', '-i',
    's|try_files $uri $uri/ /index.php$is_args$args;|try_files /dev/null @backend;|g',
    mainConfPath,
  ]);

  // Step 3: Test Nginx config
  await execFileAsync('sudo', ['/usr/local/sbin/nginx-rc', '-t']);

  // Step 4: Reload Nginx
  await execFileAsync('sudo', ['systemctl', 'reload', 'nginx-rc']);
}
