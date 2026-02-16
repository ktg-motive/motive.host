export function isAdmin(userId: string): boolean {
  return userId === process.env.ADMIN_USER_ID;
}
