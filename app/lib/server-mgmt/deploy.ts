// app/lib/server-mgmt/deploy.ts
//
// Deployment pipeline. Pulls latest code, runs build, manages PM2 processes
// (Node.js) or just builds (static). Replaces RunCloud's forceDeploy() and
// the local fallback in deploy/route.ts.
//
// Ownership boundary: Owns the git pull lifecycle and deploy script execution.
// Delegates PM2 to direct execLocal calls. Delegates .env writing to env.ts
// (called by the API route layer, not by deploy.ts).
//
// These functions do server work only -- they do NOT touch the database.
// The deploy route handles DB updates, durable operations, and env sync.

import { writeFile } from 'node:fs/promises';
import { execLocal, execBash, ExecError, BUILD_TIMEOUT, assertValidSlug } from './exec';
import { generateDeployScript, type DeployScriptOptions } from '../deploy-scripts';

const WEBAPPS_DIR = '/home/motive-host/webapps';
const SSH_KEY_DIR = '/home/motive-host/.ssh';

export interface DeployOptions {
  appSlug: string;
  branch?: string;        // default: "main"
  deployKeyName?: string; // SSH key name (default: {appSlug}_deploy)
  subdir?: string;        // monorepo subdir
}

export interface DeployResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/**
 * Pull latest code from remote: symlink cleanup, git fetch+reset, restore.
 *
 * Pure git-pull step. Does NOT run deploy scripts or PM2.
 *
 * Side effects: Modifies files in /home/motive-host/webapps/{appSlug}.
 * Failure modes: ExecError if git fetch or reset fails.
 * Idempotency: Yes -- fetch + reset --hard is idempotent.
 */
export async function pullLatest(options: DeployOptions): Promise<{
  stdout: string;
  stderr: string;
}> {
  const { appSlug, branch = 'main', deployKeyName } = options;
  assertValidSlug(appSlug);
  const appDir = `${WEBAPPS_DIR}/${appSlug}`;
  const keyName = deployKeyName ?? `${appSlug}_deploy`;
  const keyPath = `${SSH_KEY_DIR}/${keyName}`;

  let stdout = '';
  let stderr = '';

  const gitEnv = {
    GIT_SSH_COMMAND: `ssh -i ${keyPath} -o StrictHostKeyChecking=accept-new`,
  };

  // Step 1: Pre-pull symlink cleanup (critical for Vite/static sites)
  await prepullSymlinkCleanup(appDir);

  // Step 2: Git fetch + reset to match remote
  const fetchResult = await execLocal(
    'git', ['-C', appDir, 'fetch', 'origin', branch],
    { env: gitEnv, timeout: 60_000 },
  );
  stdout += `--- git fetch ---\n${fetchResult.stdout}`;
  stderr += fetchResult.stderr;

  const resetResult = await execLocal(
    'git', ['-C', appDir, 'reset', '--hard', `origin/${branch}`],
    { timeout: 10_000 },
  );
  stdout += `--- git reset ---\n${resetResult.stdout}`;
  stderr += resetResult.stderr;

  // Step 3: Post-pull restore (force-restore public/ from git for Vite builds)
  await postpullRestore(appDir);

  return { stdout, stderr };
}

/**
 * Pre-pull cleanup for Vite/static sites.
 * Removes public/ -> dist/ symlink so git can restore the real public/ dir.
 */
async function prepullSymlinkCleanup(appDir: string): Promise<void> {
  await execLocal('bash', ['-c',
    `test -L "${appDir}/public" && rm -f "${appDir}/public" || true`
  ]);
}

/**
 * Post-pull restore for Vite/static sites.
 * Force-restore public/ from git so Vite has the real directory for build.
 */
async function postpullRestore(appDir: string): Promise<void> {
  await execLocal('git', ['-C', appDir, 'checkout', '--', 'public'])
    .catch(() => { /* public/ may not exist in repo -- not an error */ });
}

