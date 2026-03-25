'use client';

import { useState, useEffect } from 'react';
import type { RunCloudWebApp, RunCloudSSL, RunCloudDomain } from '@runcloud';
import Card from '@/components/ui/card';

interface HostingAppRow {
  id: string;
  app_slug: string;
  app_name: string;
  app_type: 'wordpress' | 'nodejs' | 'static';
  primary_domain: string;
  runcloud_app_id: number;
  runcloud_server_id: number;
  cached_status: string | null;
  managed_by: string;
  created_at: string;
  deploy_template?: string | null;
  port?: number | null;
  ssl_pending?: boolean;
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

  const isSelfManaged = app.managed_by === 'self-managed';

  // PM2 status state for self-managed Node.js apps
  const [pm2Status, setPm2Status] = useState<{
    loaded: boolean;
    status: string;
    pid?: number;
    memory?: number;
    restarts?: number;
  }>({ loaded: false, status: 'loading' });

  // Fetch PM2 status on mount for self-managed nodejs apps
  useEffect(() => {
    if (!isSelfManaged || app.app_type !== 'nodejs') return;
    fetch(`/api/hosting/${appSlug}/status`)
      .then(r => r.json())
      .then(data => {
        setPm2Status({
          loaded: true,
          status: data.status ?? 'unknown',
          pid: data.pid,
          memory: data.memory,
          restarts: data.restarts,
        });
      })
      .catch(() => {
        setPm2Status({ loaded: true, status: 'unknown' });
      });
  }, [isSelfManaged, app.app_type, appSlug]);

  const runtime = isSelfManaged
    ? app.app_type === 'nodejs'
      ? `Node.js${app.deploy_template ? ` (${app.deploy_template})` : ''}`
      : 'Static'
    : app.app_type === 'nodejs'
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

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const pm2StatusColor: Record<string, string> = {
    online: 'bg-green-400',
    stopped: 'bg-red-400',
    errored: 'bg-red-400',
    not_found: 'bg-gray-400',
    unknown: 'bg-amber-400',
    loading: 'bg-gray-400',
  };

  const pm2StatusLabel: Record<string, string> = {
    online: 'Online',
    stopped: 'Stopped',
    errored: 'Errored',
    not_found: 'Not Found',
    unknown: 'Unknown',
    loading: 'Loading...',
  };

  return (
    <div className="space-y-6">
      {/* Status Section */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Application Status
        </h2>
        <div className="divide-y divide-border">
          <InfoRow label="Runtime" value={runtime} />
          {isSelfManaged && (
            <InfoRow label="Management" value="Self-Managed" />
          )}
          {!isSelfManaged && webapp && (
            <>
              <InfoRow label="Stack" value={webapp.stack} />
              <InfoRow label="Mode" value={webapp.stackMode} />
            </>
          )}
          <InfoRow label="Type" value={app.app_type} />
          {isSelfManaged && app.port && (
            <InfoRow label="Port" value={String(app.port)} />
          )}

          {/* PM2 status for self-managed Node.js apps */}
          {isSelfManaged && app.app_type === 'nodejs' && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate">Process Status</span>
              <span className="inline-flex items-center text-sm text-muted-white">
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${pm2StatusColor[pm2Status.status] ?? 'bg-gray-400'}`} />
                {pm2StatusLabel[pm2Status.status] ?? pm2Status.status}
              </span>
            </div>
          )}
          {isSelfManaged && app.app_type === 'nodejs' && pm2Status.loaded && pm2Status.pid && (
            <>
              <InfoRow label="PID" value={String(pm2Status.pid)} />
              {pm2Status.memory != null && (
                <InfoRow label="Memory" value={formatBytes(pm2Status.memory)} />
              )}
              {pm2Status.restarts != null && (
                <InfoRow label="Restarts" value={String(pm2Status.restarts)} />
              )}
            </>
          )}

          {/* Static badge for self-managed static apps */}
          {isSelfManaged && app.app_type === 'static' && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-slate">Process</span>
              <span className="inline-block rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
                Static (no process)
              </span>
            </div>
          )}
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
            ) : app.ssl_pending ? (
              <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                Pending
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
              {!isSelfManaged && (
                <InfoRow
                  label="HSTS"
                  value={ssl.hsts ? 'Enabled' : 'Disabled'}
                />
              )}
            </>
          )}
          {!ssl && !app.ssl_pending && (
            <div className="py-2">
              <p className="text-sm text-slate">
                No SSL certificate configured for this application.
              </p>
            </div>
          )}
          {app.ssl_pending && (
            <div className="py-2">
              <p className="text-sm text-amber-400/80">
                SSL is pending. Once your DNS records point to this server, SSL will be installed automatically.
              </p>
            </div>
          )}
        </div>

        {/* SSL renew button for self-managed apps */}
        {isSelfManaged && ssl && (
          <div className="mt-4">
            <button
              onClick={() =>
                handleAction(
                  'ssl',
                  `/api/hosting/${appSlug}/ssl-redeploy`,
                  "Renew the SSL certificate? Let's Encrypt will be re-provisioned.",
                )
              }
              disabled={actionState.loading !== null}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionState.loading === 'ssl' ? 'Renewing...' : 'Renew SSL Certificate'}
            </button>
          </div>
        )}
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
          {/* Restart: available for RunCloud apps and self-managed Node.js apps */}
          {(app.app_type === 'nodejs' || !isSelfManaged) && (
            <button
              onClick={() =>
                handleAction(
                  'rebuild',
                  `/api/hosting/${appSlug}/rebuild`,
                  isSelfManaged
                    ? 'Restart this application? The PM2 process will be restarted.'
                    : 'Restart this application? It will briefly be unavailable.',
                )
              }
              disabled={actionState.loading !== null}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionState.loading === 'rebuild' ? 'Restarting...' : 'Restart App'}
            </button>
          )}

          {/* Deploy: available for all self-managed apps and RunCloud Node.js apps */}
          {(isSelfManaged || app.app_type === 'nodejs') && (
            <button
              onClick={() =>
                handleAction(
                  'deploy',
                  `/api/hosting/${appSlug}/deploy`,
                  'Force deploy from git? This will run the deploy script immediately.',
                )
              }
              disabled={actionState.loading !== null}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionState.loading === 'deploy' ? 'Deploying...' : 'Force Deploy'}
            </button>
          )}

          {/* SSL: available for all apps with SSL installed */}
          {ssl !== null && !isSelfManaged && (
            <button
              onClick={() =>
                handleAction(
                  'ssl',
                  `/api/hosting/${appSlug}/ssl-redeploy`,
                  "Redeploy the SSL certificate? Let's Encrypt will be re-provisioned.",
                )
              }
              disabled={actionState.loading !== null}
              className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white disabled:cursor-not-allowed disabled:opacity-50"
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
