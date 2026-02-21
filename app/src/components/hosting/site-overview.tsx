'use client';

import type { RunCloudWebApp, RunCloudSSL, RunCloudDomain, RunCloudGit } from '@runcloud';
import Card from '@/components/ui/card';
import StatusBadge from './status-badge';

interface HostingAppRow {
  id: string;
  app_slug: string;
  app_name: string;
  app_type: 'wordpress' | 'nodejs' | 'static';
  primary_domain: string;
  runcloud_app_id: number;
  runcloud_server_id: number;
  cached_status: string | null;
  created_at: string;
}

interface SiteOverviewProps {
  appSlug: string;
  app: HostingAppRow;
  webapp: RunCloudWebApp | null;
  ssl: RunCloudSSL | null;
  domains: RunCloudDomain[];
  git: RunCloudGit | null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate">{label}</span>
      <span className="text-sm text-muted-white">{value}</span>
    </div>
  );
}

export default function SiteOverview({
  app,
  webapp,
  ssl,
  domains,
  git,
}: SiteOverviewProps) {
  const appStatus = (webapp?.state === 'active' ? 'running' : webapp?.state ?? app.cached_status) as
    | 'running'
    | 'stopped'
    | 'error'
    | 'unknown'
    | null;

  const runtime =
    app.app_type === 'nodejs'
      ? 'Node.js'
      : webapp?.phpVersion
        ? webapp.phpVersion.replace('php', 'PHP ')
        : app.app_type === 'wordpress'
          ? 'WordPress (PHP)'
          : 'Static';

  return (
    <div className="space-y-6">
      {/* Status Section */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Application Status
        </h2>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate">State</span>
            <StatusBadge status={appStatus} size="md" />
          </div>
          <InfoRow label="Runtime" value={runtime} />
          {webapp && (
            <>
              <InfoRow label="Stack" value={webapp.stack} />
              <InfoRow label="Mode" value={webapp.stackMode} />
            </>
          )}
          <InfoRow label="Type" value={app.app_type} />
        </div>
      </Card>

      {/* SSL Section */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          SSL Certificate
        </h2>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate">SSL Enabled</span>
            {ssl?.ssl_enabled ? (
              <span className="inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                Enabled
              </span>
            ) : (
              <span className="inline-block rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                Disabled
              </span>
            )}
          </div>
          {ssl && (
            <>
              <InfoRow label="Expires" value={formatDate(ssl.validUntil)} />
              <InfoRow label="Method" value={ssl.method} />
              <InfoRow
                label="HSTS"
                value={ssl.hsts ? 'Enabled' : 'Disabled'}
              />
            </>
          )}
          {!ssl && (
            <div className="py-2">
              <p className="text-sm text-slate">
                No SSL certificate configured for this application.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Domains Section */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Domains Attached
        </h2>
        {domains.length > 0 ? (
          <ul className="divide-y divide-border">
            {domains.map((domain) => (
              <li key={domain.id} className="flex items-center justify-between py-2">
                <span className="font-mono text-sm text-muted-white">
                  {domain.name}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">No domains attached.</p>
        )}
      </Card>

      {/* Git Section */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Git Integration
        </h2>
        {git ? (
          <div className="divide-y divide-border">
            <InfoRow label="Provider" value={git.provider} />
            <InfoRow label="Repository" value={git.repository} />
            <InfoRow label="Branch" value={git.branch} />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate">Auto Deploy</span>
              {git.auto_deploy ? (
                <span className="inline-block rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                  Enabled
                </span>
              ) : (
                <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                  Disabled
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate">No git integration configured.</p>
        )}
      </Card>

      {/* Quick Actions */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            disabled
            className="rounded-lg border border-border px-4 py-2 text-sm text-slate opacity-50 cursor-not-allowed"
            title="Coming soon -- Phase 2"
          >
            Force Deploy
          </button>
          <button
            disabled
            className="rounded-lg border border-border px-4 py-2 text-sm text-slate opacity-50 cursor-not-allowed"
            title="Coming soon -- Phase 2"
          >
            Rebuild App
          </button>
        </div>
        <p className="mt-2 text-xs text-slate">
          Action buttons are coming in a future update.
        </p>
      </Card>
    </div>
  );
}
