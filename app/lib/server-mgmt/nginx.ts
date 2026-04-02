// app/lib/server-mgmt/nginx.ts
//
// Owns all Nginx server block generation, writing, testing, and reloading.
// Replaces both app/lib/nginx-config.ts and RunCloud's main.conf generation.
//
// Ownership boundary: Owns /etc/nginx-rc/conf.d/{appSlug}.d/
// No other module writes to this directory.

import { execSudo, writeSudoFile } from './exec';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';

/** Home directory for webapps. */
const WEBAPPS_DIR = '/home/motive-host/webapps';

/** Nginx config directory (using nginx-rc structure). */
const NGINX_CONF_DIR = '/etc/nginx-rc/conf.d';

/** Nginx log directory. */
const NGINX_LOG_DIR = '/var/log/nginx-rc';

/**
 * App templates supported by the self-managed pipeline.
 * WordPress is NOT included. WordPress apps remain on RunCloud.
 */
export type AppTemplate = 'static' | 'nextjs' | 'express' | 'generic' | 'python';

/**
 * Nginx state machine states for an app's configuration.
 *
 * State transitions:
 *   (provision) --> http_only
 *   http_only   --> ssl_pending  (certbot started)
 *   ssl_pending --> https_live   (certbot succeeded, ssl.conf + redirect.conf written)
 *   ssl_pending --> http_only    (certbot failed, ssl_pending flag cleared)
 *   https_live  --> https_live   (writeServerBlock called again, ssl.conf preserved)
 *   any         --> migration_backout (RunCloud config restored from backup)
 *
 * Files present per state:
 *   http_only:         main.conf (listen 80)
 *   ssl_pending:       main.conf (listen 80) -- certbot running, same as http_only
 *   https_live:        main.conf (listen 443 ssl), ssl.conf, redirect.conf
 *   migration_backout: main.conf.runcloud-backup restored to main.conf
 */
export type NginxState = 'http_only' | 'ssl_pending' | 'https_live' | 'migration_backout';

/** www handling behavior for server_name directives. */
export type WwwBehavior = 'add_www' | 'no_www' | 'as_is';

export interface ServerBlockOptions {
  appSlug: string;
  /** Primary domain */
  domain: string;
  template: AppTemplate;
  /** Required for nextjs/express/generic. Ignored for static. */
  port?: number;
  /** If true, emit listen 443 ssl instead of listen 80. */
  sslOnly?: boolean;
  /** Additional domains to include in server_name (from domain_aliases). */
  aliases?: string[];
  /** www behavior: add_www includes www.{domain}, no_www does not, as_is does not. */
  wwwBehavior?: WwwBehavior;
  /** For static apps: the output directory (default: the app root). */
  staticOutputDir?: string;
  /** When true, add basic auth directives to the entire server block. */
  basicAuth?: boolean;
  /** Paths to protect with basic auth (e.g. ['/admin/']). Uses the same .htpasswd file. */
  protectedPaths?: string[];
  /** Monorepo subdirectory (affects static file paths for python apps). */
  subdir?: string;
}

/**
 * Build the server_name directive value from domain config.
 *
 * Respects wwwBehavior:
 *   add_www: "{domain} www.{domain} {aliases...}"
 *   no_www:  "{domain} {aliases...}" (no www prefix)
 *   as_is:   "{domain} {aliases...}" (no www prefix)
 */
export function buildServerNames(options: {
  domain: string;
  aliases?: string[];
  wwwBehavior?: WwwBehavior;
}): string {
  const { domain, aliases = [], wwwBehavior = 'add_www' } = options;
  const names = [domain];
  if (wwwBehavior === 'add_www') {
    names.push(`www.${domain}`);
  }
  names.push(...aliases);
  return names.join(' ');
}

/**
 * Build the list of hostnames for SSL certificate issuance.
 * Same logic as buildServerNames but returns an array for certbot -d flags.
 */
export function buildCertDomains(options: {
  domain: string;
  aliases?: string[];
  wwwBehavior?: WwwBehavior;
}): string[] {
  const { domain, aliases = [], wwwBehavior = 'add_www' } = options;
  const domains = [domain];
  if (wwwBehavior === 'add_www') {
    domains.push(`www.${domain}`);
  }
  domains.push(...aliases);
  return domains;
}

