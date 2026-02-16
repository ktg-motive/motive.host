import { z } from 'zod';

export const storageTierSchema = z.enum(['basic', 'standard', 'plus']);

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[0-9]/, 'Must include a number')
  .regex(/[^A-Za-z0-9]/, 'Must include a special character');

export const localPartSchema = z
  .string()
  .min(1, 'Required')
  .max(64, 'Too long')
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/,
    'Must start and end with a letter or number. Only letters, numbers, dots, hyphens, and underscores.'
  );

export const provisionDomainSchema = z.object({
  domainId: z.string().uuid(),
});

export const createMailboxSchema = z.object({
  localPart: localPartSchema,
  displayName: z.string().max(128).optional(),
  storageTier: storageTierSchema,
  password: passwordSchema.optional(),
});

export const updateMailboxSchema = z.object({
  suspended: z.boolean().optional(),
  storageTier: storageTierSchema.optional(),
  displayName: z.string().max(128).optional(),
  passwordChangeRequired: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: passwordSchema.optional(),
});

export const updateMigrationSchema = z.object({
  checklist: z.record(z.string(), z.boolean()).optional(),
  oldProvider: z.string().max(128).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['in_progress', 'completed', 'abandoned']).optional(),
});
