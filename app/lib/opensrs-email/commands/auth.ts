import type { OMAClient } from '../client';

export function createAuthCommands(client: OMAClient) {
  return {
    async generateUserToken(
      email: string,
      lifetimeSeconds: number = 3600
    ): Promise<string> {
      const res = await client.request<{ token: string }>('generate_token', {
        user: email,
        token_lifetime: lifetimeSeconds,
      });
      return res.token;
    },
  };
}
