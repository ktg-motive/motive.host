import { OMAClient } from './client';
import { createAuthCommands } from './commands/auth';
import { createDomainCommands } from './commands/domains';
import { createUserCommands } from './commands/users';
import type { OMAConfig } from './types';

export type { OMAConfig } from './types';
export { OMAError, STORAGE_TIERS } from './types';
export type {
  StorageTier,
  MailboxType,
  MailboxStatus,
  EmailDomainStatus,
  SpamFilterLevel,
  GetDomainResponse,
  GetUserResponse,
  SearchDomainsResponse,
  SearchUsersResponse,
} from './types';

export function createOMAClient(config: OMAConfig) {
  const client = new OMAClient(config);
  const auth = createAuthCommands(client);
  const domains = createDomainCommands(client);
  const users = createUserCommands(client);

  return {
    generateUserToken: auth.generateUserToken,
    changeDomain: domains.changeDomain,
    getDomain: domains.getDomain,
    deleteDomain: domains.deleteDomain,
    searchDomains: domains.searchDomains,
    changeUser: users.changeUser,
    getUser: users.getUser,
    deleteUser: users.deleteUser,
    searchUsers: users.searchUsers,
  };
}

export type OMAEmailClient = ReturnType<typeof createOMAClient>;
