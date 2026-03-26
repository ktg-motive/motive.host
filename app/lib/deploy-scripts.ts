// ── Deploy Script Template Generator ─────────────────────────────────────
//
// Generates bash deploy scripts for RunCloud git deployments.
// Templates are selected during provisioning based on app type.

import type { DeployTemplate } from '../src/lib/hosting-schemas';

export type { DeployTemplate };

/** Options for generating a deploy script. */
export interface DeployScriptOptions {
  /** Which template to use. */
  template: DeployTemplate;
  /** The RunCloud webapp slug (e.g., "aiwithkai-com"). */
  appSlug: string;
  /** The port this app listens on (e.g., 3001). */
  port: number;
  /** Optional subdirectory for monorepo projects (e.g., "app", "packages/web"). */
  subdir?: string;
  /** Python WSGI module string (e.g. "app:app"). Required for python template. */
  pythonModule?: string;
  /** Number of Gunicorn workers (1-8). Required for python template. */
  gunicornWorkers?: number;
}

// ── Templates ────────────────────────────────────────────────────────────

const NEXTJS_TEMPLATE = `#!/bin/bash
set -e

APP_DIR="/home/motive-host/webapps/__APP_SLUG__"
APP_NAME="__APP_SLUG__"
APP_PORT=__PORT__

cd "$APP_DIR"
__SUBDIR_CD__
BUILD_DIR="$(pwd)"

# .env is read by the app via framework-native loading (Next.js, dotenv).
# Deploy scripts do NOT source .env -- see architecture doc Section 7.

npm install --production=false
npm run build

# Recreate static asset symlink for Next.js
if [ -d "$BUILD_DIR/.next/static" ]; then
  mkdir -p "$APP_DIR/_next"
  ln -sfn "$BUILD_DIR/.next/static" "$APP_DIR/_next/static"
fi

# Restart via PM2
pm2 delete "$APP_NAME" 2>/dev/null || true
PORT=$APP_PORT pm2 start npm --name "$APP_NAME" -- start
pm2 save
`;

const EXPRESS_TEMPLATE = `#!/bin/bash
set -e

APP_DIR="/home/motive-host/webapps/__APP_SLUG__"
APP_NAME="__APP_SLUG__"
APP_PORT=__PORT__

cd "$APP_DIR"
__SUBDIR_CD__

# .env is read by the app via framework-native loading (dotenv).
# Deploy scripts do NOT source .env -- see architecture doc Section 7.

npm install --production=false

# Build if build script exists
if npm run | grep -q "build"; then
  npm run build
fi

# Restart via PM2
pm2 delete "$APP_NAME" 2>/dev/null || true
PORT=$APP_PORT pm2 start npm --name "$APP_NAME" -- start
pm2 save
`;

const GENERIC_TEMPLATE = `#!/bin/bash
set -e

APP_DIR="/home/motive-host/webapps/__APP_SLUG__"
APP_NAME="__APP_SLUG__"
APP_PORT=__PORT__

cd "$APP_DIR"
__SUBDIR_CD__

# .env is read by the app via framework-native loading (dotenv).
# Deploy scripts do NOT source .env -- see architecture doc Section 7.

npm install --production=false

# Restart via PM2
pm2 delete "$APP_NAME" 2>/dev/null || true
PORT=$APP_PORT pm2 start npm --name "$APP_NAME" -- start
pm2 save
`;

const PYTHON_TEMPLATE = `#!/bin/bash
set -e

APP_DIR="/home/motive-host/webapps/__APP_SLUG__"
APP_NAME="__APP_SLUG__"
APP_PORT=__PORT__
PYTHON_MODULE="__PYTHON_MODULE__"
GUNICORN_WORKERS=__GUNICORN_WORKERS__

cd "$APP_DIR"
__SUBDIR_CD__
WORK_DIR="$(pwd)"

# Activate venv and install dependencies
source "$APP_DIR/venv/bin/activate"
pip install -r "$WORK_DIR/requirements.txt"

# Restart Gunicorn via PM2
pm2 delete "$APP_NAME" 2>/dev/null || true
cd "$WORK_DIR" && pm2 start "$APP_DIR/venv/bin/gunicorn" \\
  --name "$APP_NAME" --interpreter none -- \\
  -w $GUNICORN_WORKERS -b 127.0.0.1:$APP_PORT $PYTHON_MODULE
pm2 save
`;

const TEMPLATES: Record<DeployTemplate, string> = {
  nextjs: NEXTJS_TEMPLATE,
  express: EXPRESS_TEMPLATE,
  generic: GENERIC_TEMPLATE,
  python: PYTHON_TEMPLATE,
};

/**
 * Generate a bash deploy script from a template.
 *
 * The returned script is suitable for use as a RunCloud git deploy script.
 * Template variables (`__APP_SLUG__`, `__PORT__`, `__SUBDIR_CD__`,
 * `__PYTHON_MODULE__`, `__GUNICORN_WORKERS__`) are replaced with the
 * provided values.
 *
 * @param options - Deploy script configuration
 * @returns The generated bash script as a string
 */
export function generateDeployScript(options: DeployScriptOptions): string {
  const { template, appSlug, port, subdir, pythonModule, gunicornWorkers } = options;

  const raw = TEMPLATES[template];
  // Shell-quote the subdir to prevent injection (schema also validates safe chars)
  const subdirLine = subdir ? `cd "${subdir.replace(/"/g, '')}"` : '';

  return raw
    .replace(/__APP_SLUG__/g, appSlug)
    .replace(/__PORT__/g, String(port))
    .replace(/__SUBDIR_CD__/g, subdirLine)
    .replace(/__PYTHON_MODULE__/g, pythonModule ?? 'app:app')
    .replace(/__GUNICORN_WORKERS__/g, String(gunicornWorkers ?? 2));
}