/**
 * Full deploy pipeline: git pull, build, PM2 restart (for Node.js)
 * or just git pull + build (for static).
 *
 * For static apps, PM2 is skipped entirely.
 *
 * Side effects: Pulls code, runs npm install + build, restarts PM2 process.
 * Failure modes: Returns { success: false } with error output if any step fails.
 *   Does NOT throw -- callers check result.success.
 * Idempotency: Yes (same code produces same build).
 */
export async function deployAndRestart(options: DeployOptions & {
  port?: number;  // Required for Node.js, null/undefined for static
  template: DeployScriptOptions['template'] | 'static';
}): Promise<DeployResult> {
  const { appSlug, subdir, port, template } = options;
  const appDir = `${WEBAPPS_DIR}/${appSlug}`;
  const start = Date.now();

  let stdout = '';
  let stderr = '';

  try {
    // Step 1: Git pull
    const pullResult = await pullLatest(options);
    stdout += pullResult.stdout;
    stderr += pullResult.stderr;

    // Step 2: Build
    if (template === 'static') {
      stdout += await runStaticDeploy(appSlug, appDir, subdir);
    } else {
      // Node.js deploy: use deploy-scripts.ts templates
      const deployScript = generateDeployScript({
        template: template as DeployScriptOptions['template'],
        appSlug,
        port: port!,
        subdir,
      });
      const deployResult = await execBash(deployScript, {
        cwd: appDir,
        timeout: BUILD_TIMEOUT,
      });
      stdout += `--- deploy ---\n${deployResult.stdout}`;
      stderr += deployResult.stderr;
    }
  } catch (err) {
    if (err instanceof ExecError) {
      stdout += err.stdout;
      stderr += err.stderr;
    }
    return {
      success: false,
      stdout,
      stderr: stderr + (err instanceof Error ? `\n${err.message}` : ''),
      durationMs: Date.now() - start,
    };
  }

  return { success: true, stdout, stderr, durationMs: Date.now() - start };
}

/**
 * Run the static site deploy pipeline.
 *
 * 1. If package.json exists: npm install + npm run build (if build script present)
 * 2. No PM2 -- nginx serves files directly
 */
async function runStaticDeploy(appSlug: string, appDir: string, subdir?: string): Promise<string> {
  const workDir = subdir ? `${appDir}/${subdir}` : appDir;
  let stdout = '--- static deploy ---\n';

  // Check if package.json exists
  try {
    await execLocal('test', ['-f', `${workDir}/package.json`]);
  } catch {
    stdout += 'No package.json found, skipping build\n';
    return stdout;
  }

  // npm install
  const installResult = await execBash('npm install --production=false', {
    cwd: workDir,
    timeout: BUILD_TIMEOUT,
  });
  stdout += installResult.stdout;

  // npm run build (if build script exists)
  try {
    await execBash('npm run 2>&1 | grep -q "build"', { cwd: workDir });
    const buildResult = await execBash('npm run build', {
      cwd: workDir,
      timeout: BUILD_TIMEOUT,
    });
    stdout += buildResult.stdout;
  } catch {
    stdout += 'No build script found, skipping build\n';
  }

  return stdout;
}

/**
 * Write the deploy log to disk for later retrieval.
 *
 * Side effects: Writes /home/motive-host/webapps/{appSlug}/.deploy.log.
 * Idempotency: Overwrites the previous log.
 */
export async function writeDeployLog(
  appSlug: string,
  result: DeployResult,
): Promise<void> {
  const logPath = `${WEBAPPS_DIR}/${appSlug}/.deploy.log`;
  const content = [
    `Deploy at ${new Date().toISOString()}`,
    `Duration: ${result.durationMs}ms`,
    `Status: ${result.success ? 'SUCCESS' : 'FAILED'}`,
    '',
    '=== STDOUT ===',
    result.stdout,
    '',
    '=== STDERR ===',
    result.stderr,
  ].join('\n');

  await writeFile(logPath, content, 'utf-8');
}
