// app/lib/server-mgmt/env.ts

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';

const WEBAPPS_DIR = '/home/motive-host/webapps';
const ALGORITHM = 'aes-256-gcm';

/**
 * Derive the encryption key from ENV_ENCRYPTION_KEY.
 * One master key for all customer env vars.
 * @throws Error if ENV_ENCRYPTION_KEY is not set.
 */
function getDerivedKey(): Buffer {
  const masterKey = process.env.ENV_ENCRYPTION_KEY;
  if (!masterKey) throw new Error('ENV_ENCRYPTION_KEY is not set');
  return scryptSync(masterKey, 'motive-host-env-vars', 32);
}

/**
 * Encrypt a plaintext value for storage in Supabase.
 * Uses AES-256-GCM with a random 16-byte IV per encryption.
 * NOT idempotent -- each call produces a different ciphertext (different IV).
 * @returns Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptValue(plaintext: string): string {
  const key = getDerivedKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a value retrieved from Supabase.
 * @param stored - Encrypted string in format: iv:authTag:ciphertext (all hex-encoded)
 * @throws Error if the format is invalid or decryption fails (tampered data)
 */
export function decryptValue(stored: string): string {
  const key = getDerivedKey();
  const [ivHex, authTagHex, ciphertext] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error('Invalid encrypted value format (expected iv:authTag:ciphertext)');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

/**
 * Validate an environment variable key name.
 * Must start with a letter or underscore, followed by letters, digits, or underscores.
 * Matches the CHECK constraint on hosting_app_env_vars.key in the database.
 */
export function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

/** A single environment variable as stored in Supabase. */
export interface EnvVar {
  key: string;
  encrypted_value: string;
  is_secret: boolean;
}

/**
 * Render a list of env vars into .env file content.
 *
 * All values are ALWAYS double-quoted to prevent interpretation issues.
 * Internal backslashes, double quotes, dollar signs, backticks, and newlines
 * are escaped per the special character handling spec (Section 7.2).
 *
 * IMPORTANT: This renders the .env for the APP to read via framework-native
 * .env loading (Next.js, Vite, dotenv). The deploy script NEVER sources this file.
 */
export function renderDotEnv(vars: EnvVar[]): string {
  return vars
    .map((v) => {
      const plaintext = decryptValue(v.encrypted_value);
      const escaped = plaintext
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`')
        .replace(/\n/g, '\\n');
      return `${v.key}="${escaped}"`;
    })
    .join('\n') + '\n';
}

/**
 * Write a .env file to an app's webapps directory.
 * Called before every deploy. File permissions set to 600 (owner read/write only).
 * Idempotent -- overwrites the existing .env if present.
 *
 * Uses fs/promises.writeFile directly (no sudo needed -- the motive-host user
 * owns the webapps directory).
 */
export async function writeEnvFile(appSlug: string, vars: EnvVar[]): Promise<void> {
  const envPath = `${WEBAPPS_DIR}/${appSlug}/.env`;
  const content = renderDotEnv(vars);
  await writeFile(envPath, content, { encoding: 'utf-8', mode: 0o600 });
}

/**
 * Read the current .env file from an app's directory.
 * Returns null if the file does not exist.
 * Intended for debugging only -- production code should read from the database.
 */
export async function readEnvFile(appSlug: string): Promise<string | null> {
  try {
    return await readFile(`${WEBAPPS_DIR}/${appSlug}/.env`, 'utf-8');
  } catch {
    return null;
  }
}
