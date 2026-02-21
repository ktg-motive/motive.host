'use client';

import { useState } from 'react';
import type { RunCloudGit } from '@runcloud';
import Card from '@/components/ui/card';

interface DeploymentTabProps {
  appSlug: string;
  app: { app_slug: string; app_type: string };
  git: RunCloudGit | null;
  sftpHost: string;
}

function InfoRow({ label, value, actions }: { label: string; value: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-white">{value}</span>
        {actions}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="rounded border border-border px-2 py-0.5 text-xs text-slate transition-colors hover:border-gold hover:text-muted-white"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function DeploymentTab({ appSlug, app, git, sftpHost }: DeploymentTabProps) {
  const [actionState, setActionState] = useState<{
    loading: boolean;
    message: string | null;
    error: string | null;
  }>({ loading: false, message: null, error: null });

  async function handleForceDeploy() {
    if (!window.confirm('Force deploy from git? This will run the deploy script immediately.')) return;
    setActionState({ loading: true, message: null, error: null });
    try {
      const res = await fetch(`/api/hosting/${appSlug}/deploy`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionState({ loading: false, message: null, error: data.error ?? 'Deploy failed' });
      } else {
        setActionState({ loading: false, message: data.message ?? 'Deploy started', error: null });
      }
    } catch {
      setActionState({ loading: false, message: null, error: 'Network error' });
    }
  }

  const sftpPort = '22';
  const sftpUser = app.app_slug;
  const sftpPath = `/home/motive-host/webapps/${app.app_slug}`;

  return (
    <div className="space-y-6">
      {/* Git Deployment */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Git Deployment
        </h2>
        {git ? (
          <>
            <div className="divide-y divide-border">
              <InfoRow label="Repository" value={git.repositoryData.url} />
              <InfoRow label="Branch" value={git.branch} />
              <InfoRow label="Provider" value={git.provider} />
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-slate">Auto Deploy</span>
                {git.autoDeploy ? (
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

            <div className="mt-4">
              <button
                onClick={handleForceDeploy}
                disabled={actionState.loading}
                className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionState.loading ? 'Deploying...' : 'Force Deploy'}
              </button>
            </div>

            {actionState.message && (
              <p className="mt-2 text-sm text-green-400">{actionState.message}</p>
            )}
            {actionState.error && (
              <p className="mt-2 text-sm text-red-400">{actionState.error}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate">No git integration configured.</p>
        )}
      </Card>

      {/* SFTP Access */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          SFTP Access
        </h2>
        <div className="divide-y divide-border">
          <InfoRow label="Host" value={sftpHost} actions={<CopyButton text={sftpHost} />} />
          <InfoRow label="Port" value={sftpPort} />
          <InfoRow label="Username" value={sftpUser} actions={<CopyButton text={sftpUser} />} />
          <InfoRow label="Path" value={sftpPath} actions={<CopyButton text={sftpPath} />} />
        </div>
        <p className="mt-4 text-xs text-slate">
          Use your SSH key for authentication. Contact support to configure SFTP access.
        </p>
      </Card>
    </div>
  );
}
