// app/lib/server-mgmt/webhook.ts
//
// GitHub/GitLab webhook signature verification, branch filtering,
// and webhook secret generation. All pure functions (no side effects).
//
// Ownership boundary: Owns webhook authentication logic.
// Does NOT own the webhook endpoint route.

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * Verify a GitHub webhook signature (HMAC-SHA256).
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - Raw request body as a string
 * @param signature - Value of X-Hub-Signature-256 header
 * @param secret - The app's webhook secret
 * @returns true if signature is valid
 *
 * Side effects: None (pure function).
 * Failure modes: Returns false on any mismatch or format error.
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature.startsWith('sha256=')) return false;
  const expected = Buffer.from(signature.slice(7), 'hex');
  const computed = createHmac('sha256', secret).update(payload).digest();
  if (expected.length !== computed.length) return false;
  return timingSafeEqual(expected, computed);
}

/**
 * Verify a GitLab webhook token.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param token - Value of X-Gitlab-Token header
 * @param secret - The app's webhook secret
 * @returns true if token matches
 *
 * Side effects: None (pure function).
 * Failure modes: Returns false on mismatch.
 */
export function verifyGitLabToken(token: string, secret: string): boolean {
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extract branch name from a GitHub/GitLab push event payload.
 * Both use "refs/heads/{branch}" format.
 *
 * @param payload - Parsed webhook payload body
 * @returns Branch name, or null if not a branch push (e.g., tag)
 *
 * Side effects: None (pure function).
 */
export function extractBranch(payload: { ref?: string }): string | null {
  if (!payload.ref) return null;
  const match = payload.ref.match(/^refs\/heads\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Determine if a push event should trigger a deploy.
 * Only deploys on pushes to the configured branch.
 * Does NOT trigger on branch deletion events.
 *
 * @param options.eventBranch - Branch from the push event
 * @param options.configuredBranch - Branch configured for auto-deploy
 * @param options.isDeleteEvent - Whether this is a branch deletion
 * @returns true if deploy should proceed
 *
 * Side effects: None (pure function).
 */
export function shouldDeploy(options: {
  eventBranch: string | null;
  configuredBranch: string;
  isDeleteEvent?: boolean;
}): boolean {
  const { eventBranch, configuredBranch, isDeleteEvent } = options;
  if (!eventBranch) return false;
  if (isDeleteEvent) return false;
  return eventBranch === configuredBranch;
}

/**
 * Generate a cryptographically random webhook secret (64-char hex).
 *
 * Side effects: Reads from OS random source.
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}
