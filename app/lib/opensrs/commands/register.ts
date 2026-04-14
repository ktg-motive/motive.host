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

/**
 * Generate a 16-character alphanumeric registrant password for SW_REGISTER.
 *
 * Previously we used `crypto.randomUUID().slice(0, 16)`, which produces values
 * like "1b4e28ba-2fa1-11" that contain hyphens. For the .ai registry the
 * OpenSRS order landed in the reseller portal with the password field blank
 * and a "No password was given" error on submit — the hyphens or UUID format
 * were not being accepted as a valid registrant password. OpenSRS docs call
 * for 6-32 alphanumeric characters for `reg_password`; emitting exactly that
 * removes the ambiguity.
 *
 * Uses crypto.getRandomValues for unbiased selection from the 62-char alphabet.
 */
export function generateRegistrantPassword(length = 16): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  // Use a bias-free rejection-sampling loop: 62 doesn't divide 256 evenly, so
  // masking with modulo would skew distribution toward lower-indexed chars.
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    const byte = buf[0];
    // 62 * 4 = 248; reject bytes >= 248 to keep distribution uniform.
    if (byte < 248) {
      out.push(alphabet[byte % alphabet.length]);
    }
  }
  return out.join('');
}

// Terminal success states returned by GET_ORDER_INFO that mean the registration
// actually landed at the registry. Anything else (pending, declined, cancelled,
// waiting, etc.) means the order is stuck and we should treat it as a failure
// so the caller can refund the customer.
const TERMINAL_SUCCESS_STATUSES = new Set([
  'completed',
  'processed',
  'delivered',
  'active',
]);

// Statuses that mean the order cannot recover. Fail fast — don't burn retries.
const TERMINAL_FAILURE_STATUSES = new Set([
  'declined',
  'cancelled',
  'canceled',
  'failed',
]);

// Number of attempts and delay (ms) for post-SW_REGISTER status verification.
// OpenSRS order info can lag briefly behind SW_REGISTER, so a short retry is
// worthwhile. Delays are ~500ms / 1s / 2s which keeps worst case under 4s.
const VERIFY_DELAYS_MS = [500, 1000, 2000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRegisterCommands(client: OpenSRSClient) {
  async function getRegistrationStatus(orderId: string): Promise<OrderInfoResponse> {
    const response = await client.request<OrderInfoResponse>({
      action: 'GET_ORDER_INFO',
      object: 'DOMAIN',
      attributes: { order_id: orderId },
    });

    return response.attributes;
  }

  return {
    async registerDomain(params: RegisterDomainParams): Promise<RegisterDomainResponse> {
      const contactSet: Record<string, Record<string, string>> = {
        owner: formatContact(params.contacts.owner),
        admin: formatContact(params.contacts.admin),
        tech: formatContact(params.contacts.tech),
        billing: formatContact(params.contacts.billing),
      };

      const rawUsername = params.contacts.owner.email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 30);

      const attributes: Record<string, unknown> = {
        domain: params.domain,
        period: String(params.period),
        contact_set: contactSet,
        // Use the tech contact we submit in contact_set rather than the
        // reseller's default. Previously hard-coded to '0', which caused the
        // reseller default (Motive AI org / different address) to appear in
        // draft orders for .ai registrations instead of the customer's data.
        custom_tech_contact: '1',
        handle: params.handleNow !== false ? 'process' : 'save',
        reg_type: 'new',
        reg_username: rawUsername || 'user',
        reg_password: generateRegistrantPassword(16),
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
      } else {
        // Tell OpenSRS to use the reseller's configured default nameservers.
        // When this attribute is omitted entirely, some TLDs (notably .ai)
        // leave the order sitting as a draft with no nameservers attached,
        // which the registry will not process. Setting '0' explicitly asks
        // OpenSRS to populate nameservers from the reseller profile.
        attributes.custom_nameservers = '0';
      }

      const response = await client.request<RegisterDomainResponse>({
        action: 'SW_REGISTER',
        object: 'DOMAIN',
        attributes,
      });

      const result = response.attributes;

      // Verify the order actually landed in a terminal success state. OpenSRS
      // returns is_success=1 on SW_REGISTER as soon as it accepts the order
      // for processing, but the order can still be declined, left pending, or
      // stuck as a draft at the registry level. A follow-up GET_ORDER_INFO
      // tells us whether registration actually completed. If not, throw so
      // the register route's catch block runs the refund path.
      if (result.id) {
        let lastStatus: string | undefined;
        let lastError: unknown;

        for (let attempt = 0; attempt < VERIFY_DELAYS_MS.length; attempt++) {
          try {
            const info = await getRegistrationStatus(result.id);
            const status = typeof info.status === 'string' ? info.status.toLowerCase() : undefined;
            lastStatus = status;
            if (status && TERMINAL_SUCCESS_STATUSES.has(status)) {
              return { ...result, verified_status: status };
            }
            // Fail fast on unrecoverable statuses — retrying a declined order
            // just wastes time before the refund fires.
            if (status && TERMINAL_FAILURE_STATUSES.has(status)) {
              throw new Error(
                `OpenSRS order ${result.id} reached terminal failure state: ${status}.`
              );
            }
          } catch (err) {
            // Re-throw our own terminal-failure error so it doesn't get swallowed
            // as "status lookup error".
            if (err instanceof Error && err.message.startsWith('OpenSRS order ')) {
              throw err;
            }
            lastError = err;
          }

          if (attempt < VERIFY_DELAYS_MS.length - 1) {
            await sleep(VERIFY_DELAYS_MS[attempt]);
          }
        }

        const statusMsg = lastStatus ?? 'unknown';
        const errSuffix = lastError instanceof Error ? ` (status lookup error: ${lastError.message})` : '';
        throw new Error(
          `OpenSRS registration did not reach a terminal success state after SW_REGISTER returned order ${result.id}. Last status: ${statusMsg}.${errSuffix}`
        );
      }

      return result;
    },

    getRegistrationStatus,
  };
}