/**
 * Generate a complete Nginx server block for an app.
 *
 * This replaces:
 * 1. RunCloud's main.conf generation (async via agent)
 * 2. 15s polling loop waiting for main.conf
 * 3. try_files sed patch
 * 4. extra.d/ proxy snippets
 *
 * The SSL include uses a glob (ssl.conf*) that silently matches nothing
 * pre-SSL and picks up ssl.conf after installation.
 *
 * @param options - Server block configuration
 * @returns Complete nginx server block as a string
 * @throws Error if port is required but missing
 *
 * Side effects: None (pure function).
 * Failure modes: Throws if template requires port but port is undefined.
 */
export function generateServerBlock(options: ServerBlockOptions): string {
  const { appSlug, domain, template, port, sslOnly, aliases, wwwBehavior, staticOutputDir, basicAuth, protectedPaths, subdir } = options;

  const serverNames = buildServerNames({ domain, aliases, wwwBehavior });

  const listenDirectives = sslOnly
    ? '    listen 443 ssl;\n    listen [::]:443 ssl;'
    : '    listen 80;\n    listen [::]:80;';

  const securityHeaders = `
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;`;

  const proxyHeaders = `
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Proxy buffer settings (prevents 502 on large headers/responses)
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;`;

  const basicAuthDirectives = basicAuth
    ? `
    # Basic auth
    auth_basic "Restricted";
    auth_basic_user_file ${NGINX_CONF_DIR}/${appSlug}.d/.htpasswd;`
    : '';

  // Validate protected paths before interpolating into nginx config.
  // Only allow lowercase alphanumeric segments separated by slashes.
  const SAFE_PATH_RE = /^\/[a-z0-9_-]+(\/[a-z0-9_-]+)*\/$/;
  const safePaths = (protectedPaths ?? []).filter(p => SAFE_PATH_RE.test(p));

  const protectedPathBlocks = safePaths.length > 0
    ? '\n' + safePaths.map(p => {
      const isProxied = !!port && template !== 'static';
      const innerDirective = isProxied
        ? `        proxy_pass http://127.0.0.1:${port};\n${proxyHeaders}`
        : `        try_files $uri $uri/ ${p}index.html;`;
      return `    # Protected path: ${p}
    location ^~ ${p} {
        auth_basic "Restricted";
        auth_basic_user_file ${NGINX_CONF_DIR}/${appSlug}.d/.htpasswd;
${innerDirective}
    }`;
    }).join('\n\n')
    : '';

  const acmeLocation = `
    # ACME challenge for certbot webroot mode
    location ^~ /.well-known/acme-challenge/ {
        root ${WEBAPPS_DIR}/${appSlug};${basicAuth ? '\n        auth_basic off;' : ''}
    }`;

  const sslInclude = `
    # SSL config (written by installSSL, glob matches nothing before SSL)
    include ${NGINX_CONF_DIR}/${appSlug}.d/ssl.conf*;`;

  const dotfileBlock = `
    # Block dotfiles (except .well-known)
    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }`;

  switch (template) {
    case 'static': {
      // Static sites build into dist/ by default (Vite convention).
      // The deploy script may also symlink public -> dist, but pointing
      // directly at the output directory is safest.
      const outputDir = staticOutputDir ?? 'dist';
      const rootDir = `${WEBAPPS_DIR}/${appSlug}/${outputDir}`;
      return `# Managed by Motive Hosting -- do not edit manually
# App: ${appSlug} | Type: static
server {
${listenDirectives}
    server_name ${serverNames};

    root ${rootDir};
    index index.html index.htm;

    access_log ${NGINX_LOG_DIR}/${appSlug}.access.log;
    error_log ${NGINX_LOG_DIR}/${appSlug}.error.log;
${securityHeaders}
${basicAuthDirectives}

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
${protectedPathBlocks}
${acmeLocation}
${sslInclude}
${dotfileBlock}
}
`;
    }

    case 'nextjs': {
      if (!port) throw new Error(`generateServerBlock: port is required for template '${template}'`);
      return `# Managed by Motive Hosting -- do not edit manually
# App: ${appSlug} | Type: nextjs | Port: ${port}
server {
${listenDirectives}
    server_name ${serverNames};

    root ${WEBAPPS_DIR}/${appSlug};

    access_log ${NGINX_LOG_DIR}/${appSlug}.access.log;
    error_log ${NGINX_LOG_DIR}/${appSlug}.error.log;
${securityHeaders}
${basicAuthDirectives}

    # Next.js static assets -- long cache, served from disk
    location /_next/static/ {
        alias ${WEBAPPS_DIR}/${appSlug}/_next/static/;
        expires 365d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location /public/ {
        alias ${WEBAPPS_DIR}/${appSlug}/public/;
        expires 30d;
        access_log off;
    }

    # All other requests proxy to Next.js server
    location / {
        proxy_pass http://127.0.0.1:${port};
${proxyHeaders}
    }
${protectedPathBlocks}
${acmeLocation}
${sslInclude}
}
`;
    }

    case 'express':
    case 'generic': {
      if (!port) throw new Error(`generateServerBlock: port is required for template '${template}'`);
      return `# Managed by Motive Hosting -- do not edit manually
# App: ${appSlug} | Type: ${template} | Port: ${port}
server {
${listenDirectives}
    server_name ${serverNames};

    root ${WEBAPPS_DIR}/${appSlug};

    access_log ${NGINX_LOG_DIR}/${appSlug}.access.log;
    error_log ${NGINX_LOG_DIR}/${appSlug}.error.log;
${securityHeaders}
${basicAuthDirectives}

    location /public/ {
        alias ${WEBAPPS_DIR}/${appSlug}/public/;
        expires 30d;
        access_log off;
    }

    # All requests proxy to Node.js server
    location / {
        proxy_pass http://127.0.0.1:${port};
${proxyHeaders}
    }
${protectedPathBlocks}
${acmeLocation}
${sslInclude}
}
`;
    }

    case 'python': {
      if (!port) throw new Error(`generateServerBlock: port is required for template '${template}'`);
      const staticDir = subdir
        ? `${WEBAPPS_DIR}/${appSlug}/${subdir}/static`
        : `${WEBAPPS_DIR}/${appSlug}/static`;
      return `# Managed by Motive Hosting -- do not edit manually
# App: ${appSlug} | Type: python | Port: ${port}
server {
${listenDirectives}
    server_name ${serverNames};

    root ${WEBAPPS_DIR}/${appSlug};

    access_log ${NGINX_LOG_DIR}/${appSlug}.access.log;
    error_log ${NGINX_LOG_DIR}/${appSlug}.error.log;
${securityHeaders}
${basicAuthDirectives}

    # Flask static files -- served from disk
    location /static/ {
        alias ${staticDir}/;
        try_files $uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # All other requests proxy to Gunicorn
    location / {
        proxy_pass http://127.0.0.1:${port};

        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Proxy buffer settings (prevents 502 on large headers/responses)
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
${protectedPathBlocks}
${acmeLocation}
${sslInclude}
}
`;
    }

    default:
      throw new Error(`generateServerBlock: unknown template '${template satisfies never}'`);
  }
}

