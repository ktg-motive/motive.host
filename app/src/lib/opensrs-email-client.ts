import { createOMAClient } from '@opensrs-email';

export function getOMAClient() {
  return createOMAClient({
    user: process.env.OPENSRS_EMAIL_USER!,
    password: process.env.OPENSRS_EMAIL_PASSWORD!,
    cluster: process.env.OPENSRS_EMAIL_CLUSTER!,
    environment: (process.env.OPENSRS_EMAIL_ENVIRONMENT as 'test' | 'live') || 'test',
  });
}
