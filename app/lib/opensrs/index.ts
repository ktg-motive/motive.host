import { OpenSRSClient } from './client';
import { createLookupCommands } from './commands/lookup';
import { createRegisterCommands } from './commands/register';
import { createDnsCommands } from './commands/dns';
import { createRenewCommands } from './commands/renew';
import { createTransferCommands } from './commands/transfer';
import type { OpenSRSConfig } from './types';

export type { OpenSRSConfig } from './types';
export { OpenSRSError } from './types';
export type {
  DomainAvailability,
  DomainSuggestion,
  DomainContact,
  RegisterDomainParams,
  RegisterDomainResponse,
  OrderInfoResponse,
  DnsRecord,
  DnsRecordType,
  DnsRecordChange,
  DnsUpdateOptions,
  DnsUpdateResult,
  DnsZoneResponse,
  RenewDomainResponse,
  DomainExpiryInfo,
  TransferEligibility,
  ProcessTransferParams,
  ProcessTransferResponse,
} from './types';

export function createOpenSRSClient(config: OpenSRSConfig) {
  const client = new OpenSRSClient(config);
  const lookup = createLookupCommands(client);
  const register = createRegisterCommands(client);
  const dns = createDnsCommands(client);
  const renew = createRenewCommands(client);
  const transfer = createTransferCommands(client);

  return {
    // Domain lookup
    checkAvailability: lookup.checkAvailability,
    suggestDomains: lookup.suggestDomains,
    getDomainPrice: lookup.getDomainPrice,

    // Domain registration
    registerDomain: register.registerDomain,
    getRegistrationStatus: register.getRegistrationStatus,

    // DNS management
    createDnsZone: dns.createDnsZone,
    getDnsZone: dns.getDnsZone,
    setDnsZone: dns.setDnsZone,
    deleteDnsZone: dns.deleteDnsZone,
    updateDnsRecords: dns.updateDnsRecords.bind(dns),
    forceNameservers: dns.forceNameservers,

    // Renewal
    renewDomain: renew.renewDomain.bind(renew),
    getDomainExpiry: renew.getDomainExpiry,

    // Transfers (inbound + outbound)
    checkTransferEligibility: transfer.checkTransferEligibility,
    getTransferPrice: transfer.getTransferPrice,
    processTransfer: transfer.processTransfer,
    unlockDomain: transfer.unlockDomain,
    lockDomain: transfer.lockDomain,
    sendAuthCode: transfer.sendAuthCode,
  };
}

export type MotiveHostingClient = ReturnType<typeof createOpenSRSClient>;
