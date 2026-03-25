import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { provisionSiteSchema } from '@/lib/hosting-schemas';
import { handleRunCloudError } from '@/lib/api-utils';
import { sendWelcomeHostingEmail } from '@/lib/sendgrid';
import { generateDeployScript } from '../../../../../lib/deploy-scripts';
import { writeNginxConfigs } from '../../../../../lib/nginx-config';
import { getOpenSRSClient } from '@/lib/opensrs-client';
import {
  provisionApp,
  rollbackProvision,
  encryptValue,
  writeEnvFile,
  beginOperation,
  completeOperation,
  failOperation,
} from '../../../../../lib/server-mgmt';
import type { AppTemplate, EnvVar } from '../../../../../lib/server-mgmt';
import { createWebsite as createUmamiWebsite, deleteWebsite as deleteUmamiWebsite } from '../../../../../lib/umami';

const MAX_PORT_RETRIES = 3;
const BASE_PORT = 3000; // first app gets 3001

export async function POST(request: Request) {
  const warnings: string[] = [];

  // ── Step 1: Auth + validate ───────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = provisionSiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const safeInputForLogging = { ...input, wp_admin_password: input.wp_admin_password ? '[REDACTED]' : undefined };

  // WordPress with self-managed is not supported
  const isWordPress = input.app_type === 'wordpress';
  const useDiy = !isWordPress;

  if (isWordPress && useDiy) {
    return NextResponse.json(
      { error: 'WordPress is not supported with self-managed server management. Use RunCloud.' },
      { status: 400 },
    );
  }

  // Verify target customer exists
  const adminDb = createAdminClient();
  const { data: targetCustomer } = await adminDb
    .from('customers')
    .select('id, email, name, plan')
    .eq('id', input.customer_id)
    .single();

  if (!targetCustomer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // ── Step 2: Derive slug ───────────────────────────────────────────────
  const normalizedDomain = input.primary_domain.toLowerCase().replace(/^www\./, '');
  const appSlug = normalizedDomain.replace(/\./g, '-');

  // Check slug uniqueness
  const { data: existingApp } = await adminDb
    .from('hosting_apps')
    .select('id')
    .eq('app_slug', appSlug)
    .maybeSingle();

  if (existingApp) {
    return NextResponse.json(
      { error: `Slug "${appSlug}" is already in use. Check existing apps or use a different domain.` },
      { status: 409 },
    );
  }

  // ── Branch: Self-Managed vs RunCloud ─────────────────────────────────
  if (useDiy) {
    return provisionDiy({ input, user, adminDb, targetCustomer, appSlug, normalizedDomain, warnings, safeInputForLogging });
  } else {
    return provisionRunCloud({ input, user, adminDb, targetCustomer, appSlug, normalizedDomain, warnings, safeInputForLogging });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Self-Managed Provisioning Path
// ════════════════════════════════════════════════════════════════════════════

interface ProvisionContext {
  input: ReturnType<typeof provisionSiteSchema.parse>;
  user: { id: string };
  adminDb: ReturnType<typeof createAdminClient>;
  targetCustomer: { id: string; email: string | null; name: string | null; plan: string | null };
  appSlug: string;
  normalizedDomain: string;
  warnings: string[];
  safeInputForLogging: Record<string, unknown>;
}

async function provisionDiy(ctx: ProvisionContext) {
  const { input, user, adminDb, targetCustomer, appSlug, normalizedDomain, warnings, safeInputForLogging } = ctx;

  // ── Calculate port (static apps don't need one) ───────────────────────
  let assignedPort: number | null = null;
  const needsPort = input.app_type !== 'static';

  if (needsPort) {
    const { data: maxPortRow } = await adminDb
      .from('hosting_apps')
      .select('port')
      .not('port', 'is', null)
      .order('port', { ascending: false })
      .limit(1)
      .maybeSingle();

    assignedPort = (maxPortRow?.port ?? BASE_PORT) + 1;
  }

  // ── Auto-configure DNS ────────────────────────────────────────────────
  let sslPending = false;
  const serverIp = process.env.RUNCLOUD_SERVER_IP;
  const dnsOwnership = input.dns_ownership ?? 'motive';

  console.log('[provision/self-managed] checking DNS for domain', normalizedDomain);
  const { data: managedDomain } = await adminDb
    .from('domains')
    .select('id, domain_name')
    .eq('domain_name', normalizedDomain)
    .maybeSingle();

  if (dnsOwnership === 'motive' && managedDomain && serverIp) {
    console.log('[provision/self-managed] Motive-managed domain -- auto-configuring DNS');
    try {
      const opensrs = getOpenSRSClient();
      let existingRecords: Array<{ type: string; subdomain: string; ip_address?: string; hostname?: string }> = [];
      try {
        const zone = await opensrs.getDnsZone(normalizedDomain);
        existingRecords = zone.records;
      } catch {
        // Zone may not exist yet
      }

      type DnsChange = Parameters<typeof opensrs.updateDnsRecords>[1][number];
      const changes: DnsChange[] = [];

      for (const r of existingRecords) {
        if (r.type === 'A' && (r.subdomain === '@' || r.subdomain === '') && r.ip_address !== serverIp) {
          changes.push({ action: 'remove', record: r as DnsChange['record'] });
        }
        if (r.subdomain === 'www' && !(r.type === 'CNAME' && r.hostname === `${normalizedDomain}.`)) {
          changes.push({ action: 'remove', record: r as DnsChange['record'] });
        }
      }

      changes.push(
        { action: 'add', record: { type: 'A', subdomain: '@', ip_address: serverIp } },
        { action: 'add', record: { type: 'CNAME', subdomain: 'www', hostname: `${normalizedDomain}.` } },
      );

      await opensrs.updateDnsRecords(normalizedDomain, changes);
      console.log('[provision/self-managed] DNS configured');
    } catch (err) {
      console.error('[provision/self-managed] DNS auto-config failed', err);
      warnings.push(`DNS auto-config failed for ${normalizedDomain}. Configure A/CNAME records manually.`);
      sslPending = true;
    }
  } else {
    if (dnsOwnership === 'external') {
      console.log('[provision/self-managed] external domain -- skipping DNS auto-config');
    } else if (!managedDomain) {
      console.log('[provision/self-managed] domain not in domains table -- skipping DNS auto-config');
    } else {
      console.log('[provision/self-managed] RUNCLOUD_SERVER_IP not set -- skipping DNS');
      warnings.push('RUNCLOUD_SERVER_IP env var not set -- DNS auto-config skipped.');
    }
    sslPending = true;
  }

  // ── Derive template ───────────────────────────────────────────────────
  let template: AppTemplate;
  if (input.app_type === 'static') {
    template = 'static';
  } else if (input.deploy_template) {
    template = input.deploy_template as AppTemplate;
  } else {
    template = 'generic';
  }

  // ── DB insert FIRST (source of truth) ─────────────────────────────────
  console.log('[provision/self-managed] inserting hosting_apps record');
  let hostingApp: Record<string, unknown> | null = null;
  let insertSucceeded = false;

  for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt++) {
    const { data, error: insertError } = await adminDb
      .from('hosting_apps')
      .insert({
        customer_id: input.customer_id,
        runcloud_app_id: null,
        runcloud_server_id: parseInt(process.env.RUNCLOUD_SERVER_ID ?? '338634', 10),
        app_slug: appSlug,
        app_name: input.app_name,
        app_type: input.app_type,
        primary_domain: input.primary_domain,
        provisioned_by: user.id,
        port: assignedPort,
        git_subdir: input.git_subdir || null,
        deploy_template: input.deploy_template || null,
        deploy_method: input.git_provider || input.deploy_method || null,
        ssl_pending: sslPending,
        managed_by: 'self-managed',
        git_repo: input.git_repository || null,
        git_branch: input.git_branch || 'main',
        www_behavior: input.www_behavior || 'add_www',
        dns_ownership: dnsOwnership,
      })
      .select()
      .single();

    if (!insertError) {
      hostingApp = data;
      insertSucceeded = true;
      break;
    }

    // Port collision -- retry with next port
    if (insertError.code === '23505' && insertError.message?.includes('port') && assignedPort !== null) {
      console.warn(`[provision/self-managed] port ${assignedPort} collision, retrying with ${assignedPort + 1}`);
      assignedPort++;
      continue;
    }

    // Non-port duplicate (slug)
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'Duplicate -- this slug is already in use' },
        { status: 409 },
      );
    }

    console.error('[provision/self-managed] DB insert failed:', insertError);
    return NextResponse.json(
      { error: 'Failed to create app record in database' },
      { status: 500 },
    );
  }

  if (!insertSucceeded || !hostingApp) {
    return NextResponse.json(
      { error: `Port assignment failed after ${MAX_PORT_RETRIES} retries` },
      { status: 500 },
    );
  }

  const hostingAppId = hostingApp.id as string;
  console.log('[provision/self-managed] DB insert complete: id =', hostingAppId, 'port =', assignedPort);

  // ── Create Umami analytics website (best-effort) ─────────────────────
  let umamiWebsiteId: string | null = null;
  try {
    const umamiSite = await createUmamiWebsite(input.app_name, normalizedDomain);
    if (umamiSite) {
      umamiWebsiteId = umamiSite.id;
      await adminDb
        .from('hosting_apps')
        .update({ umami_website_id: umamiWebsiteId })
        .eq('id', hostingAppId);
      console.log('[provision/self-managed] Umami website created:', umamiWebsiteId);
    }
  } catch (err) {
    console.warn('[provision/self-managed] Umami website creation failed:', err instanceof Error ? err.message : err);
    warnings.push('Analytics setup failed -- configure manually later.');
  }

  // ── Create durable operation record ───────────────────────────────────
  const operation = await beginOperation(adminDb, hostingAppId, 'provision', 'api', {
    domain: input.primary_domain,
    template,
  });

  if (!operation) {
    // Another operation is already running for this app (shouldn't happen during provision)
    console.error('[provision/self-managed] Failed to begin operation -- concurrent operation exists');
    // Clean up Umami website and DB row
    if (umamiWebsiteId) await deleteUmamiWebsite(umamiWebsiteId).catch(() => {});
    await adminDb.from('hosting_apps').delete().eq('id', hostingAppId);
    return NextResponse.json(
      { error: 'Another operation is already in progress for this app' },
      { status: 409 },
    );
  }

  // ── Server-side provisioning ──────────────────────────────────────────
  try {
    const result = await provisionApp({
      appSlug,
      domain: normalizedDomain,
      template,
      port: assignedPort ?? undefined,
      gitRepo: input.git_repository,
      gitBranch: input.git_branch,
      gitSubdir: input.git_subdir,
      aliases: [],
      wwwBehavior: input.www_behavior ?? 'add_www',
      dnsOwnership,
    });

    // Update ssl_pending based on actual SSL result
    if (result.sslInstalled && sslPending) {
      await adminDb
        .from('hosting_apps')
        .update({ ssl_pending: false })
        .eq('id', hostingAppId);
      sslPending = false;
    } else if (!result.sslInstalled && !sslPending) {
      // SSL was attempted but failed
      await adminDb
        .from('hosting_apps')
        .update({ ssl_pending: true })
        .eq('id', hostingAppId);
      sslPending = true;
      warnings.push('SSL installation failed -- install manually or retry later.');
    }

    if (!result.sslInstalled) {
      warnings.push('SSL not installed. Configure DNS first, then install SSL via the dashboard.');
    }

    if (input.git_repository && !result.gitCloned) {
      warnings.push('Git clone failed -- add the deploy key to your repository and redeploy.');
    }

    // ── Write env vars (if provided) ──────────────────────────────────
    if (input.env_vars && input.env_vars.length > 0) {
      try {
        const envRows: EnvVar[] = [];
        for (const ev of input.env_vars) {
          const encrypted = encryptValue(ev.value);
          const { error: envError } = await adminDb
            .from('hosting_app_env_vars')
            .insert({
              hosting_app_id: hostingAppId,
              key: ev.key,
              encrypted_value: encrypted,
              is_secret: ev.is_secret ?? false,
            });

          if (envError) {
            console.error(`[provision/self-managed] Failed to insert env var "${ev.key}":`, envError);
            warnings.push(`Failed to save env var "${ev.key}".`);
          } else {
            envRows.push({ key: ev.key, encrypted_value: encrypted, is_secret: ev.is_secret ?? false });
          }
        }

        // Write .env file to disk
        if (envRows.length > 0) {
          try {
            await writeEnvFile(appSlug, envRows);
          } catch (err) {
            console.error('[provision/self-managed] Failed to write .env file:', err);
            warnings.push('Failed to write .env file to app directory.');
          }
        }
      } catch (err) {
        console.error('[provision/self-managed] env vars processing failed:', err);
        warnings.push('Environment variable setup failed.');
      }
    }

    // ── Complete the operation ───────────────────────────────────────────
    await completeOperation(adminDb, operation.id, {
      sslInstalled: result.sslInstalled,
      gitCloned: result.gitCloned,
      deployKeyPublic: result.deployKeyPublic,
      warnings,
    });

    // ── Welcome email ───────────────────────────────────────────────────
    if (targetCustomer.email) {
      sendWelcomeHostingEmail(
        targetCustomer.email,
        targetCustomer.name ?? '',
        targetCustomer.plan ?? 'harbor',
        input.app_name,
        input.primary_domain,
      ).catch((err) => console.error('[provision/self-managed] welcome email failed:', err));
    }

    console.log('[provision/self-managed] complete -- appSlug:', appSlug, 'input:', safeInputForLogging);

    return NextResponse.json(
      {
        success: true,
        app: {
          id: hostingAppId,
          slug: appSlug,
          domain: input.primary_domain,
          managed_by: 'self-managed',
          ssl_pending: sslPending,
          deploy_key_public: result.deployKeyPublic,
          umami_website_id: umamiWebsiteId,
        },
        warnings,
      },
      { status: 201 },
    );
  } catch (err) {
    // Fatal server-side failure after DB insert -- rollback
    console.error('[provision/self-managed] server-side provisioning failed:', err);

    await failOperation(adminDb, operation.id, err instanceof Error ? err.message : 'Unknown provisioning error');

    // Clean up Umami website
    if (umamiWebsiteId) await deleteUmamiWebsite(umamiWebsiteId).catch(() => {});

    // Clean up server state
    await rollbackProvision(appSlug);

    // Delete the DB row
    await adminDb.from('hosting_apps').delete().eq('id', hostingAppId);

    return NextResponse.json(
      { error: 'Provisioning failed. Server state has been cleaned up. Check logs and retry.' },
      { status: 500 },
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RunCloud Provisioning Path (existing code, WordPress only going forward)
// ════════════════════════════════════════════════════════════════════════════

async function provisionRunCloud(ctx: ProvisionContext) {
  const { input, user, adminDb, targetCustomer, appSlug, normalizedDomain, warnings, safeInputForLogging } = ctx;

  const isWordPress = input.app_type === 'wordpress';

  // ── Step 3: Create RunCloud webapp ────────────────────────────────────
  const rc = getRunCloudClient();

  console.log('[provision/rc] step 3: creating web app', appSlug);
  let runcloudApp;
  try {
    runcloudApp = await rc.createWebApp({
      name: appSlug,
      domainName: input.primary_domain,
      user: parseInt(process.env.RUNCLOUD_SYSTEM_USER_ID ?? '1883159', 10),
      publicPath: isWordPress ? '/public_html' : '/public',
      ...(isWordPress ? { phpVersion: 'php82' } : {}),
      stack: 'nativenginx',
      stackMode: 'production',
      type: 'custom',
      clickjackingProtection: true,
      xssProtection: true,
      mimeSniffingProtection: true,
    });
  } catch (err) {
    console.error('[provision/rc] step 3 failed: createWebApp', err);
    return handleRunCloudError(err);
  }

  const appId = runcloudApp.id;
  console.log('[provision/rc] step 3 complete: appId =', appId);

  // ── Step 4: Attach domain ─────────────────────────────────────────────
  console.log('[provision/rc] step 4: attaching domain', input.primary_domain);
  try {
    await rc.attachDomain(appId, input.primary_domain);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('already exists') || errMsg.includes('Domain already')) {
      console.log('[provision/rc] step 4: domain already attached (from createWebApp) — continuing');
    } else {
      console.error('[provision/rc] step 4 failed: attachDomain', err);
      warnings.push('Domain attachment failed — may need manual configuration in RunCloud.');
    }
  }
  console.log('[provision/rc] step 4 complete');

  // ── Step 5: Calculate initial port ──────────────────────────────────
  console.log('[provision/rc] step 5: calculating port');
  const { data: maxPortRow } = await adminDb
    .from('hosting_apps')
    .select('port')
    .not('port', 'is', null)
    .order('port', { ascending: false })
    .limit(1)
    .maybeSingle();

  let assignedPort = (maxPortRow?.port ?? BASE_PORT) + 1;
  console.log('[provision/rc] step 5 complete: initial port =', assignedPort);

  // ── Step 6: Auto-configure DNS ────────────────────────────────────────
  let sslPending = false;
  const serverIp = process.env.RUNCLOUD_SERVER_IP;

  console.log('[provision/rc] step 6: checking DNS for domain', normalizedDomain);
  const { data: managedDomain } = await adminDb
    .from('domains')
    .select('id, domain_name')
    .eq('domain_name', normalizedDomain)
    .maybeSingle();

  if (managedDomain && serverIp) {
    console.log('[provision/rc] step 6: Motive-managed domain — auto-configuring DNS');
    try {
      const opensrs = getOpenSRSClient();
      let existingRecords: Array<{ type: string; subdomain: string; ip_address?: string; hostname?: string }> = [];
      try {
        const zone = await opensrs.getDnsZone(normalizedDomain);
        existingRecords = zone.records;
      } catch {
        // Zone may not exist yet
      }

      type DnsChange = Parameters<typeof opensrs.updateDnsRecords>[1][number];
      const changes: DnsChange[] = [];

      for (const r of existingRecords) {
        if (r.type === 'A' && (r.subdomain === '@' || r.subdomain === '') && r.ip_address !== serverIp) {
          changes.push({ action: 'remove', record: r as DnsChange['record'] });
        }
        if (r.subdomain === 'www' && !(r.type === 'CNAME' && r.hostname === `${normalizedDomain}.`)) {
          changes.push({ action: 'remove', record: r as DnsChange['record'] });
        }
      }

      changes.push(
        { action: 'add', record: { type: 'A', subdomain: '@', ip_address: serverIp } },
        { action: 'add', record: { type: 'CNAME', subdomain: 'www', hostname: `${normalizedDomain}.` } },
      );

      await opensrs.updateDnsRecords(normalizedDomain, changes);
      console.log('[provision/rc] step 6 complete: DNS configured');
    } catch (err) {
      console.error('[provision/rc] step 6 failed: DNS auto-config', err);
      warnings.push(`DNS auto-config failed for ${normalizedDomain}. Configure A/CNAME records manually.`);
      sslPending = true;
    }
  } else {
    if (!managedDomain) {
      console.log('[provision/rc] step 6 skipped: external domain (not in domains table)');
    } else {
      console.log('[provision/rc] step 6 skipped: RUNCLOUD_SERVER_IP not set');
      warnings.push('RUNCLOUD_SERVER_IP env var not set — DNS auto-config skipped.');
    }
    sslPending = true;
  }

  // ── Step 7: Install SSL ───────────────────────────────────────────────
  if (!sslPending) {
    console.log('[provision/rc] step 7: installing SSL');
    try {
      await rc.installSSL(appId, {
        provider: 'letsencrypt',
        environment: 'live',
        enableHttp: false,
        enableHsts: false,
        enableHstsSubdomains: false,
        enableHstsPreload: false,
        authorizationMethod: 'http-01',
        sslProtocolId: 2,
      });
      console.log('[provision/rc] step 7 complete');
    } catch (err) {
      console.error('[provision/rc] step 7 failed: installSSL', err);
      sslPending = true;
      warnings.push(`SSL install failed — install manually via the hosting dashboard.`);
    }
  } else {
    const skipReason = !managedDomain ? 'external domain' : 'RUNCLOUD_SERVER_IP not set';
    console.log(`[provision/rc] step 7 skipped: ${skipReason} — SSL pending`);
    warnings.push(`SSL not installed — ${skipReason}. Configure DNS first, then install SSL.`);
  }

  // ── Step 7a: WordPress install (WordPress only) ───────────────────────
  if (isWordPress && input.wp_title && input.wp_admin_user && input.wp_admin_password && input.wp_admin_email) {
    console.log('[provision/rc] step 7a: installing WordPress');
    try {
      await rc.installWordPress(appId, {
        title: input.wp_title,
        adminUser: input.wp_admin_user,
        adminPassword: input.wp_admin_password,
        adminEmail: input.wp_admin_email,
      });
      console.log('[provision/rc] step 7a complete');
    } catch (err) {
      console.error('[provision/rc] step 7a failed: installWordPress', err);
      return NextResponse.json(
        {
          error: `App created (RunCloud ID: ${appId}), domain + SSL configured, but WordPress install failed. Install manually.`,
          runcloudAppId: appId,
        },
        { status: 502 },
      );
    }
  }

  // ── Step 8: Insert hosting_apps record ──────────────────────────────
  console.log('[provision/rc] step 8: inserting hosting_apps record');
  let hostingApp;
  let insertSucceeded = false;

  for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt++) {
    const { data, error: insertError } = await adminDb
      .from('hosting_apps')
      .insert({
        customer_id: input.customer_id,
        runcloud_app_id: appId,
        app_slug: appSlug,
        app_name: input.app_name,
        app_type: input.app_type,
        primary_domain: input.primary_domain,
        provisioned_by: user.id,
        port: isWordPress ? null : assignedPort,
        git_subdir: input.git_subdir || null,
        deploy_template: input.deploy_template || null,
        deploy_method: input.git_provider || input.deploy_method || null,
        ssl_pending: sslPending,
        managed_by: 'runcloud',
      })
      .select()
      .single();

    if (!insertError) {
      hostingApp = data;
      insertSucceeded = true;
      break;
    }

    // Port collision — retry with next port
    if (insertError.code === '23505' && insertError.message?.includes('port')) {
      console.warn(`[provision/rc] step 8: port ${assignedPort} collision, retrying with ${assignedPort + 1}`);
      assignedPort++;
      continue;
    }

    // Non-port duplicate (slug or runcloud_app_id)
    if (insertError.code === '23505') {
      return NextResponse.json(
        {
          error: 'Duplicate — this RunCloud app or slug is already linked',
          runcloudAppId: appId,
        },
        { status: 409 },
      );
    }

    // Other DB error
    console.error('[provision/rc] step 8 failed: insert hosting_apps', insertError);
    return NextResponse.json(
      {
        error: `RunCloud app provisioned (ID: ${appId}) but failed to save to database. Link manually via POST /api/admin/hosting-apps.`,
        runcloudAppId: appId,
      },
      { status: 500 },
    );
  }

  if (!insertSucceeded) {
    return NextResponse.json(
      {
        error: `RunCloud app provisioned (ID: ${appId}) but port assignment failed after ${MAX_PORT_RETRIES} retries. Link manually.`,
        runcloudAppId: appId,
      },
      { status: 500 },
    );
  }

  console.log('[provision/rc] step 8 complete: confirmed port =', assignedPort);

  // ── Step 9: Write Nginx proxy configs ──────────────────────────────
  if (!isWordPress) {
    console.log('[provision/rc] step 9: writing Nginx proxy configs');
    try {
      await writeNginxConfigs({
        appSlug,
        port: assignedPort,
        template: input.deploy_template!,
      });
      console.log('[provision/rc] step 9 complete');
    } catch (err) {
      console.error('[provision/rc] step 9 failed: writeNginxConfigs', err);
      warnings.push(`Nginx config write failed — configure proxy manually for port ${assignedPort}.`);
    }
  } else {
    console.log('[provision/rc] step 9 skipped: WordPress app (no proxy needed)');
  }

  // ── Step 10: Configure git with deploy script ─────────────────────
  if (input.git_provider && input.git_repository) {
    console.log('[provision/rc] step 10: configuring git');
    try {
      const deployScript = !isWordPress
        ? generateDeployScript({
            template: input.deploy_template!,
            appSlug,
            port: assignedPort,
            subdir: input.git_subdir,
          })
        : undefined;

      await rc.configureGit(appId, {
        provider: input.git_provider,
        repository: input.git_repository,
        branch: input.git_branch ?? 'main',
        autoDeploy: true,
        ...(deployScript ? { deployScript } : {}),
      });
      console.log('[provision/rc] step 10 complete');
    } catch (err) {
      console.error('[provision/rc] step 10 failed: configureGit', err);
      warnings.push(`Git setup failed — configure manually via the hosting dashboard.`);
    }
  } else {
    console.log('[provision/rc] step 10 skipped: no git provider/repository specified');
  }

  // ── Step 11: Welcome email ────────────────────────────────────────
  if (targetCustomer.email) {
    sendWelcomeHostingEmail(
      targetCustomer.email,
      targetCustomer.name ?? '',
      targetCustomer.plan ?? 'harbor',
      input.app_name,
      input.primary_domain,
    ).catch((err) => console.error('[provision/rc] welcome email failed:', err));
  }

  console.log('[provision/rc] complete — appSlug:', appSlug, 'appId:', appId, 'input:', safeInputForLogging);

  return NextResponse.json(
    {
      success: true,
      app: {
        id: hostingApp!.id,
        slug: appSlug,
        domain: input.primary_domain,
        runcloud_app_id: appId,
        port: isWordPress ? null : assignedPort,
        deploy_template: input.deploy_template || null,
        deploy_method: input.deploy_method || null,
      },
      warnings,
    },
    { status: 201 },
  );
}
