'use client';

import { useState } from 'react';
import type { RunCloudWebApp, RunCloudSSL, RunCloudDomain, RunCloudGit, RunCloudActionLog } from '@runcloud';
import SiteOverview from './site-overview';
import DeploymentTab from './deployment-tab';
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
  created_at: string;
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
}

type TabId = 'overview' | 'deployment' | 'activity';

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
}: SiteTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    ...(app.app_type === 'nodejs' ? [{ id: 'deployment' as const, label: 'Deployment' }] : []),
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

      {activeTab === 'deployment' && app.app_type === 'nodejs' && (
        <DeploymentTab
          appSlug={appSlug}
          app={app}
          git={git}
          sftpHost={sftpHost}
        />
      )}

      {activeTab === 'activity' && (
        <ActivityTab actionLog={actionLog} />
      )}
    </div>
  );
}
