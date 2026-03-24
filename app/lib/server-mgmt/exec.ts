// app/lib/server-mgmt/exec.ts
//
// Foundation module for all server management operations.
// Every OS interaction flows through this layer. No other module
// imports child_process directly.
//
// Uses execFile exclusively (never shell-based exec) to prevent
// shell injection. For operations needing shell features (pipes,
// redirects), use execBash() which passes a script string to
// bash -c via execFile.

import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';

const execFileAsync = promisify(nodeExecFile);

/** Default timeout for shell commands (30 seconds). */
const DEFAULT_TIMEOUT = 30_000;

/** Extended timeout for build operations (5 minutes). */
export const BUILD_TIMEOUT = 300_000;

/** Extended timeout for git clone operations (2 minutes). */
export const CLONE_TIMEOUT = 120_000;

/** Timeout for certbot operations (60 seconds). */
export const CERTBOT_TIMEOUT = 60_000;

/** Result of a successful command execution. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: 0; // Literal 0: success always returns 0. Non-zero throws ExecError.
}

/** Error thrown when a command execution fails. */
export class ExecError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly command: string;

  constructor(command: string, exitCode: number, stdout: string, stderr: string) {
    super(`Command failed (exit ${exitCode}): ${command}\n${stderr.slice(0, 500)}`);
    this.name = 'ExecError';
    this.command = command;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

/**
 * Execute a command as the current user (motive-host).
 *
 * Uses execFile (not shell-based exec) to avoid shell injection.
 * The command is executed directly without a shell, so no globbing,
 * pipes, or redirects. For operations needing shell features, use
 * execBash() instead.
 *
 * @param command - Binary to execute (absolute path or in PATH)
 * @param args - Array of arguments (each element is one arg, no splitting)
 * @param options.cwd - Working directory
 * @param options.env - Additional env vars (merged with process.env)
 * @param options.timeout - Timeout in ms (default: 30s)
 * @returns ExecResult with stdout, stderr, exitCode 0
 * @throws ExecError on non-zero exit code or timeout
 *
 * Side effects: Executes an OS process.
 * Failure modes: ExecError (non-zero exit), timeout (killed, throws ExecError)
 */
export async function execLocal(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string>; timeout?: number },
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for build output
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    throw new ExecError(
      `${command} ${args.join(' ')}`,
      e.code ?? 1,
      e.stdout ?? '',
      e.stderr ?? '',
    );
  }
}

/**
 * Execute a command with sudo.
 *
 * Wraps execLocal with 'sudo' prepended. motive-host must have
 * passwordless sudo for the specific commands used.
 *
 * Side effects: Executes an OS process with elevated privileges.
 * Failure modes: Same as execLocal. Also fails if sudoers not configured.
 */
export async function execSudo(
  command: string,
  args: string[],
  options?: { timeout?: number },
): Promise<ExecResult> {
  return execLocal('sudo', [command, ...args], options);
}

/**
 * Execute a bash script string.
 *
 * For operations that need shell features (pipes, redirects, variable expansion).
 * The script is passed as a -c argument to bash via execFile.
 *
 * SECURITY: Callers must sanitize any user-provided values interpolated into
 * the script string. Prefer execLocal with explicit args when possible.
 *
 * Side effects: Executes a shell script.
 * Failure modes: Same as execLocal.
 */
export async function execBash(
  script: string,
  options?: { cwd?: string; env?: Record<string, string>; timeout?: number },
): Promise<ExecResult> {
  return execLocal('bash', ['-c', script], options);
}

/**
 * Write a file via sudo.
 *
 * Writes content to a temp file, then uses sudo mv to place it at the
 * target path. This avoids needing sudo for the write itself.
 *
 * @param targetPath - Absolute path for the final file
 * @param content - File content as a string
 *
 * Side effects: Creates targetPath on disk (or overwrites if exists).
 * Failure modes: ExecError if sudo mv fails, fs error if /tmp write fails.
 * Idempotency: Safe to call repeatedly -- overwrites the file each time.
 */
export async function writeSudoFile(targetPath: string, content: string): Promise<void> {
  const tmpPath = `/tmp/mh-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await writeFile(tmpPath, content, 'utf-8');
  await execSudo('mv', [tmpPath, targetPath]);
}
