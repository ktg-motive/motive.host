'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/card';

interface DiyDeploymentTabProps {
  appSlug: string;
  app: {
    app_slug: string;
    app_type: 'wordpress' | 'nodejs' | 'static' | 'python';
    webhook_enabled?: boolean;
    git_branch?: string;
    git_repo?: string | null;
    deploy_template?: string | null;
  };
  deployKeyPublic: string | null;
  lastOperation: {
    operation_type: string;
    status: string;
    created_at: string;
    error_message: string | null;
  } | null;
  isAdmin?: boolean;
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

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DiyDeploymentTab({
  appSlug,
  app,
  deployKeyPublic,
  lastOperation,
  isAdmin,
}: DiyDeploymentTabProps) {
  const [deployState, setDeployState] = useState<{
    loading: boolean;
    message: string | null;
    error: string | null;
  }>({ loading: false, message: null, error: null });

  const [deployLog, setDeployLog] = useState<string | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  const [logLoading, setLogLoading] = useState(false);

  // Webhook config state
  const [webhookConfig, setWebhookConfig] = useState<{
    enabled: boolean;
    branch: string;
    webhook_url: string;
    has_secret: boolean;
    loaded: boolean;
  }>({
    enabled: app.webhook_enabled ?? false,
    branch: app.git_branch ?? 'main',
    webhook_url: `https://my.motive.host/api/webhooks/deploy/${appSlug}`,
    has_secret: false,
    loaded: false,
  });

  const [webhookState, setWebhookState] = useState<{
    loading: boolean;
    message: string | null;
    error: string | null;
    newSecret: string | null;
  }>({ loading: false, message: null, error: null, newSecret: null });

  const [branchInput, setBranchInput] = useState(app.git_branch ?? 'main');

  // Fetch webhook config on mount
  useEffect(() => {
    fetch(`/api/hosting/${appSlug}/webhook`)
      .then(r => {
        if (!r.ok) throw new Error('Not available');
        return r.json();
      })
      .then(data => {
        setWebhookConfig({
          enabled: data.enabled,
          branch: data.branch ?? 'main',
          webhook_url: data.webhook_url,
          has_secret: data.has_secret,
          loaded: true,
        });
        setBranchInput(data.branch ?? 'main');
      })
      .catch(() => {
        // Webhook config not available (non-admin or error)
        setWebhookConfig(prev => ({ ...prev, loaded: true }));
      });
  }, [appSlug]);

  // Fetch deploy log
  const fetchDeployLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch(`/api/hosting/${appSlug}/deploy-log`);
      if (res.ok) {
        const data = await res.json();
        setDeployLog(data.log ?? null);
      }
    } catch {
      // Best-effort
    } finally {
      setLogLoading(false);
    }
  }, [appSlug]);

  async function handleDeploy() {
    const isSelfDeploy = appSlug === 'customer-hub';
    const confirmMsg = isSelfDeploy
      ? 'Force deploy from git? The app will restart and this page will briefly disconnect.'
      : 'Force deploy from git? This will run the deploy script immediately.';
    if (!window.confirm(confirmMsg)) return;

    setDeployState({ loading: true, message: null, error: null });
    try {
      const res = await fetch(`/api/hosting/${appSlug}/deploy`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setDeployState({ loading: false, message: null, error: data.error ?? 'Deploy failed' });
      } else {
        setDeployState({
          loading: false,
          message: data.message ?? 'Deploy completed',
          error: null,
        });
        // Refresh deploy log after successful deploy
        fetchDeployLog();
      }
    } catch {
      if (isSelfDeploy) {
        setDeployState({
          loading: false,
          message: 'Deploy started -- app is restarting. This page will reconnect shortly.',
          error: null,
        });
      } else {
        setDeployState({ loading: false, message: null, error: 'Network error' });
      }
    }
  }

  async function handleWebhookToggle() {
    setWebhookState({ loading: true, message: null, error: null, newSecret: null });
    try {
      const res = await fetch(`/api/hosting/${appSlug}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !webhookConfig.enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWebhookState({ loading: false, message: null, error: data.error ?? 'Failed', newSecret: null });
      } else {
        setWebhookConfig(prev => ({
          ...prev,
          enabled: !prev.enabled,
          has_secret: data.secret ? true : prev.has_secret,
        }));
        setWebhookState({
          loading: false,
          message: `Webhook ${webhookConfig.enabled ? 'disabled' : 'enabled'}`,
          error: null,
          newSecret: data.secret ?? null,
        });
      }
    } catch {
      setWebhookState({ loading: false, message: null, error: 'Network error', newSecret: null });
    }
  }

  async function handleBranchUpdate() {
    if (branchInput === webhookConfig.branch) return;
    setWebhookState({ loading: true, message: null, error: null, newSecret: null });
    try {
      const res = await fetch(`/api/hosting/${appSlug}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: branchInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWebhookState({ loading: false, message: null, error: data.error ?? 'Failed', newSecret: null });
      } else {
        setWebhookConfig(prev => ({ ...prev, branch: branchInput }));
        setWebhookState({ loading: false, message: 'Branch updated', error: null, newSecret: null });
      }
    } catch {
      setWebhookState({ loading: false, message: null, error: 'Network error', newSecret: null });
    }
  }

  async function handleRegenerateSecret() {
    if (!window.confirm('Regenerate webhook secret? You will need to update it in your Git provider.')) return;
    setWebhookState({ loading: true, message: null, error: null, newSecret: null });
    try {
      const res = await fetch(`/api/hosting/${appSlug}/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate_secret: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWebhookState({ loading: false, message: null, error: data.error ?? 'Failed', newSecret: null });
      } else {
        setWebhookConfig(prev => ({ ...prev, has_secret: true }));
        setWebhookState({
          loading: false,
          message: 'Secret regenerated. Copy it now -- it will not be shown again.',
          error: null,
          newSecret: data.secret ?? null,
        });
      }
    } catch {
      setWebhookState({ loading: false, message: null, error: 'Network error', newSecret: null });
    }
  }

  const webhookUrl = webhookConfig.webhook_url;

  return (
    <div className="space-y-6">
      {/* Deploy Key */}
      {deployKeyPublic && (
        <Card>
          <h2 className="mb-4 text-base font-semibold text-muted-white">
            Deploy Key
          </h2>
          <p className="mb-3 text-sm text-slate">
            Add this public key as a deploy key in your Git repository settings. It grants read-only access for automated deploys.
          </p>
          <div className="relative rounded-lg border border-border bg-primary-bg p-3">
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-white">
              {deployKeyPublic.trim()}
            </pre>
            <div className="absolute right-2 top-2">
              <CopyButton text={deployKeyPublic.trim()} />
            </div>
          </div>
        </Card>
      )}

      {/* Deploy Now */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Deploy
        </h2>
        <div className="divide-y divide-border">
          {app.git_repo && (
            <InfoRow label="Repository" value={app.git_repo} />
          )}
          <InfoRow label="Branch" value={app.git_branch ?? 'main'} />
          {app.deploy_template && (
            <InfoRow label="Template" value={app.deploy_template} />
          )}
        </div>

        {/* Last operation */}
        {lastOperation && lastOperation.operation_type === 'deploy' && (
          <div className="mt-3 rounded-lg border border-border bg-primary-bg p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate">Last deploy</span>
              <span className="text-xs text-slate">{formatRelativeTime(lastOperation.created_at)}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${
                lastOperation.status === 'succeeded' ? 'bg-green-400' :
                lastOperation.status === 'failed' ? 'bg-red-400' :
                lastOperation.status === 'running' ? 'bg-amber-400' : 'bg-gray-400'
              }`} />
              <span className={`text-sm ${
                lastOperation.status === 'succeeded' ? 'text-green-400' :
                lastOperation.status === 'failed' ? 'text-red-400' :
                'text-muted-white'
              }`}>
                {lastOperation.status === 'succeeded' ? 'Success' :
                 lastOperation.status === 'failed' ? 'Failed' :
                 lastOperation.status.charAt(0).toUpperCase() + lastOperation.status.slice(1)}
              </span>
            </div>
            {lastOperation.error_message && (
              <p className="mt-1 text-xs text-red-400/80">{lastOperation.error_message}</p>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleDeploy}
            disabled={deployState.loading}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deployState.loading ? 'Deploying...' : 'Deploy Now'}
          </button>

          <button
            onClick={() => {
              if (!logExpanded) fetchDeployLog();
              setLogExpanded(!logExpanded);
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm text-slate transition-colors hover:border-gold hover:text-muted-white"
          >
            {logExpanded ? 'Hide Log' : 'View Deploy Log'}
          </button>
        </div>

        {deployState.message && (
          <p className="mt-2 text-sm text-green-400">{deployState.message}</p>
        )}
        {deployState.error && (
          <p className="mt-2 text-sm text-red-400">{deployState.error}</p>
        )}

        {/* Deploy log viewer */}
        {logExpanded && (
          <div className="mt-4 rounded-lg border border-border bg-primary-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate">Deploy Log</span>
              <button
                onClick={fetchDeployLog}
                disabled={logLoading}
                className="text-xs text-slate transition-colors hover:text-gold disabled:opacity-50"
              >
                {logLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {deployLog ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-muted-white/80">
                {deployLog}
              </pre>
            ) : logLoading ? (
              <p className="text-xs text-slate">Loading deploy log...</p>
            ) : (
              <p className="text-xs text-slate">No deploy log available.</p>
            )}
          </div>
        )}
      </Card>

      {/* Webhook Configuration — admin-only (backend is admin-gated) */}
      {isAdmin && <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Webhook (Push-to-Deploy)
        </h2>

        {!webhookConfig.loaded ? (
          <p className="text-sm text-slate">Loading webhook configuration...</p>
        ) : (
          <>
            {/* Enable/disable toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-muted-white">Auto-deploy on push</span>
                <p className="text-xs text-slate">Automatically deploy when you push to the configured branch.</p>
              </div>
              <button
                onClick={handleWebhookToggle}
                disabled={webhookState.loading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  webhookConfig.enabled ? 'bg-gold' : 'bg-border'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    webhookConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {webhookConfig.enabled && (
              <div className="mt-4 space-y-4">
                {/* Webhook URL */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate">
                    Webhook URL
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg border border-border bg-primary-bg px-3 py-2 font-mono text-xs text-muted-white">
                      {webhookUrl}
                    </code>
                    <CopyButton text={webhookUrl} />
                  </div>
                </div>

                {/* Branch */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate">
                    Branch Filter
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={branchInput}
                      onChange={(e) => setBranchInput(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-primary-bg px-3 py-2 font-mono text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none"
                      placeholder="main"
                    />
                    {branchInput !== webhookConfig.branch && (
                      <button
                        onClick={handleBranchUpdate}
                        disabled={webhookState.loading}
                        className="rounded-lg border border-gold px-3 py-2 text-sm text-gold transition-colors hover:bg-gold hover:text-primary-bg disabled:opacity-50"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </div>

                {/* Webhook Secret */}
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate">
                    Webhook Secret
                  </label>
                  <div className="flex items-center gap-2">
                    {webhookState.newSecret ? (
                      <code className="flex-1 rounded-lg border border-gold/30 bg-primary-bg px-3 py-2 font-mono text-xs text-gold">
                        {webhookState.newSecret}
                      </code>
                    ) : (
                      <code className="flex-1 rounded-lg border border-border bg-primary-bg px-3 py-2 font-mono text-xs text-slate">
                        {webhookConfig.has_secret ? '********' : 'No secret configured'}
                      </code>
                    )}
                    {webhookState.newSecret && <CopyButton text={webhookState.newSecret} />}
                    <button
                      onClick={handleRegenerateSecret}
                      disabled={webhookState.loading}
                      className="rounded-lg border border-border px-3 py-2 text-xs text-slate transition-colors hover:border-gold hover:text-muted-white disabled:opacity-50"
                    >
                      Regenerate
                    </button>
                  </div>
                  {webhookState.newSecret && (
                    <p className="mt-1 text-xs text-amber-400">
                      Copy this secret now. It will not be shown again.
                    </p>
                  )}
                </div>

                {/* Provider hint */}
                <div className="rounded-lg border border-border bg-primary-bg/50 p-3">
                  <p className="text-xs text-slate">
                    <span className="font-medium text-muted-white">GitHub:</span> Settings &rarr; Webhooks &rarr; Add webhook. Set the Payload URL, Content type to <code className="text-gold">application/json</code>, and paste the secret.
                  </p>
                  <p className="mt-2 text-xs text-slate">
                    <span className="font-medium text-muted-white">GitLab:</span> Settings &rarr; Webhooks &rarr; Add new webhook. Set the URL and paste the secret as the Secret token.
                  </p>
                </div>
              </div>
            )}

            {webhookState.message && (
              <p className="mt-3 text-sm text-green-400">{webhookState.message}</p>
            )}
            {webhookState.error && (
              <p className="mt-3 text-sm text-red-400">{webhookState.error}</p>
            )}
          </>
        )}
      </Card>}
    </div>
  );
}
