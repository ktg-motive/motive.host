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

  // Check slug uniqueness before touching RunCloud (avoids orphaned apps)
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

  // ── Step 3: Create RunCloud webapp ────────────────────────────────────
  const isWordPress = input.app_type === 'wordpress';
  const rc = getRunCloudClient();

  console.log('[provision] step 3: creating web app', appSlug);
  let runcloudApp;
  try {
    runcloudApp = await rc.createWebApp({
      name: appSlug,
      domainName: input.primary_domain,
      user: parseInt(process.env.RUNCLOUD_SYSTEM_USER_ID ?? '1883159', 10),
      publicPath: `/home/motive-host/webapps/${appSlug}${isWordPress ? '/public_html' : ''}`,
      ...(isWordPress ? { phpVersion: 'php82' } : {}),
      stack: 'nativenginx',
      stackMode: 'production',
      type: 'custom',
      clickjackingProtection: true,
      xssProtection: true,
      mimeSniffingProtection: true,
    });
  } catch (err) {
    console.error('[provision] step 3 failed: createWebApp', err);
    return handleRunCloudError(err);
  }

  const appId = runcloudApp.id;
  console.log('[provision] step 3 complete: appId =', appId);

  // ── Step 4: Attach domain ─────────────────────────────────────────────
  // createWebApp already attaches the domain via domainName param,
  // but we try again in case it wasn't included or for additional domains.
  console.log('[provision] step 4: attaching domain', input.primary_domain);
  try {
    await rc.attachDomain(appId, input.primary_domain);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : '';
    if (errMsg.includes('already exists') || errMsg.includes('Domain already')) {
      console.log('[provision] step 4: domain already attached (from createWebApp) — continuing');
    } else {
      console.error('[provision] step 4 failed: attachDomain', err);
      warnings.push('Domain attachment failed — may need manual configuration in RunCloud.');
    }
  }
  console.log('[provision] step 4 complete');

  // ── Step 5: Calculate initial port ──────────────────────────────────
  console.log('[provision] step 5: calculating port');
  const { data: maxPortRow } = await adminDb
    .from('hosting_apps')
    .select('port')
    .not('port', 'is', null)
    .order('port', { ascending: false })
    .limit(1)
    .maybeSingle();

  let assignedPort = (maxPortRow?.port ?? BASE_PORT) + 1;
  console.log('[provision] step 5 complete: initial port =', assignedPort);

  // ── Step 6: Auto-configure DNS ────────────────────────────────────────
  let sslPending = false;
  const serverIp = process.env.RUNCLOUD_SERVER_IP;

  console.log('[provision] step 6: checking DNS for domain', normalizedDomain);
  const { data: managedDomain } = await adminDb
    .from('domains')
    .select('id, domain_name')
    .eq('domain_name', normalizedDomain)
    .maybeSingle();

  if (managedDomain && serverIp) {
    console.log('[provision] step 6: Motive-managed domain — auto-configuring DNS');
    try {
      const opensrs = getOpenSRSClient();
      // Fetch existing records to remove conflicting A/@  and CNAME/www entries
      let existingRecords: Array<{ type: string; subdomain: string; ip_address?: string; hostname?: string }> = [];
      try {
        const zone = await opensrs.getDnsZone(normalizedDomain);
        existingRecords = zone.records;
      } catch {
        // Zone may not exist yet — updateDnsRecords auto-creates
      }

      type DnsChange = Parameters<typeof opensrs.updateDnsRecords>[1][number];
      const changes: DnsChange[] = [];

      // Remove conflicting records at apex (A) and www (any type — A, AAAA, CNAME)
      for (const r of existingRecords) {
        if (r.type === 'A' && (r.subdomain === '@' || r.subdomain === '') && r.ip_address !== serverIp) {
          changes.push({ action: 'remove', record: r as DnsChange['record'] });
        }
        // www gets a CNAME, so remove any conflicting record type at www
        if (r.subdomain === 'www' && !(r.type === 'CNAME' && r.hostname === `${normalizedDomain}.`)) {
          changes.push({ action: 'remove', record: r as DnsChange['record'] });
        }
      }

      // Add correct records
      changes.push(
        { action: 'add', record: { type: 'A', subdomain: '@', ip_address: serverIp } },
        { action: 'add', record: { type: 'CNAME', subdomain: 'www', hostname: `${normalizedDomain}.` } },
      );

      await opensrs.updateDnsRecords(normalizedDomain, changes);
      console.log('[provision] step 6 complete: DNS configured');
    } catch (err) {
      console.error('[provision] step 6 failed: DNS auto-config', err);
      warnings.push(`DNS auto-config failed for ${normalizedDomain}. Configure A/CNAME records manually.`);
      sslPending = true;
    }
  } else {
    if (!managedDomain) {
      console.log('[provision] step 6 skipped: external domain (not in domains table)');
    } else {
      console.log('[provision] step 6 skipped: RUNCLOUD_SERVER_IP not set');
      warnings.push('RUNCLOUD_SERVER_IP env var not set — DNS auto-config skipped.');
    }
    sslPending = true;
  }

  // ── Step 7: Install SSL ───────────────────────────────────────────────
  if (!sslPending) {
    console.log('[provision] step 7: installing SSL');
    try {
      await rc.installSSL(appId, {
        provider: 'letsencrypt',
        type: 'HTTP/2',
        hsts: true,
        hsts_subdomains: false,
        hsts_preload: false,
      });
      console.log('[provision] step 7 complete');
    } catch (err) {
      console.error('[provision] step 7 failed: installSSL', err);
      sslPending = true;
      warnings.push(`SSL install failed — install manually via the hosting dashboard.`);
    }
  } else {
    const skipReason = !managedDomain ? 'external domain' : 'RUNCLOUD_SERVER_IP not set';
    console.log(`[provision] step 7 skipped: ${skipReason} — SSL pending`);
    warnings.push(`SSL not installed — ${skipReason}. Configure DNS first, then install SSL.`);
  }

  // ── Step 7a: WordPress install (WordPress only) ───────────────────────
  if (isWordPress && input.wp_title && input.wp_admin_user && input.wp_admin_password && input.wp_admin_email) {
    console.log('[provision] step 7a: installing WordPress');
    try {
      await rc.installWordPress(appId, {
        title: input.wp_title,
        adminUser: input.wp_admin_user,
        adminPassword: input.wp_admin_password,
        adminEmail: input.wp_admin_email,
      });
      console.log('[provision] step 7a complete');
    } catch (err) {
      console.error('[provision] step 7a failed: installWordPress', err);
      return NextResponse.json(
        {
          error: `App created (RunCloud ID: ${appId}), domain + SSL configured, but WordPress install failed. Install manually.`,
          runcloudAppId: appId,
        },
        { status: 502 },
      );
    }
  }

  // ── Step 8: Insert hosting_apps record (confirms port via unique constraint) ──
  // Port must be confirmed in DB BEFORE writing Nginx config or deploy script,
  // so that all three use the same port value.
  console.log('[provision] step 8: inserting hosting_apps record');
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
      console.warn(`[provision] step 8: port ${assignedPort} collision, retrying with ${assignedPort + 1}`);
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
    console.error('[provision] step 8 failed: insert hosting_apps', insertError);
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

  console.log('[provision] step 8 complete: confirmed port =', assignedPort);

  // ── Step 9: Write Nginx proxy configs (uses confirmed port) ───────────
  // Only for Node.js apps — WordPress uses PHP-FPM, not a proxy
  if (!isWordPress) {
    console.log('[provision] step 9: writing Nginx proxy configs');
    try {
      await writeNginxConfigs({
        appSlug,
        port: assignedPort,
        template: input.deploy_template!,
      });
      console.log('[provision] step 9 complete');
    } catch (err) {
      console.error('[provision] step 9 failed: writeNginxConfigs', err);
      warnings.push(`Nginx config write failed — configure proxy manually for port ${assignedPort}.`);
    }
  } else {
    console.log('[provision] step 9 skipped: WordPress app (no proxy needed)');
  }

  // ── Step 10: Configure git with deploy script (uses confirmed port) ───
  if (input.git_provider && input.git_repository) {
    console.log('[provision] step 10: configuring git');
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
      console.log('[provision] step 10 complete');
    } catch (err) {
      console.error('[provision] step 10 failed: configureGit', err);
      warnings.push(`Git setup failed — configure manually via the hosting dashboard.`);
    }
  } else {
    console.log('[provision] step 10 skipped: no git provider/repository specified');
  }

  // ── Step 11: Fire-and-forget welcome email ────────────────────────────
  if (targetCustomer.email) {
    sendWelcomeHostingEmail(
      targetCustomer.email,
      targetCustomer.name ?? '',
      targetCustomer.plan ?? 'harbor',
      input.app_name,
      input.primary_domain,
    ).catch((err) => console.error('[provision] welcome email failed:', err));
  }

  console.log('[provision] complete — appSlug:', appSlug, 'appId:', appId, 'input:', safeInputForLogging);

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