/**
 * Generate the SSL config snippet (cert paths only, NO listen directives).
 *
 * Written to {confDir}/ssl.conf by installSSL(). Picked up by main.conf's
 * include glob. main.conf owns the listen directives via sslOnly flag.
 */
export function generateSslConf(domain: string): string {
  return [
    `ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;`,
    `ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;`,
    'include /etc/letsencrypt/options-ssl-nginx.conf;',
    'ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;',
  ].join('\n') + '\n';
}

/**
 * Generate the HTTP-to-HTTPS redirect server block.
 *
 * Written to {confDir}/redirect.conf by installSSL(). Owns port 80 after
 * SSL is installed. Includes ACME challenge location for cert renewal.
 */
export function generateRedirectConf(appSlug: string, options: {
  domain: string;
  aliases?: string[];
  wwwBehavior?: WwwBehavior;
}): string {
  const serverNames = buildServerNames(options);
  return `# Managed by Motive Hosting -- HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name ${serverNames};

    # ACME challenge must stay on port 80 for certbot renewal
    location ^~ /.well-known/acme-challenge/ {
        root ${WEBAPPS_DIR}/${appSlug};
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
`;
}

/**
 * Write an Nginx server block config to disk, test, and reload.
 *
 * Follows the atomic write pattern:
 * 1. Back up current config (if exists)
 * 2. Write new config via writeSudoFile
 * 3. Test full nginx config with nginx-rc -t
 * 4. On test success: reload nginx, delete backup
 * 5. On test failure: restore backup, throw error
 *
 * @param options - Server block configuration
 *
 * Side effects: Writes to /etc/nginx-rc/conf.d/{appSlug}.d/main.conf,
 *   reloads nginx-rc.
 * Failure modes: ExecError if nginx-rc -t fails (config is rolled back),
 *   ExecError if reload fails.
 * Idempotency: Safe to call repeatedly. Produces same config from same inputs.
 *   Does NOT touch ssl.conf or redirect.conf.
 */
