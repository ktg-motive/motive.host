import { z } from 'zod';

export const createHostingAppSchema = z.object({
  customer_id: z.string().uuid(),
  runcloud_app_id: z.number().int().positive(),
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
  app_type: z.enum(['wordpress', 'nodejs']),
  primary_domain: z
    .string()
    .min(1)
    .max(253)
    .regex(
      /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
      'Must be a valid domain name (e.g. example.com)',
    ),
  app_name: z.string().min(1).max(200),
  // Optional git config (Node.js)
  git_provider: z.enum(['github', 'bitbucket', 'gitlab', 'custom']).optional(),
  git_repository: z.string().optional(),
  git_branch: z.string().optional(),
  // WordPress config (required when app_type === 'wordpress')
  wp_title: z.string().optional(),
  wp_admin_user: z.string().optional(),
  wp_admin_password: z.string().optional(),
  wp_admin_email: z.string().email().optional(),
}).superRefine((data, ctx) => {
  if (data.app_type === 'wordpress') {
    if (!data.wp_title) ctx.addIssue({ code: 'custom', path: ['wp_title'], message: 'Required for WordPress apps' });
    if (!data.wp_admin_user) ctx.addIssue({ code: 'custom', path: ['wp_admin_user'], message: 'Required for WordPress apps' });
    if (!data.wp_admin_password) ctx.addIssue({ code: 'custom', path: ['wp_admin_password'], message: 'Required for WordPress apps' });
    if (!data.wp_admin_email) ctx.addIssue({ code: 'custom', path: ['wp_admin_email'], message: 'Required for WordPress apps' });
  }
});

export type ProvisionSiteInput = z.infer<typeof provisionSiteSchema>;
