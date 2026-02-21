'use client';

import { useState } from 'react';
import type { RunCloudWebApp, RunCloudSSL, RunCloudDomain } from '@runcloud';
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

export default function SiteOverview({ appSlug, app, webapp, ssl, domains }: SiteOverviewProps) {
  const [actionState, setActionState] = useState<{
    loading: string | null;
    message: string | null;
    error: string | null;
  }>({ loading: null, message: null, error: null });

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

  async function handleAction(
    actionName: string,
    apiPath: string,
    confirmMsg: string,
  ) {
    if (!window.confirm(confirmMsg)) return;
    setActionState({ loading: actionName, message: null, error: null });
    try {
      const res = await fetch(apiPath, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionState({ loading: null, message: null, error: data.error ?? 'Action failed' });
      } else {
        setActionState({ loading: null, message: data.message ?? 'Done', error: null });
      }
    } catch {
      setActionState({ loading: null, message: null, error: 'Network error' });
    }
  }

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

      {/* Quick Actions */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              handleAction(
                'rebuild',
                `/api/hosting/${appSlug}/rebuild`,
                'Restart this application? It will briefly be unavailable.',
              )
            }
            disabled={actionState.loading !== null}
            className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionState.loading === 'rebuild' ? 'Restarting...' : 'Restart App'}
          </button>

          {app.app_type === 'nodejs' && (
            <button
              onClick={() =>
                handleAction(
                  'deploy',
                  `/api/hosting/${appSlug}/deploy`,
                  'Force deploy from git? This will run the deploy script immediately.',
                )
              }
              disabled={actionState.loading !== null}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionState.loading === 'deploy' ? 'Deploying...' : 'Force Deploy'}
            </button>
          )}

          {ssl !== null && (
            <button
              onClick={() =>
                handleAction(
                  'ssl',
                  `/api/hosting/${appSlug}/ssl-redeploy`,
                  'Redeploy the SSL certificate? Let\'s Encrypt will be re-provisioned.',
                )
              }
              disabled={actionState.loading !== null}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionState.loading === 'ssl' ? 'Redeploying...' : 'Force SSL Redeploy'}
            </button>
          )}
        </div>

        {actionState.message && (
          <p className="mt-3 text-sm text-green-400">{actionState.message}</p>
        )}
        {actionState.error && (
          <p className="mt-3 text-sm text-red-400">{actionState.error}</p>
        )}
      </Card>
    </div>
  );
}