export async function writeServerBlock(options: ServerBlockOptions): Promise<void> {
  const { appSlug } = options;
  const confDir = `${NGINX_CONF_DIR}/${appSlug}.d`;
  const confPath = `${confDir}/main.conf`;
  const backupPath = `${confPath}.bak`;

  // Create the per-app config directory
  await execSudo('mkdir', ['-p', confDir]);

  // Ensure top-level include file exists (nginx.conf only loads *.conf)
  const topLevelConf = `${NGINX_CONF_DIR}/${appSlug}.conf`;
  try {
    await stat(topLevelConf);
  } catch {
    await writeSudoFile(topLevelConf, `include ${confDir}/main.conf;\n`);
  }

  // Back up current config if it exists
  let hasBackup = false;
  try {
    await stat(confPath);
    await execSudo('cp', [confPath, backupPath]);
    hasBackup = true;
  } catch {
    // No existing config to back up -- first write
  }

  // Write the new server block
  const content = generateServerBlock(options);
  await writeSudoFile(confPath, content);

  // Test the full Nginx configuration
  try {
    await execSudo('/usr/local/sbin/nginx-rc', ['-t']);
  } catch (err) {
    // Rollback: restore the backup or remove the broken config
    if (hasBackup) {
      await execSudo('mv', [backupPath, confPath]);
    } else {
      await execSudo('rm', ['-f', confPath]);
    }
    throw err;
  }

  // Clean up backup on success
  if (hasBackup) {
    await execSudo('rm', ['-f', backupPath]);
  }

  // Reload Nginx to pick up the new config
  await execSudo('systemctl', ['reload', 'nginx-rc']);
}

/**
 * Remove an Nginx server block config directory and reload.
 *
 * Removes the entire /etc/nginx-rc/conf.d/{appSlug}.d/ directory
 * (main.conf, ssl.conf, redirect.conf, and any backups), then tests
 * and reloads nginx.
 *
 * @param appSlug - The app identifier whose config directory will be removed
 *
 * Side effects: Removes /etc/nginx-rc/conf.d/{appSlug}.d/, reloads nginx.
 * Failure modes: ExecError if nginx-rc -t fails post-removal (unlikely).
 * Idempotency: Safe to call if directory doesn't exist.
 */
export async function removeServerBlock(appSlug: string): Promise<void> {
  const confDir = `${NGINX_CONF_DIR}/${appSlug}.d`;
  const topLevelConf = `${NGINX_CONF_DIR}/${appSlug}.conf`;
  await execSudo('rm', ['-rf', confDir]);
  await execSudo('rm', ['-f', topLevelConf]);
  await execSudo('/usr/local/sbin/nginx-rc', ['-t']);
  await execSudo('systemctl', ['reload', 'nginx-rc']);
}

/**
 * Write the SSL config snippet to disk with atomic safety.
 *
 * Writes ssl.conf containing certificate paths for the given domain.
 * This file is picked up by main.conf's `include ...ssl.conf*` glob.
 *
 * @param appSlug - The app identifier
 * @param domain - The primary domain (used for Let's Encrypt cert paths)
 *
 * Side effects: Writes to /etc/nginx-rc/conf.d/{appSlug}.d/ssl.conf.
 * Failure modes: ExecError if writeSudoFile fails.
 * Idempotency: Safe to call repeatedly -- overwrites ssl.conf each time.
 */
export async function writeSSLConfig(appSlug: string, domain: string): Promise<void> {
  const confDir = `${NGINX_CONF_DIR}/${appSlug}.d`;
  const sslPath = `${confDir}/ssl.conf`;

  await execSudo('mkdir', ['-p', confDir]);
  const content = generateSslConf(domain);
  await writeSudoFile(sslPath, content);
}

