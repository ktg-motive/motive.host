import type { OpenSRSClient } from '../client';
import type { RenewDomainResponse, DomainExpiryInfo } from '../types';

export function createRenewCommands(client: OpenSRSClient) {
  return {
    async renewDomain(domain: string, period: number = 1): Promise<RenewDomainResponse> {
      // Renewal requires the current expiration year
      const expiryInfo = await this.getDomainExpiry(domain);
      const currentExpiry = new Date(expiryInfo.expiredate);
      const currentExpiryYear = currentExpiry.getFullYear();

      const response = await client.request<RenewDomainResponse>({
        action: 'RENEW',
        object: 'DOMAIN',
        attributes: {
          domain,
          period: String(period),
          currentexpirationyear: String(currentExpiryYear),
          handle: 'process',
        },
      });

      return response.attributes;
    },

    async getDomainExpiry(domain: string): Promise<DomainExpiryInfo> {
      const response = await client.request<{
        expiredate: string;
        auto_renew: string;
        sponsoring_rsp: string;
        let_expire: string;
      }>({
        action: 'GET',
        object: 'DOMAIN',
        attributes: {
          domain,
          type: 'all_info',
        },
      });

      return {
        domain,
        expiredate: response.attributes.expiredate,
        auto_renew: response.attributes.auto_renew === '1',
        let_expire: response.attributes.let_expire === '1',
      };
    },
  };
}
