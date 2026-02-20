import type { OpenSRSClient } from '../client';
import type {
  DomainContact,
  TransferEligibility,
  ProcessTransferParams,
  ProcessTransferResponse,
} from '../types';
import { OpenSRSError } from '../types';

function formatContact(contact: DomainContact): Record<string, string> {
  const result: Record<string, string> = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    phone: contact.phone,
    address1: contact.address1,
    city: contact.city,
    state: contact.state,
    postal_code: contact.postal_code,
    country: contact.country,
  };

  if (contact.fax) result.fax = contact.fax;
  if (contact.org_name) result.org_name = contact.org_name;
  if (contact.address2) result.address2 = contact.address2;
  if (contact.address3) result.address3 = contact.address3;

  return result;
}

// Human-readable reason from OpenSRS response text / attributes
function parseIneligibleReason(responseText: string, attributes: Record<string, unknown>): string {
  const reason = (attributes.reason as string) ?? responseText ?? '';
  const lower = reason.toLowerCase();

  if (lower.includes('lock') || lower.includes('locked')) {
    return 'Domain is locked. Unlock it at your current registrar before transferring.';
  }
  if (lower.includes('60') || lower.includes('recently')) {
    return 'Domain was recently registered or transferred. ICANN requires a 60-day waiting period.';
  }
  if (lower.includes('not registered') || lower.includes('not found')) {
    return 'Domain is not currently registered.';
  }
  if (lower.includes('already') || lower.includes('same registrar')) {
    return 'Domain is already managed by Motive Hosting.';
  }
  if (lower.includes('redemption') || lower.includes('expired')) {
    return 'Domain is in a redemption or expired state and cannot be transferred.';
  }

  return reason || 'Domain is not eligible for transfer at this time.';
}

export function createTransferCommands(client: OpenSRSClient) {
  return {
    async checkTransferEligibility(domain: string): Promise<TransferEligibility> {
      try {
        const response = await client.request<{ transferrable: string | number; reason: string }>({
          action: 'CHECK_TRANSFER',
          object: 'DOMAIN',
          attributes: { domain, type: 'inbound' },
        });

        const transferrable =
          response.attributes.transferrable === '1' ||
          response.attributes.transferrable === 1 ||
          String(response.attributes.transferrable).toLowerCase() === 'yes';

        if (!transferrable) {
          return {
            domain,
            eligible: false,
            reason: parseIneligibleReason(response.responseText, response.attributes as Record<string, unknown>),
          };
        }

        return { domain, eligible: true };
      } catch (err) {
        if (err instanceof OpenSRSError) {
          return {
            domain,
            eligible: false,
            reason: parseIneligibleReason(err.responseText, {}),
          };
        }
        throw err;
      }
    },

    async getTransferPrice(domain: string, period = 1): Promise<{ domain: string; price: number }> {
      const response = await client.request<{ price: string }>({
        action: 'GET_PRICE',
        object: 'DOMAIN',
        attributes: { domain, period: String(period), reg_type: 'transfer' },
      });

      return {
        domain,
        price: parseFloat(response.attributes.price),
      };
    },

    async processTransfer(params: ProcessTransferParams): Promise<ProcessTransferResponse> {
      const contactSet: Record<string, Record<string, string>> = {
        owner: formatContact(params.contacts.owner),
        admin: formatContact(params.contacts.admin),
        tech: formatContact(params.contacts.tech),
        billing: formatContact(params.contacts.billing),
      };

      const attributes: Record<string, unknown> = {
        domain: params.domain,
        period: String(params.period),
        auth_info: params.authInfo,
        contact_set: contactSet,
        handle: 'process',
        reg_username:
          params.contacts.owner.email
            .split('@')[0]
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 30) || 'user',
        reg_password: crypto.randomUUID().slice(0, 16),
        auto_renew: params.autoRenew ? '1' : '0',
        f_whois_privacy: params.privacy ? '1' : '0',
      };

      const response = await client.request<ProcessTransferResponse>({
        action: 'PROCESS_TRANSFER',
        object: 'DOMAIN',
        attributes,
      });

      return response.attributes;
    },

    // Outbound: remove the transfer lock so the gaining registrar can pull the domain.
    async unlockDomain(domain: string): Promise<void> {
      await client.request({
        action: 'MODIFY',
        object: 'DOMAIN',
        attributes: {
          domain,
          modify_fields: { lock_state: '0' },
        },
      });
    },

    // Outbound: re-apply the transfer lock (used to roll back if sendAuthCode fails).
    async lockDomain(domain: string): Promise<void> {
      await client.request({
        action: 'MODIFY',
        object: 'DOMAIN',
        attributes: {
          domain,
          modify_fields: { lock_state: '1' },
        },
      });
    },

    // Outbound: trigger OpenSRS to email the EPP/auth code to the registrant's email on file.
    async sendAuthCode(domain: string): Promise<void> {
      await client.request({
        action: 'SEND_AUTHCODE',
        object: 'DOMAIN',
        attributes: { domain },
      });
    },
  };
}
