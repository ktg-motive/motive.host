-- Migration 012: Add deploy-related columns to hosting_apps
-- Supports site hosting Phase 1: deploy templates, git method, port allocation, SSL deferral

alter table hosting_apps
  add column if not exists port             integer,
  add column if not exists git_subdir       text,
  add column if not exists deploy_template  text,
  add column if not exists deploy_method    text,
  add column if not exists ssl_pending      boolean not null default false;

-- Unique constraint prevents race conditions in port allocation
do $$ begin
  alter table hosting_apps add constraint hosting_apps_port_unique unique (port);
exception when duplicate_object then null;
end $$;

comment on column hosting_apps.port is 'Unique port for Node.js app (starting at 3001; 3000 is reserved for customer-hub)';
comment on column hosting_apps.git_subdir is 'Subdirectory for monorepo projects';
comment on column hosting_apps.deploy_template is 'Deploy script template: nextjs, express, or generic';
comment on column hosting_apps.deploy_method is 'Git provider: github or gitlab';
comment on column hosting_apps.ssl_pending is 'True if SSL installation is deferred (external domain, DNS not yet pointed)';
