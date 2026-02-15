import type { OpenSRSClient } from '../client';
import type { DomainAvailability, DomainSuggestion, DomainStatus, NameSuggestResponse } from '../types';

export function createLookupCommands(client: OpenSRSClient) {
  return {
    async checkAvailability(domain: string): Promise<DomainAvailability> {
      const response = await client.request<{ status: string }>({
        action: 'LOOKUP',
        object: 'DOMAIN',
        attributes: { domain },
      });

      const status: DomainStatus = response.attributes.status === 'available'
        ? 'available'
        : 'taken';

      return { domain, status };
    },

    async suggestDomains(query: string, tlds?: string[]): Promise<DomainSuggestion[]> {
      const searchString = query.includes('.') ? query.split('.')[0] : query;

      const attributes: Record<string, unknown> = {
        search_string: searchString,
        maximum: '10',
      };

      if (tlds && tlds.length > 0) {
        attributes.tlds = tlds;
      }

      const response = await client.request<NameSuggestResponse>({
        action: 'NAME_SUGGEST',
        object: 'DOMAIN',
        attributes,
      });

      const suggestions: DomainSuggestion[] = [];

      if (response.attributes.lookup?.items) {
        for (const item of response.attributes.lookup.items) {
          suggestions.push({
            domain: item.domain,
            status: item.status === 'available' ? 'available' : 'taken',
          });
        }
      }

      if (response.attributes.suggestion?.items) {
        for (const item of response.attributes.suggestion.items) {
          suggestions.push({
            domain: item.domain,
            status: item.status === 'available' ? 'available' : 'taken',
          });
        }
      }

      return suggestions;
    },

    async getDomainPrice(domain: string): Promise<{ domain: string; price: number }> {
      const response = await client.request<{ price: string }>({
        action: 'GET_PRICE',
        object: 'DOMAIN',
        attributes: { domain },
      });

      return {
        domain,
        price: parseFloat(response.attributes.price),
      };
    },
  };
}
