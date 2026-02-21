import type { RunCloudConfig } from './types';
import { RunCloudError } from './types';

const BASE_URL = 'https://manage.runcloud.io/api/v3';

export class RunCloudClient {
  private readonly config: RunCloudConfig;

  constructor(config: RunCloudConfig) {
    this.config = config;
  }

  get serverId(): number {
    return this.config.serverId;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });

    if (!res.ok) {
      let message = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const err = (await res.json()) as Record<string, unknown>;
        message = (err.message as string) || (err.error as string) || message;
      } catch {
        // Response body wasn't JSON
      }
      throw new RunCloudError(res.status, message);
    }

    return res.json() as Promise<T>;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
}
