import type { OMAClient } from '../client';
import type {
  MailboxType,
  GetUserResponse,
  SearchUsersResponse,
  DeleteUserResponse,
  StorageTier,
} from '../types';
import { STORAGE_TIERS } from '../types';

export function createUserCommands(client: OMAClient) {
  return {
    async changeUser(
      email: string,
      options: {
        password?: string;
        type?: MailboxType;
        displayName?: string;
        storageTier?: StorageTier;
        diskSpaceMB?: number;
        suspended?: boolean;
        passwordChangeRequired?: boolean;
        forwardEmail?: string;
      } = {}
    ): Promise<void> {
      const attributes: Record<string, unknown> = {};

      if (options.password !== undefined) attributes.password = options.password;
      if (options.type !== undefined) attributes.type = options.type;
      if (options.displayName !== undefined) attributes.display_name = options.displayName;
      if (options.suspended !== undefined) attributes.suspended = options.suspended;
      if (options.passwordChangeRequired !== undefined) {
        attributes.password_change_required = options.passwordChangeRequired;
      }
      if (options.forwardEmail !== undefined) attributes.forward_email = options.forwardEmail;

      if (options.storageTier !== undefined) {
        attributes.disk_space = STORAGE_TIERS[options.storageTier].mb;
      } else if (options.diskSpaceMB !== undefined) {
        attributes.disk_space = options.diskSpaceMB;
      }

      await client.request('change_user', { user: email, attributes });
    },

    async getUser(email: string): Promise<GetUserResponse> {
      return client.request<GetUserResponse>('get_user', { user: email });
    },

    async deleteUser(email: string): Promise<DeleteUserResponse> {
      return client.request<DeleteUserResponse>('delete_user', { user: email });
    },

    async searchUsers(
      domain: string,
      options: { page?: number; pageSize?: number } = {}
    ): Promise<SearchUsersResponse> {
      return client.request<SearchUsersResponse>('search_users', {
        domain,
        page: options.page ?? 1,
        page_size: options.pageSize ?? 100,
      });
    },
  };
}
