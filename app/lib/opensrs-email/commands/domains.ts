import type { OMAClient } from '../client';
import type {
  GetDomainResponse,
  SearchDomainsResponse,
  DeleteDomainResponse,
  SpamFilterLevel,
} from '../types';

export function createDomainCommands(client: OMAClient) {
  return {
    async changeDomain(
      domain: string,
      options: {
        catchAll?: string;
        spamFilterLevel?: SpamFilterLevel;
        suspended?: boolean;
      } = {}
    ): Promise<void> {
      const attributes: Record<string, unknown> = {};
      if (options.catchAll !== undefined) attributes.catch_all = options.catchAll;
      if (options.spamFilterLevel !== undefined) attributes.spam_filter_level = options.spamFilterLevel;
      if (options.suspended !== undefined) attributes.suspended = options.suspended;

      await client.request('change_domain', { domain, attributes });
    },

    async getDomain(domain: string): Promise<GetDomainResponse> {
      return client.request<GetDomainResponse>('get_domain', { domain });
    },

    async deleteDomain(domain: string): Promise<DeleteDomainResponse> {
      return client.request<DeleteDomainResponse>('delete_domain', { domain });
    },

    async searchDomains(
      options: { page?: number; pageSize?: number } = {}
    ): Promise<SearchDomainsResponse> {
      return client.request<SearchDomainsResponse>('search_domains', {
        page: options.page ?? 1,
        page_size: options.pageSize ?? 50,
      });
    },
  };
}
