import { z } from 'zod';

// Deploy configuration types
export const deployTemplates = ['nextjs', 'express', 'generic'] as const;
export type DeployTemplate = (typeof deployTemplates)[number];

export const deployMethods = ['github', 'gitlab'] as const;
export type DeployMethod = (typeof deployMethods)[number];

export const createHostingAppSchema = z.object({
  customer_id: z.string().uuid(),
  runcloud_app_id: z.number().int().positive().nullable().optional(),
  app_slug: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
      'Must be lowercase alphanumeric with hyphens',
    ),
  app_name: z.string().min(1).max(200),
  app_type: z.enum(['wordpress', 'nodejs', 'static']),
  primary_domain: z.string().min(1).max(253),
});

export type CreateHostingAppInput = z.infer<typeof createHostingAppSchema>;

export const provisionSiteSchema = z.object({
  customer_id: z.string().uuid(),
  app_type: z.enum(['wordpress', 'nodejs', 'static']),
  primary_domain: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Must be a valid domain name (e.g. example.com)',
    ),
  app_name: z.string().min(1).max(200),
  // Deploy configuration (required for Node.js, ignored for WordPress)
  deploy_template: z.enum(deployTemplates).optional(),
  deploy_method: z.enum(deployMethods).optional(),
  // Optional git config (Node.js)
  git_provider: z.enum(['github', 'bitbucket', 'gitlab', 'custom']).optional(),
  git_repository: z.string().optional(),
  git_branch: z.string().optional(),
  git_subdir: z.string().trim().max(100)
    .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.\-\/]*$/, 'Subdirectory must be a safe relative path (no leading slash)')
    .refine(v => !v.includes('..'), 'Subdirectory must not contain path traversal (..)').optional(),
  // Domain config (DIY)
  www_behavior: z.enum(['add_www', 'no_www', 'as_is']).optional(),
  dns_ownership: z.enum(['motive', 'external']).optional(),
  // Environment variables (DIY)
  env_vars: z.array(z.object({
    key: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Invalid env var key'),
    value: z.string(),
    is_secret: z.boolean().optional(),
  })).max(50).optional(),
  // WordPress config (required when app_type === 'wordpress')
  wp_title: z.string().optional(),
  wp_admin_user: z.string().optional(),
  wp_admin_password: z.string().optional(),
  wp_admin_email: z.string().email().optional(),
}).superRefine((data, ctx) => {
  if (data.app_type === 'nodejs') {
    if (!data.deploy_template) ctx.addIssue({ code: 'custom', path: ['deploy_template'], message: 'Required for Node.js apps' });
    if (!data.deploy_method) ctx.addIssue({ code: 'custom', path: ['deploy_method'], message: 'Required for Node.js apps' });
  }
  if (data.app_type === 'wordpress') {
    if (!data.wp_title) ctx.addIssue({ code: 'custom', path: ['wp_title'], message: 'Required for WordPress apps' });
    if (!data.wp_admin_user) ctx.addIssue({ code: 'custom', path: ['wp_admin_user'], message: 'Required for WordPress apps' });
    if (!data.wp_admin_password) ctx.addIssue({ code: 'custom', path: ['wp_admin_password'], message: 'Required for WordPress apps' });
    if (!data.wp_admin_email) ctx.addIssue({ code: 'custom', path: ['wp_admin_email'], message: 'Required for WordPress apps' });
  }
});

export type ProvisionSiteInput = z.infer<typeof provisionSiteSchema>;
