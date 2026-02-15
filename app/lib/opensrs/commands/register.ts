import type { OpenSRSClient } from '../client';
import type {
  RegisterDomainParams,
  RegisterDomainResponse,
  OrderInfoResponse,
  DomainContact,
} from '../types';

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

export function createRegisterCommands(client: OpenSRSClient) {
  return {
    async registerDomain(params: RegisterDomainParams): Promise<RegisterDomainResponse> {
      const contactSet: Record<string, Record<string, string>> = {
        owner: formatContact(params.contacts.owner),
        admin: formatContact(params.contacts.admin),
        tech: formatContact(params.contacts.tech),
        billing: formatContact(params.contacts.billing),
      };

      const attributes: Record<string, unknown> = {
        domain: params.domain,
        period: String(params.period),
        contact_set: contactSet,
        custom_tech_contact: '0',
        handle: params.handleNow !== false ? 'process' : 'save',
        reg_type: 'new',
        reg_username: params.contacts.owner.email,
        reg_password: crypto.randomUUID().slice(0, 16),
      };

      if (params.autoRenew !== undefined) {
        attributes.auto_renew = params.autoRenew ? '1' : '0';
      }

      if (params.privacy) {
        attributes.f_whois_privacy = '1';
      }

      if (params.customNameservers && params.customNameservers.length > 0) {
        attributes.custom_nameservers = '1';
        const nsSet: Record<string, Record<string, string>> = {};
        params.customNameservers.forEach((ns, i) => {
          nsSet[`name${i + 1}`] = { name: ns, sortorder: String(i + 1) };
        });
        attributes.nameserver_set = nsSet;
      }

      const response = await client.request<RegisterDomainResponse>({
        action: 'SW_REGISTER',
        object: 'DOMAIN',
        attributes,
      });

      return response.attributes;
    },

    async getRegistrationStatus(orderId: string): Promise<OrderInfoResponse> {
      const response = await client.request<OrderInfoResponse>({
        action: 'GET_ORDER_INFO',
        object: 'DOMAIN',
        attributes: { order_id: orderId },
      });

      return response.attributes;
    },
  };
}
