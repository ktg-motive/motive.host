'use client';

import { useState } from 'react';
import type { RunCloudWebApp, RunCloudSSL, RunCloudDomain, RunCloudGit, RunCloudActionLog } from '@runcloud';
import SiteOverview from './site-overview';
import DeploymentTab from './deployment-tab';
import DiyDeploymentTab from './diy-deployment-tab';
import EnvVarsTab from './env-vars-tab';
import ActivityTab from './activity-tab';

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
  webhook_enabled?: boolean;
  git_branch?: string;
  git_repo?: string | null;
  deploy_template?: string | null;
  port?: number | null;
  ssl_pending?: boolean;
}

interface LastOperation {
  operation_type: string;
  status: string;
  created_at: string;
  error_message: string | null;
}

interface SiteTabsProps {
  appSlug: string;
  app: HostingAppRow;
  webapp: RunCloudWebApp | null;
  ssl: RunCloudSSL | null;
  domains: RunCloudDomain[];
  git: RunCloudGit | null;
  actionLog: RunCloudActionLog[];
  sftpHost: string;
  deployKeyPublic?: string | null;
  lastOperation?: LastOperation | null;
  isAdmin?: boolean;
}

type TabId = 'overview' | 'deployment' | 'env' | 'activity';

interface Tab {
  id: TabId;
  label: string;
}

export default function SiteTabs({
  appSlug,
  app,
  webapp,
  ssl,
  domains,
  git,
  actionLog,
  sftpHost,
  deployKeyPublic,
  lastOperation,
  isAdmin,
}: SiteTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const isSelfManaged = app.managed_by === 'self-managed';

  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    // Deployment tab: shown for Node.js RunCloud apps and all self-managed apps
    ...(isSelfManaged || app.app_type === 'nodejs'
      ? [{ id: 'deployment' as const, label: 'Deployment' }]
      : []),
    // Env vars: shown for all self-managed apps (backend checks ownership)
    ...(isSelfManaged ? [{ id: 'env' as const, label: 'Environment' }] : []),
    { id: 'activity', label: 'Activity' },
  ];

  return (
    <div>
      <div className="mb-6 flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-gold text-gold'
                : 'border-transparent text-slate hover:text-muted-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <SiteOverview
          appSlug={appSlug}
          app={app}
          webapp={webapp}
          ssl={ssl}
          domains={domains}
        />
      )}

      {activeTab === 'deployment' && isSelfManaged && (
        <DiyDeploymentTab
          appSlug={appSlug}
          app={app}
          deployKeyPublic={deployKeyPublic ?? null}
          lastOperation={lastOperation ?? null}
          isAdmin={isAdmin}
        />
      )}

      {activeTab === 'deployment' && !isSelfManaged && app.app_type === 'nodejs' && (
        <DeploymentTab
          appSlug={appSlug}
          app={app}
          git={git}
          sftpHost={sftpHost}
        />
      )}

      {activeTab === 'env' && isSelfManaged && (
        <EnvVarsTab appSlug={appSlug} />
      )}

      {activeTab === 'activity' && (
        <ActivityTab actionLog={actionLog} />
      )}
    </div>
  );
}
