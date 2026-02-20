import type { OMAConfig, OMACredentials } from './types';
import { OMAError } from './types';

const ENDPOINTS = {
  test: 'https://admin.test.hostedemail.com/api',
  live: (cluster: string) => `https://admin.${cluster}.hostedemail.com/api`,
} as const;

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry

export class OMAClient {
  private readonly config: OMAConfig;
  private readonly baseUrl: string;
  private sessionToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: OMAConfig) {
    this.config = config;
    this.baseUrl =
      config.environment === 'test'
        ? ENDPOINTS.test
        : ENDPOINTS.live(config.cluster);
  }

  private async ensureAuth(): Promise<OMACredentials> {
    const now = Date.now();
    if (this.sessionToken && now < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return { user: this.config.user, session_token: this.sessionToken };
    }

    const response = await this.rawRequest<{
      session_token: string;
      session_token_duration: number;
    }>('authenticate', {
      credentials: {
        user: this.config.user,
        password: this.config.password,
      },
      generate_session_token: true,
      session_token_duration: 10800,
    });

    this.sessionToken = response.session_token;
    this.tokenExpiresAt = now + response.session_token_duration * 1000;

    return { user: this.config.user, session_token: this.sessionToken };
  }

  private async rawRequest<T>(method: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${method}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new OMAError(res.status, `HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    if (data.success === false || data.success === 0) {
      throw new OMAError(data.error_number ?? data.error ?? 0, data.error ?? 'Unknown OMA error');
    }

    return data as T;
  }

  async request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const credentials = await this.ensureAuth();
    return this.rawRequest<T>(method, { credentials, ...params });
  }
}
