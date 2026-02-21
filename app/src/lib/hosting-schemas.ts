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