/**
 * Write the HTTP-to-HTTPS redirect server block to disk with atomic safety.
 *
 * Writes redirect.conf which owns port 80 after SSL is installed,
 * redirecting all HTTP traffic to HTTPS while preserving the ACME
 * challenge location for certificate renewal.
 *
 * @param appSlug - The app identifier
 * @param domain - The primary domain
 * @param wwwBehavior - www handling behavior (default: 'add_www')
 * @param aliases - Additional domain aliases
 *
 * Side effects: Writes to /etc/nginx-rc/conf.d/{appSlug}.d/redirect.conf.
 * Failure modes: ExecError if writeSudoFile fails.
 * Idempotency: Safe to call repeatedly -- overwrites redirect.conf each time.
 */
export async function writeRedirectConfig(
  appSlug: string,
  domain: string,
  wwwBehavior?: WwwBehavior,
  aliases?: string[],
): Promise<void> {
  const confDir = `${NGINX_CONF_DIR}/${appSlug}.d`;
  const redirectPath = `${confDir}/redirect.conf`;

  await execSudo('mkdir', ['-p', confDir]);
  const content = generateRedirectConf(appSlug, { domain, aliases, wwwBehavior });
  await writeSudoFile(redirectPath, content);
}

/**
 * Detect the current Nginx state for an app by checking which files exist.
 *
 * Checks for config files in priority order:
 * 1. main.conf.runcloud-backup -> migration_backout
 * 2. ssl.conf + redirect.conf -> https_live
 * 3. main.conf -> http_only
 * 4. Nothing -> http_only (safe default for first provision)
 *
 * @param appSlug - The app identifier
 * @returns The current NginxState
 *
 * Side effects: Reads filesystem.
 * Failure modes: Returns 'http_only' if config dir doesn't exist (safe default).
 */
export async function detectNginxState(appSlug: string): Promise<NginxState> {
  const confDir = `${NGINX_CONF_DIR}/${appSlug}.d`;
  try {
    await stat(`${confDir}/main.conf.runcloud-backup`);
    return 'migration_backout';
  } catch { /* not in backout state */ }
  try {
    await stat(`${confDir}/ssl.conf`);
    await stat(`${confDir}/redirect.conf`);
    return 'https_live';
  } catch { /* no ssl */ }
  try {
    await stat(`${confDir}/main.conf`);
    return 'http_only';
  } catch { /* no config at all */ }
  return 'http_only';
}

/**
 * Write a .htpasswd file for basic auth into the app's nginx config directory.
 *
 * Uses subprocess spawn with password written to stdin to avoid exposing
 * the password on the command line (visible in `ps`) or interpolating it
 * into a shell string (quoting/special character breakage).
 *
 * @param appSlug - The app identifier
 * @param user - The basic auth username
 * @param password - The basic auth password (used once, not stored)
 *
 * Side effects: Writes /etc/nginx-rc/conf.d/{appSlug}.d/.htpasswd via htpasswd.
 * Failure modes: Rejects if htpasswd binary fails or is not installed.
 * Idempotency: Overwrites any existing .htpasswd file (-c flag).
 */
export async function writeBasicAuthHtpasswd(
  appSlug: string,
  user: string,
  password: string,
): Promise<void> {
  const confDir = `${NGINX_CONF_DIR}/${appSlug}.d`;
  const htpasswdPath = `${confDir}/.htpasswd`;

  // Ensure the config directory exists
  await execSudo('mkdir', ['-p', confDir]);

  // Write htpasswd to a temp path in the user's home (not world-readable /tmp),
  // then move it into the root-owned conf directory.
  const tmpDir = '/home/motive-host/.cache/motive-hosting';
  await execSudo('mkdir', ['-p', tmpDir]);
  await execSudo('chown', ['motive-host:motive-host', tmpDir]);
  await execSudo('chmod', ['700', tmpDir]);
  const tmpPath = `${tmpDir}/htpasswd-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await new Promise<void>((resolve, reject) => {
    // -i: read password from stdin
    // -B: force bcrypt hash
    // -c: create file (overwrite if exists)
    const child = spawn('htpasswd', ['-i', '-B', '-c', tmpPath, user]);

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      reject(new Error(`htpasswd spawn failed: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`htpasswd failed (exit ${code}): ${stderr.slice(0, 500)}`));
      }
    });

    // Write password to stdin and close
    child.stdin.write(password);
    child.stdin.end();
  });

  // Move the temp file into the nginx config directory (requires sudo)
  await execSudo('mv', [tmpPath, htpasswdPath]);
  await execSudo('chmod', ['644', htpasswdPath]);
}
