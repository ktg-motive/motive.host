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
        dkimSelector?: string;
        dkimKey?: string;
      } = {}
    ): Promise<void> {
      const attributes: Record<string, unknown> = {};
      if (options.catchAll !== undefined) attributes.catch_all = options.catchAll;
      if (options.spamFilterLevel !== undefined) attributes.spam_filter_level = options.spamFilterLevel;
      if (options.suspended !== undefined) attributes.suspended = options.suspended;
      if (options.dkimSelector !== undefined) attributes.dkim_selector = options.dkimSelector;
      if (options.dkimKey !== undefined) attributes.dkim_key = options.dkimKey;

      await client.request('change_domain', { domain, attributes });
    },

    async getDomain(domain: string): Promise<GetDomainResponse> {
      const raw = await client.request<{
        attributes: {
          dkim_selector?: string | null;
          disabled?: boolean;
          [key: string]: unknown;
        };
      }>('get_domain', { domain });

      return {
        domain,
        status: raw.attributes?.disabled ? 'suspended' : 'active',
        dkim_selector: raw.attributes?.dkim_selector ?? undefined,
        // dkim_record is not returned — we generate the key pair ourselves
        // and store the public DNS record value at provision time.
      };
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
