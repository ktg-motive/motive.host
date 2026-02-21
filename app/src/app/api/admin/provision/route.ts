import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRunCloudClient } from '@/lib/runcloud-client';
import { provisionSiteSchema } from '@/lib/hosting-schemas';
import { handleRunCloudError } from '@/lib/api-utils';
import { sendWelcomeHostingEmail } from '@/lib/sendgrid';

export async function POST(request: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 2. Check admin status
  const { data: customer } = await supabase
    .from('customers')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!customer?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Validate request body
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
  // Redact password from scope before any logging path
  const safeInputForLogging = { ...input, wp_admin_password: input.wp_admin_password ? '[REDACTED]' : undefined };

  // 4. Verify target customer exists
  const adminDb = createAdminClient();
  const { data: targetCustomer } = await adminDb
    .from('customers')
    .select('id, email, name, plan')
    .eq('id', input.customer_id)
    .single();

  if (!targetCustomer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }

  // 5. Derive slug from domain (strip www. prefix first to avoid www-wills-com vs wills-com collision)
  const normalizedDomain = input.primary_domain.toLowerCase().replace(/^www\./, '');
  const appSlug = normalizedDomain.replace(/\./g, '-');

  // 5a. Check slug uniqueness before touching RunCloud (avoids orphaned apps)
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

  // 6. Determine stack params based on app type
  const isWordPress = input.app_type === 'wordpress';
  const rc = getRunCloudClient();

  // Step 1: Create the web app
  console.log('[provision] step 1: creating web app', appSlug);
  let runcloudApp;
  try {
    runcloudApp = await rc.createWebApp({
      name: appSlug,
      domainName: input.primary_domain,
      user: 'motive-host',
      publicPath: isWordPress ? '/public_html' : '/',
      ...(isWordPress ? { phpVersion: 'php82' } : {}),
      stack: isWordPress ? 'hybrid' : 'native-nginx-custom',
      stackMode: 'production',
      clickjackingProtection: true,
      xssProtection: true,
      mimeSniffingProtection: true,
    });
  } catch (err) {
    console.error('[provision] step 1 failed: createWebApp', err);
    return handleRunCloudError(err);
  }

  const appId = runcloudApp.id;
  console.log('[provision] step 1 complete: appId =', appId);

  // Step 2: Attach domain
  console.log('[provision] step 2: attaching domain', input.primary_domain);
  try {
    await rc.attachDomain(appId, input.primary_domain);
  } catch (err) {
    console.error('[provision] step 2 failed: attachDomain', err);
    return NextResponse.json(
      {
        error: `App created (RunCloud ID: ${appId}) but domain attachment failed. Attach manually in RunCloud.`,
        runcloudAppId: appId,
      },
      { status: 502 },
    );
  }
  console.log('[provision] step 2 complete');

  // Step 3: Install SSL
  console.log('[provision] step 3: installing SSL');
  try {
    await rc.installSSL(appId, {
      provider: 'letsencrypt',
      type: 'HTTP/2',
      hsts: true,
      hsts_subdomains: false,
      hsts_preload: false,
    });
  } catch (err) {
    console.error('[provision] step 3 failed: installSSL', err);
    return NextResponse.json(
      {
        error: `App created (RunCloud ID: ${appId}) and domain attached, but SSL install failed. Install manually in RunCloud.`,
        runcloudAppId: appId,
      },
      { status: 502 },
    );
  }
  console.log('[provision] step 3 complete');

  // Step 4: Git config (Node.js only) — non-fatal, app is usable without git
  let gitWarning: string | undefined;
  if (input.app_type === 'nodejs' && input.git_provider && input.git_repository) {
    console.log('[provision] step 4: configuring git');
    try {
      await rc.configureGit(appId, {
        provider: input.git_provider,
        repository: input.git_repository,
        branch: input.git_branch ?? 'main',
        autoDeploy: true,
      });
      console.log('[provision] step 4 complete');
    } catch (err) {
      console.error('[provision] step 4 failed: configureGit', err);
      gitWarning = `Git setup failed — configure manually in RunCloud (app ID: ${appId}).`;
    }
  }

  // Step 5: WordPress install (WordPress only)
  if (input.app_type === 'wordpress' && input.wp_title && input.wp_admin_user && input.wp_admin_password && input.wp_admin_email) {
    console.log('[provision] step 5: installing WordPress');
    try {
      await rc.installWordPress(appId, {
        title: input.wp_title,
        adminUser: input.wp_admin_user,
        adminPassword: input.wp_admin_password,
        adminEmail: input.wp_admin_email,
      });
    } catch (err) {
      console.error('[provision] step 5 failed: installWordPress', err);
      return NextResponse.json(
        {
          error: `App created (RunCloud ID: ${appId}), domain + SSL configured, but WordPress install failed. Install manually.`,
          runcloudAppId: appId,
        },
        { status: 502 },
      );
    }
    console.log('[provision] step 5 complete');
  }

  // Step 6: Insert hosting_apps record
  console.log('[provision] step 6: inserting hosting_apps record');
  const { data: hostingApp, error: insertError } = await adminDb
    .from('hosting_apps')
    .insert({
      customer_id: input.customer_id,
      runcloud_app_id: appId,
      app_slug: appSlug,
      app_name: input.app_name,
      app_type: input.app_type,
      primary_domain: input.primary_domain,
      provisioned_by: user.id,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        {
          error: 'Duplicate — this RunCloud app or slug is already linked',
          runcloudAppId: appId,
        },
        { status: 409 },
      );
    }
    console.error('[provision] step 6 failed: insert hosting_apps', insertError);
    return NextResponse.json(
      {
        error: `RunCloud app provisioned (ID: ${appId}) but failed to save to database. Link manually via POST /api/admin/hosting-apps.`,
        runcloudAppId: appId,
      },
      { status: 500 },
    );
  }
  console.log('[provision] step 6 complete');

  // Step 7: Fire-and-forget welcome email
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
    { hostingApp, runcloudAppId: appId, ...(gitWarning ? { warning: gitWarning } : {}) },
    { status: 201 },
  );
}
