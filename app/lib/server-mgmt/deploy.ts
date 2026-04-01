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
 * Full deploy pipeline: git pull, build, PM2 restart (for Node.js),
 * pip install + gunicorn restart (for Python), or just git pull + build (for static).
 *
 * For static apps, PM2 is skipped entirely.
 *
 * Side effects: Pulls code, runs build/install, restarts PM2 process.
 * Failure modes: Returns { success: false } with error output if any step fails.
 *   Does NOT throw -- callers check result.success.
 * Idempotency: Yes (same code produces same build).
 */
export async function deployAndRestart(options: DeployOptions & {
  port?: number;  // Required for Node.js and Python, null/undefined for static
  template: DeployScriptOptions['template'] | 'static' | 'python';
  /** Python WSGI module string (e.g. "app:app"). Required when template === 'python'. */
  pythonModule?: string;
  /** Number of Gunicorn workers (1-8). Required when template === 'python'. */
  gunicornWorkers?: number;
}): Promise<DeployResult> {
  const { appSlug, subdir, port, template, pythonModule, gunicornWorkers } = options;
  const appDir = `${WEBAPPS_DIR}/${appSlug}`;
  const start = Date.now();

  let stdout = '';
  let stderr = '';

  try {
    // Step 1: Git pull
    const pullResult = await pullLatest(options);
    stdout += pullResult.stdout;
    stderr += pullResult.stderr;

    // Step 2: Build / deploy based on template
    if (template === 'static') {
      stdout += await runStaticDeploy(appSlug, appDir, subdir);
    } else if (template === 'python') {
      stdout += await runPythonDeploy(appSlug, appDir, {
        port: port!,
        pythonModule: pythonModule ?? 'app:app',
        gunicornWorkers: gunicornWorkers ?? 2,
        subdir,
      });
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

  // Re-symlink public → dist if dist/ exists (Vite/static output).
  // Nginx root points at public/, so this makes the built site serveable.
  try {
    await execLocal('test', ['-d', `${workDir}/dist`]);
    await execBash(`rm -rf "${workDir}/public" && ln -s dist "${workDir}/public"`, { cwd: workDir });
    stdout += 'Symlinked public → dist\n';
  } catch {
    // No dist/ directory — site serves from public/ as-is
  }

  return stdout;
}

/**
 * Run the Python deploy pipeline.
 *
 * 1. Activate venv and pip install requirements.txt
 * 2. PM2 delete + restart gunicorn
 * 3. PM2 save
 *
 * @param appSlug - The app identifier
 * @param appDir - Absolute path to the app directory
 * @param options.port - Port for gunicorn to bind to
 * @param options.pythonModule - WSGI module string (e.g. "app:app")
 * @param options.gunicornWorkers - Number of gunicorn worker processes
 * @param options.subdir - Optional monorepo subdirectory
 *
 * Side effects: Installs Python packages, restarts gunicorn via PM2.
 * Failure modes: Throws ExecError if pip install or PM2 fails.
 */
/** Validates python module format (defense-in-depth, matches provision.ts) */
const PYTHON_MODULE_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*:[a-zA-Z_][a-zA-Z0-9_]*$/;

async function runPythonDeploy(appSlug: string, appDir: string, options: {
  port: number;
  pythonModule: string;
  gunicornWorkers: number;
  subdir?: string;
}): Promise<string> {
  const { port, pythonModule, gunicornWorkers, subdir } = options;

  // Validate pythonModule (defense-in-depth — value comes from DB but could be corrupted)
  if (!PYTHON_MODULE_RE.test(pythonModule)) {
    throw new Error(`Invalid python_module format: ${pythonModule}`);
  }

  // Validate subdir has no path traversal
  if (subdir && (subdir.includes('..') || subdir.startsWith('/'))) {
    throw new Error(`Invalid subdir: ${subdir}`);
  }

  // Validate gunicornWorkers range
  if (gunicornWorkers < 1 || gunicornWorkers > 8) {
    throw new Error(`Invalid gunicorn_workers: ${gunicornWorkers}`);
  }

  const workDir = subdir ? `${appDir}/${subdir}` : appDir;
  let stdout = '--- python deploy ---\n';

  // Activate venv and install requirements (optional — matches provision contract)
  try {
    await execLocal('test', ['-f', `${workDir}/requirements.txt`]);
    const installResult = await execBash(
      `source "${appDir}/venv/bin/activate" && pip install -r "${workDir}/requirements.txt"`,
      { cwd: workDir, timeout: BUILD_TIMEOUT },
    );
    stdout += installResult.stdout;
  } catch {
    stdout += 'No requirements.txt found, skipping pip install\n';
  }

  // PM2 delete (ignore failure if process doesn't exist)
  try {
    await execLocal('pm2', ['delete', appSlug]);
    stdout += `Stopped existing PM2 process: ${appSlug}\n`;
  } catch {
    stdout += `No existing PM2 process: ${appSlug}\n`;
  }

  // Start gunicorn via PM2 (pythonModule is validated above, safe to interpolate)
  const startResult = await execBash(
    `cd "${workDir}" && pm2 start "${appDir}/venv/bin/gunicorn" ` +
    `--name "${appSlug}" --interpreter none -- ` +
    `-w ${gunicornWorkers} -b 127.0.0.1:${port} "${pythonModule}"`,
  );
  stdout += startResult.stdout;

  // Save PM2 process list
  const saveResult = await execLocal('pm2', ['save']);
  stdout += saveResult.stdout;

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
