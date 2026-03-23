import { z } from 'zod';

export const planIds = ['harbor', 'gulf', 'horizon', 'captain'] as const;
export type PlanId = (typeof planIds)[number];

export const createCustomerSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(200),
  display_name: z.string().max(200).optional(),
  company_name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
  plan: z.enum(planIds),
  send_welcome_email: z.boolean().default(true),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  display_name: z.string().max(200).nullable().optional(),
  company_name: z.string().max(200).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  plan: z.enum(planIds).optional(),
  disabled: z.boolean().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
